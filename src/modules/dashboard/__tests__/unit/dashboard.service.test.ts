import { DashboardService } from '../../dashboard.service';
import ActivityHistory from '../../dashboard.model';

jest.mock('../../dashboard.model');

describe('Dashboard Service Unit Tests', () => {
  let dashboardService: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    dashboardService = new DashboardService();
  });

  describe('getActivityHistory', () => {
    test('should query with serviceType when specified and not "all"', async () => {
      const mockResult = [{ title: 'Activity 1' }];
      const sortMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          skip: jest.fn().mockResolvedValue(mockResult)
        })
      });
      (ActivityHistory.find as jest.Mock).mockReturnValue({ sort: sortMock });

      const res = await dashboardService.getActivityHistory('user-123', 'pitch_deck', 1, 10);

      expect(ActivityHistory.find).toHaveBeenCalledWith({
        userId: 'user-123',
        serviceType: 'pitch_deck'
      });
      expect(res).toEqual(mockResult);
    });

    test('should query without serviceType filter when serviceType is "all"', async () => {
      const sortMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          skip: jest.fn().mockResolvedValue([])
        })
      });
      (ActivityHistory.find as jest.Mock).mockReturnValue({ sort: sortMock });

      await dashboardService.getActivityHistory('user-123', 'all', 1, 10);

      expect(ActivityHistory.find).toHaveBeenCalledWith({
        userId: 'user-123'
      });
    });
  });

  describe('logActivity', () => {
    test('should create activity history document with all fields', async () => {
      (ActivityHistory.create as jest.Mock).mockResolvedValue({ _id: 'act-1' });

      await dashboardService.logActivity(
        'user-1',
        'idea_validation',
        'Title',
        'Description',
        { score: 95 },
        1,
        'idea-123'
      );

      expect(ActivityHistory.create).toHaveBeenCalledWith({
        userId: 'user-1',
        serviceType: 'idea_validation',
        title: 'Title',
        description: 'Description',
        data: { score: 95 },
        creditsUsed: 1,
        relatedIdeaId: 'idea-123'
      });
    });

    test('should catch and handle errors without throwing', async () => {
      (ActivityHistory.create as jest.Mock).mockRejectedValue(new Error('DB failure'));

      await expect(
        dashboardService.logActivity(
          'user-1',
          'idea_validation',
          'Title',
          'Description',
          {}
        )
      ).resolves.not.toThrow();
    });
  });
});
