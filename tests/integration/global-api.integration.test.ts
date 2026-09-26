import request from 'supertest';
import app from '../setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/test-db';

describe('Global API Behavior and Middleware Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  describe('Root and Health Endpoints', () => {
    it('should return welcome message and API status on GET /', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Welcome to PitchMint API');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.env).toBeDefined();
    });
  });

  describe('404 Not Found Handler', () => {
    it('should return consistent JSON 404 response for non-existent endpoints', async () => {
      const res = await request(app).get('/api/unknown/endpoint/route');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not found');
    });
  });

  describe('Malformed Request Handling', () => {
    it('should catch malformed JSON payload and return appropriate error status', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .set('Content-Type', 'application/json')
        .send('{"email": "broken_json", incomplete');

      expect(res.status).toBe(400);
    });
  });

  describe('Sanitizer Middleware (NoSQL Injection Mitigation)', () => {
    it('should strip or sanitize MongoDB query selector injection keys from request body', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: { $gt: '' },
          password: 'Password123!'
        });

      // Sanitizer strips $ operators leaving {} which is rejected by type validation as 400
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Email and password are required');
    });
  });

  describe('CORS Integration', () => {
    it('should allow requests from whitelisted frontend origins', async () => {
      const res = await request(app)
        .get('/')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should reject requests with forbidden CORS origin', async () => {
      const res = await request(app)
        .get('/')
        .set('Origin', 'https://malicious-phishing-site.example.com');

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Not allowed by CORS');
    });
  });

  describe('Security Headers (Helmet Integration)', () => {
    it('should apply security headers on responses', async () => {
      const res = await request(app).get('/');

      expect(res.headers['x-dns-prefetch-control']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
