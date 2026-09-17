import { Types } from 'mongoose';
import { UserPlan } from '../users/user.types';

export interface RegisterUserDto {
  name: string;
  email: string;
  password?: string;
}

export interface LoginUserDto {
  email: string;
  password?: string;
}

export interface AuthResponseUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  isPremium: boolean;
  credits: number;
  plan: UserPlan;
  isEmailVerified: boolean;
  profilePicture?: string | null;
  authProvider?: string;
}

export interface AuthResponse {
  message?: string;
  token?: string;
  user?: AuthResponseUser;
  userId?: Types.ObjectId;
  emailSent?: boolean;
}
