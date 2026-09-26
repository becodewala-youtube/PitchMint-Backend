import request from 'supertest';
import app from '../../../../../tests/setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../../../../../tests/setup/test-db';
import { createTestUser, createTestInvestor, createAuthHeader, mockGeminiResponses } from '../../../../../tests/setup/test-helpers';
import User from '../../../../../src/modules/users/user.model';
import Investor from '../../../../../src/modules/investors/investor.model';
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

describe('Investors Integration Tests', () => {
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

  describe('Authorization: Premium Guard on Investor Endpoints', () => {
    it('should return 401 when request is unauthenticated', async () => {
      const res = await request(app).get('/api/investors');
      expect(res.status).toBe(401);
    });

    it('should return 403 when authenticated user is NOT premium', async () => {
      const freeUser = await createTestUser({ isPremium: false });
      const authHeader = createAuthHeader(freeUser._id);

      const res = await request(app)
        .get('/api/investors')
        .set(authHeader);

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Premium subscription required');
    });
  });

  describe('GET /api/investors', () => {
    it('should return list of investors with filtering by type and industry for premium users', async () => {
      const premiumUser = await createTestUser({ isPremium: true });
      const authHeader = createAuthHeader(premiumUser._id);

      // Create test investors
      await createTestInvestor({ name: 'VC Firm One', type: 'VC', industryFocus: ['Fintech'] });
      await createTestInvestor({ name: 'Angel Group Two', type: 'Angel', industryFocus: ['Health'] });
      await createTestInvestor({ name: 'VC Firm Three', type: 'VC', industryFocus: ['AI'] });

      // All investors
      const resAll = await request(app)
        .get('/api/investors')
        .set(authHeader);

      expect(resAll.status).toBe(200);
      expect(resAll.body.length).toBe(3);

      // Filter by type
      const resType = await request(app)
        .get('/api/investors?type=VC')
        .set(authHeader);

      expect(resType.status).toBe(200);
      expect(resType.body.length).toBe(2);

      // Filter by industry
      const resIndustry = await request(app)
        .get('/api/investors?industry=Fintech')
        .set(authHeader);

      expect(resIndustry.status).toBe(200);
      expect(resIndustry.body.length).toBe(1);
      expect(resIndustry.body[0].name).toBe('VC Firm One');
    });
  });

  describe('GET /api/investors/:id', () => {
    it('should return single investor by ID or 404 if not found', async () => {
      const premiumUser = await createTestUser({ isPremium: true });
      const authHeader = createAuthHeader(premiumUser._id);

      const investor = await createTestInvestor({ name: 'Specific Investor' });

      // Existing
      const resFound = await request(app)
        .get(`/api/investors/${investor._id}`)
        .set(authHeader);

      expect(resFound.status).toBe(200);
      expect(resFound.body.name).toBe('Specific Investor');

      // Not found
      const resNotFound = await request(app)
        .get('/api/investors/507f1f77bcf86cd799439011')
        .set(authHeader);

      expect(resNotFound.status).toBe(404);
      expect(resNotFound.body.message).toBe('Investor not found');
    });
  });

  describe('POST /api/investors/match', () => {
    it('should reject non-premium user with 403', async () => {
      const freeUser = await createTestUser({ isPremium: false, monthlyCredits: 5 });
      const authHeader = createAuthHeader(freeUser._id);

      const res = await request(app)
        .post('/api/investors/match')
        .set(authHeader)
        .send({ industry: 'Fintech', stage: 'Seed' });

      expect(res.status).toBe(403);
    });

    it('should reject premium user with 402 if credits < 2', async () => {
      const premiumUser = await createTestUser({
        isPremium: true,
        monthlyCredits: 1,
        purchasedCredits: 0
      });
      const authHeader = createAuthHeader(premiumUser._id);

      const res = await request(app)
        .post('/api/investors/match')
        .set(authHeader)
        .send({ industry: 'Fintech', stage: 'Seed' });

      expect(res.status).toBe(402);
      expect(res.body.message).toContain('Insufficient credits');
    });

    it('should deduct 2 credits, match investors with Gemini, log activity, and update user credits', async () => {
      const premiumUser = await createTestUser({
        isPremium: true,
        monthlyCredits: 3,
        purchasedCredits: 0
      });
      const authHeader = createAuthHeader(premiumUser._id);

      (geminiClient.matchInvestors as jest.Mock).mockResolvedValue(mockGeminiResponses.investorMatches);

      const criteria = {
        industry: 'Fintech',
        stage: 'Seed',
        fundingAmount: '$1M',
        location: 'San Francisco',
        businessModel: 'B2B SaaS'
      };

      const res = await request(app)
        .post('/api/investors/match')
        .set(authHeader)
        .send(criteria);

      expect(res.status).toBe(200);
      expect(res.body.matches).toHaveLength(2);
      expect(res.body.userCredits).toBe(1); // 3 - 2 = 1

      const dbUser = await User.findById(premiumUser._id);
      expect(dbUser?.credits).toBe(1);

      const activity = await ActivityHistory.findOne({ userId: premiumUser._id, serviceType: 'investor_matching' });
      expect(activity).not.toBeNull();
      expect(activity?.creditsUsed).toBe(2);
    });

    it('should refund 2 credits if Gemini API fails during investor matching', async () => {
      const premiumUser = await createTestUser({
        isPremium: true,
        monthlyCredits: 3,
        purchasedCredits: 0
      });
      const authHeader = createAuthHeader(premiumUser._id);

      (geminiClient.matchInvestors as jest.Mock).mockRejectedValue(new Error('AI investor match error'));

      const res = await request(app)
        .post('/api/investors/match')
        .set(authHeader)
        .send({ industry: 'Fintech', stage: 'Seed' });

      expect(res.status).toBe(500);

      // Verify refund
      const dbUser = await User.findById(premiumUser._id);
      expect(dbUser?.credits).toBe(3);
    });
  });
});
