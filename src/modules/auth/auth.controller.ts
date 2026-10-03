import { Request, Response } from 'express';
import User from '../users/user.model';
import { sendEmailVerification, sendPasswordReset, sendWelcomeEmail } from '../../shared/integrations/email/email.service';
import logger from '../../config/logger';
import cloudinary from '../../shared/integrations/cloudinary/cloudinary.client';
import authService from './auth.service';

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Create user
    const userPayload: any = {
      name,
      email,
      password,
      authProvider: 'local'
    };
    if (process.env.E2E_TEST === 'true') {
      userPayload.isEmailVerified = true;
    }
    const user = await User.create(userPayload);

    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    try {
      await sendEmailVerification(email, name, verificationToken);
    } catch (emailError) {
      logger.error('Failed to send verification email:', emailError);
    }

    res.status(201).json({ success: true, message: 'User registered successfully. Please check your email for verification code.',
      userId: user._id,
      emailSent: true
    });
  } catch (error: any) {
    logger.error('Registration error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify email
// @route   POST /api/auth/verify-email
// @access  Public
export const verifyEmail = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, token } = req.body;

    const user = await User.findOne({
      email,
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(email, user.name);
    } catch (emailError) {
      logger.error('Failed to send welcome email:', emailError);
    }

    res.json({
      message: 'Email verified successfully',
      token: authService.generateToken(user._id, user.tokenVersion),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
        credits: user.credits,
        plan: user.plan,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error: any) {
    logger.error('Email verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
export const resendVerification = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isEmailVerified: false });

    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found or already verified' });
    }

    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    try {
      await sendEmailVerification(email, user.name, verificationToken);
    } catch (emailError) {
      logger.error('Failed to resend verification email:', emailError);
      return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again later.' });
    }

    res.json({ message: 'Verification email sent successfully' });
  } catch (error: any) {
    logger.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Authenticate a user & get token
// @route   POST /api/auth/signin
// @access  Public
export const loginUser = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Check for user email
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({ success: false, message: 'Please verify your email before logging in',
        emailNotVerified: true,
        email: user.email
      });
    }

    if (!user.password) {
      return res.status(401).json({ success: false, message: 'This account uses Google sign-in. Please continue with Google.'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Reset monthly credits if needed
    if (typeof user.checkAndResetMonthlyCredits === 'function') {
      await user.checkAndResetMonthlyCredits();
    }

    res.json({
      token: authService.generateToken(user._id, user.tokenVersion),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
        credits: user.credits,
        plan: user.plan,
        isEmailVerified: user.isEmailVerified,
        profilePicture: user.profilePicture
      },
    });
  } catch (error: any) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Google OAuth login
// @route   POST /api/auth/google
// @access  Public
export const googleAuth = async (req: Request, res: Response): Promise<any> => {
  try {
    const { credential } = req.body;

    // Verify Google token
    const payload = await authService.verifyGoogleToken(credential);
    if (!payload) {
      return res.status(400).json({ success: false, message: 'Invalid Google credential' });
    }

    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists
    let user = await User.findOne({ 
      $or: [
        { email },
        { googleId }
      ]
    });

    if (user) {
      // Update Google ID if not set
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
        user.isEmailVerified = true; // Google emails are pre-verified
      }
      // Update profilePicture from Google if present and not a custom Cloudinary avatar, or if empty
      if (picture && (!user.profilePicture || !user.profilePicture.includes('cloudinary'))) {
        user.profilePicture = picture;
      }
      if (name && !user.name) {
        user.name = name;
      }
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        name: name || '',
        email: email || '',
        googleId,
        authProvider: 'google',
        isEmailVerified: true,
        profilePicture: picture
      });
    }

    // Reset monthly credits if needed
    if (typeof user.checkAndResetMonthlyCredits === 'function') {
      await user.checkAndResetMonthlyCredits();
    }

    res.json({
      token: authService.generateToken(user._id, user.tokenVersion),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
        credits: user.credits,
        plan: user.plan,
        isEmailVerified: user.isEmailVerified,
        profilePicture: user.profilePicture
      },
    });
  } catch (error: any) {
    logger.error('Google auth error:', error);
    res.status(500).json({ success: false, message: 'Google authentication failed' });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    const successMessage = 'If an account exists for that email address, password reset instructions have been sent.';

    if (!user) {
      logger.info(`Forgot password requested for non-existent email: ${email}`);
      return res.json({ message: successMessage });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    try {
      await sendPasswordReset(email, user.name, resetToken);
    } catch (emailError) {
      logger.error('Failed to send password reset email:', emailError);
      // ENUMERATION FIX: Do not leak existence on email failure.
      return res.json({ message: successMessage });
    }

    res.json({ message: successMessage });
  } catch (error: any) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred. Please try again later.' });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, token, newPassword } = req.body;

    const user = await User.findOne({
      email,
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate old tokens
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    logger.error('Reset password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/user
// @access  Private
export const getUserProfile = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = await User.findById(req.user?._id);

    if (user) {
      // Reset monthly credits if needed
      if (typeof user.checkAndResetMonthlyCredits === 'function') {
        await user.checkAndResetMonthlyCredits();
      }

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
        credits: user.credits,
        plan: user.plan,
        isEmailVerified: user.isEmailVerified,
        profilePicture: user.profilePicture,
        authProvider: user.authProvider
      });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error: any) {
    logger.error('Get profile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/user
// @access  Private
export const updateUserProfile = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = await User.findById(req.user?._id).select('+password');

    if (user) {
      user.name = req.body.name || user.name;
      
      // Only update email if it's different and user is not using Google auth
      if (req.body.email && req.body.email !== user.email && user.authProvider !== 'google') {
        user.email = req.body.email;
        user.isEmailVerified = false;
        
        // Send new verification email
        const verificationToken = user.generateEmailVerificationToken();
        await user.save();
        
        try {
          await sendEmailVerification(user.email, user.name, verificationToken);
        } catch (emailError) {
          logger.error('Failed to send verification email:', emailError);
        }
        
        return res.json({
          message: 'Profile updated. Please verify your new email address.',
          emailVerificationRequired: true
        });
      }
      
      if (req.body.password && user.authProvider === 'local') {
        if (!req.body.currentPassword) {
          return res.status(400).json({ success: false, message: 'Current password is required to set a new password' });
        }
        
        const isMatch = await user.matchPassword(req.body.currentPassword);
        if (!isMatch) {
          return res.status(401).json({ success: false, message: 'Incorrect current password' });
        }

        user.password = req.body.password;
        user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate old tokens
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        isPremium: updatedUser.isPremium,
        credits: updatedUser.credits,
        plan: updatedUser.plan,
        isEmailVerified: updatedUser.isEmailVerified,
        profilePicture: updatedUser.profilePicture
      });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error: any) {
    logger.error('Update profile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload profile picture
// @route   POST /api/auth/upload-avatar
// @access  Private
export const uploadProfilePicture = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user?._id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete old profile picture from Cloudinary if exists
    if (user.profilePicture && user.profilePicture.includes('cloudinary')) {
      try {
        const publicId = user.profilePicture.split('/').pop()?.split('.')[0];
        if (publicId) {
          await cloudinary.uploader.destroy(`pitchmint/avatars/${publicId}`);
        }
      } catch (error) {
        logger.warn('Failed to delete old profile picture:', error);
      }
    }

    // Update profile picture with Cloudinary URL
    user.profilePicture = req.file.path;
    await user.save();

    res.json({
      message: 'Profile picture updated successfully',
      profilePicture: user.profilePicture
    });
  } catch (error: any) {
    logger.error('Upload avatar error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
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
};
