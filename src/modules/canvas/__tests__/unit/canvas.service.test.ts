import { CanvasService } from '../../canvas.service';

describe('CanvasService Unit Tests', () => {
  let service: CanvasService;

  beforeEach(() => {
    service = new CanvasService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
