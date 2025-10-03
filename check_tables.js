const Database = require('better-sqlite3');
const db = new Database('./gps_tracking.db');

console.log('=== TABLAS EN LA BASE DE DATOS ===');
const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tablas.forEach(t => console.log(t.name));

db.close();
