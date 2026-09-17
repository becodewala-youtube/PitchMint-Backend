import { DashboardService } from '../../dashboard.service';

describe('DashboardService Unit Tests', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
