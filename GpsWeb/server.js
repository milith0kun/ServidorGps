require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const dbManager = require('./database');
const moment = require('moment');
const os = require('os');
const { spawn } = require('child_process');

// Función para obtener la IP local
function obtenerIPLocal() {
    const interfaces = os.networkInterfaces();
    let ipWiFi = null;
    let ipOtra = null;
    
    for (const interfaceName in interfaces) {
        const interfaceInfo = interfaces[interfaceName];
        for (const info of interfaceInfo) {
            // Buscar IPv4 no loopback y no interna
            if (info.family === 'IPv4' && !info.internal) {
                // Priorizar IP de red WiFi (192.168.x.x)
                if (info.address.startsWith('192.168.')) {
                    ipWiFi = info.address;
                }
                // Guardar otras IPs como respaldo
                else if (info.address.startsWith('10.') || 
                        (info.address.startsWith('172.') && 
                         parseInt(info.address.split('.')[1]) >= 16 && 
                         parseInt(info.address.split('.')[1]) <= 31)) {
                    if (!ipOtra) ipOtra = info.address;
                }
            }
        }
    }
    
    // Priorizar IP WiFi, luego otras IPs locales, finalmente localhost
    return ipWiFi || ipOtra || 'localhost';
}

// Configuración del servidor
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*', // Permitir acceso desde cualquier origen
    credentials: true, // Permitir credenciales
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.static(__dirname)); // Servir archivos estáticos desde la raíz del proyecto

// Estructura para almacenar múltiples dispositivos y sus ubicaciones
let dispositivos = new Map(); // Map<deviceId, {info, ultimaUbicacion}>
let ultimaUbicacion = null; // Mantener compatibilidad con versión anterior

// Colores predefinidos para dispositivos
const coloresDispositivos = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

// Inicializar base de datos
console.log('🗄️ Inicializando base de datos...');
dbManager.initialize().then(async () => {
    console.log('✅ Base de datos inicializada correctamente');
    
    // Cargar dispositivos existentes desde la base de datos
    try {
        const dispositivosDB = await dbManager.getAllDevices();
        console.log(`📱 Cargando ${dispositivosDB.length} dispositivos desde la base de datos...`);
        
        for (const dispositivoDB of dispositivosDB) {
            const dispositivoInfo = {
                id: dispositivoDB.id,
                nombre: dispositivoDB.name,
                color: dispositivoDB.color,
                userAgent: dispositivoDB.user_agent,
                creado: dispositivoDB.created_at,
                activo: dispositivoDB.is_active
            };
            
            // Obtener la última ubicación del dispositivo
            let ultimaUbicacion = null;
            try {
                const ultimaUbicacionDB = await dbManager.getLastLocation(dispositivoDB.id);
                if (ultimaUbicacionDB) {
                    ultimaUbicacion = {
                        lat: ultimaUbicacionDB.latitude,
                        lon: ultimaUbicacionDB.longitude,
                        accuracy: ultimaUbicacionDB.accuracy,
                        timestamp: ultimaUbicacionDB.timestamp,
                        source: ultimaUbicacionDB.source
                    };
                }
            } catch (locationErr) {
                console.error(`❌ Error cargando última ubicación para ${dispositivoDB.id}:`, locationErr);
            }
            
            // Usar la estructura correcta {info, ultimaUbicacion}
            dispositivos.set(dispositivoDB.id, {
                info: dispositivoInfo,
                ultimaUbicacion: ultimaUbicacion
            });
        }
        
        console.log(`✅ ${dispositivos.size} dispositivos cargados en memoria`);
    } catch (err) {
        console.error('❌ Error cargando dispositivos desde BD:', err);
    }
}).catch((err) => {
    console.error('❌ Error inicializando base de datos:', err);
    process.exit(1);
});

// Crear servidor HTTP
const server = require('http').createServer(app);

// Configurar WebSocket Server
const wss = new WebSocket.Server({ server });

// Lista de clientes WebSocket conectados
const clientes = new Set();

