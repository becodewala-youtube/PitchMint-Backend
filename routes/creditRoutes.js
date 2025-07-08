const express = require('express');
const router = express.Router();
const {
  getCreditPlans,
  getCreditHistory,
  purchaseCredits,
  confirmPurchase,
  getCreditBalance,
  simulatePaymentSuccess  // Add this
} = require('../controllers/creditController');
const { protect } = require('../middleware/authMiddleware');

router.get('/plans', protect, getCreditPlans);
router.get('/history', protect, getCreditHistory);
router.get('/balance', protect, getCreditBalance);
router.post('/purchase', protect, purchaseCredits);
router.post('/confirm-purchase', protect, confirmPurchase);
router.post('/simulate-payment-success', protect, simulatePaymentSuccess);  // Add this

module.exports = router;
