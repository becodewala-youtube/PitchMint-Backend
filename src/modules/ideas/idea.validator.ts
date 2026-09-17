import { body } from 'express-validator';

// Validation rules for idea submission
export const validateIdeaSubmission = [
  body('ideaText')
    .trim()
    .notEmpty()
    .withMessage('Idea text is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Idea text must be between 10 and 1000 characters'),
];

export default {
  validateIdeaSubmission,
};
