import express from 'express';
import { analyzeMarket } from './market-research.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { checkCredits } from '../../shared/middleware/credit.middleware';

const router = express.Router();

router.post('/analyze', protect, checkCredits(2), analyzeMarket);

export default router;
