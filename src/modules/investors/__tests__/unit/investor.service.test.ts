import { InvestorService } from '../../investor.service';

describe('InvestorService Unit Tests', () => {
  let service: InvestorService;

  beforeEach(() => {
    service = new InvestorService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
