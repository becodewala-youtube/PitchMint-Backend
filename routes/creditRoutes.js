const express = require('express');
const router = express.Router();
const {
  getCreditPlans,
  getCreditHistory,
  purchaseCredits,
  confirmPurchase,
  getCreditBalance
} = require('../controllers/creditController');
const { protect } = require('../middleware/authMiddleware');

router.get('/plans', protect, getCreditPlans);
router.get('/history', protect, getCreditHistory);
router.get('/balance', protect, getCreditBalance);
router.post('/purchase', protect, purchaseCredits);
router.post('/confirm-purchase', protect, confirmPurchase);

module.exports = router;