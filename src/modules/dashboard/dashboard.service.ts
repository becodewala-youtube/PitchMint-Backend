import { Types } from 'mongoose';
import ActivityHistory from './dashboard.model';
import { IActivityHistory, ServiceType } from './dashboard.types';

export class DashboardService {
  async getActivityHistory(
    userId: Types.ObjectId | string,
    serviceType?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<IActivityHistory[]> {
    const query: any = { userId };
    
    if (serviceType && serviceType !== 'all') {
      query.serviceType = serviceType;
    }

    return ActivityHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);
  }

  async logActivity(
    userId: Types.ObjectId | string,
    serviceType: ServiceType,
    title: string,
    description: string,
    data: any,
    creditsUsed: number = 1,
    relatedIdeaId: Types.ObjectId | string | null = null
  ): Promise<void> {
    try {
      await ActivityHistory.create({
        userId,
        serviceType,
        title,
        description,
        data,
        creditsUsed,
        relatedIdeaId
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;
