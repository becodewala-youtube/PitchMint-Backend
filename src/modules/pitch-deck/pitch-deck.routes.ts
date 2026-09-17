import express from 'express';
import { 
  generatePitchDeckForIdea,
  regeneratePitchDeck,
  generateTalkingPointsForSlide,
  updateSlideContent,
  addComment,
  deleteComment,
  processVoiceFeedback
} from './pitch-deck.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { pitchDeckLimiter } from '../../shared/middleware/rate-limiter.middleware';
import { checkCredits } from '../../shared/middleware/credit.middleware';
import { audioUpload } from '../../shared/middleware/upload.middleware';

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
