import { Request, Response } from 'express';
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
} from '../../auth.controller';
import User from '../../../users/user.model';
import * as emailService from '../../../../shared/integrations/email/email.service';
import authService from '../../auth.service';
import cloudinary from '../../../../shared/integrations/cloudinary/cloudinary.client';

jest.mock('../../../users/user.model');
jest.mock('../../../../shared/integrations/email/email.service');
jest.mock('../../auth.service');
jest.mock('../../../../shared/integrations/cloudinary/cloudinary.client', () => ({
  uploader: {
    destroy: jest.fn().mockResolvedValue({ result: 'ok' })
  }
}));

describe('Auth Controller Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();
    req = { body: {}, params: {}, query: {} };
    res = {
      status: statusMock,
      json: jsonMock
    };
  });

  describe('registerUser', () => {
    test('should return 400 if user already exists', async () => {
      req.body = { name: 'John', email: 'john@example.com', password: 'Password123!' };
      (User.findOne as jest.Mock).mockResolvedValue({ _id: 'existing-id' });

      await registerUser(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'User already exists'
      }));
    });

    test('should register user and send verification email on success', async () => {
      req.body = { name: 'John', email: 'john@example.com', password: 'Password123!' };
      (User.findOne as jest.Mock).mockResolvedValue(null);

      const mockSavedUser = {
        _id: 'new-user-123',
        name: 'John',
        email: 'john@example.com',
        generateEmailVerificationToken: jest.fn().mockReturnValue('123456'),
        save: jest.fn().mockResolvedValue(true)
      };
      (User.create as jest.Mock).mockResolvedValue(mockSavedUser);
      (emailService.sendEmailVerification as jest.Mock).mockResolvedValue(true);

      await registerUser(req as Request, res as Response);

      expect(User.create).toHaveBeenCalledWith({
        name: 'John',
        email: 'john@example.com',
        password: 'Password123!',
        authProvider: 'local'
      });
      expect(mockSavedUser.generateEmailVerificationToken).toHaveBeenCalled();
      expect(emailService.sendEmailVerification).toHaveBeenCalledWith('john@example.com', 'John', '123456');
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'new-user-123',
        emailSent: true
      }));
    });

    test('should handle email sending failure gracefully', async () => {
      req.body = { name: 'John', email: 'john@example.com', password: 'Password123!' };
      (User.findOne as jest.Mock).mockResolvedValue(null);
      const mockSavedUser = {
        _id: 'new-user-123',
        name: 'John',
        email: 'john@example.com',
        generateEmailVerificationToken: jest.fn().mockReturnValue('123456'),
        save: jest.fn().mockResolvedValue(true)
      };
      (User.create as jest.Mock).mockResolvedValue(mockSavedUser);
      (emailService.sendEmailVerification as jest.Mock).mockRejectedValue(new Error('SMTP connection error'));

      await registerUser(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'new-user-123',
        emailSent: true
      }));
    });

    test('should return 500 when database error occurs', async () => {
      req.body = { name: 'John', email: 'john@example.com', password: 'Password123!' };
      (User.findOne as jest.Mock).mockRejectedValue(new Error('DB failure'));

      await registerUser(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'DB failure'
      }));
    });
  });

  describe('verifyEmail', () => {
    test('should return 400 if verification token is invalid or expired', async () => {
      req.body = { email: 'john@example.com', token: 'invalid' };
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await verifyEmail(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid or expired verification token'
      }));
    });

    test('should verify email, generate token and return user profile', async () => {
      req.body = { email: 'john@example.com', token: '123456' };
      const mockUser = {
        _id: 'user-123',
        name: 'John',
        email: 'john@example.com',
        isPremium: false,
        credits: 3,
        plan: 'free',
        isEmailVerified: false,
        tokenVersion: 0,
        emailVerificationToken: '123456',
        emailVerificationExpires: new Date(Date.now() + 60000),
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (emailService.sendWelcomeEmail as jest.Mock).mockResolvedValue(true);
      (authService.generateToken as jest.Mock).mockReturnValue('jwt-token-xyz');

      await verifyEmail(req as Request, res as Response);

      expect(mockUser.isEmailVerified).toBe(true);
      expect(mockUser.emailVerificationToken).toBeNull();
      expect(mockUser.emailVerificationExpires).toBeNull();
      expect(mockUser.save).toHaveBeenCalled();
      expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith('john@example.com', 'John');
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        token: 'jwt-token-xyz',
        user: expect.objectContaining({ email: 'john@example.com', isEmailVerified: true })
      }));
    });

    test('should return 500 when error occurs during verification', async () => {
      req.body = { email: 'john@example.com', token: '123456' };
      (User.findOne as jest.Mock).mockRejectedValue(new Error('Server error'));

      await verifyEmail(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Server error'
      }));
    });
  });

  describe('resendVerification', () => {
    test('should return 400 if user not found or already verified', async () => {
      req.body = { email: 'john@example.com' };
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await resendVerification(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found or already verified'
      }));
    });

    test('should return 500 if sending verification email fails', async () => {
      req.body = { email: 'john@example.com' };
      const mockUser = {
        name: 'John',
        generateEmailVerificationToken: jest.fn().mockReturnValue('654321'),
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (emailService.sendEmailVerification as jest.Mock).mockRejectedValue(new Error('SMTP failure'));

      await resendVerification(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Failed to send verification email. Please try again later.'
      }));
    });

    test('should succeed and return 200 when email is resent', async () => {
      req.body = { email: 'john@example.com' };
      const mockUser = {
        name: 'John',
        generateEmailVerificationToken: jest.fn().mockReturnValue('654321'),
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (emailService.sendEmailVerification as jest.Mock).mockResolvedValue(true);

      await resendVerification(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Verification email sent successfully'
      }));
    });
  });

  describe('loginUser', () => {
    test('should return 400 if email or password is missing', async () => {
      req.body = { email: 'john@example.com' };

      await loginUser(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Email and password are required'
      }));
    });

    test('should return 401 if user does not exist', async () => {
      req.body = { email: 'nonexistent@example.com', password: 'Password123!' };
      const selectMock = jest.fn().mockResolvedValue(null);
      (User.findOne as jest.Mock).mockReturnValue({ select: selectMock });

      await loginUser(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid credentials'
      }));
    });

    test('should return 401 if email is not verified', async () => {
      req.body = { email: 'unverified@example.com', password: 'Password123!' };
      const mockUser = {
        email: 'unverified@example.com',
        isEmailVerified: false
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findOne as jest.Mock).mockReturnValue({ select: selectMock });

      await loginUser(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        emailNotVerified: true
      }));
    });

    test('should return 401 if account uses Google sign-in without password', async () => {
      req.body = { email: 'google@example.com', password: 'Password123!' };
      const mockUser = {
        email: 'google@example.com',
        isEmailVerified: true,
        password: null
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findOne as jest.Mock).mockReturnValue({ select: selectMock });

      await loginUser(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'This account uses Google sign-in. Please continue with Google.'
      }));
    });

    test('should return 401 if password does not match', async () => {
      req.body = { email: 'john@example.com', password: 'WrongPassword123!' };
      const mockUser = {
        email: 'john@example.com',
        isEmailVerified: true,
        password: 'hashed-password',
        matchPassword: jest.fn().mockResolvedValue(false)
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findOne as jest.Mock).mockReturnValue({ select: selectMock });

      await loginUser(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid credentials'
      }));
    });

    test('should log in successfully, trigger credit reset and return token and user', async () => {
      req.body = { email: 'john@example.com', password: 'CorrectPassword123!' };
      const mockUser = {
        _id: 'user-123',
        name: 'John',
        email: 'john@example.com',
        isEmailVerified: true,
        password: 'hashed-password',
        isPremium: false,
        credits: 3,
        plan: 'free',
        profilePicture: null,
        tokenVersion: 0,
        matchPassword: jest.fn().mockResolvedValue(true),
        checkAndResetMonthlyCredits: jest.fn().mockResolvedValue(false)
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findOne as jest.Mock).mockReturnValue({ select: selectMock });
      (authService.generateToken as jest.Mock).mockReturnValue('jwt-token-123');

      await loginUser(req as Request, res as Response);

      expect(mockUser.checkAndResetMonthlyCredits).toHaveBeenCalled();
      expect(authService.generateToken).toHaveBeenCalledWith('user-123', 0);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        token: 'jwt-token-123',
        user: expect.objectContaining({ email: 'john@example.com' })
      }));
    });
  });

  describe('googleAuth', () => {
    test('should return 400 if google credential is invalid', async () => {
      req.body = { credential: 'bad-token' };
      (authService.verifyGoogleToken as jest.Mock).mockResolvedValue(null);

      await googleAuth(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid Google credential'
      }));
    });

    test('should update existing user and return auth token', async () => {
      req.body = { credential: 'valid-google-cred' };
      (authService.verifyGoogleToken as jest.Mock).mockResolvedValue({
        sub: 'google-sub-1',
        email: 'existing@example.com',
        name: 'Google User',
        picture: 'https://photo.url'
      });

      const mockExistingUser = {
        _id: 'user-exist',
        name: 'Existing',
        email: 'existing@example.com',
        googleId: null,
        authProvider: 'local',
        profilePicture: null,
        isEmailVerified: false,
        credits: 3,
        plan: 'free',
        isPremium: false,
        tokenVersion: 1,
        save: jest.fn().mockResolvedValue(true),
        checkAndResetMonthlyCredits: jest.fn().mockResolvedValue(false)
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockExistingUser);
      (authService.generateToken as jest.Mock).mockReturnValue('jwt-google-user');

      await googleAuth(req as Request, res as Response);

      expect(mockExistingUser.googleId).toBe('google-sub-1');
      expect(mockExistingUser.authProvider).toBe('google');
      expect(mockExistingUser.isEmailVerified).toBe(true);
      expect(mockExistingUser.profilePicture).toBe('https://photo.url');
      expect(mockExistingUser.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        token: 'jwt-google-user'
      }));
    });

    test('should create new user if user does not exist', async () => {
      req.body = { credential: 'valid-google-cred' };
      (authService.verifyGoogleToken as jest.Mock).mockResolvedValue({
        sub: 'google-sub-2',
        email: 'newgoogle@example.com',
        name: 'Brand New',
        picture: 'https://photo.url/pic.jpg'
      });

      (User.findOne as jest.Mock).mockResolvedValue(null);
      const mockCreatedUser = {
        _id: 'user-created',
        name: 'Brand New',
        email: 'newgoogle@example.com',
        credits: 3,
        plan: 'free',
        isPremium: false,
        isEmailVerified: true,
        profilePicture: 'https://photo.url/pic.jpg',
        tokenVersion: 0,
        checkAndResetMonthlyCredits: jest.fn().mockResolvedValue(false)
      };
      (User.create as jest.Mock).mockResolvedValue(mockCreatedUser);
      (authService.generateToken as jest.Mock).mockReturnValue('jwt-new-user');

      await googleAuth(req as Request, res as Response);

      expect(User.create).toHaveBeenCalledWith({
        name: 'Brand New',
        email: 'newgoogle@example.com',
        googleId: 'google-sub-2',
        authProvider: 'google',
        isEmailVerified: true,
        profilePicture: 'https://photo.url/pic.jpg'
      });
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        token: 'jwt-new-user'
      }));
    });
  });

  describe('forgotPassword', () => {
    const genericSuccessMessage = 'If an account exists for that email address, password reset instructions have been sent.';

    test('should return 200 and generic message if user not found (prevent enumeration)', async () => {
      req.body = { email: 'unknown@example.com' };
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await forgotPassword(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: genericSuccessMessage
      }));
    });

    test('should return 200 and generic message if sending reset email fails (prevent enumeration)', async () => {
      req.body = { email: 'john@example.com' };
      const mockUser = {
        name: 'John',
        generatePasswordResetToken: jest.fn().mockReturnValue('reset-hex-token'),
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (emailService.sendPasswordReset as jest.Mock).mockRejectedValue(new Error('Email send failed'));

      await forgotPassword(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: genericSuccessMessage
      }));
    });

    test('should successfully send password reset code and return generic message', async () => {
      req.body = { email: 'john@example.com' };
      const mockUser = {
        name: 'John',
        generatePasswordResetToken: jest.fn().mockReturnValue('reset-hex-token'),
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (emailService.sendPasswordReset as jest.Mock).mockResolvedValue(true);

      await forgotPassword(req as Request, res as Response);

      expect(emailService.sendPasswordReset).toHaveBeenCalledWith('john@example.com', 'John', 'reset-hex-token');
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: genericSuccessMessage
      }));
    });
  });

  describe('resetPassword', () => {
    test('should return 400 if reset token is invalid or expired', async () => {
      req.body = { email: 'john@example.com', token: 'bad-token', newPassword: 'NewPassword123!' };
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await resetPassword(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid or expired reset token'
      }));
    });

    test('should reset password, bump tokenVersion, and clear reset tokens', async () => {
      req.body = { email: 'john@example.com', token: 'good-token', newPassword: 'NewPassword123!' };
      const mockUser = {
        password: 'old-password',
        tokenVersion: 2,
        passwordResetToken: 'good-token',
        passwordResetExpires: new Date(Date.now() + 60000),
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      await resetPassword(req as Request, res as Response);

      expect(mockUser.password).toBe('NewPassword123!');
      expect(mockUser.tokenVersion).toBe(3);
      expect(mockUser.passwordResetToken).toBeNull();
      expect(mockUser.passwordResetExpires).toBeNull();
      expect(mockUser.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Password reset successfully'
      }));
    });
  });

  describe('getUserProfile', () => {
    test('should return 404 if user not found', async () => {
      (req as any).user = { _id: 'missing-user' };
      (User.findById as jest.Mock).mockResolvedValue(null);

      await getUserProfile(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found'
      }));
    });

    test('should return user profile and trigger monthly credit check', async () => {
      (req as any).user = { _id: 'user-profile-id' };
      const mockUser = {
        _id: 'user-profile-id',
        name: 'Profile User',
        email: 'profile@example.com',
        isPremium: false,
        credits: 3,
        plan: 'free',
        isEmailVerified: true,
        profilePicture: null,
        authProvider: 'local',
        checkAndResetMonthlyCredits: jest.fn().mockResolvedValue(false)
      };
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      await getUserProfile(req as Request, res as Response);

      expect(mockUser.checkAndResetMonthlyCredits).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Profile User',
        email: 'profile@example.com'
      }));
    });
  });

  describe('updateUserProfile', () => {
    test('should return 404 if user not found', async () => {
      (req as any).user = { _id: 'missing-id' };
      const selectMock = jest.fn().mockResolvedValue(null);
      (User.findById as jest.Mock).mockReturnValue({ select: selectMock });

      await updateUserProfile(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found'
      }));
    });

    test('should update email and require verification for local accounts', async () => {
      (req as any).user = { _id: 'user-id' };
      req.body = { email: 'newemail@example.com' };

      const mockUser = {
        _id: 'user-id',
        name: 'John',
        email: 'old@example.com',
        authProvider: 'local',
        isEmailVerified: true,
        generateEmailVerificationToken: jest.fn().mockReturnValue('tok123'),
        save: jest.fn().mockResolvedValue(true)
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findById as jest.Mock).mockReturnValue({ select: selectMock });
      (emailService.sendEmailVerification as jest.Mock).mockResolvedValue(true);

      await updateUserProfile(req as Request, res as Response);

      expect(mockUser.email).toBe('newemail@example.com');
      expect(mockUser.isEmailVerified).toBe(false);
      expect(emailService.sendEmailVerification).toHaveBeenCalledWith('newemail@example.com', 'John', 'tok123');
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        emailVerificationRequired: true
      }));
    });

    test('should require current password if updating password', async () => {
      (req as any).user = { _id: 'user-id' };
      req.body = { password: 'NewPassword123!' };

      const mockUser = {
        _id: 'user-id',
        name: 'John',
        email: 'john@example.com',
        authProvider: 'local'
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findById as jest.Mock).mockReturnValue({ select: selectMock });

      await updateUserProfile(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Current password is required to set a new password'
      }));
    });

    test('should reject password update if current password does not match', async () => {
      (req as any).user = { _id: 'user-id' };
      req.body = { password: 'NewPassword123!', currentPassword: 'WrongPassword' };

      const mockUser = {
        _id: 'user-id',
        name: 'John',
        email: 'john@example.com',
        authProvider: 'local',
        matchPassword: jest.fn().mockResolvedValue(false)
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findById as jest.Mock).mockReturnValue({ select: selectMock });

      await updateUserProfile(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Incorrect current password'
      }));
    });

    test('should update password and bump tokenVersion when current password matches', async () => {
      (req as any).user = { _id: 'user-id' };
      req.body = { name: 'John Doe', password: 'NewPassword123!', currentPassword: 'RightPassword' };

      const mockUser = {
        _id: 'user-id',
        name: 'John',
        email: 'john@example.com',
        password: 'OldPassword123!',
        authProvider: 'local',
        tokenVersion: 0,
        isPremium: false,
        credits: 3,
        plan: 'free',
        isEmailVerified: true,
        profilePicture: null,
        matchPassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        })
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findById as jest.Mock).mockReturnValue({ select: selectMock });

      await updateUserProfile(req as Request, res as Response);

      expect(mockUser.name).toBe('John Doe');
      expect(mockUser.password).toBe('NewPassword123!');
      expect(mockUser.tokenVersion).toBe(1);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        name: 'John Doe'
      }));
    });
  });

  describe('uploadProfilePicture', () => {
    test('should return 400 if no file was uploaded', async () => {
      (req as any).file = null;

      await uploadProfilePicture(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'No file uploaded'
      }));
    });

    test('should return 404 if user not found', async () => {
      (req as any).file = { path: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' };
      (req as any).user = { _id: 'missing-user' };
      (User.findById as jest.Mock).mockResolvedValue(null);

      await uploadProfilePicture(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found'
      }));
    });

    test('should destroy old cloudinary picture and update with new path', async () => {
      (req as any).file = { path: 'https://res.cloudinary.com/pitchmint/avatars/new_pic.jpg' };
      (req as any).user = { _id: 'user-123' };

      const mockUser = {
        profilePicture: 'https://res.cloudinary.com/pitchmint/avatars/old_pic.jpg',
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      await uploadProfilePicture(req as Request, res as Response);

      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('pitchmint/avatars/old_pic');
      expect(mockUser.profilePicture).toBe('https://res.cloudinary.com/pitchmint/avatars/new_pic.jpg');
      expect(mockUser.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Profile picture updated successfully',
        profilePicture: 'https://res.cloudinary.com/pitchmint/avatars/new_pic.jpg'
      }));
    });
  });
});
