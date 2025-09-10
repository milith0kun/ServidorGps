const dbManager = require('./database');

async function checkDatabase() {
    try {
        await dbManager.initialize();
        const db = dbManager.getDatabase();
        
        // Verificar dispositivos
        const devices = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM devices', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log('📱 Dispositivos en la base de datos:', devices.length);
        devices.forEach(device => {
            console.log(`  - ID: ${device.id}, Nombre: ${device.name}, Creado: ${device.created_at}`);
        });
        
        // Verificar ubicaciones
        const locations = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM locations ORDER BY timestamp DESC LIMIT 10', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log('\n📍 Últimas ubicaciones en la base de datos:', locations.length);
        locations.forEach(location => {
            console.log(`  - Device: ${location.device_id}, Lat: ${location.latitude}, Lon: ${location.longitude}, Timestamp: ${new Date(location.timestamp).toLocaleString()}`);
        });
        
        if (devices.length === 0) {
            console.log('\n⚠️ No hay dispositivos en la base de datos');
        }
        
        if (locations.length === 0) {
            console.log('\n⚠️ No hay ubicaciones en la base de datos');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error verificando base de datos:', error);
        process.exit(1);
    }
}

checkDatabase();