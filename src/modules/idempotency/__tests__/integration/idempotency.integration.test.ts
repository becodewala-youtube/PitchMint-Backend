import http from 'http';
import { AddressInfo } from 'net';
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
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    serverPort = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('Request Identity Validation (API-02)', () => {
    it('Case 1: Same user + same key + same endpoint + same payload: cached response, no second credit deduction', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockResolvedValue(mockGeminiResponses.ideaValidation);

      const idempotencyKey = 'case-1-key';
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

      // Verify record stored in DB
      const record = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(record).not.toBeNull();
      expect(record?.status).toBe('completed');
      expect(record?.httpMethod).toBe('POST');
      expect(record?.endpoint).toBe('/api/idea/submit');

      // Second Request with same Idempotency-Key, same endpoint, same payload
      const res2 = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      // Must return identical cached response
      expect(res2.status).toBe(201);
      expect(res2.body._id).toBe(res1.body._id);
      expect(res2.body.marketDemandScore).toBe(res1.body.marketDemandScore);

      // User credits must still be 2 (zero additional credits deducted)
      const userAfterSecond = await User.findById(user._id);
      expect(userAfterSecond?.credits).toBe(2);

      // Gemini AI client was invoked exactly once
      expect(geminiClient.validateIdea).toHaveBeenCalledTimes(1);

      // Exactly 1 Idea saved in DB
      const ideaCount = await Idea.countDocuments({ userId: user._id });
      expect(ideaCount).toBe(1);
    });

    it('Case 2: Same user + same key + different payload: 409 conflict, no cached replay', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockResolvedValue(mockGeminiResponses.ideaValidation);

      const idempotencyKey = 'case-2-key';

      // 1st request with payload A
      const res1 = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({ ideaText: 'Payload A: Solar powered drone' });

      expect(res1.status).toBe(201);

      // 2nd request with same key but different payload B
      const res2 = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({ ideaText: 'Payload B: Crypto automated trading bot' });

      expect(res2.status).toBe(409);
      expect(res2.body).toEqual({
        success: false,
        message: 'Idempotency key has already been used with a different request payload or endpoint.'
      });

      // Gemini not invoked a second time
      expect(geminiClient.validateIdea).toHaveBeenCalledTimes(1);

      // User credits still 2 (no second deduction)
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);
    });

    it('Case 3: Same user + same key + different guarded endpoint: 409 conflict, no cached replay', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockResolvedValue(mockGeminiResponses.ideaValidation);

      const idempotencyKey = 'case-3-key';

      // 1st request on /api/idea/submit
      const res1 = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({ ideaText: 'Idea text for initial submission' });

      expect(res1.status).toBe(201);

      // 2nd request with same key on a different endpoint (/api/canvas/:id)
      const res2 = await request(app)
        .post(`/api/canvas/${idea._id}`)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({});

      expect(res2.status).toBe(409);
      expect(res2.body).toEqual({
        success: false,
        message: 'Idempotency key has already been used with a different request payload or endpoint.'
      });

      // Canvas generator not invoked
      expect(geminiClient.generateCanvas).not.toHaveBeenCalled();
    });

    it('Case 4: Same user + same key + different HTTP method: 409 conflict', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generatePitchDeck as jest.Mock).mockResolvedValue(mockGeminiResponses.pitchDeck);

      const idempotencyKey = 'case-4-key';

      // 1st request: POST /api/pitchdeck/:id
      const res1 = await request(app)
        .post(`/api/pitchdeck/${idea._id}`)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({});

      expect(res1.status).toBe(200);

      // 2nd request: PUT /api/pitchdeck/:id with same idempotencyKey
      const res2 = await request(app)
        .put(`/api/pitchdeck/${idea._id}`)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({});

      expect(res2.status).toBe(409);
      expect(res2.body).toEqual({
        success: false,
        message: 'Idempotency key has already been used with a different request payload or endpoint.'
      });

      // Pitch deck generator invoked only once
      expect(geminiClient.generatePitchDeck).toHaveBeenCalledTimes(1);
    });

    it('Case 5: Failed request + same key + same payload: retry supported and succeeds', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      // First attempt: Gemini fails
      (geminiClient.validateIdea as jest.Mock).mockRejectedValueOnce(new Error('AI inference error'));

      const idempotencyKey = 'case-5-key';
      const payload = { ideaText: 'Smart logistics tracking tags' };

      const failRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(failRes.status).toBe(500);

      // Credits refunded
      const userAfterFail = await User.findById(user._id);
      expect(userAfterFail?.credits).toBe(3);

      // Idempotency record is in 'failed' status
      const failedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(failedRecord).not.toBeNull();
      expect(failedRecord?.status).toBe('failed');

      // Second attempt: same key and same payload succeeds
      (geminiClient.validateIdea as jest.Mock).mockResolvedValueOnce(mockGeminiResponses.ideaValidation);

      const retryRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(retryRes.status).toBe(201);
      expect(retryRes.body._id).toBeDefined();

      // Credits deducted exactly 1 time
      const userAfterRetry = await User.findById(user._id);
      expect(userAfterRetry?.credits).toBe(2);

      // Record now marked completed
      const completedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(completedRecord?.status).toBe('completed');
      expect(completedRecord?.responseStatus).toBe(201);
    });

    it('Case 6: Failed request + same key + different payload: rejected without altering original record', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.validateIdea as jest.Mock).mockRejectedValueOnce(new Error('Network error on 1st attempt'));

      const idempotencyKey = 'case-6-key';
      const originalPayload = { ideaText: 'Original payload that failed' };

      // 1st request fails
      const failRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(originalPayload);

      expect(failRes.status).toBe(500);

      const originalFailedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(originalFailedRecord?.status).toBe('failed');

      // Retry attempt with SAME key but DIFFERENT payload
      const diffPayloadRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({ ideaText: 'Different payload for retry' });

      expect(diffPayloadRes.status).toBe(409);
      expect(diffPayloadRes.body).toEqual({
        success: false,
        message: 'Idempotency key has already been used with a different request payload or endpoint.'
      });

      // Verify original record was NOT altered
      const recordAfterDiff = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(recordAfterDiff?.status).toBe('failed');
      expect(recordAfterDiff?.requestPayloadHash).toBe(originalFailedRecord?.requestPayloadHash);
      expect(recordAfterDiff?.endpoint).toBe(originalFailedRecord?.endpoint);
    });

    it('Concurrent requests with same Idempotency-Key deduct credits only once', async () => {
      const user = await createTestUser({ monthlyCredits: 5, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockGeminiResponses.ideaValidation), 100))
      );

      const idempotencyKey = 'req-key-concurrent';
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

  describe('Client Disconnect Safety and Recovery', () => {
    it('Scenario 1: Client disconnects while operation is in progress, retains in_progress protection, rejects concurrent duplicate with 409, completes successfully on finish, and caches response with single credit deduction and single AI execution', async () => {
      const user = await createTestUser({ monthlyCredits: 5, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      let resolveGemini: (val: any) => void = () => {};
      let signalGeminiStarted: () => void = () => {};
      const geminiStartedPromise = new Promise<void>((resolve) => {
        signalGeminiStarted = resolve;
      });

      (geminiClient.validateIdea as jest.Mock).mockImplementation(() => {
        signalGeminiStarted();
        return new Promise((resolve) => {
          resolveGemini = resolve;
        });
      });

      const idempotencyKey = 'disconnect-safety-key-1';
      const payload = { ideaText: 'Decentralized cloud backup storage' };

      // 1. Client initiates HTTP request via raw http.request
      const clientReq = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/idea/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader.Authorization,
          'Idempotency-Key': idempotencyKey
        }
      });
      clientReq.on('error', () => {});
      clientReq.write(JSON.stringify(payload));
      clientReq.end();

      // Wait until Gemini execution has started on the backend
      await geminiStartedPromise;

      // 2. Client abruptly disconnects while operation is actively running
      clientReq.destroy();

      // Wait for socket close event propagation
      await new Promise((resolve) => setTimeout(resolve, 80));

      // 3. Verify the idempotency record in MongoDB retains in_progress status (NOT failed or 499)
      const inFlightRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(inFlightRecord).not.toBeNull();
      expect(inFlightRecord?.status).toBe('in_progress');

      // Verify user credits deducted once for the in-flight operation
      const userInFlight = await User.findById(user._id);
      expect(userInFlight?.credits).toBe(4);

      // 4. Duplicate request arrives with same key while original operation is still executing
      const dupRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      // Must be rejected with 409 Conflict
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.message).toContain('in progress');

      // AI execution still only called once; credits remain 4 (no double credit burn)
      expect(geminiClient.validateIdea).toHaveBeenCalledTimes(1);
      const userAfterDup = await User.findById(user._id);
      expect(userAfterDup?.credits).toBe(4);

      // 5. Original operation finishes running
      resolveGemini(mockGeminiResponses.ideaValidation);

      // Wait for DB write to settle
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 6. Verify idempotency record is updated to 'completed'
      const completedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(completedRecord?.status).toBe('completed');
      expect(completedRecord?.responseStatus).toBe(201);
      expect(completedRecord?.responseData?._id).toBeDefined();

      // 7. A subsequent retry request arrives with the same key
      const retryRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      // Must receive cached 201 response immediately
      expect(retryRes.status).toBe(201);
      expect(retryRes.body._id).toBe(completedRecord?.responseData?._id);

      // Credits still 4 (no additional deduction)
      const userFinal = await User.findById(user._id);
      expect(userFinal?.credits).toBe(4);

      // Gemini AI still called exactly once
      expect(geminiClient.validateIdea).toHaveBeenCalledTimes(1);

      // Exactly 1 Idea created in DB
      const ideaCount = await Idea.countDocuments({ userId: user._id });
      expect(ideaCount).toBe(1);
    });

    it('Scenario 2: Client disconnects and original operation genuinely fails: record becomes failed, retry with same key succeeds safely without double execution', async () => {
      const user = await createTestUser({ monthlyCredits: 5, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      let rejectGemini: (err: any) => void = () => {};
      let signalGeminiStarted: () => void = () => {};
      const geminiStartedPromise = new Promise<void>((resolve) => {
        signalGeminiStarted = resolve;
      });

      (geminiClient.validateIdea as jest.Mock).mockImplementation(() => {
        signalGeminiStarted();
        return new Promise((_, reject) => {
          rejectGemini = reject;
        });
      });

      const idempotencyKey = 'disconnect-safety-key-2';
      const payload = { ideaText: 'AI precision agriculture drones' };

      // 1. Client initiates HTTP request
      const clientReq = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/idea/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader.Authorization,
          'Idempotency-Key': idempotencyKey
        }
      });
      clientReq.on('error', () => {});
      clientReq.write(JSON.stringify(payload));
      clientReq.end();

      await geminiStartedPromise;

      // 2. Client disconnects
      clientReq.destroy();
      await new Promise((resolve) => setTimeout(resolve, 80));

      // Record is in_progress while operation runs
      const inFlightRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(inFlightRecord?.status).toBe('in_progress');

      // 3. Original operation genuinely fails (e.g. Gemini throws an error)
      rejectGemini(new Error('Downstream Gemini quota exceeded'));

      // Wait for error handler and DB write
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 4. Record is now transitioned to 'failed' (responseStatus: 500)
      const failedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(failedRecord?.status).toBe('failed');
      expect(failedRecord?.responseStatus).toBe(500);

      // Credits refunded
      const userAfterFail = await User.findById(user._id);
      expect(userAfterFail?.credits).toBe(5);

      // 5. Retry with a DIFFERENT payload must be rejected with 409 mismatch
      const diffRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({ ideaText: 'Completely different idea payload' });

      expect(diffRes.status).toBe(409);
      expect(diffRes.body.message).toContain('different request payload');

      // 6. Legitimate retry with the SAME payload succeeds safely
      (geminiClient.validateIdea as jest.Mock).mockResolvedValueOnce(mockGeminiResponses.ideaValidation);

      const retryRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(retryRes.status).toBe(201);
      expect(retryRes.body._id).toBeDefined();

      // Credits deducted exactly once (from 5 to 4)
      const userAfterSuccess = await User.findById(user._id);
      expect(userAfterSuccess?.credits).toBe(4);

      // Record transitioned to 'completed'
      const completedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(completedRecord?.status).toBe('completed');
      expect(completedRecord?.responseStatus).toBe(201);

      // 7. Subsequent immediate replay returns cached response without duplicate AI execution or credit burn
      const cachedReplayRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(cachedReplayRes.status).toBe(201);
      expect(cachedReplayRes.body._id).toBe(retryRes.body._id);

      const userFinal = await User.findById(user._id);
      expect(userFinal?.credits).toBe(4);

      const ideaCount = await Idea.countDocuments({ userId: user._id });
      expect(ideaCount).toBe(1);
    });
  });

  describe('TTL Policy and Crash Recovery (API-02)', () => {
    it('1. New in_progress records have no automatic expiry in MongoDB', async () => {
      const user = await createTestUser({ monthlyCredits: 5 });
      const authHeader = createAuthHeader(user._id);

      let signalStarted: () => void = () => {};
      const startedPromise = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      let finishOperation: () => void = () => {};

      (geminiClient.validateIdea as jest.Mock).mockImplementation(() => {
        signalStarted();
        return new Promise((resolve) => {
          finishOperation = () => resolve(mockGeminiResponses.ideaValidation);
        });
      });

      const idempotencyKey = 'ttl-test-new-in-progress';
      const payload = { ideaText: 'Solar desalination drone' };

      // Fire request asynchronously using native http.request
      const clientReq = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/idea/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader.Authorization,
          'Idempotency-Key': idempotencyKey
        }
      });
      clientReq.on('error', () => {});
      clientReq.write(JSON.stringify(payload));
      clientReq.end();

      await startedPromise;

      // Inspect record in MongoDB while actively in_progress
      const record = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(record).not.toBeNull();
      expect(record?.status).toBe('in_progress');
      expect(record?.expiresAt).toBeUndefined();

      // Finish operation
      finishOperation();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('2. Completed records receive a 24-hour expiry in MongoDB', async () => {
      const user = await createTestUser({ monthlyCredits: 5 });
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockResolvedValue(mockGeminiResponses.ideaValidation);

      const idempotencyKey = 'ttl-test-completed-expiry';
      const payload = { ideaText: 'Vertical hydro turbine' };

      const beforeSubmit = Date.now();
      const res = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res.status).toBe(201);
      const afterSubmit = Date.now();

      const record = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(record?.status).toBe('completed');
      expect(record?.expiresAt).toBeDefined();

      const expiresMs = record!.expiresAt!.getTime();
      expect(expiresMs).toBeGreaterThanOrEqual(beforeSubmit + 24 * 60 * 60 * 1000);
      expect(expiresMs).toBeLessThanOrEqual(afterSubmit + 24 * 60 * 60 * 1000);
    });

    it('3. Failed records receive a 24-hour expiry in MongoDB', async () => {
      const user = await createTestUser({ monthlyCredits: 5 });
      const authHeader = createAuthHeader(user._id);
      (geminiClient.validateIdea as jest.Mock).mockRejectedValue(new Error('AI inference timeout'));

      const idempotencyKey = 'ttl-test-failed-expiry';
      const payload = { ideaText: 'Autonomous lawn mower' };

      const beforeSubmit = Date.now();
      const res = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res.status).toBe(500);
      const afterSubmit = Date.now();

      const record = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(record?.status).toBe('failed');
      expect(record?.expiresAt).toBeDefined();

      const expiresMs = record!.expiresAt!.getTime();
      expect(expiresMs).toBeGreaterThanOrEqual(beforeSubmit + 24 * 60 * 60 * 1000);
      expect(expiresMs).toBeLessThanOrEqual(afterSubmit + 24 * 60 * 60 * 1000);
    });

    it('4. Retrying a failed record removes its expiry while the operation is running', async () => {
      const user = await createTestUser({ monthlyCredits: 5 });
      const authHeader = createAuthHeader(user._id);

      // Step 1: Initial attempt fails
      (geminiClient.validateIdea as jest.Mock).mockRejectedValueOnce(new Error('First attempt failure'));
      const idempotencyKey = 'ttl-test-retry-removes-expiry';
      const payload = { ideaText: 'Underwater drone camera' };

      const failRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      expect(failRes.status).toBe(500);

      const failedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(failedRecord?.status).toBe('failed');
      expect(failedRecord?.expiresAt).toBeDefined();

      // Step 2: Retry with controlled promise via http.request
      let signalRetryStarted: () => void = () => {};
      const retryStartedPromise = new Promise<void>((resolve) => {
        signalRetryStarted = resolve;
      });
      let finishRetry: () => void = () => {};

      (geminiClient.validateIdea as jest.Mock).mockImplementationOnce(() => {
        signalRetryStarted();
        return new Promise((resolve) => {
          finishRetry = () => resolve(mockGeminiResponses.ideaValidation);
        });
      });

      const clientReq = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/idea/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader.Authorization,
          'Idempotency-Key': idempotencyKey
        }
      });
      clientReq.on('error', () => {});
      clientReq.write(JSON.stringify(payload));
      clientReq.end();

      await retryStartedPromise;

      // While retry is actively executing, record must have status: 'in_progress' and NO expiresAt
      const inFlightRetryRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(inFlightRetryRecord?.status).toBe('in_progress');
      expect(inFlightRetryRecord?.expiresAt).toBeUndefined();

      finishRetry();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const completedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(completedRecord?.status).toBe('completed');
      expect(completedRecord?.expiresAt).toBeDefined();
    });

    it('5. A duplicate request for a permanently in_progress record cannot execute the handler again', async () => {
      const user = await createTestUser({ monthlyCredits: 5 });
      const authHeader = createAuthHeader(user._id);

      const idempotencyKey = 'stuck-crash-record-key';
      const payload = { ideaText: 'Quantum sensor platform' };

      // Simulate a record left permanently in_progress by an ungraceful server crash from 12 hours ago
      const crypto = await import('crypto');
      const { canonicalize } = await import('../../../../shared/middleware/idempotency.middleware');
      const hash = crypto.createHash('sha256').update(JSON.stringify(canonicalize({ body: payload, query: {} }))).digest('hex');

      await IdempotencyRecord.create({
        userId: user._id,
        idempotencyKey,
        httpMethod: 'POST',
        endpoint: '/api/idea/submit',
        status: 'in_progress',
        requestPayloadHash: hash,
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
      });

      // Duplicate request arrives with same key
      const dupRes = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(dupRes.status).toBe(409);
      expect(dupRes.body).toEqual({
        success: false,
        message: 'Request currently in progress. Please retry shortly.'
      });

      // Gemini must NEVER have been called
      expect(geminiClient.validateIdea).not.toHaveBeenCalled();

      // Credits remain untouched (5)
      const userAfter = await User.findById(user._id);
      expect(userAfter?.credits).toBe(5);

      // No new idea created
      const ideaCount = await Idea.countDocuments({ userId: user._id });
      expect(ideaCount).toBe(0);
    });

    it('6. A completed retry receives a fresh expiry in MongoDB', async () => {
      const user = await createTestUser({ monthlyCredits: 5 });
      const authHeader = createAuthHeader(user._id);

      // Create an older failed record (e.g. failed 2 hours ago with an earlier expiry)
      const crypto = await import('crypto');
      const { canonicalize } = await import('../../../../shared/middleware/idempotency.middleware');
      const payload = { ideaText: 'Deep sea mineral mapping' };
      const hash = crypto.createHash('sha256').update(JSON.stringify(canonicalize({ body: payload, query: {} }))).digest('hex');
      const idempotencyKey = 'fresh-ttl-retry-key';

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const oldExpiry = new Date(twoHoursAgo.getTime() + 24 * 60 * 60 * 1000);

      await IdempotencyRecord.create({
        userId: user._id,
        idempotencyKey,
        httpMethod: 'POST',
        endpoint: '/api/idea/submit',
        status: 'failed',
        requestPayloadHash: hash,
        responseStatus: 500,
        createdAt: twoHoursAgo,
        expiresAt: oldExpiry
      });

      (geminiClient.validateIdea as jest.Mock).mockResolvedValueOnce(mockGeminiResponses.ideaValidation);

      const beforeRetry = Date.now();
      const res = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res.status).toBe(201);
      const afterRetry = Date.now();

      const completedRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(completedRecord?.status).toBe('completed');
      expect(completedRecord?.expiresAt).toBeDefined();

      const freshExpiresMs = completedRecord!.expiresAt!.getTime();
      // Fresh expiry must be ~24 hours from NOW, NOT from twoHoursAgo
      expect(freshExpiresMs).toBeGreaterThanOrEqual(beforeRetry + 24 * 60 * 60 * 1000);
      expect(freshExpiresMs).toBeLessThanOrEqual(afterRetry + 24 * 60 * 60 * 1000);
      expect(freshExpiresMs).toBeGreaterThan(oldExpiry.getTime());
    });
  });

  describe('Query Parameter Fingerprinting (API-02)', () => {
    it('should reject with 409 when duplicate key is reused on pitch simulator with different query params (?regenerate=true)', async () => {
      const user = await createTestUser({ monthlyCredits: 5 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue(mockGeminiResponses.pitchSimulation);

      const idempotencyKey = 'pitch-sim-query-diff-key';

      // 1. Initial request without regenerate query param
      const res1 = await request(app)
        .post(`/api/pitch-simulator/simulate/${idea._id}`)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({});

      expect(res1.status).toBe(200);

      const userAfterFirst = await User.findById(user._id);
      expect(userAfterFirst?.credits).toBe(4);
      expect(geminiClient.simulateInvestorQA).toHaveBeenCalledTimes(1);

      const originalRecord = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(originalRecord?.status).toBe('completed');
      const originalHash = originalRecord?.requestPayloadHash;

      // 2. Duplicate request with same key but ?regenerate=true
      const res2 = await request(app)
        .post(`/api/pitch-simulator/simulate/${idea._id}?regenerate=true`)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({});

      // 3. Confirm second request receives HTTP 409
      expect(res2.status).toBe(409);
      expect(res2.body).toEqual({
        success: false,
        message: 'Idempotency key has already been used with a different request payload or endpoint.'
      });

      // 4. Confirm Gemini is called only once
      expect(geminiClient.simulateInvestorQA).toHaveBeenCalledTimes(1);

      // 5. Confirm credits are deducted only once
      const userAfterSecond = await User.findById(user._id);
      expect(userAfterSecond?.credits).toBe(4);

      // 6. Confirm original record remains unchanged
      const recordAfterSecond = await IdempotencyRecord.findOne({ userId: user._id, idempotencyKey });
      expect(recordAfterSecond?.status).toBe('completed');
      expect(recordAfterSecond?.requestPayloadHash).toBe(originalHash);
      expect(recordAfterSecond?.responseStatus).toBe(200);
    });

    it('should treat equivalent query parameters in different key orders as identical and return cached response', async () => {
      const user = await createTestUser({ monthlyCredits: 5 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue(mockGeminiResponses.pitchSimulation);

      const idempotencyKey = 'pitch-sim-query-order-key';

      // Request 1 with ?regenerate=true&lang=en
      const res1 = await request(app)
        .post(`/api/pitch-simulator/simulate/${idea._id}?regenerate=true&lang=en`)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({});

      expect(res1.status).toBe(200);
      const userAfterFirst = await User.findById(user._id);
      expect(userAfterFirst?.credits).toBe(4);

      // Request 2 with ?lang=en&regenerate=true (different query key order)
      const res2 = await request(app)
        .post(`/api/pitch-simulator/simulate/${idea._id}?lang=en&regenerate=true`)
        .set(authHeader)
        .set('Idempotency-Key', idempotencyKey)
        .send({});

      expect(res2.status).toBe(200);
      expect(res2.body.pitchSimulation).toBeDefined();

      // Zero additional credits deducted
      const userAfterSecond = await User.findById(user._id);
      expect(userAfterSecond?.credits).toBe(4);

      // Gemini not called a second time
      expect(geminiClient.simulateInvestorQA).toHaveBeenCalledTimes(1);
    });
  });
});
