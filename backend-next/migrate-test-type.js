const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'performance_test_db'
  });
  
  // Add columns for data that was previously only from test_histories JOIN
  await c.execute("ALTER TABLE test_reports ADD COLUMN target_url VARCHAR(500) DEFAULT '' AFTER test_type");
  await c.execute("ALTER TABLE test_reports ADD COLUMN virtual_users INT DEFAULT 0 AFTER target_url");
  await c.execute("ALTER TABLE test_reports ADD COLUMN duration INT DEFAULT 0 AFTER virtual_users");
  await c.execute("ALTER TABLE test_reports ADD COLUMN avg_response_time FLOAT DEFAULT 0 AFTER duration");
  await c.execute("ALTER TABLE test_reports ADD COLUMN error_rate FLOAT DEFAULT 0 AFTER avg_response_time");
  
  // Backfill from test_histories for existing reports
  await c.execute(`
    UPDATE test_reports r 
    JOIN test_histories h ON r.test_history_id = h.id 
    SET r.target_url = h.target_url, 
        r.virtual_users = h.virtual_users, 
        r.duration = h.duration,
        r.avg_response_time = h.avg_response_time,
        r.error_rate = h.error_rate
    WHERE r.test_history_id > 0
  `);
  
  console.log('Columns added and backfilled successfully');
  await c.end();
})();
