import express from 'express';
import { protect } from '../../shared/middleware/auth.middleware';
import { 
  upgradeUserToPremium, 
  verifyPremiumPayment, 
  handlePaymentWebhook,
  simulatePremiumUpgrade 
} from './payment.controller';

const router = express.Router();

router.post('/create-checkout-session', protect, upgradeUserToPremium);
router.post('/verify-premium', protect, verifyPremiumPayment);
router.post('/simulate-premium-success', protect, simulatePremiumUpgrade);
router.post('/webhook', express.raw({ type: 'application/json' }), handlePaymentWebhook);

export default router;
