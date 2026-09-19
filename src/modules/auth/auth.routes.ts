import express from 'express';
import { 
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
} from './auth.controller';
import { protect } from '../../shared/middleware/auth.middleware';
import { upload } from '../../shared/middleware/upload.middleware';
import { handleValidationErrors } from '../../shared/middleware/sanitizer.middleware';
import { strictAuthLimiter } from '../../shared/middleware/rate-limiter.middleware';
import { 
  validateUserRegistration, 
  validatePasswordReset, 
  validateUpdateProfile 
} from './auth.validator';

const router = express.Router();

router.post('/register', validateUserRegistration, handleValidationErrors, registerUser);
router.post('/verify-email', strictAuthLimiter, verifyEmail);
router.post('/resend-verification', strictAuthLimiter, resendVerification);
router.post('/signin', loginUser);
router.post('/google', googleAuth);
router.post('/forgot-password', strictAuthLimiter, forgotPassword);
router.post('/reset-password', strictAuthLimiter, validatePasswordReset, handleValidationErrors, resetPassword);
router.get('/user', protect, getUserProfile);
router.put('/user', protect, validateUpdateProfile, handleValidationErrors, updateUserProfile);
router.post('/upload-avatar', protect, upload.single('avatar'), uploadProfilePicture);

export default router;
