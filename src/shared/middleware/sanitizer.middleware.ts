import { Request, Response, NextFunction } from 'express';
import xss from 'xss-clean';
import { validationResult } from 'express-validator';

// Middleware to sanitize user input
export const sanitizeInput = xss();

// Middleware to handle validation errors
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): any => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export default {
  sanitizeInput,
  handleValidationErrors,
};
