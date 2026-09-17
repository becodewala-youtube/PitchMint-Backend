import express from 'express';
import { analyzeCompetitors, analyzeCompetitorsRandom } from '../controllers/competitorController';
import { protect } from '../middleware/authMiddleware';
import { checkCredits, deductCredits } from '../middleware/creditMiddleware';

const router = express.Router();

router.post('/analyze/:id', protect, checkCredits(1), analyzeCompetitors, deductCredits(1, 'competitor_analysis'));
router.post('/analyze', protect, checkCredits(1), analyzeCompetitorsRandom, deductCredits(1, 'competitor_analysis'));

export default router;
