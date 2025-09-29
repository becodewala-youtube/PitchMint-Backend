const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { 
  upgradeUserToPremium, 
  verifyPremiumPayment,
  handlePaymentWebhook
} = require('../controllers/paymentController');

router.post('/create-checkout-session', protect, upgradeUserToPremium);
router.post('/verify-premium', protect, verifyPremiumPayment);
router.post('/webhook', express.raw({ type: 'application/json' }), handlePaymentWebhook);

module.exports = router;