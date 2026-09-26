import {
  apiLimiter,
  authLimiter,
  strictAuthLimiter,
  pitchDeckLimiter,
  canvasLimiter
} from '../rate-limiter.middleware';

describe('Rate Limiter Middleware Unit Tests', () => {
  test('all rate limiters should be defined as express middleware functions', () => {
    expect(typeof apiLimiter).toBe('function');
    expect(typeof authLimiter).toBe('function');
    expect(typeof strictAuthLimiter).toBe('function');
    expect(typeof pitchDeckLimiter).toBe('function');
    expect(typeof canvasLimiter).toBe('function');
  });
});
