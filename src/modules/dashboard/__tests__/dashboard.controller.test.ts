import { Request, Response } from 'express';
import { getActivityHistory } from '../dashboard.controller';
import dashboardService from '../dashboard.service';

jest.mock('../dashboard.service');

describe('Dashboard Controller Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();
    req = { query: {} };
    res = {
      status: statusMock,
      json: jsonMock
    };
  });

  describe('getActivityHistory', () => {
    test('should return 401 if user is unauthorized', async () => {
      req.user = undefined;

      await getActivityHistory(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized' }));
    });

    test('should return activity history for authenticated user', async () => {
      (req as any).user = { _id: 'user-1' };
      req.query = { page: '2', limit: '15', serviceType: 'idea_validation' };

      const mockHistory = [{ title: 'Validated Idea' }];
      (dashboardService.getActivityHistory as jest.Mock).mockResolvedValue(mockHistory);

      await getActivityHistory(req as Request, res as Response);

      expect(dashboardService.getActivityHistory).toHaveBeenCalledWith('user-1', 'idea_validation', 2, 15);
      expect(jsonMock).toHaveBeenCalledWith(mockHistory);
    });

    test('should return 500 when error occurs in service', async () => {
      (req as any).user = { _id: 'user-1' };
      (dashboardService.getActivityHistory as jest.Mock).mockRejectedValue(new Error('Service failed'));

      await getActivityHistory(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Service failed' }));
    });
  });
});
