const express = require('express');
const router = express.Router();

const loginController = require('../controllers/loginController');
const profileController = require('../controllers/profileController');
const passwordController = require('../controllers/passwordController');

// JWT 인증 필요
router.get('/me', loginController.verifyToken, loginController.me);
router.put('/profile', loginController.verifyToken, profileController.updateProfile);
router.post('/change-password', loginController.verifyToken, passwordController.changePassword);
router.get('/providers', loginController.verifyToken, profileController.getProviders);

module.exports = router;
