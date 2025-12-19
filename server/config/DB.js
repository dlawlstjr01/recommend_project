const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: 'project-db-campus.smhrd.com',
  port: 3307,
  user: 'cgi_25K_donga1_p2_3',
  password: 'smhrd3',
  database: 'cgi_25K_donga1_p2_3',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

module.exports = db;
