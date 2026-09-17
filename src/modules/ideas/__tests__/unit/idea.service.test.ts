import { IdeaService } from '../../idea.service';

describe('IdeaService Unit Tests', () => {
  let service: IdeaService;

  beforeEach(() => {
    service = new IdeaService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });
});
