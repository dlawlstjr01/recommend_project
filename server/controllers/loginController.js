const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/DB');

const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: false,            // 운영 HTTPS면 true
    sameSite: 'lax',          // 보통 'lax' (프론트/백 분리+크로스사이트면 'none' + secure 필요)
    maxAge: 1000 * 60 * 60,   // 1시간
    path: '/',
  };
};

// JSON 문자열 안전 파싱 (user_usage 같은 필드용)
const parseJsonSafe = (value) => {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

/**
 * POST /auth/login
 */
exports.login = async (req, res) => {
  try {
    const { id, password } = req.body;

    if (!id || !password) {
      return res.status(400).json({ message: '아이디 또는 비밀번호 누락' });
    }

    const [rows] = await db.query(
      `
      SELECT u.user_no, ua.password
      FROM users u
      JOIN user_auth ua ON u.user_no = ua.user_no
      WHERE u.id = ?
      AND ua.provider = 'local'
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: '존재하지 않는 아이디' });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: '비밀번호 불일치' });
    }

    const token = jwt.sign(
      { userNo: user.user_no },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('accessToken', token, getCookieOptions());
    return res.status(200).json({ message: '로그인 성공' });
  } catch (err) {
    console.error('로그인 오류:', err);
    return res.status(500).json({ message: '서버 오류' });
  }
};

/**
 * JWT 인증 공통 함수 (쿠키만 사용)
 */
exports.verifyToken = async (req, res, next) => {
  const token = req.cookies?.accessToken;
  if (!token) return res.status(401).json({ message: '토큰 없음' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // role 조회
    const [rows] = await db.query(
      `SELECT role FROM users WHERE user_no = ?`,
      [decoded.userNo]
    );

    if (!rows.length) return res.status(401).json({ message: '유저 없음' });

    req.user = { userNo: decoded.userNo, role: rows[0].role };
    next();
  } catch (err) {
    return res.status(401).json({ message: '유효하지 않은 토큰' });
  }
};

/**
 *  내 정보 조회 (/auth/me)
 */
exports.me = async (req, res) => {
  try {
    const userNo = req.user.userNo;

    const [rows] = await db.query(
      `
      SELECT user_no, id, name, email, role, job, user_usage, design, budget
      FROM users
      WHERE user_no = ?
      `,
      [userNo]
    );

    if (!rows.length) {
      return res.status(401).json({ message: '유저 없음' });
    }

    const u = rows[0];

    return res.json({
      user_no: u.user_no,
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,

      //  맞춤 추천 설정 값 추가
      job: u.job,
      design: u.design,
      budget: u.budget,

      // (원하면 유지 / 필요 없으면 지워도 됨)
      user_usage: parseJsonSafe(u.user_usage),
    });
  } catch (err) {
    console.error('me 조회 오류:', err);
    return res.status(500).json({ message: '서버 오류' });
  }
};

exports.logout = (req, res) => {
  // cookie 설정 옵션과 동일한 축으로 지우는 게 안전
  const opts = getCookieOptions();
  res.clearCookie('accessToken', {
    path: opts.path,
    sameSite: opts.sameSite,
    secure: opts.secure,
  });

  return res.status(200).json({ message: '로그아웃 완료' });
};
