import mysql from 'mysql2/promise';

// สร้าง connection pool สำหรับ MySQL
export const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'loadtest_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Helper function สำหรับ query
export async function query<T>(sql: string, params?: unknown[]): Promise<T> {
  const [rows] = await db.execute(sql, params);
  return rows as T;
}
