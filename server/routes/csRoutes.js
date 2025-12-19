const express = require("express");
const jwt = require("jsonwebtoken");
const { verifyToken } = require("../controllers/loginController"); 
const noticeController = require("../controllers/noticeController");
const faqController = require("../controllers/faqController");
const inquiryController = require("../controllers/inquiryController");

const router = express.Router();

const authGuard = (req, res, next) => {
  // 1 Bearer 토큰
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;

  // 2 쿠키 accessToken
  const token = req.cookies?.accessToken || bearerToken;

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userNo: payload.userNo };const express = require("express");
const jwt = require("jsonwebtoken");

const noticeController = require("../controllers/noticeController");
const faqController = require("../controllers/faqController");
const inquiryController = require("../controllers/inquiryController");

const router = express.Router();

const authGuard = (req, res, next) => {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;

  // ✅ 쿠키 accessToken (signedCookie까지 겸용)
  const cookieToken = req.cookies?.accessToken || req.signedCookies?.accessToken;

  const token = cookieToken || bearerToken;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ 핵심: 토큰 payload는 userNo 로 들어있음
    const userNo = payload.userNo ?? payload.user_no;
    if (!userNo) return res.status(401).json({ message: "Unauthorized" });

    // ✅ 둘 다 세팅(컨트롤러 호환)
    req.user = {
      userNo,
      user_no: userNo,
      role: payload.role || "USER",
    };

    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// 공지/FAQ (public)
router.get("/notices", noticeController.listPublished);
router.get("/notices/:id", noticeController.getPublished);
router.get("/faqs", faqController.listPublished);

// 1:1 문의 (login required)
router.post("/inquiries", authGuard, inquiryController.create);
router.get("/inquiries", authGuard, inquiryController.listMine);
router.get("/inquiries/:id", authGuard, inquiryController.getMine);

module.exports = router;

    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// 공지/FAQ (public)
router.get("/notices", noticeController.listPublished);
router.get("/notices/:id", noticeController.getPublished);

router.get("/faqs", faqController.listPublished);

// 1:1 문의 (login required)
router.post("/inquiries", verifyToken, inquiryController.create);
router.get("/inquiries", verifyToken, inquiryController.listMine);
router.get("/inquiries/:id", verifyToken, inquiryController.getMine);


module.exports = router;
