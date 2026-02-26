import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// สร้าง JWT token
export function generateToken(payload: { userId: number; username: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

// ตรวจสอบ JWT token
export function verifyToken(token: string): { userId: number; username: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    return decoded;
  } catch (err) {
    console.error('[Auth] Token verification failed:', err instanceof Error ? err.message : 'Unknown error');
    console.log('[Auth] Using JWT_SECRET (first 6 chars):', JWT_SECRET.substring(0, 6) + '...');
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// ตรวจสอบ password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ดึง token จาก Authorization header
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}
