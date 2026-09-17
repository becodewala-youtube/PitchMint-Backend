import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import ideaRoutes from '../modules/ideas/idea.routes';
import pitchDeckRoutes from '../modules/pitch-deck/pitch-deck.routes';
import canvasRoutes from '../modules/canvas/canvas.routes';
import investorRoutes from '../modules/investors/investor.routes';
import paymentRoutes from '../modules/payments/payment.routes';
import competitorRoutes from '../modules/competitors/competitor.routes';
import pitchSimulatorRoutes from '../modules/pitch-simulator/pitch-simulator.routes';
import creditRoutes from '../modules/credits/credit.routes';
import marketResearchRoutes from '../modules/market-research/market-research.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import { processRazorpayWebhook } from '../modules/payments/payment.webhook';

const router = Router();

// Mount business module routes
router.use('/api/auth', authRoutes);
router.use('/api/idea', ideaRoutes);
router.use('/api/pitchdeck', pitchDeckRoutes);
router.use('/api/canvas', canvasRoutes);
router.use('/api/investors', investorRoutes);
router.use('/api/payment', paymentRoutes);
router.use('/api/competitors', competitorRoutes);
router.use('/api/pitch-simulator', pitchSimulatorRoutes);
router.use('/api/credits', creditRoutes);
router.use('/api/market-research', marketResearchRoutes);
router.use('/api/history', dashboardRoutes);

// Mount top-level Razorpay webhook endpoint
router.post('/razorpay-webhook', processRazorpayWebhook);

export default router;
