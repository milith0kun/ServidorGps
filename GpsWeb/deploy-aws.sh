#!/bin/bash

# Script de despliegue automático para AWS Ubuntu
# Configura el servidor GPS Tracking con detección automática de IP y túnel ngrok

set -e  # Salir si hay algún error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración
PROJECT_NAME="gps-tracking"
SERVICE_NAME="gps-tracking"
WEB_DIR="/var/www/html"
PROJECT_DIR="$WEB_DIR/$PROJECT_NAME"
NODE_VERSION="18"

echo -e "${BLUE}🚀 Iniciando despliegue de GPS Tracking Server${NC}"
echo "=================================================="

# Función para imprimir mensajes
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar si se ejecuta como root
if [[ $EUID -eq 0 ]]; then
    print_warning "Ejecutándose como root. Se recomienda usar sudo cuando sea necesario."
fi

# 1. Actualizar sistema
echo -e "${BLUE}📦 Actualizando sistema...${NC}"
sudo apt update && sudo apt upgrade -y
print_status "Sistema actualizado"

# 2. Instalar Node.js si no está instalado
if ! command -v node &> /dev/null; then
    echo -e "${BLUE}📦 Instalando Node.js ${NODE_VERSION}...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_status "Node.js instalado: $(node --version)"
else
    print_status "Node.js ya está instalado: $(node --version)"
fi

# 3. Instalar nginx si no está instalado
if ! command -v nginx &> /dev/null; then
    echo -e "${BLUE}📦 Instalando nginx...${NC}"
    sudo apt install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    print_status "Nginx instalado y configurado"
else
    print_status "Nginx ya está instalado"
fi

# 4. Instalar ngrok
if ! command -v ngrok &> /dev/null; then
    echo -e "${BLUE}📦 Instalando ngrok...${NC}"
    curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
    sudo apt update && sudo apt install -y ngrok
    print_status "ngrok instalado"
else
    print_status "ngrok ya está instalado"
fi

# 5. Crear directorio del proyecto
echo -e "${BLUE}📁 Configurando directorio del proyecto...${NC}"
sudo mkdir -p "$PROJECT_DIR"
sudo chown -R $USER:www-data "$PROJECT_DIR"
sudo chmod -R 755 "$PROJECT_DIR"
print_status "Directorio del proyecto creado: $PROJECT_DIR"

# 6. Copiar archivos del proyecto (si se ejecuta desde el directorio del proyecto)
if [[ -f "package.json" && -f "server.js" ]]; then
    echo -e "${BLUE}📋 Copiando archivos del proyecto...${NC}"
    cp -r . "$PROJECT_DIR/"
    print_status "Archivos copiados al directorio de despliegue"
else
    print_warning "No se encontraron archivos del proyecto en el directorio actual"
    echo "Asegúrate de ejecutar este script desde el directorio del proyecto o copiar manualmente los archivos a $PROJECT_DIR"
fi

# 7. Cambiar al directorio del proyecto
cd "$PROJECT_DIR"

# 8. Instalar dependencias
if [[ -f "package.json" ]]; then
    echo -e "${BLUE}📦 Instalando dependencias de Node.js...${NC}"
    npm install --production
    
    # Instalar dotenv si no está en las dependencias
    if ! npm list dotenv &> /dev/null; then
        npm install dotenv
    fi
    
    print_status "Dependencias instaladas"
else
    print_error "No se encontró package.json"
    exit 1
fi

# 9. Detectar IP del servidor
echo -e "${BLUE}🌐 Detectando configuración del servidor...${NC}"
PUBLIC_IP=""
PRIVATE_IP=""

# Intentar obtener IP pública de AWS
if curl -s --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 &> /dev/null; then
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
    print_status "IP pública AWS detectada: $PUBLIC_IP"
fi

# Obtener IP privada
PRIVATE_IP=$(hostname -I | awk '{print $1}')
print_status "IP privada detectada: $PRIVATE_IP"

# Usar IP pública si está disponible, sino privada
SERVER_IP=${PUBLIC_IP:-$PRIVATE_IP}
print_status "IP del servidor configurada: $SERVER_IP"

# 10. Crear archivo de configuración .env
echo -e "${BLUE}⚙️  Creando configuración de entorno...${NC}"
cat > .env << EOF
NODE_ENV=production
PORT=3000
SERVER_IP=$SERVER_IP
NGROK_ENABLED=true
DATABASE_PATH=./gps_tracking.db
EOF

print_status "Archivo .env creado"

