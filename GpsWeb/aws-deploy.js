#!/usr/bin/env node

/**
 * Script de configuración automática para despliegue en AWS Ubuntu
 * Detecta IP, puerto y configura túnel ngrok automáticamente
 * 
 * Uso:
 * - En desarrollo local: node aws-deploy.js --mode=local
 * - En servidor AWS: node aws-deploy.js --mode=aws
 * - Solo configurar ngrok: node aws-deploy.js --mode=ngrok
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Configuración por defecto
const CONFIG = {
    DEFAULT_PORT: 3000,
    AWS_HTML_PATH: '/var/www/html',
    NGROK_CONFIG_PATH: '~/.ngrok2/ngrok.yml',
    LOG_FILE: 'deploy.log'
};

/**
 * Función mejorada para detectar IP del servidor
 * Prioriza IPs públicas para AWS, luego privadas para desarrollo local
 */
function detectarIPServidor() {
    const interfaces = os.networkInterfaces();
    let ipPublica = null;
    let ipPrivada = null;
    let ipLocal = null;
    
    console.log('🔍 Detectando interfaces de red...');
    
    for (const interfaceName in interfaces) {
        const interfaceInfo = interfaces[interfaceName];
        console.log(`   Interface: ${interfaceName}`);
        
        for (const info of interfaceInfo) {
            if (info.family === 'IPv4' && !info.internal) {
                console.log(`     IP: ${info.address}`);
                
                // IP pública (AWS EC2, DigitalOcean, etc.)
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
                // Otras IPs privadas (10.x.x.x, 172.16-31.x.x)
                else {
                    if (!ipLocal) ipLocal = info.address;
                }
            }
        }
    }
    
    // Prioridad: IP pública > IP privada > IP local > localhost
    const ipDetectada = ipPublica || ipPrivada || ipLocal || 'localhost';
    const tipoIP = ipPublica ? 'pública' : (ipPrivada ? 'privada' : 'local');
    
    console.log(`✅ IP detectada: ${ipDetectada} (${tipoIP})`);
    return {
        ip: ipDetectada,
        tipo: tipoIP,
        esPublica: !!ipPublica,
        esPrivada: !!ipPrivada
    };
}

/**
 * Detecta el puerto disponible o usa el configurado
 */
function detectarPuerto() {
    const puertoEnv = process.env.PORT;
    const puertoArg = process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1];
    const puerto = puertoArg || puertoEnv || CONFIG.DEFAULT_PORT;
    
    console.log(`🔌 Puerto configurado: ${puerto}`);
    return parseInt(puerto);
}

/**
 * Verifica si ngrok está instalado y configurado
 */
function verificarNgrok() {
    try {
        execSync('which ngrok', { stdio: 'ignore' });
        console.log('✅ ngrok encontrado en el sistema');
        return true;
    } catch (error) {
        console.log('❌ ngrok no encontrado');
        return false;
    }
}

/**
 * Instala ngrok en Ubuntu si no está presente
 */
function instalarNgrok() {
    console.log('📦 Instalando ngrok...');
    try {
        // Descargar e instalar ngrok
        execSync(`
            curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null &&
            echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list &&
            sudo apt update && sudo apt install ngrok
        `, { stdio: 'inherit' });
        
        console.log('✅ ngrok instalado correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error instalando ngrok:', error.message);
        return false;
    }
}

/**
 * Configura el authtoken de ngrok
 */
function configurarNgrokAuth() {
    const authToken = process.env.NGROK_AUTHTOKEN;
    if (!authToken) {
        console.log('⚠️  Variable NGROK_AUTHTOKEN no encontrada');
        console.log('   Configúrala con: export NGROK_AUTHTOKEN=tu_token_aqui');
        return false;
    }
    
    try {
        execSync(`ngrok authtoken ${authToken}`, { stdio: 'inherit' });
        console.log('✅ Token de ngrok configurado');
        return true;
    } catch (error) {
        console.error('❌ Error configurando token de ngrok:', error.message);
        return false;
    }
}

/**
 * Genera configuración de entorno para el servidor
 */
