import express from 'express';
import request from 'supertest';
import { 
  validateUserRegistration, 
  validatePasswordReset, 
  validateUpdateProfile 
} from '../../auth.validator';
import { handleValidationErrors } from '../../../../shared/middleware/sanitizer.middleware';

describe('Auth Validators Unit Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    app.post('/test/register', validateUserRegistration, handleValidationErrors, (_req: express.Request, res: express.Response) => {
      res.status(200).json({ success: true });
    });

    app.post('/test/reset-password', validatePasswordReset, handleValidationErrors, (_req: express.Request, res: express.Response) => {
      res.status(200).json({ success: true });
    });

    app.put('/test/update-profile', validateUpdateProfile, handleValidationErrors, (_req: express.Request, res: express.Response) => {
      res.status(200).json({ success: true });
    });
  });

  describe('validateUserRegistration', () => {
    test('should pass with valid registration data', async () => {
      const res = await request(app)
        .post('/test/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should fail when name is empty or too short', async () => {
      const res = await request(app)
        .post('/test/register')
        .send({
          name: 'A',
          email: 'jane@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      const nameError = res.body.errors.find((e: any) => e.path === 'name');
      expect(nameError.msg).toMatch(/between 2 and 50 characters/i);
    });

    test('should fail when email format is invalid', async () => {
      const res = await request(app)
        .post('/test/register')
        .send({
          name: 'Jane Doe',
          email: 'not-an-email',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      const emailError = res.body.errors.find((e: any) => e.path === 'email');
      expect(emailError.msg).toMatch(/valid email/i);
    });

    test('should fail when password lacks special character or numbers', async () => {
      const res = await request(app)
        .post('/test/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'PasswordOnly'
        });

      expect(res.status).toBe(400);
      const passwordError = res.body.errors.find((e: any) => e.path === 'password');
      expect(passwordError.msg).toMatch(/uppercase.*lowercase.*number.*special/i);
    });

    test('should fail when password is shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/test/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Pass1!'
        });

      expect(res.status).toBe(400);
      const passwordError = res.body.errors.find((e: any) => e.path === 'password');
      expect(passwordError.msg).toMatch(/at least 8 characters/i);
    });
  });

  describe('validatePasswordReset', () => {
    test('should pass with valid newPassword', async () => {
      const res = await request(app)
        .post('/test/reset-password')
        .send({
          newPassword: 'BrandNewPass123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should fail when newPassword is missing', async () => {
      const res = await request(app)
        .post('/test/reset-password')
        .send({});

      expect(res.status).toBe(400);
      const error = res.body.errors.find((e: any) => e.path === 'newPassword');
      expect(error.msg).toMatch(/New password is required/i);
    });

    test('should fail when newPassword fails complexity requirement', async () => {
      const res = await request(app)
        .post('/test/reset-password')
        .send({
          newPassword: 'simplepassword'
        });

      expect(res.status).toBe(400);
      const error = res.body.errors.find((e: any) => e.path === 'newPassword');
      expect(error.msg).toMatch(/uppercase.*lowercase.*number.*special/i);
    });
  });

  describe('validateUpdateProfile', () => {
    test('should pass when password is not provided (optional)', async () => {
      const res = await request(app)
        .put('/test/update-profile')
        .send({
          name: 'Updated Name'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should validate password complexity if password is provided', async () => {
      const res = await request(app)
        .put('/test/update-profile')
        .send({
          password: 'weak'
        });

      expect(res.status).toBe(400);
      const error = res.body.errors.find((e: any) => e.path === 'password');
      expect(error.msg).toBeDefined();
    });

    test('should pass when valid complex password is provided', async () => {
      const res = await request(app)
        .put('/test/update-profile')
        .send({
          password: 'SecureUpdated123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
