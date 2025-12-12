const db = require('../config/DB');

exports.googleLink = async (req, res) => {
  try {
    const userNo = req.localUserNo;      //  로컬 로그인 userNo
    const provider = 'google';
    const socialId = req.user?.id;       //  구글 profile.id

    console.log('[Parsed] userNo=', userNo, 'provider=', provider, 'socialId=', socialId);

    if (!userNo) {
      console.log(' FAIL: localUserNo is missing (verifyToken/backup 문제)');
      return res.redirect('http://localhost:5173/mypage?linked=google&error=not-logged-in');
    }
    if (!socialId) {
      console.log(' FAIL: google profile id is missing (passport profile 문제)');
      return res.redirect('http://localhost:5173/mypage?linked=google&error=no-google-id');
    }

    //  2 이 구글 계정이 이미 어디에 붙어있는지 확인
    const [rows] = await db.query(
      `SELECT user_no FROM user_auth WHERE provider = ? AND social_id = ?`,
      [provider, socialId]
    );

    if (rows.length > 0 && Number(rows[0].user_no) !== Number(userNo)) {
      return res.redirect('http://localhost:5173/mypage?linked=google&error=already-linked');
    }

    //  3 INSERT 시도
    console.log(' INSERT into user_auth...');
    const [result] = await db.query(
      `
      INSERT INTO user_auth (user_no, provider, social_id)
      VALUES (?, ?, ?)
      `,
      [userNo, provider, socialId]
    );
    console.log(' INSERT result:', result);

    console.log(' SUCCESS: linked google to local user');
    return res.redirect('http://localhost:5173/mypage?linked=google');
  } catch (err) {
    console.error('googleLink error:', err?.code, err?.message, err);

    // 중복이면 성공 처리(선택)
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.redirect('http://localhost:5173/mypage?linked=google');
    }

    return res.redirect('http://localhost:5173/mypage?linked=google&error=fail');
  }
};

exports.kakaoLink = async (req, res) => {
  try {
    const userNo = req.localUserNo;        //  로컬 로그인 userNo
    const provider = 'kakao';
    const socialId = String(req.user?.id); //  kakao profile.id

    if (!userNo) {
      return res.redirect('http://localhost:5173/mypage?linked=kakao&error=not-logged-in');
    }
    if (!socialId) {
      return res.redirect('http://localhost:5173/mypage?linked=kakao&error=no-kakao-id');
    }

    // 다른 유저에 이미 연동된 카카오인지 체크
    const [rows] = await db.query(
      `SELECT user_no FROM user_auth WHERE provider = ? AND social_id = ?`,
      [provider, socialId]
    );

    if (rows.length > 0 && Number(rows[0].user_no) !== Number(userNo)) {
      return res.redirect('http://localhost:5173/mypage?linked=kakao&error=already-linked');
    }

    // 내 계정에 kakao 연동 row 추가
    await db.query(
      `INSERT INTO user_auth (user_no, provider, social_id) VALUES (?, ?, ?)`,
      [userNo, provider, socialId]
    );

    return res.redirect('http://localhost:5173/mypage?linked=kakao');
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.redirect('http://localhost:5173/mypage?linked=kakao');
    }
    console.error('kakaoLink error:', err);
    return res.redirect('http://localhost:5173/mypage?linked=kakao&error=fail');
  }
};