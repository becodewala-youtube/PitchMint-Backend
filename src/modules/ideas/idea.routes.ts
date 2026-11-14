import express from 'express';
import { 
  submitStartupIdea, 
  getIdeaById, 
  getSavedIdeas, 
  deleteIdea 
} from './idea.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { checkCredits } from '../../shared/middleware/credit.middleware';
import { idempotencyMiddleware } from '../../shared/middleware/idempotency.middleware';

const router = express.Router();

router.post('/submit', protect, idempotencyMiddleware, checkCredits(1), submitStartupIdea);
router.get('/saved', protect, getSavedIdeas);
router.get('/:id', protect, getIdeaById);
router.delete('/:id', protect, deleteIdea);

export default router;
