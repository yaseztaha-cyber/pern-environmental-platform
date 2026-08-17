/**
 * Auth Routes — self-hosted JWT + bcrypt authentication
 * POST /register, POST /login, POST /logout, GET /me, POST /refresh,
 * POST /forgot-password, POST /reset-password, POST /verify-email, POST /resend-verification
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../db');
const logger = require('../utils/logger');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'pern-jwt-secret-change-me-in-production';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '30d';
const REFRESH_DAYS = 30;
const BCRYPT_ROUNDS = 12;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const isProd = process.env.NODE_ENV === 'production';

function generateToken(payload, expires) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expires });
}

function setRefreshCookie(res, token) {
  res.cookie('pern_refresh_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie('pern_refresh_token', { path: '/' });
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(pw) {
  return typeof pw === 'string' && pw.length >= 8;
}

// ===================== REGISTER =====================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await db.getUserByEmail(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = `user_${crypto.randomBytes(12).toString('hex')}`;
    const verificationToken = crypto.randomBytes(32).toString('hex');

    await db.createLocalUser({
      id: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      passwordHash,
      role: 'viewer',
      organizationId: 'default',
    });

    await db.setVerificationToken(userId, verificationToken);

    // Send verification email (best-effort)
    const transporter = getTransporter();
    if (transporter) {
      const verifyUrl = `${FRONTEND_URL}/#/verify-email?token=${verificationToken}`;
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@pern.local',
          to: email.toLowerCase().trim(),
          subject: 'Verify your PERN account',
          html: `<p>Welcome to PERN Platform!</p><p>Click the link below to verify your email:</p><p><a href="${verifyUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
          text: `Welcome to PERN Platform! Verify your email: ${verifyUrl}`,
        });
      } catch (err) {
        logger.warn('[Auth] Failed to send verification email', { error: err.message });
      }
    }

    // Generate tokens
    const accessToken = generateToken({ sub: userId, email: email.toLowerCase().trim(), name: name.trim(), role: 'viewer' }, ACCESS_EXPIRES);
    const refreshToken = generateToken({ sub: userId, type: 'refresh' }, REFRESH_EXPIRES);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      accessToken,
      user: {
        id: userId,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: 'viewer',
        emailVerified: false,
      },
    });
  } catch (err) {
    logger.error('[Auth] Register failed', { error: err.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ===================== LOGIN =====================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.getUserByEmail(email.toLowerCase().trim());
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in', code: 'EMAIL_NOT_VERIFIED' });
    }

    await db.updateUserLastLogin(user.id);

    const accessToken = generateToken({ sub: user.id, email: user.email, name: user.name, role: user.role || 'viewer' }, ACCESS_EXPIRES);
    const refreshToken = generateToken({ sub: user.id, type: 'refresh' }, REFRESH_EXPIRES);
    setRefreshCookie(res, refreshToken);

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'viewer',
        emailVerified: user.email_verified,
      },
    });
  } catch (err) {
    logger.error('[Auth] Login failed', { error: err.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// ===================== LOGOUT =====================
router.post('/logout', (req, res) => {
  clearRefreshCookie(res);
  res.json({ success: true });
});

// ===================== ME =====================
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1] : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.getUser(decoded.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'viewer',
      organizationId: user.organization_id,
      emailVerified: user.email_verified,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// ===================== REFRESH =====================
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.pern_refresh_token;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid refresh token' });

    const user = await db.getUser(decoded.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const accessToken = generateToken({ sub: user.id, email: user.email, name: user.name, role: user.role || 'viewer' }, ACCESS_EXPIRES);
    const newRefreshToken = generateToken({ sub: user.id, type: 'refresh' }, REFRESH_EXPIRES);
    setRefreshCookie(res, newRefreshToken);

    res.json({ accessToken });
  } catch (err) {
    clearRefreshCookie(res);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ===================== VERIFY EMAIL =====================
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification token required' });

    const user = await db.verifyEmailUser(token);
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification token' });

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ===================== RESEND VERIFICATION =====================
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await db.getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.json({ success: true }); // Don't reveal if user exists

    if (user.email_verified) {
      return res.json({ success: true, message: 'Email already verified' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await db.setVerificationToken(user.id, verificationToken);

    const transporter = getTransporter();
    if (transporter) {
      const verifyUrl = `${FRONTEND_URL}/#/verify-email?token=${verificationToken}`;
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@pern.local',
          to: user.email,
          subject: 'Verify your PERN account',
          html: `<p>Click the link below to verify your email:</p><p><a href="${verifyUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
          text: `Verify your email: ${verifyUrl}`,
        });
      } catch (err) {
        logger.warn('[Auth] Failed to resend verification email', { error: err.message });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend verification' });
  }
});

// ===================== FORGOT PASSWORD =====================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await db.getUserByEmail(email.toLowerCase().trim());
    if (!user) return res.json({ success: true }); // Don't reveal if user exists

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await db.setResetToken(user.id, resetToken, expires);

    const transporter = getTransporter();
    if (transporter) {
      const resetUrl = `${FRONTEND_URL}/#/reset-password?token=${resetToken}`;
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@pern.local',
          to: user.email,
          subject: 'Reset your PERN password',
          html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset Password</a></p><p>This link expires in 1 hour.</p><p>If you didn't request this, ignore this email.</p>`,
          text: `Reset your password: ${resetUrl}`,
        });
      } catch (err) {
        logger.warn('[Auth] Failed to send reset email', { error: err.message });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// ===================== RESET PASSWORD =====================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await db.getUserByResetToken(token);
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.resetPasswordHash(user.id, passwordHash);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Password reset failed' });
  }
});

module.exports = router;
