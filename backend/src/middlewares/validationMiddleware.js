/**
 * Validates registration input fields
 */
exports.validateRegister = (req, res, next) => {
  const { name, phone, password } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
    errors.push('Phone number is required');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

/**
 * Validates login input fields
 */
exports.validateLogin = (req, res, next) => {
  const { phone, email, password } = req.body;
  const errors = [];

  if (!phone && !email) {
    errors.push('Please provide a phone number or email address');
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};
