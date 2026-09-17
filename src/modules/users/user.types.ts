import { Document, Types } from 'mongoose';

export type UserPlan = 'free' | 'starter' | 'pro' | 'premium';
export type AuthProvider = 'local' | 'google';
export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'past_due';

export interface IUserMethods {
  matchPassword(enteredPassword: string): Promise<boolean>;
  generateEmailVerificationToken(): string;
  generatePasswordResetToken(): string;
  resetMonthlyCredits(): void;
  getCreditsForPlan(): number;
  deductCredits(amount?: number): boolean;
}

export interface IUser extends Document, IUserMethods {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  profilePicture?: string | null;
  isPremium: boolean;
  credits: number;
  lastCreditReset: Date;
  plan: UserPlan;
  isEmailVerified: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | number | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | number | null;
  googleId?: string | null;
  authProvider: AuthProvider;
  savedIdeas: Types.ObjectId[];
  stripeCustomerId?: string | null;
  subscriptionId?: string | null;
  subscriptionStatus: SubscriptionStatus;
  createdAt: Date;
}
