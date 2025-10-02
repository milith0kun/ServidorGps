const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const dbManager = require('./database');
const moment = require('moment');
const os = require('os');
const ngrok = require('ngrok');

// Cargar configuración de entorno
require('dotenv').config();

/**
 * Función mejorada para detectar IP del servidor
 * Optimizada para entornos AWS y servidores en la nube
 */
function obtenerIPServidor() {
    const interfaces = os.networkInterfaces();
    let ipPublica = null;
    let ipPrivada = null;
    let ipLocal = null;
    
    // Intentar obtener IP pública desde metadatos de AWS EC2
    if (process.env.AWS_EXECUTION_ENV || process.env.EC2_INSTANCE_ID) {
        try {
            const { execSync } = require('child_process');
            // Obtener IP pública de AWS metadata
            const publicIP = execSync('curl -s http://169.254.169.254/latest/meta-data/public-ipv4', 
                { timeout: 3000, encoding: 'utf8' }).trim();
            if (publicIP && publicIP !== '404 - Not Found') {
                console.log(`🌍 IP pública AWS detectada: ${publicIP}`);
                return publicIP;
            }
        } catch (error) {
            console.log('⚠️  No se pudo obtener IP pública de AWS metadata');
        }
    }
    
    // Detectar IP desde interfaces de red
    for (const interfaceName in interfaces) {
        const interfaceInfo = interfaces[interfaceName];
        for (const info of interfaceInfo) {
            if (info.family === 'IPv4' && !info.internal) {
                // IP pública (no privada)
                if (!info.address.startsWith('192.168.') && 
                    !info.address.startsWith('10.') && 
                    !(info.address.startsWith('172.') && 
                      parseInt(info.address.split('.')[1]) >= 16 && 
                      parseInt(info.address.split('.')[1]) <= 31)) {
                    ipPublica = info.address;
                }
                // IP privada de red local (192.168.x.x)
                else if (info.address.startsWith('192.168.')) {
                    ipPrivada = info.address;
                }
                // Otras IPs privadas
                else {
                    if (!ipLocal) ipLocal = info.address;
                }
            }
        }
    }
    
    // Prioridad: IP pública > IP privada > IP local > localhost
    const ipDetectada = ipPublica || ipPrivada || ipLocal || 'localhost';
    console.log(`🌐 IP detectada: ${ipDetectada} (${ipPublica ? 'pública' : 'privada'})`);
    return ipDetectada;
}

/**
 * Configuración automática de ngrok con reintentos
 */
async function configurarNgrokAutomatico(puerto) {
    const maxReintentos = 3;
    let intento = 1;
    
    while (intento <= maxReintentos) {
        try {
            console.log(`🌐 Iniciando túnel ngrok público (intento ${intento}/${maxReintentos})...`);
            
            // Configuración de ngrok para acceso público sin restricciones
            const opciones = {
                addr: puerto,
                region: process.env.NGROK_REGION || 'us', // Región configurable
                bind_tls: true, // Forzar HTTPS
                inspect: false, // Desactivar interfaz web de ngrok para servidores
                // Configuraciones para acceso público
                host_header: 'rewrite', // Reescribir headers del host
                schemes: ['https'], // Solo HTTPS para mayor seguridad
                // Permitir acceso desde cualquier origen
                basic_auth: undefined, // Sin autenticación básica
                oauth: undefined, // Sin OAuth
                circuit_breaker: undefined, // Sin circuit breaker
                compression: true, // Habilitar compresión
                // Headers personalizados para evitar restricciones
                request_header: {
                    add: [
                        'X-Forwarded-Proto: https',
                        'X-Real-IP: $remote_addr'
                    ]
                },
                response_header: {
                    add: [
                        'Access-Control-Allow-Origin: *',
                        'Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With',
                        'X-Frame-Options: SAMEORIGIN',
                        'X-Content-Type-Options: nosniff'
                    ]
                }
            };
            
            // Si hay un subdominio personalizado configurado
            if (process.env.NGROK_SUBDOMAIN) {
                opciones.subdomain = process.env.NGROK_SUBDOMAIN;
                console.log(`🎯 Usando subdominio personalizado: ${process.env.NGROK_SUBDOMAIN}`);
            }
            
            const url = await ngrok.connect(opciones);
            console.log(`✅ Túnel ngrok público activo: ${url}`);
            console.log(`🌍 Accesible desde cualquier dispositivo y ubicación`);
            console.log(`📱 URL para aplicaciones móviles: ${url}`);
            console.log(`🔗 URL para navegadores web: ${url}`);
            
            // Guardar URL para uso global
            global.ngrokUrl = url;
            
            return url;
            
        } catch (error) {
            console.error(`❌ Error en intento ${intento}:`, error.message);
            
            if (intento === maxReintentos) {
                console.log('⚠️  No se pudo establecer túnel ngrok, continuando sin él...');
                console.log('💡 Verifica tu token de ngrok y conectividad a internet');
                return null;
            }
            
            // Esperar antes del siguiente intento
            await new Promise(resolve => setTimeout(resolve, 2000 * intento));
            intento++;
        }
    }
    
    return null;
}

