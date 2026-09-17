import express from 'express';
import { 
  simulatePitch, 
  evaluateAnswer, 
  simulatePitchRandom, 
  evaluateAnswerRandom 
} from './pitch-simulator.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { checkCredits, deductCredits } from '../../shared/middleware/credit.middleware';

const router = express.Router();

router.post('/simulate/:id', protect, checkCredits(1), simulatePitch, deductCredits(1, 'pitch_simulator'));
router.post('/evaluate/:id', protect, evaluateAnswer);
router.post('/simulate', protect, checkCredits(1), simulatePitchRandom, deductCredits(1, 'pitch_simulator'));
router.post('/evaluate', protect, evaluateAnswerRandom);

export default router;
