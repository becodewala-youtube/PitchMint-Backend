const express = require('express');
const router = express.Router();
const { 
  submitStartupIdea, 
  getIdeaById, 
  getSavedIdeas,
  deleteIdea
} = require('../controllers/ideaController');
const { protect } = require('../middleware/authMiddleware');
const { checkCredits, deductCredits } = require('../middleware/creditMiddleware');

router.post('/submit', protect, checkCredits(1), submitStartupIdea, deductCredits(1, 'idea_validation'));
router.get('/saved', protect, getSavedIdeas);
router.get('/:id', protect, getIdeaById);
router.delete('/:id', protect, deleteIdea);

module.exports = router;