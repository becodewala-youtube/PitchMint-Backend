import { Request, Response, NextFunction } from 'express';
import logger from '../../config/logger';
import env from '../../config/env';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  logger.error('Global error handler:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
};

export default {
  errorHandler,
  notFoundHandler
};