# 11. Configurar ngrok authtoken si está disponible
if [[ -n "$NGROK_AUTHTOKEN" ]]; then
    echo -e "${BLUE}🔑 Configurando token de ngrok...${NC}"
    ngrok authtoken "$NGROK_AUTHTOKEN"
    print_status "Token de ngrok configurado"
else
    print_warning "Variable NGROK_AUTHTOKEN no encontrada"
    echo "Para configurar ngrok, ejecuta: export NGROK_AUTHTOKEN=tu_token_aqui"
fi

# 12. Crear archivo de servicio systemd
echo -e "${BLUE}🔧 Creando servicio systemd...${NC}"
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=GPS Tracking Server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=SERVER_IP=$SERVER_IP
ExecStart=/usr/bin/node server-aws.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF

print_status "Archivo de servicio systemd creado"

# 13. Configurar nginx como proxy reverso
echo -e "${BLUE}🌐 Configurando nginx...${NC}"
sudo tee /etc/nginx/sites-available/$PROJECT_NAME > /dev/null << EOF
server {
    listen 80;
    server_name $SERVER_IP localhost;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Configuración específica para WebSocket
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Habilitar el sitio
sudo ln -sf /etc/nginx/sites-available/$PROJECT_NAME /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
print_status "Nginx configurado como proxy reverso"

# 14. Configurar permisos
echo -e "${BLUE}🔒 Configurando permisos...${NC}"
sudo chown -R www-data:www-data "$PROJECT_DIR"
sudo chmod -R 755 "$PROJECT_DIR"
print_status "Permisos configurados"

# 15. Habilitar e iniciar el servicio
echo -e "${BLUE}🚀 Iniciando servicio...${NC}"
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

# Esperar un momento para que el servicio inicie
sleep 3

# Verificar estado del servicio
if sudo systemctl is-active --quiet $SERVICE_NAME; then
    print_status "Servicio $SERVICE_NAME iniciado correctamente"
else
    print_error "Error al iniciar el servicio $SERVICE_NAME"
    echo "Verificar logs con: sudo journalctl -u $SERVICE_NAME -f"
fi

# 16. Configurar firewall (si ufw está instalado)
if command -v ufw &> /dev/null; then
    echo -e "${BLUE}🔥 Configurando firewall...${NC}"
    sudo ufw allow 22/tcp    # SSH
    sudo ufw allow 80/tcp    # HTTP
    sudo ufw allow 443/tcp   # HTTPS
    sudo ufw allow 3000/tcp  # Node.js app
    print_status "Reglas de firewall configuradas"
fi

# 17. Mostrar resumen
echo ""
echo "=================================================="
echo -e "${GREEN}🎉 DESPLIEGUE COMPLETADO EXITOSAMENTE${NC}"
echo "=================================================="
echo ""
echo -e "${BLUE}📋 INFORMACIÓN DEL SERVIDOR:${NC}"
echo "   🌐 IP del servidor: $SERVER_IP"
echo "   🔌 Puerto: 3000"
echo "   📁 Directorio: $PROJECT_DIR"
echo "   🔧 Servicio: $SERVICE_NAME"
echo ""
echo -e "${BLUE}🌍 URLs DE ACCESO:${NC}"
echo "   🏠 Local: http://localhost"
echo "   📱 Red: http://$SERVER_IP"
if [[ -n "$PUBLIC_IP" ]]; then
    echo "   🌍 Público: http://$PUBLIC_IP"
fi
echo ""
echo -e "${BLUE}🛠️  COMANDOS ÚTILES:${NC}"
echo "   Ver estado: sudo systemctl status $SERVICE_NAME"
echo "   Ver logs: sudo journalctl -u $SERVICE_NAME -f"
echo "   Reiniciar: sudo systemctl restart $SERVICE_NAME"
echo "   Detener: sudo systemctl stop $SERVICE_NAME"
echo ""
echo -e "${BLUE}📱 CONFIGURACIÓN PARA APP ANDROID:${NC}"
echo "   Endpoint: http://$SERVER_IP/api/ubicacion"
if [[ -n "$PUBLIC_IP" ]]; then
    echo "   Endpoint público: http://$PUBLIC_IP/api/ubicacion"
fi
echo ""
echo -e "${YELLOW}⚠️  NOTAS IMPORTANTES:${NC}"
echo "   • El túnel ngrok se configurará automáticamente al iniciar"
echo "   • Para configurar ngrok: export NGROK_AUTHTOKEN=tu_token"
echo "   • Los logs se guardan en: /var/log/syslog"
echo "   • La base de datos se crea automáticamente en: $PROJECT_DIR/gps_tracking.db"
echo ""
print_status "¡Despliegue completado! El servidor está listo para recibir ubicaciones GPS."