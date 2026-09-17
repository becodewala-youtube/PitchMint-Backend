import { Request, Response } from 'express';
import ActivityHistory from '../models/ActivityHistory';

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
      return res.status(401).json({ message: 'Not authorized' });
    }

    let query: any = { userId: req.user._id };
    
    if (serviceType && serviceType !== 'all') {
      query.serviceType = serviceType;
    }
    
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const activities = await ActivityHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    res.json(activities);
  } catch (error: any) {
    console.error('Error getting activity history:', error);
    res.status(500).json({ message: error.message });
  }
};

export default {
  getActivityHistory
};
