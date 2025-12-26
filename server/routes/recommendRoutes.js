const express = require("express");
const router = express.Router();

const {
  getUserRecommendations
} = require("../controllers/recommendController");

// GET /api/recommend?user_no=1
router.get("/", getUserRecommendations);

module.exports = router;
