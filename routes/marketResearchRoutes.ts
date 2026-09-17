import express from 'express';
import { analyzeMarket } from '../controllers/marketResearchController';
import { protect } from '../middleware/authMiddleware';
import { checkCredits } from '../middleware/creditMiddleware';

const router = express.Router();

router.post('/analyze', protect, checkCredits(2), analyzeMarket);

export default router;
