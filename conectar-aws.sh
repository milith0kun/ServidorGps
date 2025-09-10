#!/bin/bash

# Script para conectarse directamente a la instancia EC2 y navegar al directorio de la aplicación
# Autor: Usuario
# Fecha: $(date)

# Verificar que el archivo de clave exista
if [ ! -f "edmil-key.pem" ]; then
    echo "Error: No se encuentra el archivo de clave edmil-key.pem"
    exit 1
fi

# Asegurar que los permisos de la clave sean correctos
chmod 400 edmil-key.pem

# Intentar conexión a la instancia EC2 y navegar al directorio de la aplicación
echo "Conectando a la instancia EC2..."
ssh -i "edmil-key.pem" ubuntu@3.19.27.29 "cd /var/www/html && bash"

# Si la conexión falla, mostrar mensaje de error
if [ $? -ne 0 ]; then
    echo "Error: No se pudo establecer conexión con la instancia EC2"
    echo "Verifique:"
    echo "  - Que la instancia esté en ejecución"
    echo "  - Que la dirección IP sea correcta"
    echo "  - Que el grupo de seguridad permita conexiones SSH"
    echo "  - Que el usuario sea correcto (ec2-user, ubuntu, etc.)"
    exit 1
fi