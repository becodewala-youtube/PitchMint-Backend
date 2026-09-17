import express from 'express';
import { 
  generatePitchDeckForIdea,
  regeneratePitchDeck,
  generateTalkingPointsForSlide,
  updateSlideContent,
  addComment,
  deleteComment,
  processVoiceFeedback
} from '../controllers/pitchDeckController';
import { protect } from '../middleware/authMiddleware';
import { pitchDeckLimiter } from '../middleware/rateLimiter';
import { checkCredits } from '../middleware/creditMiddleware';
import { audioUpload } from '../middleware/uploadMiddleware';

const router = express.Router();

router.post('/:id', protect, pitchDeckLimiter, checkCredits(1), generatePitchDeckForIdea);
router.put('/:id', protect, pitchDeckLimiter, checkCredits(1), regeneratePitchDeck);
router.post('/talking-points/:id', protect, generateTalkingPointsForSlide);
router.put('/collaborative/:id/slide', protect, updateSlideContent);
router.post('/collaborative/:id/comment', protect, addComment);
router.delete('/collaborative/:id/comment/:commentId', protect, deleteComment);
router.post(
  '/voice-feedback/:id',
  protect,
  audioUpload.single('audio'),
  processVoiceFeedback
);

export default router;
