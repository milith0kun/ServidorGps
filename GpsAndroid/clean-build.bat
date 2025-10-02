@echo off
echo ========================================
echo Script de limpieza para proyecto Android
echo ========================================
echo.

echo 1. Deteniendo todos los daemons de Gradle...
call gradlew.bat --stop

echo.
echo 2. Terminando procesos Java que puedan estar bloqueando archivos...
taskkill /F /IM java.exe 2>nul
taskkill /F /IM javaw.exe 2>nul

echo.
echo 3. Esperando 2 segundos para asegurar liberación de archivos...
timeout /t 2 /nobreak >nul

echo.
echo 4. Intentando eliminar directorio build...
if exist app\build (
    rmdir /s /q app\build 2>nul
    if exist app\build (
        echo    - No se pudo eliminar completamente, intentando con archivos individuales...
        del /f /s /q app\build\*.* 2>nul
        rmdir /s /q app\build 2>nul
    ) else (
        echo    - Directorio build eliminado exitosamente
    )
) else (
    echo    - El directorio build no existe
)

echo.
echo 5. Limpiando caché de Gradle...
if exist %USERPROFILE%\.gradle\caches (
    echo    - Limpiando caché global de Gradle...
    rmdir /s /q %USERPROFILE%\.gradle\caches\build-cache-* 2>nul
)

echo.
echo 6. Ejecutando limpieza de Gradle...
call gradlew.bat clean

echo.
echo ========================================
echo Limpieza completada!
echo ========================================
echo.
echo Sugerencias adicionales:
echo - Asegúrate de que tu antivirus excluya la carpeta del proyecto
echo - Considera reiniciar el IDE si persisten los problemas
echo - Ejecuta 'gradlew.bat assembleDebug' para recompilar
echo.
pause