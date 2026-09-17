import { UserService } from '../../user.service';
import User from '../../user.model';

describe('UserService Unit Tests', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    jest.clearAllMocks();
  });

  test('should be defined', () => {
    expect(userService).toBeDefined();
  });
});
