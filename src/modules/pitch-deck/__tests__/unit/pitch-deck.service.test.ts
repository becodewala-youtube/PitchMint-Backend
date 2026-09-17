import { PitchDeckService } from '../../pitch-deck.service';

describe('PitchDeckService Unit Tests', () => {
  let service: PitchDeckService;

  beforeEach(() => {
    service = new PitchDeckService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