// Manejar conexiones WebSocket
wss.on('connection', (ws) => {
    console.log('ðŸ”— Nuevo cliente WebSocket conectado');
    clientes.add(ws);
    
    // Enviar la Ãºltima ubicaciÃ³n al cliente reciÃ©n conectado
    if (ultimaUbicacion) {
        ws.send(JSON.stringify({
            tipo: 'ubicacion',
            datos: ultimaUbicacion
        }));
    }
    
    // Manejar desconexiÃ³n
    ws.on('close', () => {
        console.log('âŒ Cliente WebSocket desconectado');
        clientes.delete(ws);
    });
    
    // Manejar errores
    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
        clientes.delete(ws);
    });
});

// Función para enviar datos a todos los clientes WebSocket
function enviarATodosLosClientes(datos, tipo = 'ubicacion') {
    const mensaje = JSON.stringify({
        tipo: tipo,
        datos: datos
    });
    
    clientes.forEach((cliente) => {
        if (cliente.readyState === WebSocket.OPEN) {
            cliente.send(mensaje);
        }
    });
}

// Función para obtener o crear un dispositivo
async function obtenerOCrearDispositivo(deviceId, userAgent) {
    if (!dispositivos.has(deviceId)) {
        const nuevoDispositivo = {
            id: deviceId,
            nombre: `Dispositivo ${deviceId}`,
            color: coloresDispositivos[dispositivos.size % coloresDispositivos.length],
            userAgent: userAgent,
            creado: new Date().toISOString(),
            activo: true
        };
        
        // Almacenar con la estructura consistente {info, ultimaUbicacion}
        dispositivos.set(deviceId, {
            info: nuevoDispositivo,
            ultimaUbicacion: null
        });
        
        // Guardar en base de datos
        if (dbManager.isReady()) {
            try {
                await dbManager.upsertDevice(
                    deviceId, 
                    nuevoDispositivo.nombre, 
                    nuevoDispositivo.color, 
                    userAgent
                );
                console.log(`✅ Dispositivo ${deviceId} registrado/actualizado`);
            } catch (err) {
                console.error('❌ Error guardando dispositivo en BD:', err);
            }
        }
        
        // Notificar a todos los clientes sobre el nuevo dispositivo
        enviarATodosLosClientes(Array.from(dispositivos.values()), 'dispositivos');
        
        console.log(`📱 Nuevo dispositivo registrado: ${deviceId}`);
    }
    return dispositivos.get(deviceId).info;
}

// ENDPOINTS DE LA API

// Función para obtener la IP pública de AWS dinámicamente
async function obtenerIPPublicaAWS() {
    try {
        // Intentar obtener IP pública desde metadatos de AWS EC2
        if (process.env.AWS_EXECUTION_ENV || process.env.EC2_INSTANCE_ID) {
            const { execSync } = require('child_process');
            const publicIP = execSync('curl -s http://169.254.169.254/latest/meta-data/public-ipv4', 
                { timeout: 3000, encoding: 'utf8' }).trim();
            if (publicIP && publicIP !== '404 - Not Found' && publicIP.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                console.log(`🌍 IP pública AWS detectada dinámicamente: ${publicIP}`);
                return publicIP;
            }
        }
        
        // Fallback: usar servicio externo para obtener IP pública
        const https = require('https');
        return new Promise((resolve) => {
            const req = https.get('https://checkip.amazonaws.com/', (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    const ip = data.trim();
                    if (ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                        console.log(`🌍 IP pública detectada desde servicio externo: ${ip}`);
                        resolve(ip);
                    } else {
                        console.log('⚠️  No se pudo obtener IP pública, usando IP por defecto');
                        resolve('18.217.206.56'); // IP por defecto como fallback
                    }
                });
            });
            req.on('error', () => {
                console.log('⚠️  Error obteniendo IP pública, usando IP por defecto');
                resolve('18.217.206.56'); // IP por defecto como fallback
            });
            req.setTimeout(3000, () => {
                req.destroy();
                console.log('⚠️  Timeout obteniendo IP pública, usando IP por defecto');
                resolve('18.217.206.56'); // IP por defecto como fallback
            });
        });
    } catch (error) {
        console.log('⚠️  Error obteniendo IP pública:', error.message);
        return '18.217.206.56'; // IP por defecto como fallback
    }
}

