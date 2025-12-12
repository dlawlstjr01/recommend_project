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
      try {
        const provider = 'google';
        const socialId = profile.id;
        const email = profile.emails?.[0]?.value || null;
        const name = profile.displayName;

        // 기존 소셜 계정 확인
        const [authRows] = await db.query(
          `
          SELECT u.user_no
          FROM user_auth ua
          JOIN users u ON ua.user_no = u.user_no
          WHERE ua.provider = ?
          AND ua.social_id = ?
          `,
          [provider, socialId]
        );

        if (authRows.length > 0) {
          return done(null, { userNo: authRows[0].user_no });
        }

        //  없으면 신규 유저 생성 (로그인 전용에서는 OK)
        const generatedLoginId = `google_${socialId}`;

        const [userResult] = await db.query(
          `
          INSERT INTO users (id, name, email)
          VALUES (?, ?, ?)
          `,
          [generatedLoginId, name, email]
        );

        const userNo = userResult.insertId;

        await db.query(
          `
          INSERT INTO user_auth (user_no, provider, social_id)
          VALUES (?, ?, ?)
          `,
          [userNo, provider, socialId]
        );

        return done(null, { userNo });
      } catch (err) {
        return done(err);
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


