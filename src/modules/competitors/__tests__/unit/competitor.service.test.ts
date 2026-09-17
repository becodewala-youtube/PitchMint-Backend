import { CompetitorService } from '../../competitor.service';

describe('CompetitorService Unit Tests', () => {
  let service: CompetitorService;

  beforeEach(() => {
    service = new CompetitorService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
