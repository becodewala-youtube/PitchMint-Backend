import request from 'supertest';
import app from '../setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/test-db';
import { createTestUser, createAuthHeader } from '../setup/test-helpers';
import ActivityHistory from '../../src/modules/dashboard/dashboard.model';

describe('Dashboard & Activity History Integration Tests', () => {
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

  describe('GET /api/history', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/history');
      expect(res.status).toBe(401);
    });

    it('should return activities strictly isolated to the authenticated user', async () => {
      const userA = await createTestUser({ email: 'user_dash_a@example.com' });
      const userB = await createTestUser({ email: 'user_dash_b@example.com' });

      // Create activities for user A
      await ActivityHistory.create({
        userId: userA._id,
        serviceType: 'idea_validation',
        title: 'Idea 1 Analysis',
        description: 'Validation report',
        creditsUsed: 1,
        data: {}
      });
      await ActivityHistory.create({
        userId: userA._id,
        serviceType: 'pitch_deck',
        title: 'Pitch Deck Generated',
        description: '10 slides generated',
        creditsUsed: 1,
        data: {}
      });

      // Create activity for user B
      await ActivityHistory.create({
        userId: userB._id,
        serviceType: 'canvas',
        title: 'Canvas Generated',
        description: 'Lean canvas report',
        creditsUsed: 1,
        data: {}
      });

      const authHeaderA = createAuthHeader(userA._id);

      const res = await request(app)
        .get('/api/history')
        .set(authHeaderA);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      // Verify all activities belong to user A
      res.body.forEach((item: any) => {
        expect(item.userId).toBe(userA._id.toString());
      });
    });

    it('should filter activities by serviceType and support pagination', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      // Seed 3 idea_validation and 2 market_research
      for (let i = 1; i <= 3; i++) {
        await ActivityHistory.create({
          userId: user._id,
          serviceType: 'idea_validation',
          title: `Validation ${i}`,
          description: 'Desc',
          creditsUsed: 1,
          data: {}
        });
      }

      for (let i = 1; i <= 2; i++) {
        await ActivityHistory.create({
          userId: user._id,
          serviceType: 'market_research',
          title: `Research ${i}`,
          description: 'Desc',
          creditsUsed: 2,
          data: {}
        });
      }

      // Filter by serviceType
      const resFilter = await request(app)
        .get('/api/history?serviceType=market_research')
        .set(authHeader);

      expect(resFilter.status).toBe(200);
      expect(resFilter.body.length).toBe(2);
      expect(resFilter.body[0].serviceType).toBe('market_research');

      // Pagination
      const resPage = await request(app)
        .get('/api/history?page=2&limit=2')
        .set(authHeader);

      expect(resPage.status).toBe(200);
      expect(resPage.body.length).toBe(2); // items 3 and 4 out of 5
    });
  });
});
