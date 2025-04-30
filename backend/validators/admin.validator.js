const { body } = require('express-validator');

module.exports = {
  validateAdminCreation: [
    body('email')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),
    
    body('password')
      .isLength({ min: 12 }).withMessage('Password must be at least 12 characters')
      .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
      .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
      .matches(/[0-9]/).withMessage('Password must contain at least one number')
      .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character'),
    
    body('role')
      .isIn(['admin', 'superadmin']).withMessage('Invalid role specified')
  ]
};