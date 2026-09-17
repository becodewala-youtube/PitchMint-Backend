import User from './user.model';
import { IUser } from './user.types';

export class UserService {
  async findById(id: string): Promise<IUser | null> {
    return User.findById(id);
  }

  async findByEmail(email: string, includePassword = false): Promise<IUser | null> {
    const query = User.findOne({ email });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async updateProfile(id: string, updates: Partial<IUser>): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, updates, { new: true });
  }

  async upgradeToPremium(userId: string): Promise<IUser | null> {
    return User.findByIdAndUpdate(userId, { isPremium: true }, { new: true });
  }

  async addCredits(userId: string, amount: number): Promise<IUser | null> {
    const user = await User.findById(userId);
    if (!user) return null;
    user.credits = (user.credits || 0) + amount;
    return user.save();
  }

  async deductCredits(userId: string, amount: number): Promise<IUser | null> {
    const user = await User.findById(userId);
    if (!user || user.credits < amount) return null;
    user.credits = Math.max(0, user.credits - amount);
    return user.save();
  }
}

export const userService = new UserService();
export default userService;
