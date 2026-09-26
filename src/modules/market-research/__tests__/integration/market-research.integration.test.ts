import request from 'supertest';
import app from '../../../../../tests/setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../../../../../tests/setup/test-db';
import { createTestUser, createAuthHeader, mockGeminiResponses } from '../../../../../tests/setup/test-helpers';
import User from '../../../../../src/modules/users/user.model';
import ActivityHistory from '../../../../../src/modules/dashboard/dashboard.model';
import * as geminiClient from '../../../../../src/shared/integrations/gemini/gemini.client';

jest.mock('../../../../../src/shared/integrations/gemini/gemini.client', () => ({
  validateIdea: jest.fn(),
  generatePitchDeck: jest.fn(),
  generateCanvas: jest.fn(),
  generateCompetitorAnalysis: jest.fn(),
  simulateInvestorQA: jest.fn(),
  generateMarketResearch: jest.fn(),
  generateTalkingPoints: jest.fn(),
  matchInvestors: jest.fn()
}));

describe('Market Research Integration Tests', () => {
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

  describe('POST /api/market-research/analyze', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/market-research/analyze')
        .send({
          ideaText: 'B2B supply chain optimization',
          industry: 'Logistics',
          targetRegion: 'North America'
        });

      expect(res.status).toBe(401);
    });

    it('should return 400 when required fields are missing', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/market-research/analyze')
        .set(authHeader)
        .send({
          ideaText: 'Some idea'
          // Missing industry and targetRegion
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Please provide startup idea, industry, and target region');
    });

    it('should return 402 when user has less than 2 credits', async () => {
      const user = await createTestUser({ monthlyCredits: 1, purchasedCredits: 0 }); // only 1 credit
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/market-research/analyze')
        .set(authHeader)
        .send({
          ideaText: 'B2B logistics platform',
          industry: 'Logistics',
          targetRegion: 'North America'
        });

      expect(res.status).toBe(402);
      expect(res.body.message).toContain('Insufficient credits');
    });

    it('should deduct 2 credits, generate TAM/SAM/SOM market analysis, log activity, and update user credits', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateMarketResearch as jest.Mock).mockResolvedValue(mockGeminiResponses.marketResearch);

      const res = await request(app)
        .post('/api/market-research/analyze')
        .set(authHeader)
        .send({
          ideaText: 'B2B logistics platform',
          industry: 'Logistics',
          targetRegion: 'North America'
        });

      expect(res.status).toBe(200);
      expect(res.body.tam).toBeDefined();
      expect(res.body.sam).toBeDefined();
      expect(res.body.som).toBeDefined();
      expect(res.body.userCredits).toBe(1); // 3 - 2 = 1

      // Verify DB state
      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(1);
      expect(dbUser?.credits).toBe(1);

      // Verify activity log with 2 credits used
      const activity = await ActivityHistory.findOne({ userId: user._id, serviceType: 'market_research' });
      expect(activity).not.toBeNull();
      expect(activity?.creditsUsed).toBe(2);
    });

    it('should refund 2 credits if Gemini API fails during market analysis', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateMarketResearch as jest.Mock).mockRejectedValue(new Error('AI market research error'));

      const res = await request(app)
        .post('/api/market-research/analyze')
        .set(authHeader)
        .send({
          ideaText: 'B2B logistics platform',
          industry: 'Logistics',
          targetRegion: 'North America'
        });

      expect(res.status).toBe(500);

      // Verify full refund of 2 credits
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(3);
      expect(dbUser?.monthlyCredits).toBe(3);
    });
  });
});
