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
} from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';
import { upload } from '../middleware/uploadMiddleware';
import { validateUserRegistration, handleValidationErrors } from '../middleware/sanitizer';

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
