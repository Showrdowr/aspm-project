import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword, generateToken } from '@/lib/auth';

interface User {
  id: number;
  username: string;
  password_hash: string;
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    
    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }
    
    // ค้นหา user
    const users = await query<User[]>(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    
    const user = users[0];
    
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // ตรวจสอบ password (ใช้ column password_hash)
    const isValid = await verifyPassword(password, user.password_hash);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // สร้าง JWT token
    const token = generateToken({ 
      userId: user.id, 
      username: user.username 
    });
    
    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      username: user.username
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
