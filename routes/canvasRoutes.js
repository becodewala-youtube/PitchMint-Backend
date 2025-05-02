const express = require('express');
const router = express.Router();
const { 
  generateCanvasForIdea, 
  regenerateCanvas 
} = require('../controllers/canvasController');
const { protect } = require('../middleware/authMiddleware');
const { canvasLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to both routes
router.post('/:id', protect, canvasLimiter, generateCanvasForIdea);
router.put('/:id', protect, canvasLimiter, regenerateCanvas);

module.exports = router;