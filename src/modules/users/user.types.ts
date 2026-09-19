import { Document, Types } from 'mongoose';

export type UserPlan = 'free' | 'starter' | 'pro' | 'premium';
export type AuthProvider = 'local' | 'google';

export interface IUserMethods {
  matchPassword(enteredPassword: string): Promise<boolean>;
  generateEmailVerificationToken(): string;
  generatePasswordResetToken(): string;
  resetMonthlyCredits(): boolean;
  checkAndResetMonthlyCredits(): Promise<boolean>;
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
  monthlyCredits: number;
  purchasedCredits: number;
  readonly credits: number; // Virtual sum of monthly + purchased
  lastCreditReset: Date;
  plan: UserPlan;
  isEmailVerified: boolean;
  tokenVersion: number;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | number | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | number | null;
  googleId?: string | null;
  authProvider: AuthProvider;
  savedIdeas: Types.ObjectId[];
  processedPayments: string[];
  processedRefunds: string[];
  createdAt: Date;
}
