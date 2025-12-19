const db = require('../config/DB');
const jwt = require('jsonwebtoken');

  // JWT 인증 미들웨어
exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: '토큰 없음' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userNo: decoded.userNo };
    next();
  } catch (err) {
    return res.status(401).json({ message: '유효하지 않은 토큰' });
  }
};

//   프로필 수정
const parseJsonSafe = (value) => {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userNo = req.user.userNo;
    const { name, job, brand, design, budget } = req.body;

    await db.query(
      `
      UPDATE users
      SET name = ?, job = ?, brand = ?, design = ?, budget = ?
      WHERE user_no = ?
      `,
      [
        name,
        job,
        JSON.stringify(brand || []),
        design,
        budget,
        userNo,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT id, name, email, job, user_usage, brand, design, budget
      FROM users
      WHERE user_no = ?
      `,
      [userNo]
    );

    const user = rows[0];

    res.json({
      user: {
        ...user,
        brand: parseJsonSafe(user.brand),
        user_usage: parseJsonSafe(user.user_usage),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '프로필 수정 실패' });
  }
};

  // 🔗 소셜 연동 상태 조회
exports.getProviders = async (req, res) => {
  try {
    const userNo = req.user.userNo;

    const [rows] = await db.query(
      `SELECT provider FROM user_auth WHERE user_no = ?`,
      [userNo]
    );

    res.json(rows.map(r => r.provider));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '연동 조회 실패' });
  }
};
