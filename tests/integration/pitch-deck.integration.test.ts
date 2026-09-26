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

describe('Pitch Deck Integration Tests', () => {
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

  describe('POST /api/pitchdeck/:id', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/pitchdeck/507f1f77bcf86cd799439011');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent idea', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/pitchdeck/507f1f77bcf86cd799439011')
        .set(authHeader);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Idea not found');
    });

    it('should return 403 when non-owner attempts to generate pitch deck', async () => {
      const owner = await createTestUser({ email: 'owner_deck@example.com' });
      const idea = await createTestIdea(owner._id);

      const attacker = await createTestUser({ email: 'attacker_deck@example.com' });
      const authHeader = createAuthHeader(attacker._id);

      const res = await request(app)
        .post(`/api/pitchdeck/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Not authorized');
    });

    it('should return 402 when user has insufficient credits', async () => {
      const user = await createTestUser({ monthlyCredits: 0, purchasedCredits: 0 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post(`/api/pitchdeck/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(402);
      expect(res.body.message).toContain('Insufficient credits');
    });

    it('should deduct 1 credit, call Gemini, and persist pitchDeckContent on Idea document', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generatePitchDeck as jest.Mock).mockResolvedValue(mockGeminiResponses.pitchDeck);

      const res = await request(app)
        .post(`/api/pitchdeck/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.pitchDeckContent).toBeDefined();
      expect(res.body.pitchDeckContent.problem).toBe(mockGeminiResponses.pitchDeck.problem);
      expect(res.body.userCredits).toBe(2);

      // Verify in DB
      const dbIdea = await Idea.findById(idea._id);
      expect(dbIdea?.pitchDeckContent?.solution).toBe(mockGeminiResponses.pitchDeck.solution);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);
    });

    it('should refund credits if Gemini API fails during pitch deck generation', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generatePitchDeck as jest.Mock).mockRejectedValue(new Error('AI generation failure'));

      const res = await request(app)
        .post(`/api/pitchdeck/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to generate pitch deck');

      // Verify refund
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(3);
    });
  });

  describe('PUT /api/pitchdeck/:id (Regenerate)', () => {
    it('should regenerate pitch deck and update content', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id, {
        pitchDeckContent: mockGeminiResponses.pitchDeck
      });
      const authHeader = createAuthHeader(user._id);

      const updatedDeck = {
        ...mockGeminiResponses.pitchDeck,
        problem: 'Updated problem statement for pitch deck regeneration'
      };
      (geminiClient.generatePitchDeck as jest.Mock).mockResolvedValue(updatedDeck);

      const res = await request(app)
        .put(`/api/pitchdeck/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.pitchDeckContent.problem).toBe('Updated problem statement for pitch deck regeneration');

      const dbIdea = await Idea.findById(idea._id);
      expect(dbIdea?.pitchDeckContent?.problem).toBe('Updated problem statement for pitch deck regeneration');
    });
  });

  describe('POST /api/pitchdeck/talking-points/:id', () => {
    it('should generate talking points for specific slide', async () => {
      const user = await createTestUser();
      const idea = await createTestIdea(user._id, {
        pitchDeckContent: mockGeminiResponses.pitchDeck
      });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateTalkingPoints as jest.Mock).mockResolvedValue(mockGeminiResponses.talkingPoints);

      const res = await request(app)
        .post(`/api/pitchdeck/talking-points/${idea._id}`)
        .set(authHeader)
        .send({ slideIndex: 0 });

      expect(res.status).toBe(200);
      expect(res.body.talkingPoints).toEqual(mockGeminiResponses.talkingPoints);
    });
  });

  describe('Collaborative Features: Slide Edit and Comments', () => {
    it('should update slide content collaboratively', async () => {
      const user = await createTestUser();
      const idea = await createTestIdea(user._id, {
        pitchDeckContent: mockGeminiResponses.pitchDeck
      });
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .put(`/api/pitchdeck/collaborative/${idea._id}/slide`)
        .set(authHeader)
        .send({
          slideIndex: 1,
          content: 'Brand new collaborative solution content'
        });

      expect(res.status).toBe(200);

      const dbIdea = await Idea.findById(idea._id);
      expect(dbIdea?.pitchDeckContent?.solution).toBe('Brand new collaborative solution content');
    });

    it('should add and delete comment on pitch deck', async () => {
      const user = await createTestUser();
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      // Add comment
      const addRes = await request(app)
        .post(`/api/pitchdeck/collaborative/${idea._id}/comment`)
        .set(authHeader)
        .send({
          text: 'Great slide, consider adding traction metric',
          slideIndex: 1,
          position: { x: 100, y: 150 }
        });

      expect(addRes.status).toBe(200);
      expect(addRes.body.comment).toBeDefined();
      expect(addRes.body.comment.text).toBe('Great slide, consider adding traction metric');
      const commentId = addRes.body.comment.id;

      // Delete comment
      const delRes = await request(app)
        .delete(`/api/pitchdeck/collaborative/${idea._id}/comment/${commentId}`)
        .set(authHeader);

      expect(delRes.status).toBe(200);
      const dbIdea = await Idea.findById(idea._id);
      expect(dbIdea?.collaborativeData?.comments?.length).toBe(0);
    });
  });
});
