const Database = require('better-sqlite3');
const db = new Database('./gps_tracking.db');

console.log('\n=== DISPOSITIVOS REGISTRADOS ===');
const dispositivos = db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all();
dispositivos.forEach(d => {
    console.log(`ID: ${d.device_id} | Nombre: ${d.device_name} | Creado: ${d.created_at}`);
});

console.log('\n=== ÚLTIMAS 10 UBICACIONES ===');
const ubicaciones = db.prepare(`
    SELECT l.*, d.device_name 
    FROM locations l 
    JOIN devices d ON l.device_id = d.device_id 
    ORDER BY l.timestamp DESC 
    LIMIT 10
`).all();
ubicaciones.forEach(u => {
    const fecha = new Date(u.timestamp);
    console.log(`${u.device_name} | Lat: ${u.latitude.toFixed(6)} | Lon: ${u.longitude.toFixed(6)} | ${fecha.toLocaleString('es-ES')}`);
});

console.log('\n=== CONTEO DE UBICACIONES POR DISPOSITIVO ===');
const conteo = db.prepare(`
    SELECT d.device_name, COUNT(l.id) as total 
    FROM devices d 
    LEFT JOIN locations l ON d.device_id = l.device_id 
    GROUP BY d.device_id
`).all();
conteo.forEach(c => {
    console.log(`${c.device_name}: ${c.total} ubicaciones`);
});

db.close();
