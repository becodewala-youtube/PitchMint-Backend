import { Types } from 'mongoose';
import ActivityHistory, { ServiceType } from '../models/ActivityHistory';

export const logActivity = async (
  userId: Types.ObjectId | string,
  serviceType: ServiceType,
  title: string,
  description: string,
  data: any,
  creditsUsed: number = 1,
  relatedIdeaId: Types.ObjectId | string | null = null
): Promise<void> => {
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
};

export default { logActivity };
