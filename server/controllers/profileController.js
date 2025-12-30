const db = require('../config/DB');

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
    const { name, job, design, budget } = req.body;

    await db.query(
      `
      UPDATE users
      SET name = ?, job = ?, design = ?, budget = ?
      WHERE user_no = ?
      `,
      [name, job, design, budget, userNo]
    );

    const [rows] = await db.query(
      `
      SELECT user_no, id, name, email, role, job, user_usage, design, budget
      FROM users
      WHERE user_no = ?
      `,
      [userNo]
    );

    const user = rows[0];

    res.json({
      user: {
        ...user,
        user_usage: parseJsonSafe(user.user_usage),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '프로필 수정 실패' });
  }
};

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
