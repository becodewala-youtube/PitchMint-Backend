const express = require('express');
const router = express.Router();
const { 
  generateCanvasForIdea, 
  regenerateCanvas 
} = require('../controllers/canvasController');
const { protect } = require('../middleware/authMiddleware');
const { canvasLimiter } = require('../middleware/rateLimiter');
const { checkCredits, deductCredits } = require('../middleware/creditMiddleware');

// Apply rate limiting and credit checking to both routes
router.post('/:id', protect, canvasLimiter, checkCredits(1), generateCanvasForIdea, deductCredits(1, 'canvas'));
router.put('/:id', protect, canvasLimiter, checkCredits(1), regenerateCanvas, deductCredits(1, 'canvas'));

module.exports = router;