// Configuración del servidor
const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_IP = process.env.SERVER_IP || obtenerIPServidor();
const NGROK_ENABLED = process.env.NGROK_ENABLED !== 'false';

// Middleware
app.use(cors({
    origin: '*', // Permitir todos los orígenes para desarrollo
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Estructura para almacenar múltiples dispositivos y sus ubicaciones
let dispositivos = new Map();
let ultimaUbicacion = null;

// Colores para dispositivos
const coloresDispositivos = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

// Inicializar base de datos
console.log('🗄️ Inicializando base de datos...');
dbManager.initialize().then(async () => {
    console.log('✅ Base de datos inicializada correctamente');
    
    // Cargar dispositivos existentes
    try {
        const dispositivos_db = await dbManager.getAllDevices();
        console.log(`📱 ${dispositivos_db.length} dispositivos cargados desde la base de datos`);
        
        dispositivos_db.forEach((dispositivo, index) => {
            dispositivos.set(dispositivo.id, {
                info: {
                    deviceId: dispositivo.id,
                    deviceName: dispositivo.name,
                    userAgent: dispositivo.user_agent || 'Desconocido',
                    color: coloresDispositivos[index % coloresDispositivos.length],
                    primeraConexion: dispositivo.created_at,
                    ultimaConexion: dispositivo.updated_at,
                    totalUbicaciones: dispositivo.total_locations || 0
                },
                ultimaUbicacion: null
            });
        });
        
        // Cargar última ubicación de cada dispositivo
        for (const [deviceId, dispositivo] of dispositivos) {
            try {
                const ultimaUbicacionDB = await dbManager.getLastLocation(deviceId);
                if (ultimaUbicacionDB) {
                    dispositivo.ultimaUbicacion = ultimaUbicacionDB;
                    if (!ultimaUbicacion || new Date(ultimaUbicacionDB.timestamp) > new Date(ultimaUbicacion.timestamp)) {
                        ultimaUbicacion = ultimaUbicacionDB;
                    }
                }
            } catch (error) {
                console.error(`❌ Error cargando ubicación para ${deviceId}:`, error);
            }
        }
        
        console.log(`📍 Ubicaciones cargadas para ${dispositivos.size} dispositivos`);
        
    } catch (error) {
        console.error('❌ Error cargando datos iniciales:', error);
    }
    
}).catch((err) => {
    console.error('❌ Error inicializando base de datos:', err);
    process.exit(1);
});

// Configurar WebSocket
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: false // Desactivar compresión para mejor rendimiento
});

const clientes = new Set();

wss.on('connection', (ws, req) => {
    console.log(`🔌 Nueva conexión WebSocket desde ${req.socket.remoteAddress}`);
    clientes.add(ws);
    
    // Enviar datos iniciales al cliente
    if (ultimaUbicacion) {
        ws.send(JSON.stringify({
            tipo: 'ubicacion',
            datos: ultimaUbicacion
        }));
    }
    
    ws.on('close', () => {
        console.log('🔌 Conexión WebSocket cerrada');
        clientes.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('❌ Error en WebSocket:', error);
        clientes.delete(ws);
    });
});

// Función para enviar datos a todos los clientes WebSocket
function enviarATodosLosClientes(datos, tipo = 'ubicacion') {
    const mensaje = JSON.stringify({ tipo, datos });
    clientes.forEach(cliente => {
        if (cliente.readyState === WebSocket.OPEN) {
            try {
                cliente.send(mensaje);
            } catch (error) {
                console.error('❌ Error enviando mensaje WebSocket:', error);
                clientes.delete(cliente);
            }
        }
    });
}

// Función para obtener o crear dispositivo
async function obtenerOCrearDispositivo(deviceId, userAgent) {
    if (!dispositivos.has(deviceId)) {
        try {
            let dispositivo_db = await dbManager.obtenerDispositivo(deviceId);
            
            if (!dispositivo_db) {
                const deviceName = `Dispositivo ${deviceId.substring(0, 8)}`;
                dispositivo_db = await dbManager.crearDispositivo(deviceId, deviceName, userAgent);
                console.log(`📱 Nuevo dispositivo creado: ${deviceName} (${deviceId})`);
            }
            
            const colorIndex = dispositivos.size % coloresDispositivos.length;
            dispositivos.set(deviceId, {
                info: {
                    deviceId: dispositivo_db.device_id,
                    deviceName: dispositivo_db.device_name,
                    userAgent: dispositivo_db.user_agent || userAgent,
                    color: coloresDispositivos[colorIndex],
                    primeraConexion: dispositivo_db.created_at,
                    ultimaConexion: dispositivo_db.updated_at,
                    totalUbicaciones: dispositivo_db.total_locations || 0
                },
                ultimaUbicacion: null
            });
            
        } catch (error) {
            console.error('❌ Error obteniendo/creando dispositivo:', error);
            throw error;
        }
    }
    
    return dispositivos.get(deviceId);
}

// Endpoint principal para recibir ubicaciones
app.post('/api/ubicacion', async (req, res) => {
    try {
        const { deviceId, deviceName, lat, lon, accuracy, timestamp } = req.body;
        
        if (!deviceId || lat === undefined || lon === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos requeridos: deviceId, lat, lon'
            });
        }
        
        const userAgent = req.get('User-Agent') || 'Desconocido';
        
        // Obtener o crear dispositivo
        const dispositivo = await obtenerOCrearDispositivo(deviceId, userAgent);
        
        // Crear objeto de ubicación
        const ubicacion = {
            deviceId,
            deviceName: deviceName || dispositivo.info.deviceName,
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            accuracy: parseFloat(accuracy) || 0,
            timestamp: timestamp || new Date().toISOString(),
            color: dispositivo.info.color
        };
        
        // Guardar en base de datos
        await dbManager.guardarUbicacion(ubicacion);
        
        // Actualizar dispositivo en memoria
        dispositivo.ultimaUbicacion = ubicacion;
        dispositivo.info.ultimaConexion = new Date().toISOString();
        dispositivo.info.totalUbicaciones++;
        
        // Actualizar última ubicación global
        ultimaUbicacion = ubicacion;
        
        // Enviar a clientes WebSocket
        enviarATodosLosClientes(ubicacion, 'ubicacion');
        
        console.log(`📍 Ubicación recibida de ${deviceName || deviceId}: ${lat}, ${lon} (±${accuracy}m)`);
        
        res.json({
            success: true,
            message: 'Ubicación guardada correctamente',
            data: {
                deviceId,
                timestamp: ubicacion.timestamp,
                coordinates: [lat, lon]
            }
        });
        
    } catch (error) {
        console.error('❌ Error procesando ubicación:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// Endpoint para obtener última ubicación
app.get('/api/ubicacion/ultima', (req, res) => {
    res.json({
        success: true,
        data: ultimaUbicacion
    });
});

// Endpoint para obtener todos los dispositivos
app.get('/api/dispositivos', async (req, res) => {
    try {
        const dispositivosArray = Array.from(dispositivos.values()).map(dispositivo => ({
            ...dispositivo.info,
            ultimaUbicacion: dispositivo.ultimaUbicacion
        }));
        
        res.json({
            success: true,
            data: dispositivosArray,
            total: dispositivosArray.length
        });
    } catch (error) {
        console.error('❌ Error obteniendo dispositivos:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// Endpoint para obtener historial de ubicaciones
app.get('/api/ubicaciones/historial', async (req, res) => {
    try {
        const { deviceId, limit = 100, offset = 0 } = req.query;
        const ubicaciones = await dbManager.obtenerHistorialUbicaciones(deviceId, parseInt(limit), parseInt(offset));
        
        res.json({
            success: true,
            data: ubicaciones,
            total: ubicaciones.length
        });
    } catch (error) {
        console.error('❌ Error obteniendo historial:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// Servir archivos estáticos
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado'
    });
});

// Iniciar servidor
server.listen(PORT, '0.0.0.0', async () => {
    console.log('🚀 Servidor GPS Tracking iniciado');
    console.log(`📡 Servidor HTTP en puerto ${PORT}`);
    console.log(`🌐 WebSocket Server activo en puerto ${PORT}`);
    console.log(`🔗 Acceso local: http://localhost:${PORT}`);
    console.log(`📱 Acceso desde red: http://${SERVER_IP}:${PORT}`);
    
    // Configurar ngrok automáticamente si está habilitado
    if (NGROK_ENABLED) {
        const ngrokUrl = await configurarNgrokAutomatico(PORT);
        if (ngrokUrl) {
            console.log('='.repeat(60));
            console.log('📱 CONFIGURACIÓN PARA APP ANDROID:');
            console.log(`   URL del servidor (ngrok): ${ngrokUrl}`);
            console.log(`   URL del servidor (local): http://${SERVER_IP}:${PORT}`);
            console.log('='.repeat(60));
        }
    }
    
    console.log('📱 Endpoint para Android: POST /api/ubicacion');
    console.log('🗺️  Endpoint para web: GET /api/ubicacion/ultima');
    console.log(`🌐 IP del servidor: ${SERVER_IP}`);
    console.log('');
});

// Manejo graceful del cierre del servidor
process.on('SIGTERM', async () => {
    console.log('🛑 Cerrando servidor...');
    
    // Cerrar túnel ngrok si está activo
    if (global.ngrokUrl) {
        try {
            await ngrok.disconnect();
            await ngrok.kill();
            console.log('🌐 Túnel ngrok cerrado');
        } catch (error) {
            console.log('⚠️  Error al cerrar ngrok:', error.message);
        }
    }
    
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Recibida señal de interrupción...');
    process.emit('SIGTERM');
});