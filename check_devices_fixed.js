const Database = require('better-sqlite3');
const db = new Database('./gps_tracking.db');

console.log('\n=== DISPOSITIVOS REGISTRADOS ===');
const dispositivos = db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all();
dispositivos.forEach(d => {
    console.log(`ID: ${d.id}`);
    console.log(`Nombre: ${d.name}`);
    console.log(`Color: ${d.color}`);
    console.log(`Creado: ${d.created_at}`);
    console.log(`Activo: ${d.is_active ? 'Sí' : 'No'}`);
    console.log('---');
});

console.log('\n=== ÚLTIMAS 10 UBICACIONES ===');
const ubicaciones = db.prepare(`
    SELECT l.*, d.name 
    FROM locations l 
    JOIN devices d ON l.device_id = d.id 
    ORDER BY l.timestamp DESC 
    LIMIT 10
`).all();
ubicaciones.forEach(u => {
    const fecha = new Date(parseInt(u.timestamp));
    console.log(`${u.name} | Lat: ${u.latitude.toFixed(6)} | Lon: ${u.longitude.toFixed(6)} | ${fecha.toLocaleString('es-ES')} | Acc: ${u.accuracy}m`);
});

console.log('\n=== CONTEO DE UBICACIONES POR DISPOSITIVO ===');
const conteo = db.prepare(`
    SELECT d.name, COUNT(l.id) as total,
           MAX(l.timestamp) as ultima_ubicacion
    FROM devices d 
    LEFT JOIN locations l ON d.id = l.device_id 
    GROUP BY d.id
    ORDER BY ultima_ubicacion DESC
`).all();
conteo.forEach(c => {
    const ultimaFecha = c.ultima_ubicacion ? new Date(parseInt(c.ultima_ubicacion)).toLocaleString('es-ES') : 'Nunca';
    console.log(`${c.name}: ${c.total} ubicaciones | Última: ${ultimaFecha}`);
});

db.close();
