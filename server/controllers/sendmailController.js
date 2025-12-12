// controllers/sendmailController.js
const nodemailer = require('nodemailer');

const emailCodes = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// 인증번호 발송
exports.sendEmailCode = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: '이메일 필요' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  emailCodes[email] = {
    code,
    expiresAt: Date.now() + 1000 * 60 * 5, // 5분
  };

  try {
    await transporter.sendMail({
      from: `"MyApp" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: '[MyApp] 이메일 인증번호',
      html: `
        <div style="font-family: Arial">
          <h2>이메일 인증번호</h2>
          <h1>${code}</h1>
          <p>5분 이내 입력해주세요.</p>
        </div>
      `,
    });

    res.json({ message: '인증번호 발송 완료' });
  } catch (err) {
    console.error('메일 발송 에러:', err);
    res.status(500).json({ message: '메일 발송 실패' });
  }
};

// 인증번호 검증
exports.verifyEmailCode = (req, res) => {
  const { email, code } = req.body;
  const data = emailCodes[email];

  if (!data) return res.status(400).json({ verified: false });

  if (Date.now() > data.expiresAt) {
    delete emailCodes[email];
    return res.status(400).json({ message: '만료됨' });
  }

  if (data.code === code) {
    delete emailCodes[email];
    return res.json({ verified: true });
  }

  res.status(400).json({ verified: false });
};
