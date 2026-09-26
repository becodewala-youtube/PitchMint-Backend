import request from 'supertest';
import app from '../../app';

describe('App Bootstrap and Middleware Tests', () => {
  describe('GET / (Root health check)', () => {
    test('should return welcome message and environment info', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Welcome to PitchMint API');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('CORS and Security Headers', () => {
    test('should allow requests with allowed origins', async () => {
      const res = await request(app)
        .get('/')
        .set('Origin', 'http://localhost:5173');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    test('should reject requests with disallowed origin', async () => {
      const res = await request(app)
        .get('/')
        .set('Origin', 'http://malicious-website.com');

      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/Not allowed by CORS/);
    });

    test('should include Helmet security headers', async () => {
      const res = await request(app).get('/');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });
  });

  describe('404 Not Found Handler', () => {
    test('should return 404 for unknown endpoints', async () => {
      const res = await request(app).get('/api/completely-unknown-route');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Route \/api\/completely-unknown-route not found/);
    });
  });
});
