import request from 'supertest';
import app from '../../setup/test-app';

describe('Idea Endpoints E2E', () => {
  describe('POST /api/idea/submit', () => {
    test('should require authentication', async () => {
      const ideaData = {
        ideaText: 'Test idea that needs authentication'
      };

      const response = await request(app)
        .post('/api/idea/submit')
        .send(ideaData);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/idea/saved', () => {
    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/idea/saved');

      expect(response.status).toBe(401);
    });
  });
});