// Endpoint específico para datos GPS desde app Android
app.post('/api/gps', async (req, res) => {
    try {
        const { deviceId, deviceName, lat, lon, accuracy, timestamp } = req.body;
        
        console.log(`📱 Datos GPS recibidos de ${deviceName} (${deviceId}):`, { lat, lon, accuracy });
        
        // Validar datos recibidos
        if (typeof lat !== 'number' || typeof lon !== 'number') {
            return res.status(400).json({
                error: 'Latitud y longitud deben ser números',
                received: { lat, lon }
            });
        }
        
        // Validaciones de coherencia de coordenadas GPS
        if (lat < -90 || lat > 90) {
            console.warn(`⚠️ Latitud fuera de rango válido: ${lat}`);
            return res.status(400).json({
                error: 'Latitud debe estar entre -90 y 90 grados'
            });
        }
        
        if (lon < -180 || lon > 180) {
            console.warn(`⚠️ Longitud fuera de rango válido: ${lon}`);
            return res.status(400).json({
                error: 'Longitud debe estar entre -180 y 180 grados'
            });
        }
        
        // Validar que no sean coordenadas nulas (0,0) que indican error GPS
        if (lat === 0 && lon === 0) {
            console.warn(`⚠️ Coordenadas nulas detectadas (0,0) - posible error GPS`);
            return res.status(400).json({
                error: 'Coordenadas nulas detectadas - error GPS'
            });
        }
        
        // Validar precisión
        if (accuracy && (accuracy < 0 || accuracy > 10000)) {
            console.warn(`⚠️ Precisión fuera de rango válido: ${accuracy}m`);
            return res.status(400).json({
                error: 'Precisión debe estar entre 0 y 10000 metros'
            });
        }
        
        // Validaciones geográficas adicionales para filtrar ubicaciones sospechosas
        // Filtrar coordenadas que correspondan a ubicaciones conocidas de prueba o no deseadas
        const ubicacionesSospechosas = [
            { lat: 19.4326, lon: -99.1332, nombre: 'Ciudad de México (ubicación de prueba común)' },
            { lat: 37.7749, lon: -122.4194, nombre: 'San Francisco (ubicación de prueba común)' },
            { lat: 40.7128, lon: -74.0060, nombre: 'Nueva York (ubicación de prueba común)' }
        ];
        
        for (const ubicacionSospechosa of ubicacionesSospechosas) {
            const distanciaLat = Math.abs(lat - ubicacionSospechosa.lat);
            const distanciaLon = Math.abs(lon - ubicacionSospechosa.lon);
            
            // Si está muy cerca de una ubicación sospechosa (dentro de ~1km)
            if (distanciaLat < 0.01 && distanciaLon < 0.01) {
                console.warn(`⚠️ Ubicación sospechosa detectada: ${ubicacionSospechosa.nombre} (${lat}, ${lon})`);
                return res.status(400).json({
                    error: `Ubicación filtrada: ${ubicacionSospechosa.nombre}`,
                    details: 'Esta ubicación ha sido identificada como datos de prueba o no válidos'
                });
            }
        }
        
        // Obtener o crear dispositivo
        const dispositivo = await obtenerOCrearDispositivo(deviceId, deviceName);
        
        // Crear objeto de ubicación
        const nuevaUbicacion = {
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            accuracy: parseFloat(accuracy) || 0,
            timestamp: timestamp || Date.now(),
            recibido: new Date().toISOString(),
            deviceId: deviceId,
            source: 'android_app'
        };
        
        // Guardar en base de datos
        if (dbManager.isReady()) {
            try {
                await dbManager.insertLocation(
                    deviceId,
                    parseFloat(lat),
                    parseFloat(lon),
                    parseFloat(accuracy) || 0,
                    timestamp || Date.now(),
                    'android_app'
                );
                console.log(`💾 Ubicación GPS guardada en BD para ${deviceName}`);
            } catch (dbErr) {
                console.error('❌ Error guardando ubicación GPS en BD:', dbErr);
            }
        }
        
        // Actualizar dispositivo en memoria
        dispositivos.set(deviceId, {
            info: dispositivo,
            ultimaUbicacion: nuevaUbicacion
        });
        
        // Mantener compatibilidad con versión anterior
        ultimaUbicacion = nuevaUbicacion;
        
        // Enviar a todos los clientes WebSocket conectados
        enviarATodosLosClientes({
            tipo: 'ubicacion',
            dispositivo: dispositivo,
            ubicacion: nuevaUbicacion,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Datos GPS recibidos correctamente',
            deviceId: deviceId,
            deviceName: deviceName,
            timestamp: nuevaUbicacion.timestamp
        });
        
    } catch (error) {
        console.error('❌ Error procesando datos GPS:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: error.message
        });
    }
});

