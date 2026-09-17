import { Request, Response, NextFunction } from 'express';
import xss from 'xss-clean';
import { validationResult, body } from 'express-validator';

// Middleware to sanitize user input
export const sanitizeInput = xss();

// Validation rules for idea submission
export const validateIdeaSubmission = [
  body('ideaText')
    .trim()
    .notEmpty()
    .withMessage('Idea text is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Idea text must be between 10 and 1000 characters'),
];

// Validation rules for user registration
export const validateUserRegistration = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

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
  validateIdeaSubmission,
  validateUserRegistration,
  handleValidationErrors,
};
