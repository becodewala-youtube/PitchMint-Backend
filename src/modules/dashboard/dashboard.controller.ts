import { Request, Response } from 'express';
import dashboardService from './dashboard.service';

// @desc    Get user activity history
// @route   GET /api/history
// @access  Private
export const getActivityHistory = async (req: Request, res: Response): Promise<any> => {
  try {
    const { serviceType, page = 1, limit = 20 } = req.query as {
      serviceType?: string;
      page?: string | number;
      limit?: string | number;
    };
    
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const activities = await dashboardService.getActivityHistory(
      req.user._id,
      serviceType,
      pageNum,
      limitNum
    );

    res.json(activities);
  } catch (error: any) {
    console.error('Error getting activity history:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  getActivityHistory
};
