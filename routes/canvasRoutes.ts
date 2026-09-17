import express from 'express';
import { 
  generateCanvasForIdea, 
  regenerateCanvas 
} from '../controllers/canvasController';
import { protect } from '../middleware/authMiddleware';
import { canvasLimiter } from '../middleware/rateLimiter';
import { checkCredits, deductCredits } from '../middleware/creditMiddleware';

const router = express.Router();

// Apply rate limiting and credit checking to both routes
router.post('/:id', protect, canvasLimiter, checkCredits(1), generateCanvasForIdea, deductCredits(1, 'canvas'));
router.put('/:id', protect, canvasLimiter, checkCredits(1), regenerateCanvas, deductCredits(1, 'canvas'));

export default router;
