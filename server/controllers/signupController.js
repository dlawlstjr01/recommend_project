const bcrypt = require('bcrypt');
const db = require('../config/DB');


// 아이디 중복 확인
exports.checkId = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json({ available: false });

    const [rows] = await db.query(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    res.json({ available: rows.length === 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ available: false });
  }
};

 // 회원가입 (local)
exports.signup = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const {
      id,
      password,
      name,
      email,
      job,
      user_usage,
      brand,
      design,
      budget,
    } = req.body;

    if (!id || !password || !name) {
      return res.status(400).json({ message: '필수값 누락' });
    }

    // 아이디 중복 체크
    const [exist] = await conn.query('SELECT id FROM users WHERE id = ?', [id]);
    if (exist.length > 0) {
      return res.status(400).json({ message: '이미 존재하는 아이디' });
    }

    await conn.beginTransaction();

    // 1) users 저장
    const [userResult] = await conn.query(
      `
      INSERT INTO users (id, name, email, job, user_usage, brand, design, budget)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        name,
        email || null,
        job || null,
        JSON.stringify(user_usage || []),
        JSON.stringify(brand || []),
        design || 'simple',
        budget || 'unlimited',
      ]
    );

    const userNo = userResult.insertId;

    // 2) user_auth 저장 (local)
    const hashedPassword = await bcrypt.hash(password, 10);

    await conn.query(
      `
      INSERT INTO user_auth (user_no, provider, password)
      VALUES (?, 'local', ?)
      `,
      [userNo, hashedPassword]
    );

    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('회원가입 오류:', err);
    return res.status(500).json({ message: '서버 오류' });
  } finally {
    conn.release();
  }
};
