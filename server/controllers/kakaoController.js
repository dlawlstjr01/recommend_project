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
      try {
        const provider = 'kakao';
        const socialId = String(profile.id); // 카카오 고유 id
        const email = profile._json?.kakao_account?.email || null;
        const name =
          profile.displayName ||
          profile._json?.properties?.nickname ||
          'Kakao User';

        // 기존 카카오 계정 확인
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

        //  없으면 신규 유저 생성
        const generatedLoginId = `kakao_${socialId}`;

        const [userResult] = await db.query(
          `INSERT INTO users (id, name, email) VALUES (?, ?, ?)`,
          [generatedLoginId, name, email]
        );

        const userNo = userResult.insertId;

        await db.query(
          `INSERT INTO user_auth (user_no, provider, social_id) VALUES (?, ?, ?)`,
          [userNo, provider, socialId]
        );

        return done(null, { userNo });
      } catch (err) {
        return done(err);
      }
    }
  )
);

//  카카오 연동
passport.use(
  'kakao-link',
  new KakaoStrategy(
    {
      clientID: process.env.KAKAO_CLIENT_ID,
      callbackURL: 'http://localhost:5000/auth/kakao/link/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      return done(null, profile); //  프로필만 넘김
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