import express from 'express';
import { 
  simulatePitch, 
  evaluateAnswer, 
  simulatePitchRandom, 
  evaluateAnswerRandom 
} from '../controllers/pitchSimulatorController';
import { protect } from '../middleware/authMiddleware';
import { checkCredits, deductCredits } from '../middleware/creditMiddleware';

const router = express.Router();

router.post('/simulate/:id', protect, checkCredits(1), simulatePitch, deductCredits(1, 'pitch_simulator'));
router.post('/evaluate/:id', protect, evaluateAnswer);
router.post('/simulate', protect, checkCredits(1), simulatePitchRandom, deductCredits(1, 'pitch_simulator'));
router.post('/evaluate', protect, evaluateAnswerRandom);

export default router;
