import { AuthService } from '../../auth.service';

describe('AuthService Unit Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  test('should generate a token for user ID', () => {
    const token = authService.generateToken('user123');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
  });
});
