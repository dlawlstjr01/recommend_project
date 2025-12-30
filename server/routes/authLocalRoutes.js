const express = require('express');
const router = express.Router();

const signupController = require('../controllers/SignupController');
const loginController = require('../controllers/loginController');

router.post('/check-id', signupController.checkId);
router.post('/signup', signupController.signup);

router.post('/login', loginController.login);
router.post('/logout', loginController.logout);

module.exports = router;
