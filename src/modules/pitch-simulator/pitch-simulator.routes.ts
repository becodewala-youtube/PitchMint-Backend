import express from 'express';
import { 
  simulatePitch, 
  evaluateAnswer, 
  simulatePitchRandom, 
  evaluateAnswerRandom 
} from './pitch-simulator.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { checkCredits } from '../../shared/middleware/credit.middleware';
import { idempotencyMiddleware } from '../../shared/middleware/idempotency.middleware';

const router = express.Router();

router.post('/simulate/:id', protect, idempotencyMiddleware, checkCredits(1), simulatePitch);
router.post('/evaluate/:id', protect, evaluateAnswer);
router.post('/simulate', protect, idempotencyMiddleware, checkCredits(1), simulatePitchRandom);
router.post('/evaluate', protect, evaluateAnswerRandom);

export default router;
