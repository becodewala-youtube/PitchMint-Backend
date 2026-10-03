import request from 'supertest';
import { connectTestDB, closeTestDB, clearTestDB } from '../../../../../tests/setup/test-db';
import { createTestUser, createAuthHeader } from '../../../../../tests/setup/test-helpers';
import User from '../../../../../src/modules/users/user.model';
import * as emailService from '../../../../../src/shared/integrations/email/email.service';
import authService from '../../../../../src/modules/auth/auth.service';
import cloudinary from '../../../../../src/shared/integrations/cloudinary/cloudinary.client';

// Mock external boundaries
jest.mock('../../../../../src/shared/integrations/email/email.service', () => ({
  sendEmailVerification: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('multer-storage-cloudinary', () => ({
  CloudinaryStorage: jest.fn().mockImplementation(() => ({
    _handleFile: (_req: any, file: any, cb: any) => {
      file.stream.on('data', () => {});
      file.stream.on('end', () => {
        cb(null, {
          path: 'https://res.cloudinary.com/demo/image/upload/v1234/test_avatar.png',
          size: 1024,
          filename: 'test_avatar.png'
        });
      });
      file.stream.on('error', (err: any) => {
        cb(err);
      });
      file.stream.resume();
    },
    _removeFile: (_req: any, _file: any, cb: any) => {
      cb(null);
    }
  }))
}));

// Import app AFTER mocks are established
import app from '../../../../../tests/setup/test-app';

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should successfully register a new user and generate a verification code', async () => {
      const payload = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('User registered successfully');
      expect(res.body.userId).toBeDefined();

      // Verify database state
      const dbUser = await User.findOne({ email: payload.email });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.name).toBe('John Doe');
      expect(dbUser?.isEmailVerified).toBe(false);
      expect(dbUser?.monthlyCredits).toBe(3);
      expect(dbUser?.emailVerificationToken).toHaveLength(6);
      expect(dbUser?.emailVerificationExpires).toBeDefined();

      // Verify email service was invoked with verification token
      expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
        payload.email,
        payload.name,
        dbUser?.emailVerificationToken
      );
    });

    it('should reject registration if email is already taken', async () => {
      await createTestUser({ email: 'taken@example.com' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'taken@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('User already exists');
    });

    it('should fail validation on invalid email or weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: '',
          email: 'invalid-email',
          password: 'weak'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should verify email and return a valid JWT token when given valid token', async () => {
      const user = await createTestUser({
        isEmailVerified: false,
        emailVerificationToken: '123456',
        emailVerificationExpires: new Date(Date.now() + 10 * 60 * 1000)
      });

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: user.email,
          token: '123456'
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Email verified successfully');
      expect(res.body.token).toBeDefined();
      expect(res.body.user.isEmailVerified).toBe(true);

      // Verify in DB
      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.isEmailVerified).toBe(true);
      expect(updatedUser?.emailVerificationToken).toBeNull();

      // Welcome email triggered
      expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(user.email, user.name);
    });

    it('should reject email verification with expired or incorrect token', async () => {
      const user = await createTestUser({
        isEmailVerified: false,
        emailVerificationToken: '999999',
        emailVerificationExpires: new Date(Date.now() - 1000) // expired
      });

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: user.email,
          token: '999999'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid or expired verification token');
    });
  });

  describe('POST /api/auth/signin', () => {
    it('should authenticate user and return token when credentials are valid', async () => {
      const email = 'signin_user@example.com';
      await createTestUser({
        email,
        password: 'Password123!',
        isEmailVerified: true
      });

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email,
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.credits).toBe(3);
    });

    it('should reject login with wrong password', async () => {
      const email = 'wrong_pass@example.com';
      await createTestUser({ email, isEmailVerified: true });

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email,
          password: 'IncorrectPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should reject login if email has not been verified', async () => {
      const email = 'unverified@example.com';
      await createTestUser({ email, isEmailVerified: false });

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email,
          password: 'Password123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.emailNotVerified).toBe(true);
      expect(res.body.message).toContain('Please verify your email');
    });

    it('should reject local password login for Google-authenticated accounts without password', async () => {
      const email = 'google_only@example.com';
      await User.create({
        name: 'Google User',
        email,
        authProvider: 'google',
        googleId: 'google_sub_123',
        isEmailVerified: true
      });

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email,
          password: 'AnyPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Google sign-in');
    });
  });

  describe('POST /api/auth/google', () => {
    it('should register and authenticate a new user using Google ID token', async () => {
      const mockPayload = {
        sub: 'google_unique_id_12345',
        email: 'google_new@example.com',
        name: 'Google Newbie',
        picture: 'https://lh3.googleusercontent.com/photo.jpg'
      };

      jest.spyOn(authService, 'verifyGoogleToken').mockResolvedValue(mockPayload as any);

      const res = await request(app)
        .post('/api/auth/google')
        .send({ credential: 'valid_mock_google_credential' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(mockPayload.email);
      expect(res.body.user.isEmailVerified).toBe(true);

      const dbUser = await User.findOne({ email: mockPayload.email });
      expect(dbUser?.authProvider).toBe('google');
      expect(dbUser?.googleId).toBe(mockPayload.sub);
    });

    it('should link and login existing local user with Google account', async () => {
      const email = 'existing_local@example.com';
      await createTestUser({ email, isEmailVerified: false });

      const mockPayload = {
        sub: 'google_linked_sub_999',
        email,
        name: 'Existing Local',
        picture: 'https://lh3.googleusercontent.com/photo2.jpg'
      };

      jest.spyOn(authService, 'verifyGoogleToken').mockResolvedValue(mockPayload as any);

      const res = await request(app)
        .post('/api/auth/google')
        .send({ credential: 'valid_mock_google_credential' });

      expect(res.status).toBe(200);
      const dbUser = await User.findOne({ email });
      expect(dbUser?.googleId).toBe(mockPayload.sub);
      expect(dbUser?.isEmailVerified).toBe(true);
    });
  });

  describe('Password Reset Flow and Token Invalidation', () => {
    it('should execute full forgot-password -> reset-password flow and invalidate prior tokens', async () => {
      const user = await createTestUser({ email: 'reset_flow@example.com' });
      const originalAuthHeader = createAuthHeader(user._id, user.tokenVersion);

      // Verify original token works
      const initialProfileRes = await request(app)
        .get('/api/auth/user')
        .set(originalAuthHeader);
      expect(initialProfileRes.status).toBe(200);

      // 1. Request password reset
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: user.email });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.message).toContain('If an account exists for that email address, password reset instructions have been sent');
      expect(emailService.sendPasswordReset).toHaveBeenCalled();

      // Retrieve reset token from DB
      const userWithReset = await User.findById(user._id);
      const resetToken = userWithReset?.passwordResetToken;
      expect(resetToken).toBeDefined();

      // 2. Reset password using token
      const newPassword = 'NewSecretPassword123!';
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: user.email,
          token: resetToken,
          newPassword
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toBe('Password reset successfully');

      // 3. Prior token must now be rejected due to tokenVersion increment
      const staleTokenRes = await request(app)
        .get('/api/auth/user')
        .set(originalAuthHeader);

      expect(staleTokenRes.status).toBe(401);
      expect(staleTokenRes.body.message).toContain('Token has been invalidated');

      // 4. Can login with new password
      const newLoginRes = await request(app)
        .post('/api/auth/signin')
        .send({
          email: user.email,
          password: newPassword
        });

      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.token).toBeDefined();
    });
  });

  describe('GET /api/auth/user & PUT /api/auth/user', () => {
    it('should fetch authenticated user profile', async () => {
      const user = await createTestUser({ name: 'Profile Test' });
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .get('/api/auth/user')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body._id).toBe(user._id.toString());
      expect(res.body.name).toBe('Profile Test');
      expect(res.body.credits).toBe(3);
    });

    it('should update profile name and password successfully', async () => {
      const user = await createTestUser({
        password: 'OldPassword123!',
        isEmailVerified: true
      });
      const authHeader = createAuthHeader(user._id, user.tokenVersion);

      const updateRes = await request(app)
        .put('/api/auth/user')
        .set(authHeader)
        .send({
          name: 'Updated Name',
          currentPassword: 'OldPassword123!',
          password: 'NewBrandPassword123!'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('Updated Name');

      // Verify DB update
      const dbUser = await User.findById(user._id).select('+password');
      expect(dbUser?.name).toBe('Updated Name');
      expect(await dbUser?.matchPassword('NewBrandPassword123!')).toBe(true);
    });

    it('should reject password update if currentPassword is wrong', async () => {
      const user = await createTestUser({ password: 'OldPassword123!' });
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .put('/api/auth/user')
        .set(authHeader)
        .send({
          currentPassword: 'IncorrectOldPassword123!',
          password: 'NewBrandPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Incorrect current password');
    });
  });

  describe('POST /api/auth/upload-avatar', () => {
    it('should upload avatar and update profile picture in database', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' } as any);

      const res = await request(app)
        .post('/api/auth/upload-avatar')
        .set(authHeader)
        .attach('avatar', Buffer.from('fake image content'), 'avatar.png');

      expect(res.status).toBe(200);
      expect(res.body.profilePicture).toBe('https://res.cloudinary.com/demo/image/upload/v1234/test_avatar.png');

      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.profilePicture).toBe('https://res.cloudinary.com/demo/image/upload/v1234/test_avatar.png');
    });
  });
});
