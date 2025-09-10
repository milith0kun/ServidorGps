@echo off
REM Script para conectarse directamente a la instancia EC2 desde Windows y navegar al directorio de la aplicación
REM Autor: Usuario

echo Conectando a la instancia EC2 y navegando al directorio de la aplicación...

REM Cambiar al directorio donde se encuentra el script
cd /d "%~dp0"

REM Ejecutar el script bash usando Git Bash
start "" "C:\Program Files\Git\bin\bash.exe" -c "./conectar-aws.sh"

REM Si no se encuentra Git Bash en la ruta predeterminada, intentar con otra ubicación común
if %ERRORLEVEL% NEQ 0 (
    echo Intentando ruta alternativa de Git Bash...
    start "" "C:\Program Files (x86)\Git\bin\bash.exe" -c "./conectar-aws.sh"
)

REM Si aún falla, mostrar mensaje de error
if %ERRORLEVEL% NEQ 0 (
    echo Error: No se pudo encontrar Git Bash.
    echo Asegúrese de que Git esté instalado correctamente.
    pause
    exit /b 1
)