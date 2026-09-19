import express from 'express';
import { 
  simulatePitch, 
  evaluateAnswer, 
  simulatePitchRandom, 
  evaluateAnswerRandom 
} from './pitch-simulator.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { checkCredits } from '../../shared/middleware/credit.middleware';

const router = express.Router();

router.post('/simulate/:id', protect, checkCredits(1), simulatePitch);
router.post('/evaluate/:id', protect, evaluateAnswer);
router.post('/simulate', protect, checkCredits(1), simulatePitchRandom);
router.post('/evaluate', protect, evaluateAnswerRandom);

export default router;
