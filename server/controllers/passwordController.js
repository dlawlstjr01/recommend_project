const bcrypt = require('bcrypt');
const db = require('../config/DB');

exports.changePassword = async (req, res) => {
  try {
    const { id, currentPassword, newPassword } = req.body;

    if (!id || !currentPassword || !newPassword) {
      return res.status(400).json({ message: '필수값 누락' });
    }

    // 1) users에서 user_no 찾기
    const [urows] = await db.query('SELECT user_no FROM users WHERE id = ?', [id]);
    if (urows.length === 0) {
      return res.status(404).json({ message: '사용자 없음' });
    }
    const userNo = urows[0].user_no;

    // 2) user_auth에서 local 비밀번호 가져오기
    const [arows] = await db.query(
      "SELECT password FROM user_auth WHERE user_no = ? AND provider = 'local'",
      [userNo]
    );

    // 소셜로그인은 변경 불가
    if (arows.length === 0 || !arows[0].password) {
      return res.status(400).json({ message: '소셜 로그인 계정은 비밀번호 변경이 불가합니다.' });
    }

    // 3) 현재 비밀번호 검증
    const isMatch = await bcrypt.compare(currentPassword, arows[0].password);
    if (!isMatch) {
      return res.status(401).json({ message: '현재 비밀번호 불일치' });
    }

    // 4) 새 비밀번호 저장 (user_auth에 업데이트)
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await db.query(
      "UPDATE user_auth SET password = ? WHERE user_no = ? AND provider = 'local'",
      [hashedNewPassword, userNo]
    );

    return res.json({ success: true, message: '비밀번호 변경 완료' });
  } catch (err) {
    console.error('비밀번호 변경 오류:', err);
    return res.status(500).json({ message: '서버 오류' });
  }
};
