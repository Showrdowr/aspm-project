import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

interface User {
  id: number;
  username: string;
}

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json();
    
    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }
    
    // ตรวจสอบว่า username ซ้ำหรือไม่
    const existingUsers = await query<User[]>(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว' },
        { status: 409 }
      );
    }
    
    // ตรวจสอบ email ซ้ำ (ถ้ามี email)
    if (email) {
      const existingEmail = await query<User[]>(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );
      if (existingEmail.length > 0) {
        return NextResponse.json(
          { error: 'อีเมลล์นี้ถูกใช้ไปแล้ว' },
          { status: 409 }
        );
      }
    }
    
    // Hash password และสร้าง user (ใช้ column password_hash)
    const hashedPassword = await hashPassword(password);
    
    await query(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email || '', hashedPassword, 'user']
    );
    
    return NextResponse.json({ 
      message: 'User registered successfully',
      username 
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
