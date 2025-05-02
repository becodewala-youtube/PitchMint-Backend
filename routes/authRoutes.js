const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  getUserProfile, 
  updateUserProfile,
  upgradeToPremium
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/user', protect, getUserProfile);
router.put('/user', protect, updateUserProfile);
router.put('/upgrade', protect, upgradeToPremium);

module.exports = router;