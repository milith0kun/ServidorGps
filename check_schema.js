const Database = require('better-sqlite3');
const db = new Database('./gps_tracking.db');

console.log('\n=== ESQUEMA DE TABLA DEVICES ===');
const schemaDevices = db.prepare("PRAGMA table_info(devices)").all();
schemaDevices.forEach(col => {
    console.log(`${col.name} (${col.type})`);
});

console.log('\n=== ESQUEMA DE TABLA LOCATIONS ===');
const schemaLocations = db.prepare("PRAGMA table_info(locations)").all();
schemaLocations.forEach(col => {
    console.log(`${col.name} (${col.type})`);
});

console.log('\n=== CONTENIDO DE DEVICES ===');
const devices = db.prepare('SELECT * FROM devices').all();
console.log(JSON.stringify(devices, null, 2));

db.close();
