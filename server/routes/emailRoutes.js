const express = require('express');
const router = express.Router();

const sendmailController = require('../controllers/sendmailController');

router.post('/send-email-code', sendmailController.sendEmailCode);
router.post('/verify-email-code', sendmailController.verifyEmailCode);

module.exports = router;
