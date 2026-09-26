import { logActivity } from '../activity-logger';
import { dashboardService } from '../../../modules/dashboard/dashboard.service';

jest.mock('../../../modules/dashboard/dashboard.service', () => ({
  dashboardService: {
    logActivity: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('Activity Logger Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should delegate to dashboardService.logActivity with correct arguments', async () => {
    await logActivity(
      'user-1',
      'idea_validation',
      'Tested idea',
      'Description',
      { score: 90 },
      1,
      'idea-123'
    );

    expect(dashboardService.logActivity).toHaveBeenCalledWith(
      'user-1',
      'idea_validation',
      'Tested idea',
      'Description',
      { score: 90 },
      1,
      'idea-123'
    );
  });

  test('should delegate to dashboardService.logActivity with default arguments when omitted', async () => {
    await logActivity(
      'user-1',
      'idea_validation',
      'Tested idea',
      'Description',
      { score: 90 }
    );

    expect(dashboardService.logActivity).toHaveBeenCalledWith(
      'user-1',
      'idea_validation',
      'Tested idea',
      'Description',
      { score: 90 },
      1,
      null
    );
  });
});
