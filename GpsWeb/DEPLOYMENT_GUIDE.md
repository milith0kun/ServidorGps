# 🚀 Guía de Despliegue - Servidor GPS Web

## 📋 Descripción
Esta guía te ayudará a desplegar el servidor GPS web tanto en un entorno local como en AWS EC2.

## 🛠️ Requisitos Previos

### Para Desarrollo Local:
- Node.js (versión 14 o superior)
- npm (incluido con Node.js)
- Git

### Para AWS EC2:
- Cuenta de AWS
- Conocimientos básicos de EC2
- Clave SSH para acceso al servidor

## 🏠 Despliegue Local

### 1. Clonar el Repositorio
```bash
git clone https://github.com/milith0kun/GpsServidorWeb.git
cd GpsServidorWeb
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Iniciar el Servidor
```bash
npm start
```

El servidor estará disponible en: `http://localhost:3000`

### 4. Verificar Funcionamiento
- Abre tu navegador y ve a `http://localhost:3000`
- Deberías ver la interfaz del mapa GPS
- El endpoint para la app Android será: `http://localhost:3000/api/location`

## ☁️ Despliegue en AWS EC2

### 1. Crear Instancia EC2

1. **Accede a la Consola de AWS**
   - Ve a EC2 Dashboard
   - Haz clic en "Launch Instance"

2. **Configurar la Instancia**
   - **Nombre**: `gps-web-server`
   - **AMI**: Ubuntu Server 22.04 LTS (Free tier eligible)
   - **Tipo de Instancia**: t2.micro (Free tier eligible)
   - **Par de Claves**: Crea o selecciona una clave existente

3. **Configurar Grupo de Seguridad**
   ```
   Reglas de Entrada:
   - SSH (22) - Tu IP
   - HTTP (80) - 0.0.0.0/0
   - HTTPS (443) - 0.0.0.0/0
   - Custom TCP (3000) - 0.0.0.0/0
   ```

4. **Lanzar la Instancia**

### 2. Conectar a la Instancia

```bash
ssh -i "tu-clave.pem" ubuntu@tu-ip-publica-ec2
```

### 3. Configurar el Servidor

#### Actualizar el Sistema
```bash
sudo apt update
sudo apt upgrade -y
```

#### Instalar Node.js y npm
```bash
# Instalar Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalación
node --version
npm --version
```

#### Instalar Git
```bash
sudo apt install git -y
```

### 4. Desplegar la Aplicación

#### Clonar el Repositorio
```bash
cd /home/ubuntu
git clone https://github.com/milith0kun/GpsServidorWeb.git
cd GpsServidorWeb

# Cambiar a la rama principal
git checkout master

# Verificar contenido del proyecto
ls -la
```

#### Instalar Dependencias
```bash
npm install
```

#### Probar la Aplicación
```bash
# Ejecutar en modo de prueba
npm start
```

**Nota**: Para salir del proceso, presiona `Ctrl + C`

### 5. Configurar PM2 (Gestor de Procesos)

#### Instalar PM2
```bash
sudo npm install -g pm2
```

#### Iniciar la Aplicación con PM2
```bash
# Iniciar la aplicación
pm2 start server.js --name "gps-web-server"

# Configurar PM2 para iniciar automáticamente
pm2 startup
pm2 save
```

#### Comandos Útiles de PM2
```bash
# Ver estado de las aplicaciones
pm2 status

# Ver logs
pm2 logs gps-web-server

# Reiniciar aplicación
pm2 restart gps-web-server

# Detener aplicación
pm2 stop gps-web-server

# Eliminar aplicación
pm2 delete gps-web-server
```

### 6. Configurar Nginx (Opcional - Recomendado)

#### Instalar Nginx
```bash
sudo apt install nginx -y
```

#### Configurar Nginx
```bash
sudo nano /etc/nginx/sites-available/gps-web-server
```

Agregar la siguiente configuración:
```nginx
server {
    listen 80;
    server_name tu-dominio.com;  # O tu IP pública

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Habilitar la Configuración
```bash
sudo ln -s /etc/nginx/sites-available/gps-web-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. Configurar Firewall (UFW)

```bash
# Habilitar UFW
sudo ufw enable

# Permitir conexiones necesarias
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw allow 3000

# Verificar estado
sudo ufw status
```

## 🔧 Configuración de la App Android

Para que la app Android se conecte al servidor:

### Desarrollo Local:
```
URL del servidor: http://tu-ip-local:3000/api/location
```

### Producción (AWS):
```
URL del servidor: http://tu-ip-publica-ec2/api/location
# O si usas dominio: http://tu-dominio.com/api/location
```

## 📊 Monitoreo y Mantenimiento

### Verificar Estado del Servidor
```bash
# Estado de PM2
pm2 status

# Logs de la aplicación
pm2 logs gps-web-server

# Estado de Nginx
sudo systemctl status nginx

# Uso de recursos del sistema
htop
```

### Actualizar la Aplicación
```bash
cd /home/ubuntu/GpsServidorWeb

# Hacer pull de los últimos cambios
echo "📥 Descargando últimos cambios..."
git pull origin master

# Instalar/actualizar dependencias
echo "📦 Instalando dependencias..."
npm install

# Reiniciar la aplicación
echo "🔄 Reiniciando servidor..."
pm2 restart gps-web-server

echo "✅ Actualización completada!"
```

## 🛡️ Seguridad

### Recomendaciones de Seguridad:

1. **Actualizar regularmente el sistema**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Configurar certificado SSL** (para producción)
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d tu-dominio.com
   ```

3. **Configurar backup automático**
   ```bash
   # Crear script de backup
   sudo nano /home/ubuntu/backup.sh
   ```

4. **Monitorear logs regularmente**
   ```bash
   pm2 logs gps-web-server
   sudo tail -f /var/log/nginx/access.log
   ```

## 🚨 Solución de Problemas

### Problemas Comunes:

1. **Puerto 3000 ocupado**
   ```bash
   sudo lsof -i :3000
   sudo kill -9 PID
   ```

2. **Nginx no inicia**
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

3. **PM2 no encuentra la aplicación**
   ```bash
   pm2 delete all
   pm2 start server.js --name "gps-web-server"
   ```

4. **Problemas de permisos**
   ```bash
   sudo chown -R ubuntu:ubuntu /home/ubuntu/GpsServidorWeb
   ```

## 📞 Soporte

Si encuentras problemas durante el despliegue:

1. Revisa los logs de la aplicación: `pm2 logs gps-web-server`
2. Verifica el estado de los servicios: `pm2 status`
3. Consulta los logs del sistema: `sudo journalctl -f`

---

**¡Felicidades! 🎉 Tu servidor GPS web está ahora desplegado y funcionando.**