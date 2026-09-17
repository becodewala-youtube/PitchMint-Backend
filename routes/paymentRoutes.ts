import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { 
  upgradeUserToPremium, 
  verifyPremiumPayment,
  handlePaymentWebhook
} from '../controllers/paymentController';

const router = express.Router();

router.post('/create-checkout-session', protect, upgradeUserToPremium);
router.post('/verify-premium', protect, verifyPremiumPayment);
router.post('/webhook', express.raw({ type: 'application/json' }), handlePaymentWebhook);

export default router;
