import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../setup/test-app';
import User from '../../../src/modules/users/user.model';

describe('Auth Endpoints E2E', () => {
  beforeEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await User.deleteMany({});
    }
  });

  describe('POST /api/auth/register', () => {
    test('should validate registration fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: '',
          email: 'invalid-email',
          password: '123'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/signin', () => {
    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
    });
  });
});
