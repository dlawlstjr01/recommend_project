const bcrypt = require('bcrypt');
const pool = require('../config/DB');

exports.changePassword = async (req, res) => {
  try {
    const { id, currentPassword, newPassword } = req.body;

    // 1. 필수값 체크
    if (!id || !currentPassword || !newPassword) {
      return res.status(400).json({ message: '필수값 누락' });
    }

    // 2. 사용자 조회
    const [rows] = await pool.query(
      'SELECT password FROM users WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: '사용자 없음' });
    }

    const user = rows[0];

    // 3. 현재 비밀번호 검증
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: '현재 비밀번호 불일치' });
    }

    // 4. 새 비밀번호 암호화
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // 5. 비밀번호 업데이트
    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedNewPassword, id]
    );

    res.json({ success: true, message: '비밀번호 변경 완료' });
  } catch (err) {
    console.error('비밀번호 변경 오류:', err);
    res.status(500).json({ message: '서버 오류' });
  }
};
