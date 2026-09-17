import { CreditService } from '../../credit.service';

describe('CreditService Unit Tests', () => {
  let service: CreditService;

  beforeEach(() => {
    service = new CreditService();
    jest.clearAllMocks();
  });

  test('should return credit plans', () => {
    const plans = service.getPlans();
    expect(plans).toHaveProperty('starter');
    expect(plans).toHaveProperty('pro');
    expect(plans).toHaveProperty('premium');
  });
});
