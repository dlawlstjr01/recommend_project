const express = require("express");

const noticeController = require("../controllers/noticeController");
const faqController = require("../controllers/faqController");
const inquiryController = require("../controllers/inquiryController");
const { verifyToken } = require("../controllers/loginController");

const router = express.Router();

const adminGuard = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "관리자 권한 필요" });
  }
  next();
};

router.use(verifyToken, adminGuard);

// Notices admin
router.get("/notices", noticeController.listAdmin);
router.get("/notices/:id", noticeController.getAdmin);
router.post("/notices", noticeController.create);
router.patch("/notices/:id", noticeController.update);
router.delete("/notices/:id", noticeController.remove);

// FAQs admin
router.get("/faqs", faqController.listAdmin);
router.post("/faqs", faqController.create);
router.patch("/faqs/:id", faqController.update);
router.delete("/faqs/:id", faqController.remove);

// Inquiries admin
router.get("/inquiries", inquiryController.listAdmin);
router.get("/inquiries/:id", inquiryController.getAdmin);
router.post("/inquiries/:id/reply", inquiryController.reply);
router.patch("/inquiries/:id/status", inquiryController.updateStatus);
router.delete("/inquiries/:id", inquiryController.remove);

module.exports = router;