// Endpoint para recibir ubicación desde la app Android (compatibilidad)
app.post('/api/ubicacion', async (req, res) => {
    try {
        const { lat, lon, latitude, longitude, accuracy, timestamp, deviceId, source } = req.body;
        
        // Soportar tanto lat/lon como latitude/longitude
        const latitud = lat || latitude;
        const longitud = lon || longitude;
        
        // InformaciÃ³n sobre el origen de la peticiÃ³n
        const clienteInfo = {
            ip: req.ip || req.connection.remoteAddress || req.socket.remoteAddress,
            userAgent: req.get('User-Agent') || 'No especificado',
            origen: req.get('Origin') || 'No especificado',
            referer: req.get('Referer') || 'No especificado'
        };
        
        // Validar datos recibidos
        if (typeof latitud !== 'number' || typeof longitud !== 'number') {
            return res.status(400).json({
                error: 'Latitud y longitud deben ser nÃºmeros',
                received: { lat: latitud, lon: longitud }
            });
        }
        
        // Obtener o crear dispositivo (usar IP como deviceId por defecto si no se proporciona)
        const dispositivoId = deviceId || clienteInfo.ip;
        const dispositivo = await obtenerOCrearDispositivo(dispositivoId, clienteInfo.userAgent);
        
        // Procesar timestamp
        const timestampFinal = timestamp || Date.now();
        
        // Crear objeto de ubicación
        const nuevaUbicacion = {
            lat: parseFloat(latitud),
            lon: parseFloat(longitud),
            accuracy: parseFloat(accuracy) || 0,
            timestamp: timestampFinal,
            recibido: new Date().toISOString(),
            deviceId: dispositivoId,
            source: source || 'android_app'
        };
        
        // Guardar en base de datos
        if (dbManager.isReady()) {
            try {
                await dbManager.insertLocation(
                    dispositivoId,
                    parseFloat(latitud),
                    parseFloat(longitud),
                    parseFloat(accuracy) || 0,
                    timestampFinal,
                    source || 'android_app'
                );
                console.log(`💾 Ubicación guardada en BD para dispositivo ${dispositivoId}`);
            } catch (dbErr) {
                console.error('❌ Error guardando ubicación en BD:', dbErr);
                // Continuar aunque falle la BD
            }
        }
        
        // Actualizar ubicación del dispositivo en memoria
        dispositivo.ultimaUbicacion = nuevaUbicacion;
        dispositivo.ultimaActividad = new Date().toISOString();
        
        // Mantener compatibilidad: guardar como última ubicación general
        ultimaUbicacion = nuevaUbicacion;
        
        // Enviar ubicación específica del dispositivo a todos los clientes
        enviarATodosLosClientes({
            deviceId: dispositivoId,
            ubicacion: nuevaUbicacion,
            dispositivo: {
                id: dispositivo.id,
                nombre: dispositivo.nombre,
                color: dispositivo.color
            }
        }, 'ubicacion_dispositivo');
        
        console.log('ðŸ“ Nueva ubicaciÃ³n recibida:', {
            lat: nuevaUbicacion.lat,
            lon: nuevaUbicacion.lon,
            accuracy: nuevaUbicacion.accuracy,
            clientes: clientes.size,
            cliente: clienteInfo
        });
        
        res.status(200).json({
            mensaje: 'UbicaciÃ³n recibida correctamente',
            ubicacion: nuevaUbicacion
        });
        
    } catch (error) {
        console.error('Error al procesar ubicaciÃ³n:', error);
        res.status(500).json({
            error: 'Error interno del servidor'
        });
    }
});

// Endpoint para obtener la Ãºltima ubicaciÃ³n
app.get('/api/ubicacion/ultima', (req, res) => {
    if (ultimaUbicacion) {
        res.status(200).json(ultimaUbicacion);
    } else {
        res.status(404).json({
            mensaje: 'No hay ubicaciones disponibles'
        });
    }
});

