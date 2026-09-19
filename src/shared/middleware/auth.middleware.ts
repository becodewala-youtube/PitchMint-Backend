import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../../modules/users/user.model';
import env from '../../config/env';

interface JwtPayload {
  id: string;
  tokenVersion?: number;
}

export const protect = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  let token: string | undefined;
  
  // Check if token exists in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      
      // Check if token exists and is not 'null' or 'undefined'
      if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ message: 'Not authorized, no valid token' });
      }
      
      // Verify token
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      
      // Get user from the token (exclude password)
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (decoded.tokenVersion !== undefined && req.user.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({ message: 'Token has been invalidated. Please log in again.' });
      }
      
      return next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
  
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Check if user is premium
export const premium = (req: Request, res: Response, next: NextFunction): any => {
  if (req.user && req.user.isPremium) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Premium subscription required'
  });
};

export default { protect, premium };
