const express = require("express");
const { chat } = require("../controllers/chatbotController");

const router = express.Router();

router.post("/", chat);

module.exports = router;