// Endpoint para obtener todos los dispositivos
app.get('/api/dispositivos', async (req, res) => {
    try {
        // Obtener solo dispositivos con ubicaciones recientes desde la base de datos
        const dispositivosActivos = [];
        
        for (const [deviceId, dispositivo] of dispositivos) {
            if (dbManager.isReady()) {
                // Obtener las últimas 10 ubicaciones del dispositivo
                const ultimasUbicaciones = await new Promise((resolve, reject) => {
                    const query = `
                        SELECT * FROM locations 
                        WHERE device_id = ? 
                        ORDER BY timestamp DESC 
                        LIMIT 10
                    `;
                    dbManager.db.all(query, [deviceId], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
                
                // Solo incluir dispositivos que tengan al menos una ubicación reciente
                if (ultimasUbicaciones.length > 0) {
                    const ultimaUbicacion = ultimasUbicaciones[0];
                    const tiempoUltimaUbicacion = new Date(ultimaUbicacion.timestamp).getTime();
                    const ahora = Date.now();
                    const tiempoTranscurrido = ahora - tiempoUltimaUbicacion;
                    
                    // Solo mostrar dispositivos activos en las últimas 2 horas
                    if (tiempoTranscurrido <= 2 * 60 * 60 * 1000) {
                        const info = dispositivo.info || dispositivo;
                        
                        // Extraer información del dispositivo del userAgent
                        let nombreDispositivo = info.nombre;
                        let modeloDispositivo = 'Desconocido';
                        
                        if (info.userAgent) {
                            // Extraer modelo del dispositivo del userAgent
                            const userAgentMatch = info.userAgent.match(/\(([^)]+)\)/);
                            if (userAgentMatch) {
                                const deviceInfo = userAgentMatch[1];
                                const parts = deviceInfo.split(';');
                                if (parts.length >= 2) {
                                    modeloDispositivo = parts[1].trim();
                                }
                            }
                            nombreDispositivo = `${modeloDispositivo} (${info.id.substring(0, 8)})`;
                        }
                        
                        dispositivosActivos.push({
                            id: info.id,
                            nombre: nombreDispositivo,
                            modelo: modeloDispositivo,
                            color: info.color,
                            userAgent: info.userAgent,
                            creado: info.creado,
                            activo: info.activo,
                            ultimaUbicacion: {
                                lat: ultimaUbicacion.latitude,
                                lon: ultimaUbicacion.longitude,
                                accuracy: ultimaUbicacion.accuracy,
                                timestamp: ultimaUbicacion.timestamp,
                                source: ultimaUbicacion.source
                            },
                            tiempoUltimaActividad: ultimaUbicacion.timestamp,
                            totalUbicaciones: ultimasUbicaciones.length
                        });
                    }
                }
            }
        }
        
        console.log(`📱 Dispositivos activos encontrados: ${dispositivosActivos.length} de ${dispositivos.size} total`);
        
        res.json({
            dispositivos: dispositivosActivos,
            total: dispositivosActivos.length,
            totalEnBD: dispositivos.size,
            periodoActividad: '2 horas',
            criterio: 'Últimas 10 ubicaciones por dispositivo'
        });
    } catch (error) {
        console.error('❌ Error obteniendo dispositivos activos:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            message: error.message
        });
    }
});

// Endpoint para obtener un dispositivo específico
app.get('/api/dispositivos/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    const dispositivo = dispositivos.get(deviceId);
    
    if (dispositivo) {
        res.json(dispositivo);
    } else {
        res.status(404).json({
            error: 'Dispositivo no encontrado'
        });
    }
});

// Endpoint para actualizar información de un dispositivo
app.put('/api/dispositivos/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    const { nombre, activo } = req.body;
    const dispositivo = dispositivos.get(deviceId);
    
    if (dispositivo) {
        if (nombre) dispositivo.nombre = nombre;
        if (typeof activo === 'boolean') dispositivo.activo = activo;
        
        // Notificar cambios a todos los clientes
        enviarATodosLosClientes(Array.from(dispositivos.values()), 'dispositivos');
        
        res.json(dispositivo);
    } else {
        res.status(404).json({
            error: 'Dispositivo no encontrado'
        });
    }
});

