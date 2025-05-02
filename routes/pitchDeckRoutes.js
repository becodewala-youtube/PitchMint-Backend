const express = require('express');
const router = express.Router();
const { 
  generatePitchDeckForIdea, 
  regeneratePitchDeck 
} = require('../controllers/pitchDeckController');
const { protect } = require('../middleware/authMiddleware');
const { pitchDeckLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to both routes
router.post('/:id', protect, pitchDeckLimiter, generatePitchDeckForIdea);
router.put('/:id', protect, pitchDeckLimiter, regeneratePitchDeck);

module.exports = router;