const express = require('express');
const router = express.Router();
const passport = require('passport');

const googleController = require('../controllers/googleController');
const kakaoController = require('../controllers/kakaoController');

// 구글 로그인 시작
router.get(
  '/google',
  passport.authenticate('google-login', { scope: ['profile', 'email'] })
);

// 구글 로그인 콜백
router.get(
  '/google/callback',
  passport.authenticate('google-login', { session: false }),
  googleController.googleCallback
);

// 카카오 로그인 시작
router.get(
  '/kakao',
  passport.authenticate('kakao-login', { session: false })
);

// 카카오 로그인 콜백
router.get(
  '/kakao/callback',
  passport.authenticate('kakao-login', { session: false }),
  kakaoController.kakaoCallback
);

module.exports = router;
