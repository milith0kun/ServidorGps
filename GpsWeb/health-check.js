#!/usr/bin/env node

/**
 * Script de verificación de salud del servidor GPS
 * Verifica el estado del servidor, base de datos, ngrok y conectividad
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Configuración
const CONFIG = {
    serverPort: process.env.PORT || 3000,
    ngrokApiPort: 4040,
    dbPath: process.env.DB_PATH || './database.db',
    timeout: 5000,
    retries: 3
};

// Colores para output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

class HealthChecker {
    constructor() {
        this.results = {
            server: false,
            database: false,
            ngrok: false,
            connectivity: false,
            overall: false
        };
        this.details = {};
    }

    log(message, color = colors.reset) {
        console.log(`${color}${message}${colors.reset}`);
    }

    async checkServer() {
        this.log('🔍 Verificando servidor local...', colors.blue);
        
        return new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: CONFIG.serverPort,
                path: '/health',
                method: 'GET',
                timeout: CONFIG.timeout
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        this.results.server = true;
                        this.details.server = `Servidor respondiendo en puerto ${CONFIG.serverPort}`;
                        this.log(`✅ Servidor OK (${res.statusCode})`, colors.green);
                    } else {
                        this.details.server = `Servidor respondió con código ${res.statusCode}`;
                        this.log(`❌ Servidor ERROR (${res.statusCode})`, colors.red);
                    }
                    resolve();
                });
            });

            req.on('error', (err) => {
                this.details.server = `Error de conexión: ${err.message}`;
                this.log(`❌ Servidor ERROR: ${err.message}`, colors.red);
                resolve();
            });

            req.on('timeout', () => {
                this.details.server = 'Timeout de conexión';
                this.log('❌ Servidor ERROR: Timeout', colors.red);
                req.destroy();
                resolve();
            });

            req.end();
        });
    }

    async checkDatabase() {
        this.log('🔍 Verificando base de datos...', colors.blue);
        
        try {
            const dbExists = fs.existsSync(CONFIG.dbPath);
            if (dbExists) {
                const stats = fs.statSync(CONFIG.dbPath);
                this.results.database = true;
                this.details.database = `Base de datos encontrada (${(stats.size / 1024).toFixed(2)} KB)`;
                this.log('✅ Base de datos OK', colors.green);
            } else {
                this.details.database = 'Archivo de base de datos no encontrado';
                this.log('❌ Base de datos ERROR: Archivo no encontrado', colors.red);
            }
        } catch (error) {
            this.details.database = `Error accediendo a la base de datos: ${error.message}`;
            this.log(`❌ Base de datos ERROR: ${error.message}`, colors.red);
        }
    }

    async checkNgrok() {
        this.log('🔍 Verificando túnel ngrok...', colors.blue);
        
        return new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: CONFIG.ngrokApiPort,
                path: '/api/tunnels',
                method: 'GET',
                timeout: CONFIG.timeout
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const tunnels = JSON.parse(data);
                        if (tunnels.tunnels && tunnels.tunnels.length > 0) {
                            const httpsTunnel = tunnels.tunnels.find(t => t.proto === 'https');
                            if (httpsTunnel) {
                                this.results.ngrok = true;
                                this.details.ngrok = `Túnel activo: ${httpsTunnel.public_url}`;
                                this.log(`✅ Ngrok OK: ${httpsTunnel.public_url}`, colors.green);
                            } else {
                                this.details.ngrok = 'No se encontró túnel HTTPS';
                                this.log('⚠️  Ngrok: Solo túnel HTTP disponible', colors.yellow);
                            }
                        } else {
                            this.details.ngrok = 'No hay túneles activos';
                            this.log('❌ Ngrok ERROR: No hay túneles', colors.red);
                        }
                    } catch (error) {
                        this.details.ngrok = `Error parseando respuesta de ngrok: ${error.message}`;
                        this.log(`❌ Ngrok ERROR: ${error.message}`, colors.red);
                    }
                    resolve();
                });
            });

            req.on('error', (err) => {
                this.details.ngrok = `Ngrok no está ejecutándose: ${err.message}`;
                this.log('❌ Ngrok ERROR: No está ejecutándose', colors.red);
                resolve();
            });

            req.on('timeout', () => {
                this.details.ngrok = 'Timeout conectando a ngrok API';
                this.log('❌ Ngrok ERROR: Timeout', colors.red);
                req.destroy();
                resolve();
            });

            req.end();
        });
    }

    async checkConnectivity() {
        this.log('🔍 Verificando conectividad externa...', colors.blue);
        
        return new Promise((resolve) => {
            const req = https.request({
                hostname: 'www.google.com',
                port: 443,
                path: '/',
                method: 'HEAD',
                timeout: CONFIG.timeout
            }, (res) => {
                this.results.connectivity = true;
                this.details.connectivity = `Conectividad externa OK (${res.statusCode})`;
                this.log('✅ Conectividad OK', colors.green);
                resolve();
            });

            req.on('error', (err) => {
                this.details.connectivity = `Sin conectividad externa: ${err.message}`;
                this.log(`❌ Conectividad ERROR: ${err.message}`, colors.red);
                resolve();
            });

            req.on('timeout', () => {
                this.details.connectivity = 'Timeout de conectividad externa';
                this.log('❌ Conectividad ERROR: Timeout', colors.red);
                req.destroy();
                resolve();
            });

            req.end();
        });
    }

    async checkSystemResources() {
        this.log('🔍 Verificando recursos del sistema...', colors.blue);
        
        return new Promise((resolve) => {
            exec('df -h . && free -h && ps aux | grep node', (error, stdout, stderr) => {
                if (error) {
                    this.details.system = `Error obteniendo información del sistema: ${error.message}`;
                    this.log('⚠️  Sistema: Error obteniendo información', colors.yellow);
                } else {
                    const lines = stdout.split('\n');
                    const diskInfo = lines[1] ? lines[1].split(/\s+/) : [];
                    const diskUsage = diskInfo[4] ? diskInfo[4] : 'N/A';
                    
                    this.details.system = `Uso de disco: ${diskUsage}`;
                    this.log(`ℹ️  Sistema: Uso de disco ${diskUsage}`, colors.blue);
                }
                resolve();
            });
        });
    }

    generateReport() {
        const totalChecks = Object.keys(this.results).length - 1; // -1 para excluir 'overall'
        const passedChecks = Object.values(this.results).filter(r => r === true).length;
        
        this.results.overall = passedChecks >= totalChecks * 0.75; // 75% de éxito mínimo

        this.log('\n' + '='.repeat(60), colors.bold);
        this.log('📊 REPORTE DE SALUD DEL SERVIDOR GPS', colors.bold);
        this.log('='.repeat(60), colors.bold);

        // Estado general
        const overallStatus = this.results.overall ? '✅ SALUDABLE' : '❌ PROBLEMAS DETECTADOS';
        const overallColor = this.results.overall ? colors.green : colors.red;
        this.log(`\n🎯 Estado General: ${overallStatus}`, overallColor + colors.bold);
        this.log(`📈 Puntuación: ${passedChecks}/${totalChecks} verificaciones exitosas\n`);

        // Detalles por componente
        this.log('📋 Detalles por Componente:', colors.bold);
        this.log('-'.repeat(40));

        Object.entries(this.results).forEach(([component, status]) => {
            if (component === 'overall') return;
            
            const icon = status ? '✅' : '❌';
            const color = status ? colors.green : colors.red;
            const detail = this.details[component] || 'Sin detalles';
            
            this.log(`${icon} ${component.toUpperCase()}: ${detail}`, color);
        });

        // Recomendaciones
        this.log('\n💡 Recomendaciones:', colors.bold);
        this.log('-'.repeat(20));

        if (!this.results.server) {
            this.log('• Verificar que el servidor esté ejecutándose: sudo systemctl status gps-tracking', colors.yellow);
        }
        if (!this.results.database) {
            this.log('• Verificar permisos de la base de datos: ls -la database.db', colors.yellow);
        }
        if (!this.results.ngrok) {
            this.log('• Verificar configuración de ngrok: ngrok config check', colors.yellow);
        }
        if (!this.results.connectivity) {
            this.log('• Verificar conectividad de red y firewall', colors.yellow);
        }

        this.log('\n' + '='.repeat(60), colors.bold);
        
        return this.results.overall;
    }

    async run() {
        this.log('🚀 Iniciando verificación de salud del servidor GPS...', colors.bold);
        this.log('⏰ ' + new Date().toLocaleString() + '\n');

        await this.checkServer();
        await this.checkDatabase();
        await this.checkNgrok();
        await this.checkConnectivity();
        await this.checkSystemResources();

        const isHealthy = this.generateReport();
        
        // Código de salida para scripts de monitoreo
        process.exit(isHealthy ? 0 : 1);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    const checker = new HealthChecker();
    checker.run().catch(error => {
        console.error('❌ Error ejecutando verificación de salud:', error);
        process.exit(1);
    });
}

module.exports = HealthChecker;