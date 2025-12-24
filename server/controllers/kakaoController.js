const passport = require('passport');
const KakaoStrategy = require('passport-kakao').Strategy;
const jwt = require('jsonwebtoken');
const db = require('../config/DB');

//  카카오 로그인
passport.use(
  'kakao-login',
  new KakaoStrategy(
    {
      clientID: process.env.KAKAO_CLIENT_ID,
      callbackURL: 'http://localhost:5000/auth/kakao/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      const conn = await db.getConnection();
      try {
        const provider = 'kakao';
        const socialId = String(profile.id);
        const email = profile._json?.kakao_account?.email || null;
        const name =
          profile.displayName ||
          profile._json?.properties?.nickname ||
          'Kakao User';

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

        // 2) 없으면 신규 생성 시도 (users 중복 방어)
        const generatedLoginId = `kakao_${socialId}`;
        let userNo;
        let isNew = true;

        try {
          const [userResult] = await conn.query(
            `INSERT INTO users (id, name, email) VALUES (?, ?, ?)`,
            [generatedLoginId, name, email]
          );
          userNo = userResult.insertId;
        } catch (e) {
          // users에 이미 kakao_... 이 있는 경우(중복) → 기존 user_no 가져오기
          if (e.code === 'ER_DUP_ENTRY') {
            isNew = false;
            const [uRows] = await conn.query(
              `SELECT user_no FROM users WHERE id = ? LIMIT 1`,
              [generatedLoginId]
            );
            if (uRows.length === 0) throw e;
            userNo = uRows[0].user_no;
          } else {
            throw e;
          }
        }

        // 3) user_auth는 UPSERT로 안전하게 연결(중복/레이스 방지)
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

//  카카오 연동은 그대로 OK
passport.use(
  'kakao-link',
  new KakaoStrategy(
    {
      clientID: process.env.KAKAO_CLIENT_ID,
      callbackURL: 'http://localhost:5000/auth/kakao/link/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

exports.kakaoCallback = (req, res) => {
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
    return res.redirect(`http://localhost:5173/?${qs}&provider=kakao`);
  } catch (err) {
    console.error('kakaoCallback error:', err);
    return res.redirect('http://localhost:5173/login?error=kakao');
  }
};
