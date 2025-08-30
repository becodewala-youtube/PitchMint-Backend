const express = require('express');
const router = express.Router();
const { 
  generatePitchDeckForIdea, 
  regeneratePitchDeck ,
  generateTalkingPointsForSlide
} = require('../controllers/pitchDeckController');
const { protect } = require('../middleware/authMiddleware');
const { pitchDeckLimiter } = require('../middleware/rateLimiter');
const { checkCredits } = require('../middleware/creditMiddleware');

// Remove deductCredits middleware - handle in controller
router.post('/:id', protect, pitchDeckLimiter, checkCredits(1), generatePitchDeckForIdea);
router.put('/:id', protect, pitchDeckLimiter, checkCredits(1), regeneratePitchDeck);
router.post('/talking-points/:id', protect, generateTalkingPointsForSlide);

module.exports = router;