// Endpoint para obtener ubicaciones de todos los dispositivos activos
app.get('/api/ubicaciones', (req, res) => {
    const ubicaciones = [];
    
    dispositivos.forEach((dispositivo) => {
        if (dispositivo.activo && dispositivo.ultimaUbicacion) {
            ubicaciones.push({
                deviceId: dispositivo.id,
                nombre: dispositivo.nombre,
                color: dispositivo.color,
                ubicacion: dispositivo.ultimaUbicacion
            });
        }
    });
    
    res.json({
        ubicaciones: ubicaciones,
        total: ubicaciones.length
    });
});

// Endpoint para obtener ubicaciones por rango de fechas
app.get('/api/ubicaciones/historial', async (req, res) => {
    try {
        const { deviceId, fechaInicio, fechaFin, limite } = req.query;
        
        if (!dbManager.isReady()) {
            return res.status(503).json({
                error: 'Base de datos no disponible'
            });
        }
        
        // Validar parámetros
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                error: 'Se requieren fechaInicio y fechaFin (formato: YYYY-MM-DD HH:mm:ss)'
            });
        }
        
        // Convertir fechas a timestamps
        const timestampInicio = moment(fechaInicio).valueOf();
        const timestampFin = moment(fechaFin).valueOf();
        
        if (isNaN(timestampInicio) || isNaN(timestampFin)) {
            return res.status(400).json({
                error: 'Formato de fecha inválido. Use: YYYY-MM-DD HH:mm:ss'
            });
        }
        
        const ubicaciones = await dbManager.getLocationsByDateRange(
            deviceId || null,
            timestampInicio,
            timestampFin,
            parseInt(limite) || 1000
        );
        
        res.json({
            ubicaciones,
            total: ubicaciones.length,
            rango: {
                inicio: fechaInicio,
                fin: fechaFin
            },
            deviceId: deviceId || 'todos'
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo historial:', error);
        res.status(500).json({
            error: 'Error interno del servidor'
        });
    }
});

// Endpoint para obtener estadísticas de ubicaciones
app.get('/api/ubicaciones/estadisticas', async (req, res) => {
    try {
        const { deviceId } = req.query;
        
        if (!dbManager.isReady()) {
            return res.status(503).json({
                error: 'Base de datos no disponible'
            });
        }
        
        const stats = await dbManager.getLocationStats(deviceId || null);
        
        res.json({
            estadisticas: stats,
            deviceId: deviceId || 'todos'
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({
            error: 'Error interno del servidor'
        });
    }
});

// Endpoint para obtener historial de ubicaciones
app.get('/api/historial/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    const { fecha } = req.query;
    
    if (!dbManager.isReady()) {
        return res.status(503).json({ error: 'Base de datos no disponible' });
    }
    
    let query = 'SELECT * FROM locations WHERE device_id = ?';
    let params = [deviceId];
    
    if (fecha) {
        // Filtrar por fecha específica
        const fechaInicio = new Date(fecha);
        fechaInicio.setHours(0, 0, 0, 0);
        const fechaFin = new Date(fecha);
        fechaFin.setHours(23, 59, 59, 999);
        
        query += ' AND timestamp BETWEEN ? AND ?';
        params.push(fechaInicio.toISOString(), fechaFin.toISOString());
    }
    
    query += ' ORDER BY timestamp ASC';
    
    dbManager.getDatabase().all(query, params, (err, rows) => {
        if (err) {
            console.error('❌ Error obteniendo historial:', err);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
        
        res.json({
            deviceId,
            fecha: fecha || 'todas',
            ubicaciones: rows,
            total: rows.length
        });
    });
});

// Endpoint para limpiar datos antiguos y duplicados
app.post('/api/limpiar-datos', async (req, res) => {
    try {
        if (!dbManager.isReady()) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const db = dbManager.db;
        let resultados = {
            ubicacionesEliminadas: 0,
            dispositivosLimpiados: 0,
            duplicadosEliminados: 0
        };
        
        // 1. Eliminar TODAS las ubicaciones
        await new Promise((resolve, reject) => {
            const query = 'DELETE FROM locations';
            db.run(query, [], function(err) {
                if (err) reject(err);
                else {
                    resultados.ubicacionesEliminadas = this.changes;
                    resolve();
                }
            });
        });
        
        // 2. Eliminar TODOS los dispositivos de la base de datos
        await new Promise((resolve, reject) => {
            const query = 'DELETE FROM devices';
            db.run(query, [], function(err) {
                if (err) reject(err);
                else {
                    resultados.dispositivosLimpiados = this.changes;
                    resolve();
                }
            });
        });
        
        // 3. Limpiar todos los dispositivos de la memoria
        dispositivos.clear();
        ultimaUbicacion = null;
        
        console.log(`🧹 Limpieza completada:`, resultados);
        
        res.json({
            success: true,
            mensaje: 'Limpieza de datos completada',
            resultados
        });
        
    } catch (error) {
        console.error('❌ Error en limpieza de datos:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            message: error.message
        });
    }
});

// Endpoint para obtener estadÃ­sticas del servidor
app.get('/api/stats', async (req, res) => {
    try {
        let dbStats = null;
        if (dbManager.isReady()) {
            try {
                dbStats = await dbManager.getLocationStats();
            } catch (err) {
                console.error('Error obteniendo stats de BD:', err);
            }
        }
        
        res.json({
            clientesConectados: clientes.size,
            totalDispositivos: dispositivos.size,
            dispositivosActivos: Array.from(dispositivos.values()).filter(d => d.activo).length,
            ultimaUbicacion: ultimaUbicacion ? {
                timestamp: ultimaUbicacion.timestamp,
                recibido: ultimaUbicacion.recibido,
                deviceId: ultimaUbicacion.deviceId
            } : null,
            baseDatos: dbStats,
            servidor: {
                puerto: PORT,
                iniciado: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas del servidor:', error);
        res.status(500).json({
            error: 'Error interno del servidor'
        });
    }
});





// Servir la pÃ¡gina web principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Manejar rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint no encontrado'
    });
});

