import request from 'supertest';
import app from '../../setup/test-app';

describe('Payments & Credits E2E', () => {
  test('should require authentication to fetch credit plans', async () => {
    const response = await request(app).get('/api/credits/plans');
    expect(response.status).toBe(401);
  });

  test('should require authentication to create checkout session', async () => {
    const response = await request(app).post('/api/payment/create-checkout-session');
    expect(response.status).toBe(401);
  });
});