function generarConfiguracionEntorno(ipInfo, puerto) {
    const config = {
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: puerto,
        SERVER_IP: ipInfo.ip,
        SERVER_TYPE: ipInfo.esPublica ? 'aws' : 'local',
        NGROK_ENABLED: 'true',
        DATABASE_PATH: './gps_tracking.db'
    };
    
    // Crear archivo .env
    const envContent = Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    fs.writeFileSync('.env', envContent);
    console.log('✅ Archivo .env generado');
    
    return config;
}

/**
 * Crea script de inicio para systemd (Ubuntu)
 */
function crearScriptSystemd(config) {
    const serviceName = 'gps-tracking';
    const serviceContent = `[Unit]
Description=GPS Tracking Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${process.cwd()}
Environment=NODE_ENV=production
Environment=PORT=${config.PORT}
Environment=SERVER_IP=${config.SERVER_IP}
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
`;

    const servicePath = `/etc/systemd/system/${serviceName}.service`;
    
    try {
        fs.writeFileSync(`${serviceName}.service`, serviceContent);
        console.log(`✅ Archivo de servicio creado: ${serviceName}.service`);
        console.log(`   Para instalarlo: sudo cp ${serviceName}.service ${servicePath}`);
        console.log(`   Para habilitarlo: sudo systemctl enable ${serviceName}`);
        console.log(`   Para iniciarlo: sudo systemctl start ${serviceName}`);
    } catch (error) {
        console.error('❌ Error creando archivo de servicio:', error.message);
    }
}

/**
 * Función principal de despliegue
 */
async function main() {
    const modo = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'auto';
    
    console.log('🚀 Iniciando configuración de despliegue GPS Tracking');
    console.log(`📋 Modo: ${modo}`);
    console.log('='.repeat(60));
    
    // 1. Detectar configuración del servidor
    const ipInfo = detectarIPServidor();
    const puerto = detectarPuerto();
    
    // 2. Generar configuración de entorno
    const config = generarConfiguracionEntorno(ipInfo, puerto);
    
    // 3. Configurar ngrok si es necesario
    if (modo === 'ngrok' || modo === 'auto' || modo === 'aws') {
        if (!verificarNgrok()) {
            if (modo === 'aws') {
                if (!instalarNgrok()) {
                    console.log('❌ No se pudo instalar ngrok, continuando sin túnel...');
                }
            } else {
                console.log('⚠️  ngrok no encontrado. Instálalo manualmente.');
            }
        }
        
        if (verificarNgrok()) {
            configurarNgrokAuth();
        }
    }
    
    // 4. Crear script de systemd para AWS
    if (modo === 'aws' || modo === 'auto') {
        crearScriptSystemd(config);
    }
    
    // 5. Mostrar resumen de configuración
    console.log('='.repeat(60));
    console.log('📋 RESUMEN DE CONFIGURACIÓN:');
    console.log(`   🌐 IP del servidor: ${ipInfo.ip} (${ipInfo.tipo})`);
    console.log(`   🔌 Puerto: ${puerto}`);
    console.log(`   📁 Directorio actual: ${process.cwd()}`);
    console.log(`   🔧 Modo de despliegue: ${modo}`);
    
    if (ipInfo.esPublica) {
        console.log(`   🌍 URL pública: http://${ipInfo.ip}:${puerto}`);
    }
    console.log(`   🏠 URL local: http://localhost:${puerto}`);
    
    console.log('='.repeat(60));
    console.log('🎯 PRÓXIMOS PASOS:');
    
    if (modo === 'aws') {
        console.log('   1. Copiar archivos a /var/www/html/');
        console.log('   2. Instalar dependencias: npm install');
        console.log('   3. Configurar servicio: sudo cp gps-tracking.service /etc/systemd/system/');
        console.log('   4. Habilitar servicio: sudo systemctl enable gps-tracking');
        console.log('   5. Iniciar servicio: sudo systemctl start gps-tracking');
    } else {
        console.log('   1. Instalar dependencias: npm install');
        console.log('   2. Iniciar servidor: npm start');
    }
    
    console.log('✅ Configuración completada');
}

// Ejecutar script principal
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    detectarIPServidor,
    detectarPuerto,
    verificarNgrok,
    generarConfiguracionEntorno
};