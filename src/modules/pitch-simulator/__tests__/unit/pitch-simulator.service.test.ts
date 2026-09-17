import { PitchSimulatorService } from '../../pitch-simulator.service';

describe('PitchSimulatorService Unit Tests', () => {
  let service: PitchSimulatorService;

  beforeEach(() => {
    service = new PitchSimulatorService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
