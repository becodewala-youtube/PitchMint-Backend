import express from 'express';
import { 
  generateCanvasForIdea, 
  regenerateCanvas 
} from './canvas.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { canvasLimiter } from '../../shared/middleware/rate-limiter.middleware';
import { checkCredits } from '../../shared/middleware/credit.middleware';

const router = express.Router();

// Apply rate limiting and credit checking to both routes
router.post('/:id', protect, canvasLimiter, checkCredits(1), generateCanvasForIdea);
router.put('/:id', protect, canvasLimiter, checkCredits(1), regenerateCanvas);

export default router;
