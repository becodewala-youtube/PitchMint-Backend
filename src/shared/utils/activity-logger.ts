import { Types } from 'mongoose';
import { dashboardService } from '../../modules/dashboard/dashboard.service';
import { ServiceType } from '../../modules/dashboard/dashboard.types';

export const logActivity = async (
  userId: Types.ObjectId | string,
  serviceType: ServiceType,
  title: string,
  description: string,
  data: any,
  creditsUsed: number = 1,
  relatedIdeaId: Types.ObjectId | string | null = null
): Promise<void> => {
  return dashboardService.logActivity(
    userId,
    serviceType,
    title,
    description,
    data,
    creditsUsed,
    relatedIdeaId
  );
};

export default { logActivity };
