const express = require('express');
const router = express.Router();
const { 
generatePitchDeckForIdea,
  regeneratePitchDeck,
  generateTalkingPointsForSlide,
  updateSlideContent,
  addComment,
  deleteComment,
  processVoiceFeedback
} = require('../controllers/pitchDeckController');
const { protect } = require('../middleware/authMiddleware');
const { pitchDeckLimiter } = require('../middleware/rateLimiter');
const { checkCredits } = require('../middleware/creditMiddleware');
const { audioUpload } = require('../middleware/uploadMiddleware');

// Remove deductCredits middleware - handle in controller
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


module.exports = router;
