const express = require('express');
const router = express.Router();
const {
  getCreditPlans,
  getCreditHistory,
  purchaseCredits,
  verifyPayment,
  getCreditBalance,
  simulatePaymentSuccess  // Add this
} = require('../controllers/creditController');
const { protect } = require('../middleware/authMiddleware');

router.get('/plans', protect, getCreditPlans);
router.get('/history', protect, getCreditHistory);
router.get('/balance', protect, getCreditBalance);
router.post('/purchase', protect, purchaseCredits);
router.post('/create-checkout-session', protect, purchaseCredits); // Add alias for backward compatibility
router.post('/verify-payment', protect, verifyPayment);
router.post('/simulate-payment-success', protect, simulatePaymentSuccess);  // Add this

module.exports = router;
