const express = require("express");
const router = express.Router();
const userLogController = require("../controllers/userLogController");

// 상품 상세 로그 저장
router.post("/", userLogController.createUserLog);

module.exports = router;
