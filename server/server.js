require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const authLocalRoutes = require('./routes/authLocalRoutes');
const userRoutes = require('./routes/userRoutes');
const emailRoutes = require('./routes/emailRoutes');
const socialAuthRoutes = require('./routes/socialAuthRoutes');
const oauthRoutes = require('./routes/oauthRoutes');
const chatbotRoutes = require("./routes/chatbotRoutes");
const csRoutes = require("./routes/csRoutes");
const csAdminRoutes = require("./routes/csAdminRoutes");

const app = express();
//  회원가입 / 인증 라우터
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(passport.initialize());
app.use(cookieParser());
app.use('/auth', authLocalRoutes);
app.use('/auth', userRoutes);
app.use('/auth', emailRoutes);
app.use('/auth', socialAuthRoutes);
app.use('/auth', oauthRoutes);
app.use("/api/chat", chatbotRoutes);
app.use("/api/cs", csRoutes);
app.use("/api/admin/cs", csAdminRoutes);

// 로컬 JSON 제품 전체 조회
app.get('/api/local-products', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'techspecs-raw.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);

    //  실제 배열은 json.data (각 요소 안에 Product, Release Date 등)
    res.json(json.data || []);
  } catch (e) {
    console.error('local-products 읽기 실패:', e);
    res.status(500).json({ message: '로컬 제품 데이터를 불러올 수 없습니다.' });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
