const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const db = require('../config/DB'); // 네 DB 경로에 맞게

 //  Google Strategy 등록

// 구글 로그인
passport.use(
  'google-login',
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      const conn = await db.getConnection();
      try {
        const provider = 'google';
        const socialId = profile.id;
        const email = profile.emails?.[0]?.value || null;
        const name = profile.displayName;

        await conn.beginTransaction();

        // 1) user_auth 기준으로 기존 계정 확인 (있으면 로그인)
        const [authRows] = await conn.query(
          `SELECT user_no FROM user_auth WHERE provider = ? AND social_id = ? LIMIT 1`,
          [provider, socialId]
        );

        if (authRows.length > 0) {
          await conn.commit();
          return done(null, { userNo: authRows[0].user_no, isNew: false });
        }

        // 2) 없으면 신규 생성 시도
        const generatedLoginId = `google_${socialId}`;
        let userNo;
        let isNew = true;

        try {
          const [userResult] = await conn.query(
            `INSERT INTO users (id, name, email) VALUES (?, ?, ?)`,
            [generatedLoginId, name, email]
          );
          userNo = userResult.insertId;
        } catch (e) {
          // 이미 users에 google_... 이 들어가 있는 경우(중복) → 기존 user_no 가져오기
          if (e.code === 'ER_DUP_ENTRY') {
            isNew = false;
            const [uRows] = await conn.query(
              `SELECT user_no FROM users WHERE id = ? LIMIT 1`,
              [generatedLoginId]
            );
            if (uRows.length === 0) throw e; // 이 경우는 정말 이상한 상태
            userNo = uRows[0].user_no;
          } else {
            throw e;
          }
        }

        // 3) user_auth는 UPSERT로 안전하게 넣기 (중복/레이스 방지)
        await conn.query(
          `
          INSERT INTO user_auth (user_no, provider, social_id)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE user_no = VALUES(user_no)
          `,
          [userNo, provider, socialId]
        );

        await conn.commit();
        return done(null, { userNo, isNew });
      } catch (err) {
        await conn.rollback();
        return done(err);
      } finally {
        conn.release();
      }
    }
  )
);

//  2) 구글 연동
passport.use(
  'google-link',
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/link/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      //  연동은 프로필만 넘김
      return done(null, profile);
    }
  )
);


//   Google 로그인 완료 처리

exports.googleCallback = (req, res) => {
  try {
    const token = jwt.sign(
      { userNo: req.user.userNo },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    const qs = req.user?.isNew ? 'signup=1' : 'login=1';
    return res.redirect(`http://localhost:5173/?${qs}&provider=google`);
  } catch (err) {
    console.error('googleCallback error:', err);
    return res.redirect('http://localhost:5173/login?error=google');
  }
};

