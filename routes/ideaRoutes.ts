import express from 'express';
import { 
  submitStartupIdea, 
  getIdeaById, 
  getSavedIdeas,
  deleteIdea
} from '../controllers/ideaController';
import { protect } from '../middleware/authMiddleware';
import { checkCredits } from '../middleware/creditMiddleware';

const router = express.Router();

router.post('/submit', protect, checkCredits(1), submitStartupIdea);
router.get('/saved', protect, getSavedIdeas);
router.get('/:id', protect, getIdeaById);
router.delete('/:id', protect, deleteIdea);

export default router;
