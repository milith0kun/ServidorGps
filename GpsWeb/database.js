const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const moment = require('moment');

/**
 * Módulo de base de datos SQLite para almacenar ubicaciones GPS
 * Compatible con Ubuntu y sistemas multiplataforma
 */
class DatabaseManager {
    constructor() {
        // Ruta de la base de datos - compatible con Ubuntu
        this.dbPath = path.join(__dirname, 'gps_tracking.db');
        this.db = null;
        this.isInitialized = false;
    }

    /**
     * Inicializa la conexión a la base de datos y crea las tablas necesarias
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Error conectando a la base de datos:', err.message);
                    reject(err);
                    return;
                }
                console.log('✅ Conectado a la base de datos SQLite');
                this.createTables()
                    .then(() => {
                        this.isInitialized = true;
                        resolve();
                    })
                    .catch(reject);
            });
        });
    }

    /**
     * Crea las tablas necesarias para el sistema GPS
     */
    async createTables() {
        return new Promise((resolve, reject) => {
            // Tabla para dispositivos
            const createDevicesTable = `
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL,
                    user_agent TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1
                )
            `;

            // Tabla para ubicaciones GPS con datos de sensores
            const createLocationsTable = `
                CREATE TABLE IF NOT EXISTS locations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    accuracy REAL,
                    timestamp BIGINT NOT NULL,
                    formatted_time TEXT NOT NULL,
                    source TEXT DEFAULT 'unknown',
                    accel_x REAL,
                    accel_y REAL,
                    accel_z REAL,
                    steps INTEGER,
                    speed REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (device_id) REFERENCES devices (id)
                )
            `;

            // Índices para optimizar consultas
            const createIndexes = [
                'CREATE INDEX IF NOT EXISTS idx_locations_device_id ON locations(device_id)',
                'CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp)',
                'CREATE INDEX IF NOT EXISTS idx_locations_created_at ON locations(created_at)',
                'CREATE INDEX IF NOT EXISTS idx_locations_device_timestamp ON locations(device_id, timestamp)'
            ];

            // Ejecutar creación de tablas
            this.db.serialize(() => {
                this.db.run(createDevicesTable, (err) => {
                    if (err) {
                        console.error('❌ Error creando tabla devices:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('✅ Tabla devices creada/verificada');
                });

                this.db.run(createLocationsTable, (err) => {
                    if (err) {
                        console.error('❌ Error creando tabla locations:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('✅ Tabla locations creada/verificada');
                });

                // Crear índices
                createIndexes.forEach((indexQuery, i) => {
                    this.db.run(indexQuery, (err) => {
                        if (err) {
                            console.error(`❌ Error creando índice ${i + 1}:`, err.message);
                        } else {
                            console.log(`✅ Índice ${i + 1} creado/verificado`);
                        }
                    });
                });

                // Migrar tabla existente para agregar columnas de sensores si no existen
                this.migrateLocationColumns();

                resolve();
            });
        });
    }

    /**
     * Migra la tabla locations para agregar columnas de sensores
     */
    async migrateLocationColumns() {
        const columnsToAdd = [
            { name: 'accel_x', type: 'REAL' },
            { name: 'accel_y', type: 'REAL' },
            { name: 'accel_z', type: 'REAL' },
            { name: 'steps', type: 'INTEGER' },
            { name: 'speed', type: 'REAL' }
        ];

        // Verificar qué columnas existen
        this.db.all("PRAGMA table_info(locations)", (err, columns) => {
            if (err) {
                console.error('❌ Error verificando estructura de tabla:', err);
                return;
            }

            const existingColumns = columns.map(col => col.name);
            
            columnsToAdd.forEach(col => {
                if (!existingColumns.includes(col.name)) {
                    const alterQuery = `ALTER TABLE locations ADD COLUMN ${col.name} ${col.type}`;
                    this.db.run(alterQuery, (err) => {
                        if (err) {
                            console.error(`❌ Error agregando columna ${col.name}:`, err.message);
                        } else {
                            console.log(`✅ Columna ${col.name} agregada a locations`);
                        }
                    });
                }
            });
        });
    }

    /**
     * Registra o actualiza un dispositivo
     */
    async upsertDevice(deviceId, name, color, userAgent) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO devices (id, name, color, user_agent, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            this.db.run(query, [deviceId, name, color, userAgent], function(err) {
                if (err) {
                    console.error('❌ Error insertando/actualizando dispositivo:', err.message);
                    reject(err);
                    return;
                }
                console.log(`✅ Dispositivo ${deviceId} registrado/actualizado`);
                resolve({ deviceId, changes: this.changes });
            });
        });
    }

    /**
     * Inserta una nueva ubicación GPS con datos de sensores
     */
    async insertLocation(deviceId, latitude, longitude, accuracy, timestamp, source = 'unknown', sensorData = {}) {
        return new Promise((resolve, reject) => {
            // Formatear timestamp para visualización
            const formattedTime = moment(timestamp).format('YYYY-MM-DD HH:mm:ss');
            
            const query = `
                INSERT INTO locations (device_id, latitude, longitude, accuracy, timestamp, formatted_time, source, accel_x, accel_y, accel_z, steps, speed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(query, [
                deviceId, 
                latitude, 
                longitude, 
                accuracy, 
                timestamp, 
                formattedTime, 
                source,
                sensorData.accelX || null,
                sensorData.accelY || null,
                sensorData.accelZ || null,
                sensorData.steps || null,
                sensorData.speed || null
            ], function(err) {
                if (err) {
                    console.error('❌ Error insertando ubicación:', err.message);
                    reject(err);
                    return;
                }
                console.log(`📍 Ubicación guardada para dispositivo ${deviceId} (ID: ${this.lastID})`);
                resolve({ 
                    locationId: this.lastID, 
                    deviceId, 
                    latitude, 
                    longitude, 
                    accuracy, 
                    timestamp,
                    formattedTime,
                    source
                });
            });
        });
    }

    /**
     * Obtiene todas las ubicaciones de un dispositivo en un rango de fechas
     */
    async getLocationsByDateRange(deviceId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM locations 
                WHERE device_id = ? 
                AND datetime(formatted_time) BETWEEN datetime(?) AND datetime(?)
                ORDER BY timestamp ASC
            `;
            
            this.db.all(query, [deviceId, startDate, endDate], (err, rows) => {
                if (err) {
                    console.error('❌ Error obteniendo ubicaciones por rango de fechas:', err.message);
                    reject(err);
                    return;
                }
                console.log(`📊 Obtenidas ${rows.length} ubicaciones para ${deviceId} entre ${startDate} y ${endDate}`);
                resolve(rows);
            });
        });
    }

    /**
     * Obtiene las últimas N ubicaciones de un dispositivo
     */
    async getRecentLocations(deviceId, limit = 100) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM locations 
                WHERE device_id = ? 
                ORDER BY timestamp DESC 
                LIMIT ?
            `;
            
            this.db.all(query, [deviceId, limit], (err, rows) => {
                if (err) {
                    console.error('❌ Error obteniendo ubicaciones recientes:', err.message);
                    reject(err);
                    return;
                }
                resolve(rows.reverse()); // Devolver en orden cronológico
            });
        });
    }

    /**
     * Obtiene la última ubicación de un dispositivo específico
     */
    async getLastLocation(deviceId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM locations 
                WHERE device_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 1
            `;
            
            this.db.get(query, [deviceId], (err, row) => {
                if (err) {
                    console.error('❌ Error obteniendo última ubicación:', err.message);
                    reject(err);
                    return;
                }
                resolve(row || null);
            });
        });
    }

    /**
     * Obtiene todos los dispositivos registrados
     */
    async getAllDevices() {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM devices ORDER BY created_at DESC';
            
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    console.error('❌ Error obteniendo dispositivos:', err.message);
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }

    /**
     * Obtiene estadísticas de ubicaciones por dispositivo
     */
    async getLocationStats(deviceId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_locations,
                    MIN(timestamp) as first_location,
                    MAX(timestamp) as last_location,
                    AVG(accuracy) as avg_accuracy
                FROM locations 
                WHERE device_id = ?
            `;
            
            this.db.get(query, [deviceId], (err, row) => {
                if (err) {
                    console.error('❌ Error obteniendo estadísticas:', err.message);
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    }

    /**
     * Limpia ubicaciones antiguas (más de X días)
     */
    async cleanOldLocations(daysToKeep = 30) {
        return new Promise((resolve, reject) => {
            const cutoffDate = moment().subtract(daysToKeep, 'days').format('YYYY-MM-DD HH:mm:ss');
            const query = 'DELETE FROM locations WHERE formatted_time < ?';
            
            this.db.run(query, [cutoffDate], function(err) {
                if (err) {
                    console.error('❌ Error limpiando ubicaciones antiguas:', err.message);
                    reject(err);
                    return;
                }
                console.log(`🧹 Eliminadas ${this.changes} ubicaciones anteriores a ${cutoffDate}`);
                resolve({ deletedCount: this.changes, cutoffDate });
            });
        });
    }

    /**
     * Cierra la conexión a la base de datos
     */
    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Error cerrando la base de datos:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('✅ Conexión a la base de datos cerrada');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Verifica si la base de datos está inicializada
     */
    isReady() {
        return this.isInitialized && this.db !== null;
    }
}

// Exportar una instancia singleton
const dbManager = new DatabaseManager();
module.exports = dbManager;