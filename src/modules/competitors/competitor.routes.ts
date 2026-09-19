import express from 'express';
import { analyzeCompetitors, analyzeCompetitorsRandom } from './competitor.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { checkCredits } from '../../shared/middleware/credit.middleware';

const router = express.Router();

router.post('/analyze/:id', protect, checkCredits(1), analyzeCompetitors);
router.post('/analyze', protect, checkCredits(1), analyzeCompetitorsRandom);

export default router;
