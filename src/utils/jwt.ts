import jwt, { SignOptions } from 'jsonwebtoken';

// JWT Secret - MUST be set via environment variable in production
// Minimum 32 characters recommended for security
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('⚠️  WARNING: JWT_SECRET not set! Using default secret. This is insecure for production!');
}
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '1h') as SignOptions['expiresIn'];
const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN ||
  '7d') as SignOptions['expiresIn'];

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
  tenantSubdomain?: string;
  tenantSlug?: string;
  isSuperAdmin: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(payload: JWTPayload): string {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN,
  };
  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Generate refresh token (long-lived)
 */
export function generateRefreshToken(payload: JWTPayload): string {
  const options: SignOptions = {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  };
  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(payload: JWTPayload): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
