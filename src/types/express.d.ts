import { Request } from 'express';
import { IUser } from '../modules/users/user.types';

declare global {
  namespace Express {
    interface Request {
      user?: IUser | any;
      rawBody?: Buffer;
    }
  }
}
