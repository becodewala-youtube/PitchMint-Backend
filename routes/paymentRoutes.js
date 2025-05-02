const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { upgradeUserToPremium, handlePaymentSuccess } = require('../controllers/paymentController');

router.post('/create-checkout-session', protect, upgradeUserToPremium);
router.post('/webhook', express.raw({ type: 'application/json' }), handlePaymentSuccess);

module.exports = router;