const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/DB');

/**
 * POST /auth/login
 */
exports.login = async (req, res) => {
  try {
    const { id, password } = req.body;

    if (!id || !password) {
      return res.status(400).json({ message: '아이디 또는 비밀번호 누락' });
    }

    // users + user_auth JOIN (local만)
    const [rows] = await pool.query(
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

    //  JWT 발급
    const token = jwt.sign(
      { userNo: user.user_no },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: false,      // 로컬 개발
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60, // 1시간
    });

    // 이제 token을 굳이 내려줄 필요 없음
    res.status(200).json({ message: '로그인 성공' });
  } catch (err) {
    console.error('로그인 오류:', err);
    res.status(500).json({ message: '서버 오류' });
  }
};

/**
 * JWT 인증 공통 함수
 */
exports.verifyToken = (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '토큰 없음' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userNo: decoded.userNo };
    next();
  } catch (err) {
    return res.status(401).json({ message: '유효하지 않은 토큰' });
  }
};

/**
 * 내 정보 조회
 */
exports.me = async (req, res) => {
  try {
    const userNo = req.user.userNo;

    const [rows] = await pool.query(
      `
      SELECT id, name, email
      FROM users
      WHERE user_no = ?
      `,
      [userNo]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('accessToken', {
    path: '/',        
  });
  res.status(200).json({ message: '로그아웃 완료' });
};
