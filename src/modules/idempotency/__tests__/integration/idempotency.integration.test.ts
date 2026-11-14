import request from 'supertest';
import app from '../../../../../tests/setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../../../../../tests/setup/test-db';
import { createTestUser, createTestIdea, createAuthHeader, mockGeminiResponses } from '../../../../../tests/setup/test-helpers';
import User from '../../../../modules/users/user.model';
import Idea from '../../../../modules/ideas/idea.model';
import IdempotencyRecord from '../../idempotency.model';
import * as geminiClient from '../../../../shared/integrations/gemini/gemini.client';

// Mock Gemini AI client
jest.mock('../../../../shared/integrations/gemini/gemini.client', () => ({
  validateIdea: jest.fn(),
  generatePitchDeck: jest.fn(),
  generateCanvas: jest.fn(),
  generateCompetitorAnalysis: jest.fn(),
  simulateInvestorQA: jest.fn(),
  generateMarketResearch: jest.fn(),
  generateTalkingPoints: jest.fn(),
  matchInvestors: jest.fn()
}));

describe('Idempotency Integration Tests', () => {
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

  describe('POST /api/idea/submit with Idempotency-Key', () => {
    it('TC-IDEMP-01: Sequential duplicate request returns cached response, deducts credits once, calls Gemini once', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockResolvedValue(mockGeminiResponses.ideaValidation);

      const idempotencyKey = 'req-key-tc-01';
      const payload = { ideaText: 'AI automated greenhouse monitoring' };

      // First Request
      const res1 = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res1.status).toBe(201);
      expect(res1.body._id).toBeDefined();
      expect(res1.body.userCredits).toBe(2);

      // Verify user credits decreased by 1
      const userAfterFirst = await User.findById(user._id);
      expect(userAfterFirst?.credits).toBe(2);

      // Verify idempotency record in DB
      const record = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(record).not.toBeNull();
      expect(record?.status).toBe('completed');
      expect(record?.responseStatus).toBe(201);

      // Second Request with same Idempotency-Key
      const res2 = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      // Must return identical cached response
      expect(res2.status).toBe(201);
      expect(res2.body._id).toBe(res1.body._id);
      expect(res2.body.marketDemandScore).toBe(res1.body.marketDemandScore);

      // User credits must still be 2 (zero additional credits deducted!)
      const userAfterSecond = await User.findById(user._id);
      expect(userAfterSecond?.credits).toBe(2);

      // Gemini AI client was invoked exactly once
      expect(geminiClient.validateIdea).toHaveBeenCalledTimes(1);

      // Exactly 1 Idea was saved in DB
      const ideaCount = await Idea.countDocuments({ userId: user._id });
      expect(ideaCount).toBe(1);
    });

    it('TC-IDEMP-02: Concurrent requests with same Idempotency-Key deduct credits only once', async () => {
      const user = await createTestUser({ monthlyCredits: 5, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockGeminiResponses.ideaValidation), 100))
      );

      const idempotencyKey = 'req-key-concurrent-02';
      const payload = { ideaText: 'Blockchain verified carbon credits' };

      // Fire 2 concurrent requests with same key
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/idea/submit')
          .set(authHeader)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload),
        request(app)
          .post('/api/idea/submit')
          .set(authHeader)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload)
      ]);

      const statuses = [resA.status, resB.status];
      // One request must succeed (201). The other may either receive 409 (in progress) or 201 (if caught after completion)
      expect(statuses).toContain(201);

      // User credits must be deducted at most once (from 5 to 4)
      const userInDb = await User.findById(user._id);
      expect(userInDb?.credits).toBe(4);

      // Gemini AI client invoked only once
      expect(geminiClient.validateIdea).toHaveBeenCalledTimes(1);

      // Only 1 idea document created
      const count = await Idea.countDocuments({ userId: user._id });
      expect(count).toBe(1);
    });

    it('TC-IDEMP-03: Failed request marks status failed and allows safe retry with same Idempotency-Key', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      // First attempt: Gemini fails
      (geminiClient.validateIdea as jest.Mock).mockRejectedValueOnce(new Error('AI generation timeout'));

      const idempotencyKey = 'req-key-retry-03';
      const payload = { ideaText: 'Drone delivery service for rural hospitals' };

      const failRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(failRes.status).toBe(500);

      // Verify credits refunded
      const userAfterFail = await User.findById(user._id);
      expect(userAfterFail?.credits).toBe(3);

      // Verify idempotency record is marked failed
      const failedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(failedRecord).not.toBeNull();
      expect(failedRecord?.status).toBe('failed');

      // Second attempt: Gemini succeeds
      (geminiClient.validateIdea as jest.Mock).mockResolvedValueOnce(mockGeminiResponses.ideaValidation);

      const retryRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(retryRes.status).toBe(201);
      expect(retryRes.body._id).toBeDefined();

      // Credits deducted 1 time
      const userAfterRetry = await User.findById(user._id);
      expect(userAfterRetry?.credits).toBe(2);

      // Idempotency record now completed
      const completedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(completedRecord?.status).toBe('completed');
      expect(completedRecord?.responseStatus).toBe(201);
    });

    it('should support x-idempotency-key header variant', async () => {
      const user = await createTestUser({ monthlyCredits: 2 });
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockResolvedValue(mockGeminiResponses.ideaValidation);

      const key = 'req-key-x-variant';
      const payload = { ideaText: 'Personalized meal prep robot' };

      const res1 = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('x-idempotency-key', key)
        .send(payload);

      expect(res1.status).toBe(201);

      // Second request with x-idempotency-key
      const res2 = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('x-idempotency-key', key)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.body._id).toBe(res1.body._id);
      expect(geminiClient.validateIdea).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pitch Deck Generation with Idempotency', () => {
    it('should return cached pitch deck response when called with duplicate Idempotency-Key', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generatePitchDeck as jest.Mock).mockResolvedValue(mockGeminiResponses.pitchDeck);

      const key = 'req-deck-key-1';

      // 1st request
      const res1 = await request(app)
        .post(`/api/pitchdeck/${idea._id}`)
        .set(authHeader)
        .set('Idempotency-Key', key)
        .send({});

      expect(res1.status).toBe(200);

      // 2nd request
      const res2 = await request(app)
        .post(`/api/pitchdeck/${idea._id}`)
        .set(authHeader)
        .set('Idempotency-Key', key)
        .send({});

      expect(res2.status).toBe(200);
      expect(geminiClient.generatePitchDeck).toHaveBeenCalledTimes(1);

      // User credits deducted only 1 time
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);
    });
  });

  describe('Canvas Generation with Idempotency', () => {
    it('should return cached canvas response when called with duplicate Idempotency-Key', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateCanvas as jest.Mock).mockResolvedValue(mockGeminiResponses.canvas);

      const key = 'req-canvas-key-1';

      // 1st request
      const res1 = await request(app)
        .post(`/api/canvas/${idea._id}`)
        .set(authHeader)
        .set('Idempotency-Key', key)
        .send({});

      expect(res1.status).toBe(200);

      // 2nd request
      const res2 = await request(app)
        .post(`/api/canvas/${idea._id}`)
        .set(authHeader)
        .set('Idempotency-Key', key)
        .send({});

      expect(res2.status).toBe(200);
      expect(geminiClient.generateCanvas).toHaveBeenCalledTimes(1);

      // User credits deducted only 1 time
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);
    });
  });
});
