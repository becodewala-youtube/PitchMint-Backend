import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { app } from '../server';
import User from '../models/User';
import Idea from '../models/Idea';
import jwt from 'jsonwebtoken';

describe('Idea Endpoints', () => {
  let authToken: string;
  let userId: Types.ObjectId;

  beforeEach(async () => {
    await User.deleteMany({});
    await Idea.deleteMany({});
    
    // Create test user
    const user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      isEmailVerified: true,
      credits: 5
    });
    
    userId = user._id;
    authToken = jwt.sign({ id: userId }, process.env.JWT_SECRET as string);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/idea/submit', () => {
    test('should submit and validate idea', async () => {
      const ideaData = {
        ideaText: 'A mobile app that connects dog owners with local dog walkers'
      };

      const response = await request(app)
        .post('/api/idea/submit')
        .set('Authorization', `Bearer ${authToken}`)
        .send(ideaData)
        .expect(201);

      expect(response.body.ideaText).toBe(ideaData.ideaText);
      expect(response.body.overallScore).toBeDefined();
      expect(response.body.analysis).toBeDefined();
    });

    test('should require authentication', async () => {
      const ideaData = {
        ideaText: 'Test idea'
      };

      await request(app)
        .post('/api/idea/submit')
        .send(ideaData)
        .expect(401);
    });

    test('should require sufficient credits', async () => {
      // Update user to have 0 credits
      await User.findByIdAndUpdate(userId, { credits: 0 });

      const ideaData = {
        ideaText: 'Test idea'
      };

      const response = await request(app)
        .post('/api/idea/submit')
        .set('Authorization', `Bearer ${authToken}`)
        .send(ideaData)
        .expect(402);

      expect(response.body.message).toContain('Insufficient credits');
    });
  });

  describe('GET /api/idea/saved', () => {
    test('should get user saved ideas', async () => {
      // Create test idea
      await Idea.create({
        userId,
        ideaText: 'Test idea',
        marketDemandScore: 80,
        competitionScore: 70,
        monetizationFeasibilityScore: 75,
        overallScore: 75,
        analysis: {
          marketDemand: { score: 80, text: 'Good market demand' },
          competition: { score: 70, text: 'Moderate competition' },
          monetization: { score: 75, text: 'Good monetization potential' },
          overall: { score: 75, text: 'Promising idea' }
        }
      });

      const response = await request(app)
        .get('/api/idea/saved')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].ideaText).toBe('Test idea');
    });
  });
});
