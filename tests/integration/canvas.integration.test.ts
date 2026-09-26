import request from 'supertest';
import app from '../setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/test-db';
import { createTestUser, createTestIdea, createAuthHeader, mockGeminiResponses } from '../setup/test-helpers';
import User from '../../src/modules/users/user.model';
import Idea from '../../src/modules/ideas/idea.model';
import * as geminiClient from '../../src/shared/integrations/gemini/gemini.client';

jest.mock('../../src/shared/integrations/gemini/gemini.client', () => ({
  validateIdea: jest.fn(),
  generatePitchDeck: jest.fn(),
  generateCanvas: jest.fn(),
  generateCompetitorAnalysis: jest.fn(),
  simulateInvestorQA: jest.fn(),
  generateMarketResearch: jest.fn(),
  generateTalkingPoints: jest.fn(),
  matchInvestors: jest.fn()
}));

describe('Canvas Integration Tests', () => {
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

  describe('POST /api/canvas/:id', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/canvas/507f1f77bcf86cd799439011');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent idea', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/canvas/507f1f77bcf86cd799439011')
        .set(authHeader);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Idea not found');
    });

    it('should return 403 when non-owner requests canvas generation', async () => {
      const owner = await createTestUser({ email: 'owner_canvas@example.com' });
      const idea = await createTestIdea(owner._id);

      const stranger = await createTestUser({ email: 'stranger_canvas@example.com' });
      const authHeaderStranger = createAuthHeader(stranger._id);

      const res = await request(app)
        .post(`/api/canvas/${idea._id}`)
        .set(authHeaderStranger);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Not authorized');
    });

    it('should return 402 when user has insufficient credits', async () => {
      const user = await createTestUser({ monthlyCredits: 0, purchasedCredits: 0 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post(`/api/canvas/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(402);
      expect(res.body.message).toContain('Insufficient credits');
    });

    it('should deduct 1 credit, call Gemini, and persist canvasContent on Idea', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateCanvas as jest.Mock).mockResolvedValue(mockGeminiResponses.canvas);

      const res = await request(app)
        .post(`/api/canvas/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.canvasContent).toBeDefined();
      expect(res.body.canvasContent.problem).toBe(mockGeminiResponses.canvas.problem);
      expect(res.body.canvasContent.uniqueValueProposition).toBe(mockGeminiResponses.canvas.uniqueValueProposition);
      expect(res.body.userCredits).toBe(2);

      const dbIdea = await Idea.findById(idea._id);
      expect(dbIdea?.canvasContent?.solution).toBe(mockGeminiResponses.canvas.solution);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);
    });

    it('should refund credits if Gemini AI throws an error', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateCanvas as jest.Mock).mockRejectedValue(new Error('AI generation error'));

      const res = await request(app)
        .post(`/api/canvas/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to generate canvas');

      // Verify refund
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(3);
    });
  });

  describe('PUT /api/canvas/:id (Regenerate)', () => {
    it('should regenerate canvas and update content in database', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id, {
        canvasContent: mockGeminiResponses.canvas
      });
      const authHeader = createAuthHeader(user._id);

      const updatedCanvas = {
        ...mockGeminiResponses.canvas,
        problem: 'Updated problem statement for canvas'
      };
      (geminiClient.generateCanvas as jest.Mock).mockResolvedValue(updatedCanvas);

      const res = await request(app)
        .put(`/api/canvas/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.canvasContent.problem).toBe('Updated problem statement for canvas');

      const dbIdea = await Idea.findById(idea._id);
      expect(dbIdea?.canvasContent?.problem).toBe('Updated problem statement for canvas');
    });
  });
});
