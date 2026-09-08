import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'togetherplay_super_secret_jwt_key_2026_dev';

export async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if username or email already exists
    const existingUser = await queryOne(
      'SELECT * FROM USERS WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)',
      [username.trim(), email.trim()]
    );

    if (existingUser) {
      return res.status(409).json({ error: 'Username or email is already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userId = uuidv4();
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;

    await execute(
      'INSERT INTO USERS (user_id, username, email, password_hash, avatar) VALUES (?, ?, ?, ?, ?)',
      [userId, username.trim(), email.trim().toLowerCase(), passwordHash, avatar]
    );

    const token = jwt.sign(
      { user_id: userId, username: username.trim(), email: email.trim().toLowerCase(), avatar },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        user_id: userId,
        username: username.trim(),
        email: email.trim().toLowerCase(),
        avatar,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
}

export async function login(req, res) {
  try {
    const { identifier, password } = req.body; // username or email

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    const user = await queryOne(
      'SELECT * FROM USERS WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)',
      [identifier.trim(), identifier.trim()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash || user.PASSWORD_HASH);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const userId = user.user_id || user.USER_ID;
    const username = user.username || user.USERNAME;
    const email = user.email || user.EMAIL;
    const avatar = user.avatar || user.AVATAR;

    const token = jwt.sign(
      { user_id: userId, username, email, avatar },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Logged in successfully',
      token,
      user: {
        user_id: userId,
        username,
        email,
        avatar,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
}

export async function getMe(req, res) {
  try {
    const user = await queryOne(
      'SELECT user_id, username, email, avatar, created_at FROM USERS WHERE user_id = ?',
      [req.user.user_id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
}
