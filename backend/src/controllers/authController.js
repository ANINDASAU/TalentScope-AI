const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Generate signed JWT token for authenticated user
 * @param {string} id User ID
 * @param {string} role User Role
 * @returns {string} Signed JWT
 */
const generateToken = (id, role) => {
  const secret = process.env.JWT_SECRET || 'talentscope_super_secret_jwt_key_2026';
  const expiresIn = process.env.JWT_EXPIRE || '30d';
  return jwt.sign({ id, role }, secret, { expiresIn });
};

/**
 * Helper to sanitize user document before returning to client (omitting password hash)
 * @param {object} user Mongoose user doc or plain object
 * @returns {object} Safe user object
 */
const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;
  return userObj;
};

/**
 * @desc    Register a new Athlete / User
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      role,
      age,
      gender,
      weight,
      height,
      preferredSports,
      primarySport,
      specialization,
      affiliation
    } = req.body;

    // Check for existing user with identical phone number
    const existingPhone = await User.findOne({ phone: phone.trim() });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'An account with this phone number already exists.'
      });
    }

    // Check for existing user with identical email if provided
    if (email) {
      const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email address already exists.'
        });
      }
    }

    // Create user in MongoDB (password will be hashed via User pre-save hook)
    const user = await User.create({
      name: name.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      phone: phone.trim(),
      password,
      role: role || 'athlete',
      age: age ? Number(age) : undefined,
      gender: gender || 'male',
      weight: weight ? Number(weight) : undefined,
      height: height ? Number(height) : undefined,
      preferredSports: preferredSports
        ? Array.isArray(preferredSports)
          ? preferredSports
          : preferredSports.split(',').map((s) => s.trim())
        : ['Athletics'],
      primarySport: primarySport || 'Athletics',
      specialization: specialization || 'Sprinting & Biometrics',
      affiliation: affiliation || 'Independent Athlete'
    });

    const token = generateToken(user._id, user.role);

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('[Auth Register Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration'
    });
  }
};

/**
 * @desc    Authenticate User (Athlete/Coach) and return JWT
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    // Query condition: match phone or email
    const query = {};
    if (phone) query.phone = phone.trim();
    else if (email) query.email = email.trim().toLowerCase();

    // Query user and explicitly select password hash
    const user = await User.findOne(query).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User not found.'
      });
    }

    // Verify bcrypt password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.'
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Account has been suspended.'
      });
    }

    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('[Auth Login Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during login'
    });
  }
};

/**
 * @desc    Get currently authenticated User Profile
 * @route   GET /api/auth/profile
 * @access  Private (Requires Bearer token)
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('[Auth GetProfile Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error retrieving profile'
    });
  }
};
