const express = require('express');
const router = express.Router();
const { 
  generatePitchDeckForIdea, 
  regeneratePitchDeck 
} = require('../controllers/pitchDeckController');
const { protect } = require('../middleware/authMiddleware');
const { pitchDeckLimiter } = require('../middleware/rateLimiter');
const { checkCredits, deductCredits } = require('../middleware/creditMiddleware');

// Apply rate limiting and credit checking to both routes
router.post('/:id', protect, pitchDeckLimiter, checkCredits(1), generatePitchDeckForIdea, deductCredits(1, 'pitch_deck'));
router.put('/:id', protect, pitchDeckLimiter, checkCredits(1), regeneratePitchDeck, deductCredits(1, 'pitch_deck'));

module.exports = router;