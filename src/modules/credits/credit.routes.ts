import express from 'express';
import {
  getCreditPlans,
  getCreditHistory,
  purchaseCredits,
  verifyPayment,
  getCreditBalance,
  simulatePaymentSuccess
} from './credit.controller';
import { protect } from '../../shared/middleware/auth.middleware';

const router = express.Router();

router.get('/plans', protect, getCreditPlans);
router.get('/history', protect, getCreditHistory);
router.get('/balance', protect, getCreditBalance);
router.post('/purchase', protect, purchaseCredits);
router.post('/create-checkout-session', protect, purchaseCredits); // Alias for backward compatibility
router.post('/verify-payment', protect, verifyPayment);
router.post('/simulate-payment-success', protect, simulatePaymentSuccess);

export default router;
