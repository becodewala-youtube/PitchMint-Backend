const express = require('express');
const router = express.Router();
const { 
  submitStartupIdea, 
  getIdeaById, 
  getSavedIdeas,
  deleteIdea
} = require('../controllers/ideaController');
const { protect } = require('../middleware/authMiddleware');

router.post('/submit', protect, submitStartupIdea);
router.get('/saved', protect, getSavedIdeas);
router.get('/:id', protect, getIdeaById);
router.delete('/:id', protect, deleteIdea);

module.exports = router;