# 🗺️ Sistema de Rastreo GPS en Tiempo Real

Sistema completo de rastreo GPS con aplicación móvil Android y servidor web en tiempo real. Desarrollado por **Edmil Jampier Saire Bustamante**.

---

## 📋 Tabla de Contenidos

- [Descripción General](#-descripción-general)
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Funcionalidades Principales](#-funcionalidades-principales)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Configuración y Despliegue](#-configuración-y-despliegue)
- [Uso del Sistema](#-uso-del-sistema)
- [Conexión a AWS](#-conexión-a-aws)
- [Solución de Problemas](#-solución-de-problemas)

---

## 🎯 Descripción General

Este sistema permite el **rastreo GPS en tiempo real** de dispositivos Android con visualización web interactiva. Diseñado para funcionar tanto en entornos locales como en la nube (AWS), utiliza WebSockets para actualización instantánea de ubicaciones.

### Características Destacadas

✅ **Rastreo GPS en Tiempo Real** - Actualización automática cada 10 segundos  
✅ **Visualización Web Interactiva** - Mapa Leaflet con OpenStreetMap  
✅ **Búsqueda de Lugares** - Geocodificación con Nominatim API  
✅ **Cálculo de Rutas** - Navegación y direcciones con OSRM  
✅ **Obtención de Coordenadas** - Click en mapa o botón en app  
✅ **Servicio en Segundo Plano** - Continúa rastreando aunque cierres la app  
✅ **Acceso Público** - Túnel ngrok para acceso desde cualquier lugar  
✅ **Base de Datos SQLite** - Almacenamiento persistente de ubicaciones  

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  App Android        │         │  Servidor Node.js│         │  Cliente Web    │
│  (Kotlin)           │◄───────►│  + WebSocket     │◄───────►│  (JavaScript)   │
│                     │  HTTP   │  + Express       │  WS     │  + Leaflet      │
│  - GPS Service      │  POST   │  + SQLite        │         │  + Nominatim    │
│  - FusedLocation    │         │                  │         │  + OSRM         │
│  - OkHttp           │         │  Puerto: 3000    │         │                 │
└─────────────────────┘         └──────────────────┘         └─────────────────┘
         │                               │                            │
         │                               │                            │
         └───────────────────┬───────────┴────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │   Ngrok Tunnel   │
                    │  Acceso Público  │
                    │  *.ngrok-free.dev│
                    └──────────────────┘
```

### Flujo de Datos

1. **App Android** captura ubicación GPS cada 10 segundos
2. **Envío HTTP POST** a servidor (local o ngrok)
3. **Servidor** almacena en SQLite y emite evento WebSocket
4. **Cliente Web** recibe actualización en tiempo real
5. **Mapa** se actualiza automáticamente con nueva posición

---

## ⚡ Funcionalidades Principales

### 1️⃣ Búsqueda de Lugares y Direcciones

**Android:**
- Campo de búsqueda en la parte superior
- Búsqueda por nombre, dirección o tipo de lugar
- Lista de resultados con nombre y dirección completa
- Selección para ver en mapa o calcular ruta

**Web:**
- Campo "Buscar lugar o dirección"
- Resultados en tiempo real al escribir
- Filtro por país (Perú por defecto)
- Click en resultado para centrar mapa

**Tecnología:** API Nominatim de OpenStreetMap (geocodificación gratuita)

### 2️⃣ Obtención de Coordenadas

**Android:**
- Botón "Mis Coordenadas" muestra ubicación actual
- Copia coordenadas al portapapeles con un click
- Formato: `Latitud, Longitud`
- Precisión en metros mostrada

**Web:**
- Click en cualquier punto del mapa
- Popup con coordenadas exactas
- Botón de copiar coordenadas
- Formato legible: `-13.5058, -72.0098`

### 3️⃣ Cálculo de Rutas y Navegación

**Android:**
- Busca un destino
- Botón "Calcular Ruta" desde ubicación actual
- Muestra distancia, tiempo estimado e instrucciones paso a paso
- Lista detallada de maniobras

**Web:**
- Selecciona destino desde búsqueda
- Calcula ruta desde dispositivo más reciente
- Línea animada en mapa mostrando ruta
- Panel con información: distancia, duración, pasos
- Botón para abrir en Google Maps

**Tecnología:** OSRM (Open Source Routing Machine) para cálculo de rutas

---

## 🛠️ Tecnologías Utilizadas

### Backend (Servidor Node.js)

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Node.js** | v18+ | Runtime JavaScript del servidor |
| **Express** | ^4.18.2 | Framework web para API REST |
| **WebSocket (ws)** | ^8.18.0 | Comunicación en tiempo real |
| **SQLite** | ^5.1.7 | Base de datos embebida |
| **ngrok** | ^5.0.0-beta.2 | Túnel público para desarrollo |
| **dotenv** | ^16.6.1 | Variables de entorno |
| **cors** | ^2.8.5 | Cross-Origin Resource Sharing |
| **moment** | ^2.30.1 | Manejo de fechas/horas |

### Frontend Web

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Leaflet** | 1.9.4 | Biblioteca de mapas interactivos |
| **OpenStreetMap** | - | Tiles de mapa gratuitos |
| **Nominatim API** | - | Geocodificación (buscar lugares) |
| **OSRM API** | - | Cálculo de rutas y navegación |
| **WebSocket API** | - | Cliente para actualizaciones en tiempo real |
| **HTML5/CSS3/JS** | - | Interfaz responsive |

### Aplicación Android

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Kotlin** | 2.1.0 | Lenguaje de programación |
| **Jetpack Compose** | 1.8.0 | UI moderna y declarativa |
| **Google Play Services** | 21.3.0 | FusedLocationProviderClient para GPS |
| **OkHttp** | 4.12.0 | Cliente HTTP |
| **Kotlinx Serialization** | 1.7.3 | Serialización JSON |
| **Material Design 3** | 1.4.0 | Componentes UI |
| **Gradle** | 8.13 | Sistema de construcción |

---

## 📂 Estructura del Proyecto

```
ProtectoGps/
│
├── 📁 GpsWeb/                          # Servidor Backend + Frontend Web
│   ├── server.js                       # Servidor Node.js principal
│   ├── database.js                     # Gestión de SQLite
│   ├── index.html                      # Interfaz web
│   ├── script.js                       # Lógica del cliente web
│   ├── styles.css                      # Estilos de la interfaz
│   ├── package.json                    # Dependencias Node.js
│   ├── .env                            # Configuración (NO subir a Git)
│   ├── gps_tracking.db                 # Base de datos SQLite
│   ├── tunnel-url.txt                  # URL del túnel ngrok
│   ├── aws-deploy.js                   # Script de despliegue AWS
│   ├── deploy-aws.sh                   # Script bash para AWS
│   ├── health-check.js                 # Verificación de salud del servidor
│   └── README.md                       # Documentación específica
│
├── 📁 GpsAndroid/                      # Aplicación Móvil Android
│   ├── app/
│   │   ├── src/main/java/com/example/gpsandroid/
│   │   │   ├── MainActivity.kt         # Actividad principal
│   │   │   └── GpsService.kt           # Servicio GPS en segundo plano
│   │   ├── build.gradle.kts            # Configuración del módulo
│   │   └── src/main/AndroidManifest.xml
│   ├── build.gradle.kts                # Configuración del proyecto
│   ├── settings.gradle.kts             # Configuración Gradle
│   ├── gradle/
│   │   └── libs.versions.toml          # Versiones de dependencias
│   ├── gradlew                         # Gradle wrapper (Linux/Mac)
│   ├── gradlew.bat                     # Gradle wrapper (Windows)
│   └── clean-build.bat                 # Script de limpieza
│
├── 📁 jdk-24.0.2/                      # Java Development Kit local
│
├── edmil-key.pem                       # Clave privada SSH para AWS
├── conectar-aws.sh                     # Script conexión SSH Linux/Mac
├── conectar-aws.bat                    # Script conexión SSH Windows
└── README.md                           # Este archivo
```

---

## 🚀 Configuración y Despliegue

### Prerrequisitos

- **Node.js** v18 o superior
- **Android Studio** (para desarrollo Android)
- **Dispositivo Android** con GPS y permisos de ubicación
- **Cuenta ngrok** (gratuita) para túnel público
- **Instancia AWS EC2** (opcional, para producción)

### 1. Configuración del Servidor

#### Paso 1: Instalar Dependencias

```bash
cd GpsWeb
npm install
```

#### Paso 2: Configurar Variables de Entorno

Edita el archivo `.env`:

```properties
# Puerto del servidor
PORT=3000

# Token de ngrok (obtener en https://dashboard.ngrok.com)
NGROK_AUTHTOKEN=tu_token_aqui
NGROK_REGION=us
NGROK_ENABLED=true

# Configuración del servidor
NODE_ENV=development
SERVER_NAME=gps-tracking-server

# Base de datos
DB_PATH=./gps_tracking.db
```

#### Paso 3: Iniciar Servidor

**Modo Desarrollo (local):**
```bash
npm start
```

**Modo Producción (AWS):**
```bash
nohup node server.js > nohup.out 2>&1 &
```

El servidor se iniciará en `http://localhost:3000` y generará automáticamente un túnel ngrok público.

### 2. Configuración de la App Android

#### Paso 1: Abrir Proyecto en Android Studio

1. Abre Android Studio
2. `File` → `Open` → Selecciona carpeta `GpsAndroid`
3. Espera a que Gradle sincronice

#### Paso 2: Actualizar URL del Servidor

Edita estos archivos y reemplaza la URL de ngrok con la tuya:

**MainActivity.kt (línea 97):**
```kotlin
private val serverUrl = "https://TU-TUNEL.ngrok-free.dev/api/ubicacion"
```

**GpsService.kt (línea 47):**
```kotlin
private val serverUrl = "https://TU-TUNEL.ngrok-free.dev/api/ubicacion"
```

> 💡 **Tip:** La URL de ngrok se muestra en la consola al iniciar el servidor o se guarda en `tunnel-url.txt`

#### Paso 3: Compilar e Instalar

**Conecta tu dispositivo Android vía USB** y ejecuta:

```bash
cd GpsAndroid
.\gradlew.bat assembleDebug installDebug    # Windows
./gradlew assembleDebug installDebug        # Linux/Mac
```

O desde Android Studio: `Run` → `Run 'app'`

### 3. Permisos de la App Android

La aplicación requiere estos permisos (se solicitan automáticamente):

- ✅ `ACCESS_FINE_LOCATION` - GPS preciso
- ✅ `ACCESS_COARSE_LOCATION` - Ubicación aproximada
- ✅ `INTERNET` - Enviar datos al servidor
- ✅ `POST_NOTIFICATIONS` - Notificaciones del servicio
- ✅ `FOREGROUND_SERVICE` - Servicio en segundo plano
- ✅ `FOREGROUND_SERVICE_LOCATION` - GPS en segundo plano

---

## 📱 Uso del Sistema

### Interfaz Android

#### Pantalla Principal

```
┌─────────────────────────────────────────┐
│  🔍 [Buscar lugar o dirección...]      │
├─────────────────────────────────────────┤
│                                         │
│  📍 Ubicación GPS Actual                │
│  ─────────────────────────              │
│  Latitud:  -13.5058803                  │
│  Longitud: -72.0098184                  │
│  Precisión: 13.9m                       │
│  Última:   02/10/2025 00:36:37          │
│                                         │
│  [📍 Mis Coordenadas]                   │
│                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                         │
│  🚀 Navegación                          │
│  ─────────────────────────              │
│  📍 Lugar seleccionado: (ninguno)       │
│  [ Calcular Ruta ]                      │
│                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                         │
│  ⚙️ Control del Servicio                │
│  ─────────────────────────              │
│  Estado: ⚠️ Inactivo                    │
│  [▶️ Iniciar Servicio GPS]              │
│                                         │
└─────────────────────────────────────────┘
```

#### Funciones de los Botones

- **📍 Mis Coordenadas**: Copia lat/lon al portapapeles
- **🔍 Buscar**: Busca lugares usando Nominatim
- **Calcular Ruta**: Genera ruta desde ubicación actual
- **Iniciar/Detener Servicio**: Control del rastreo en segundo plano

### Interfaz Web

Abre en navegador: `https://tu-tunel.ngrok-free.dev` o `http://localhost:3000`

```
┌────────────────────────────────────────────────────────────────────┐
│  🗺️ Sistema de Rastreo GPS en Tiempo Real                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  🔍 [Buscar lugar o dirección...]          [🔎]                   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │                        🗺️ MAPA                               │ │
│  │                                                              │ │
│  │         📍 ← Tus dispositivos aparecen aquí                  │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  📱 Dispositivos Conectados:                                       │
│  ┌────────────────────────────────────────┐                       │
│  │ 📱 HUAWEI ABR-LX3                      │                       │
│  │ 🕐 02/10/2025 00:39:12                 │                       │
│  │ 📍 -13.5058, -72.0098                  │                       │
│  │ 🎯 Precisión: 20.4m                    │                       │
│  │ [Ver en mapa] [Calcular ruta]          │                       │
│  └────────────────────────────────────────┘                       │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

#### Interacciones en el Mapa

- **Click en mapa**: Muestra coordenadas del punto
- **Click en marcador**: Información del dispositivo
- **Zoom**: Rueda del mouse o botones +/-
- **Arrastrar**: Click y mantener para mover mapa
- **Ruta**: Línea animada azul cuando se calcula ruta

---

## ☁️ Conexión a AWS

### Configuración de la Instancia EC2

**Instancia actual:**
- 🌍 **IP Pública:** `18.188.229.222`
- 💻 **Tipo:** Ubuntu Server
- 🔑 **Clave:** `edmil-key.pem`
- 📂 **Directorio:** `/home/ubuntu/GpsWeb`

### Métodos de Conexión

#### 1. Script Automático (Windows)

```bash
.\conectar-aws.bat
```

#### 2. Script Automático (Linux/Mac)

```bash
chmod +x conectar-aws.sh
./conectar-aws.sh
```

#### 3. Comando SSH Manual

```bash
ssh -i edmil-key.pem ubuntu@18.188.229.222
```

### Despliegue en AWS

#### Paso 1: Conectarse a la Instancia

```bash
ssh -i edmil-key.pem ubuntu@18.188.229.222
```

#### Paso 2: Navegar al Directorio

```bash
cd /home/ubuntu/GpsWeb
```

#### Paso 3: Actualizar Código (si es necesario)

```bash
git pull origin main
npm install
```

#### Paso 4: Iniciar Servidor en Segundo Plano

```bash
# Detener proceso anterior (si existe)
pkill -f "node server.js"

# Iniciar nuevo proceso
nohup node server.js > nohup.out 2>&1 &

# Verificar que está corriendo
ps aux | grep node
```

#### Paso 5: Ver Logs en Tiempo Real

```bash
tail -f nohup.out
```

### Verificar Estado del Servidor

```bash
# Ver últimas 50 líneas de log
tail -n 50 nohup.out

# Verificar puerto 3000
sudo netstat -tulpn | grep 3000

# Verificar proceso Node.js
ps aux | grep server.js
```

### Configuración de Seguridad AWS

Asegúrate de que el **Security Group** tenga estas reglas:

| Tipo | Protocolo | Puerto | Origen | Descripción |
|------|-----------|--------|--------|-------------|
| SSH | TCP | 22 | Tu IP | Acceso SSH |
| HTTP | TCP | 80 | 0.0.0.0/0 | Acceso web |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Acceso web seguro |
| Custom TCP | TCP | 3000 | 0.0.0.0/0 | Servidor Node.js |

---

## 🔧 Solución de Problemas

### Problema: App no envía ubicaciones

**Diagnóstico:**
```bash
# Verificar logs de la app
adb logcat -s GPS_SENDER GpsService
```

**Soluciones:**
1. ✅ Verifica que GPS esté activado en el dispositivo
2. ✅ Concede permisos de ubicación (Permitir siempre)
3. ✅ Desactiva "Optimización de batería" para la app
4. ✅ Verifica que la URL del servidor sea correcta
5. ✅ Comprueba conexión a internet del dispositivo

### Problema: Servidor no inicia

**Diagnóstico:**
```bash
# Ver error completo
npm start
```

**Soluciones:**
1. ✅ Verifica que el puerto 3000 no esté en uso: `netstat -ano | findstr :3000`
2. ✅ Instala dependencias: `npm install`
3. ✅ Verifica archivo `.env` existe y tiene NGROK_AUTHTOKEN
4. ✅ Actualiza Node.js a versión 18+

### Problema: Túnel ngrok no se crea

**Soluciones:**
1. ✅ Verifica token en `.env`: `NGROK_AUTHTOKEN=tu_token`
2. ✅ Instala ngrok manualmente: `npm install ngrok@5.0.0-beta.2`
3. ✅ Cambia `NGROK_ENABLED=false` para modo local sin túnel

### Problema: No aparecen dispositivos en mapa web

**Diagnóstico:**
1. Abre consola del navegador (F12)
2. Ve a pestaña "Network" o "Red"
3. Busca conexión WebSocket

**Soluciones:**
1. ✅ Refresca la página web (Ctrl+R)
2. ✅ Verifica que WebSocket conecte (debe aparecer en Network)
3. ✅ Comprueba que el servidor esté corriendo
4. ✅ Revisa base de datos: `SELECT * FROM locations ORDER BY timestamp DESC LIMIT 10;`

### Problema: Búsqueda de lugares no funciona

**Soluciones:**
1. ✅ Verifica conexión a internet
2. ✅ API Nominatim tiene límites de uso (1 req/segundo)
3. ✅ Espera unos segundos entre búsquedas
4. ✅ Usa términos de búsqueda más específicos

### Problema: Cálculo de ruta falla

**Soluciones:**
1. ✅ Verifica que origen y destino estén en zona con cobertura de OSRM
2. ✅ Asegúrate de que las coordenadas sean válidas
3. ✅ OSRM puede no tener rutas en zonas muy remotas
4. ✅ Usa lugares dentro de carreteras/ciudades principales

---

## 📊 Base de Datos

### Estructura de la Tabla `locations`

```sql
CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT NOT NULL,
    deviceName TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Consultas Útiles

```sql
-- Ver últimas 10 ubicaciones
SELECT * FROM locations ORDER BY timestamp DESC LIMIT 10;

-- Contar ubicaciones por dispositivo
SELECT deviceId, deviceName, COUNT(*) as total 
FROM locations 
GROUP BY deviceId;

-- Ubicaciones de hoy
SELECT * FROM locations 
WHERE DATE(timestamp) = DATE('now')
ORDER BY timestamp DESC;

-- Limpiar ubicaciones antiguas (>30 días)
DELETE FROM locations 
WHERE timestamp < datetime('now', '-30 days');
```

---

## 🔐 Seguridad

### Archivos Sensibles (NO subir a GitHub)

- ❌ `edmil-key.pem` - Clave privada SSH
- ❌ `.env` - Variables de entorno con tokens
- ❌ `gps_tracking.db` - Base de datos con ubicaciones
- ❌ `tunnel-url.txt` - URL temporal de ngrok

### Buenas Prácticas

- ✅ Mantén `.gitignore` actualizado
- ✅ Cambia tokens periódicamente
- ✅ Usa HTTPS para conexiones públicas
- ✅ Limita permisos de la clave SSH: `chmod 400 edmil-key.pem`
- ✅ Habilita firewall en AWS (Security Groups)

---

## 📈 Rendimiento

### Métricas Típicas

- **Frecuencia GPS:** 10 segundos (configurable)
- **Precisión GPS:** 10-30 metros (según condiciones)
- **Latencia WebSocket:** < 100ms
- **Consumo batería:** ~3-5% por hora con servicio activo
- **Tamaño APK:** ~5 MB
- **Uso RAM servidor:** ~50-100 MB
- **Almacenamiento DB:** ~1 KB por ubicación

### Optimizaciones

- 📉 Reduce frecuencia de actualización para ahorrar batería
- 📉 Implementa compresión de datos para reducir ancho de banda
- 📉 Limpia base de datos periódicamente
- 📉 Usa caché para búsquedas repetidas

---

## 🤝 Contribuciones

Desarrollado por **Edmil Jampier Saire Bustamante**

### Próximas Mejoras

- [ ] Historial de rutas (trazas completas)
- [ ] Notificaciones push cuando dispositivo entra/sale de zona
- [ ] Exportar datos a CSV/KML
- [ ] Modo nocturno en mapa
- [ ] Autenticación de usuarios
- [ ] Dashboard con estadísticas

---

## 📞 Soporte

Si encuentras problemas o tienes preguntas:

1. 📝 Revisa la sección [Solución de Problemas](#-solución-de-problemas)
2. 📋 Verifica logs del servidor: `tail -f nohup.out` (AWS)
3. 📱 Revisa logs de Android: `adb logcat -s GPS_SENDER`
4. 🌐 Comprueba que ngrok esté activo: visita la URL en navegador

---

## 📄 Licencia

MIT License - Uso libre con atribución

---

**Última actualización:** Octubre 2025  
**Versión:** 1.0.0  
**Estado:** ✅ Producción
