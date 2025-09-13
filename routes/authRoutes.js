const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  verifyEmail,
  resendVerification,
  loginUser,
  googleAuth,
  forgotPassword,
  resetPassword,
  getUserProfile, 
  updateUserProfile,
  uploadProfilePicture
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { upload, audioUpload } = require('../middleware/uploadMiddleware');
const { validateUserRegistration, handleValidationErrors } = require('../middleware/sanitizer');

router.post('/register', validateUserRegistration, handleValidationErrors, registerUser);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/user', protect, getUserProfile);
router.put('/user', protect, updateUserProfile);
router.post('/upload-avatar', protect, upload.single('avatar'), uploadProfilePicture);

module.exports = router;