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
import { validateUserRegistration } from './auth.validator';

const router = express.Router();

router.post('/register', validateUserRegistration, handleValidationErrors, registerUser);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/signin', loginUser);
router.post('/google', googleAuth);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/user', protect, getUserProfile);
router.put('/user', protect, updateUserProfile);
router.post('/upload-avatar', protect, upload.single('avatar'), uploadProfilePicture);

export default router;
