import jwt from 'jsonwebtoken';
import { AuthService } from '../auth.service';
import env from '../../../config/env';

jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: jest.fn().mockImplementation(async ({ idToken, audience }) => {
        if (idToken === 'valid-google-token') {
          return {
            getPayload: () => ({
              sub: 'google-12345',
              email: 'googleuser@example.com',
              name: 'Google User',
              picture: 'https://lh3.googleusercontent.com/photo.jpg'
            })
          };
        }
        throw new Error('Invalid token signature');
      })
    }))
  };
});

describe('AuthService Unit Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('generateToken', () => {
    test('should generate a valid JWT signed with id and default tokenVersion', () => {
      const userId = 'user_abc_123';
      const token = authService.generateToken(userId);

      expect(typeof token).toBe('string');
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      expect(decoded.id).toBe(userId);
      expect(decoded.tokenVersion).toBe(0);
    });

    test('should include custom tokenVersion in JWT payload', () => {
      const userId = 'user_abc_456';
      const token = authService.generateToken(userId, 5);

      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      expect(decoded.id).toBe(userId);
      expect(decoded.tokenVersion).toBe(5);
    });
  });

  describe('verifyGoogleToken', () => {
    test('should return payload when google token is valid', async () => {
      const payload = await authService.verifyGoogleToken('valid-google-token');
      expect(payload).toBeDefined();
      expect(payload?.email).toBe('googleuser@example.com');
      expect(payload?.sub).toBe('google-12345');
      expect(payload?.name).toBe('Google User');
    });

    test('should throw error when google token verification fails', async () => {
      await expect(authService.verifyGoogleToken('invalid-token')).rejects.toThrow('Invalid token signature');
    });
  });
});