// Iniciar el servidor
server.listen(PORT, '0.0.0.0', async () => {
    const ipLocal = obtenerIPLocal();
    const ipPublica = await obtenerIPPublicaAWS();
    console.log('🚀 Servidor GPS Tracking iniciado');
    console.log(`📡 Servidor HTTP en puerto ${PORT}`);
    console.log(`🌐 WebSocket Server activo en puerto ${PORT}`);
    console.log(`🔗 Acceso local: http://localhost${PORT === 80 ? '' : ':' + PORT}`);
    console.log(`📱 Acceso desde móvil: http://${ipLocal}${PORT === 80 ? '' : ':' + PORT}`);
    console.log(`🔗 Acceso desde AWS EC2: http://${ipPublica}${PORT === 80 ? '' : ':' + PORT}`);
    
    // Configuración de LocalTunnel (sin tokens, gratuito y más estable)
const startLocalTunnel = async () => {
  try {
    console.log('🔄 Iniciando túnel LocalTunnel...');
    
    // Generar un subdominio basado en el nombre del proyecto para mayor estabilidad
    const subdomain = 'gps-tracking-' + Math.random().toString(36).substring(2, 8);
    
    return new Promise((resolve, reject) => {
      // Ejecutar LocalTunnel usando npx para mejor compatibilidad
      const lt = spawn('npx', ['localtunnel', '--port', PORT.toString(), '--subdomain', subdomain], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
      
      let output = '';
      let tunnelUrl = '';
      
      lt.stdout.on('data', (data) => {
        output += data.toString();
        console.log('LocalTunnel output:', data.toString());
        
        // Buscar la URL en diferentes formatos posibles
        const match = output.match(/your url is: (https:\/\/[^\s\n\r]+)/i) || 
                     output.match(/(https:\/\/[a-z0-9-]+\.loca\.lt)/i);
        
        if (match && !tunnelUrl) {
          tunnelUrl = match[1].trim();
          console.log(`🌐 Túnel LocalTunnel activo: ${tunnelUrl}`);
          console.log(`📱 URL para la app Android: ${tunnelUrl}`);
          
          // Guardar la URL en un archivo para referencia
          require('fs').writeFileSync('./tunnel-url.txt', tunnelUrl);
          
          resolve(tunnelUrl);
        }
      });
      
      lt.stderr.on('data', (data) => {
        console.log('LocalTunnel info:', data.toString());
      });
      
      lt.on('error', (error) => {
        console.error('❌ Error al inicializar LocalTunnel:', error.message);
        reject(error);
      });
      
      // Timeout de 15 segundos para obtener la URL
      setTimeout(() => {
        if (!tunnelUrl) {
          reject(new Error('Timeout esperando URL de LocalTunnel'));
        }
      }, 15000);
    });
    
  } catch (error) {
    console.error('❌ Error al inicializar LocalTunnel:', error.message);
    console.log('⚠️  El servidor continuará sin túnel público');
    
    // Alternativas adicionales
    console.log('\n🔧 Alternativas para acceso público:');
    console.log('1. Ejecutar manualmente: npx localtunnel --port 3000');
    console.log('2. Usar Serveo: ssh -R 80:localhost:3000 serveo.net');
    console.log('3. Configurar port forwarding en tu router');
    
    return null;
  }
};
    
    // Esperar un momento para que el servidor esté completamente listo
    setTimeout(async () => {
        // Inicializar LocalTunnel automáticamente después de que el servidor esté corriendo
        const url = await startLocalTunnel();
        
        if (url) {
            console.log(`🌍 Túnel LocalTunnel público activo: ${url}`);
            console.log(`🌍 Accesible desde cualquier dispositivo y ubicación`);
            console.log(`🔗 Sin necesidad de tokens ni configuración adicional`);
            console.log(`📱 Configura esta URL en tu app Android: ${url}`);
            console.log('='.repeat(60));
            console.log('🌐 ESTADO DEL SERVIDOR:');
            console.log(`   ✅ Servidor GPS: Activo en puerto ${PORT}`);
            console.log(`   ✅ Túnel LocalTunnel: ${url}`);
            console.log(`   ✅ WebSocket: Activo`);
            console.log(`   ✅ Base de datos: Conectada`);
            console.log(`   ✅ Dispositivos cargados: ${Object.keys(dispositivos).length}`);
            
            // Guardar la URL de LocalTunnel para uso posterior
            global.tunnelUrl = url;
        } else {
            console.log('='.repeat(60));
            console.log('📱 CONFIGURACIÓN PARA APP ANDROID:');
            console.log(`   URL del servidor: http://${ipLocal}:${PORT}`);
            console.log('='.repeat(60));
        }
    }, 2000); // Esperar 2 segundos para que el servidor esté completamente listo
    
    console.log('📱 Endpoint para Android: POST /api/ubicacion');
    console.log('🗺️  Endpoint para web: GET /api/ubicacion/ultima');
    console.log(`🌐 IP Local detectada: ${ipLocal}`);
    console.log(`🌍 IP Pública AWS detectada: ${ipPublica}`);
    console.log('');
});

// Manejar cierre graceful del servidor
process.on('SIGTERM', async () => {
    console.log('🛑 Cerrando servidor...');
    
    // Cerrar túnel ngrok si está activo
    try {
        await ngrok.disconnect();
        await ngrok.kill();
        console.log('🌐 Túnel ngrok cerrado');
    } catch (error) {
        console.log('⚠️  Error al cerrar ngrok:', error.message);
    }
    
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
    });
});


// Endpoint para obtener información del servidor (IP y puerto dinámicos)
app.get('/api/server-info', async (req, res) => {
    try {
        const ipLocal = obtenerIPLocal();
        let ipPublica = null;
        
        // Intentar obtener IP pública de AWS dinámicamente
        try {
            ipPublica = await obtenerIPPublicaAWS();
        } catch (error) {
            console.log('⚠️  No se pudo obtener IP pública AWS:', error.message);
        }
        
        const serverInfo = {
            puerto: PORT,
            ipLocal: ipLocal,
            ipPublica: ipPublica,
            timestamp: new Date().toISOString(),
            // Información adicional del servidor
            servidor: {
                tipo: process.env.AWS_EXECUTION_ENV ? 'AWS EC2' : 'Local',
                plataforma: process.platform,
                version: process.version
            }
        };
        
        console.log('📡 Información del servidor solicitada:', serverInfo);
        
        res.json(serverInfo);
        
    } catch (error) {
        console.error('❌ Error obteniendo información del servidor:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            message: error.message
        });
    }
});