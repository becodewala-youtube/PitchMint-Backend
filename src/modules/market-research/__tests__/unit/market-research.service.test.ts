import { MarketResearchService } from '../../market-research.service';

describe('MarketResearchService Unit Tests', () => {
  let service: MarketResearchService;

  beforeEach(() => {
    service = new MarketResearchService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
