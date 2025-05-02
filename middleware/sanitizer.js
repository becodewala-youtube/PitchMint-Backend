const xss = require('xss-clean');
const { validationResult, body } = require('express-validator');

// Middleware to sanitize user input
const sanitizeInput = xss();

// Validation rules for idea submission
const validateIdeaSubmission = [
  body('ideaText')
    .trim()
    .notEmpty()
    .withMessage('Idea text is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Idea text must be between 10 and 1000 characters'),
];

// Validation rules for user registration
const validateUserRegistration = [
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
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

module.exports = {
  sanitizeInput,
  validateIdeaSubmission,
  validateUserRegistration,
  handleValidationErrors,
};