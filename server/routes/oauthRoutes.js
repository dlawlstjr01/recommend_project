// routes/oauthRoutes.js
const express = require('express');
const router = express.Router();
const passport = require('passport');

const loginController = require('../controllers/loginController');
const oauthLinkController = require('../controllers/oauthLinkController');

//  Google 연동 시작

router.get(
  '/google/link',
  loginController.verifyToken,
  passport.authenticate('google-link', { scope: ['profile', 'email'], session: false })
);


// Google 연동 콜백

router.get(
  '/google/link/callback',
  loginController.verifyToken,
  (req, res, next) => {
    req.localUserNo = req.user.userNo;
    next();
  },
  passport.authenticate('google-link', { session: false }),
  oauthLinkController.googleLink
);

 // Kakao 연동 시작
router.get(
  '/kakao/link',
  loginController.verifyToken,
  passport.authenticate('kakao-link', { session: false })
);


 //  Kakao 연동 콜백
 
router.get(
  '/kakao/link/callback',
  loginController.verifyToken,
  (req, res, next) => {
    req.localUserNo = req.user.userNo;
    next();
  },
  passport.authenticate('kakao-link', { session: false }),
  oauthLinkController.kakaoLink
);

module.exports = router;
