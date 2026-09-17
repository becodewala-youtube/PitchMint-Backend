import { PaymentService } from '../../payment.service';

describe('PaymentService Unit Tests', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
