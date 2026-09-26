import { CREDIT_PLANS } from '../../credit-plans';

describe('Credit Plans Constants Unit Tests', () => {
  test('should define starter, pro, and premium plans with valid values', () => {
    expect(CREDIT_PLANS.starter).toBeDefined();
    expect(CREDIT_PLANS.pro).toBeDefined();
    expect(CREDIT_PLANS.premium).toBeDefined();

    expect(CREDIT_PLANS.starter.credits).toBe(25);
    expect(CREDIT_PLANS.starter.price).toBe(9900);

    expect(CREDIT_PLANS.pro.credits).toBe(100);
    expect(CREDIT_PLANS.pro.price).toBe(49900);

    expect(CREDIT_PLANS.premium.credits).toBe(500);
    expect(CREDIT_PLANS.premium.price).toBe(99900);
  });
});
