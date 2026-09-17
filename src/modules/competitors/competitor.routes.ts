import express from 'express';
import { analyzeCompetitors, analyzeCompetitorsRandom } from './competitor.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { checkCredits, deductCredits } from '../../shared/middleware/credit.middleware';

const router = express.Router();

router.post('/analyze/:id', protect, checkCredits(1), analyzeCompetitors, deductCredits(1, 'competitor_analysis'));
router.post('/analyze', protect, checkCredits(1), analyzeCompetitorsRandom, deductCredits(1, 'competitor_analysis'));

export default router;
