# Sistema de Rastreo GPS Completo

Un sistema completo de rastreo GPS que incluye una aplicación web en tiempo real y una aplicación móvil Android para el envío de coordenadas.

## 🚀 Características

### Aplicación Web (GpsWeb)
- **Visualización en tiempo real** de ubicaciones GPS en mapa interactivo
- **WebSocket** para actualizaciones en tiempo real
- **Filtros de fecha y hora** para consultas históricas
- **Búsqueda de ubicaciones** por dirección
- **Cálculo de rutas** entre puntos
- **Interfaz moderna y responsiva** con Bootstrap
- **Base de datos SQLite** para almacenamiento persistente

### Aplicación Android (GpsAndroid)
- **Envío automático de coordenadas GPS** al servidor
- **Configuración de intervalos** de envío
- **Interfaz nativa Android** con Kotlin
- **Gestión de permisos** de ubicación

## 📁 Estructura del Proyecto

```
ProtectoGps/
├── GpsWeb/                 # Aplicación web
│   ├── server.js          # Servidor Node.js con Express y WebSocket
│   ├── index.html         # Interfaz web principal
│   ├── script.js          # Lógica del frontend
│   ├── styles.css         # Estilos CSS
│   ├── database.js        # Configuración de base de datos
│   └── package.json       # Dependencias de Node.js
├── GpsAndroid/            # Aplicación móvil Android
│   ├── app/               # Código fuente de la aplicación
│   ├── build.gradle.kts   # Configuración de construcción
│   └── settings.gradle.kts
├── conectar-aws.sh        # Script para conexión SSH a AWS
├── conectar-aws.bat       # Script de Windows para AWS
└── README.md              # Este archivo
```

## 🛠️ Tecnologías Utilizadas

### Backend
- **Node.js** - Entorno de ejecución
- **Express.js** - Framework web
- **WebSocket (ws)** - Comunicación en tiempo real
- **SQLite3** - Base de datos
- **CORS** - Manejo de políticas de origen cruzado

### Frontend
- **HTML5** - Estructura
- **CSS3** - Estilos
- **JavaScript ES6+** - Lógica del cliente
- **Bootstrap 5** - Framework CSS
- **Leaflet** - Mapas interactivos
- **OpenStreetMap** - Proveedor de mapas

### Móvil
- **Android Studio** - IDE de desarrollo
- **Kotlin** - Lenguaje de programación
- **Gradle** - Sistema de construcción

## 🚀 Instalación y Configuración

### Prerrequisitos
- Node.js (v14 o superior)
- npm o yarn
- Android Studio (para la app móvil)
- Git

### Configuración de la Aplicación Web

1. **Clonar el repositorio:**
```bash
git clone https://github.com/milith0kun/GpsCompleto.git
cd GpsCompleto/GpsWeb
```

2. **Instalar dependencias:**
```bash
npm install
```

3. **Iniciar el servidor:**
```bash
node server.js
```

4. **Acceder a la aplicación:**
   - Abrir navegador en `http://localhost:3001`

### Configuración de la Aplicación Android

1. **Abrir Android Studio**
2. **Importar el proyecto** desde `GpsAndroid/`
3. **Configurar la URL del servidor** en el código
4. **Compilar y ejecutar** en dispositivo o emulador

## 📡 API Endpoints

### REST API
- `POST /api/gps` - Recibir coordenadas GPS
- `GET /api/ubicaciones` - Obtener historial de ubicaciones
- `GET /api/dispositivos` - Listar dispositivos activos

### WebSocket
- Conexión en `ws://localhost:3001`
- Eventos en tiempo real para nuevas ubicaciones

## 🗄️ Base de Datos

### Tabla: ubicaciones
```sql
CREATE TABLE ubicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispositivo_id TEXT NOT NULL,
    latitud REAL NOT NULL,
    longitud REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    precision_metros REAL,
    velocidad REAL,
    direccion REAL
);
```

### Tabla: dispositivos
```sql
CREATE TABLE dispositivos (
    id TEXT PRIMARY KEY,
    nombre TEXT,
    ultima_conexion INTEGER,
    activo BOOLEAN DEFAULT 1
);
```

## 🌐 Despliegue en AWS

El proyecto incluye scripts para facilitar el despliegue en AWS EC2:

- `conectar-aws.sh` - Script de conexión SSH para Linux/Mac
- `conectar-aws.bat` - Script de conexión SSH para Windows

### Configuración de AWS
1. Configurar instancia EC2
2. Instalar Node.js y dependencias
3. Configurar grupo de seguridad para puertos 3001 y 22
4. Subir archivos del proyecto
5. Ejecutar aplicación

## 🔧 Configuración

### Variables de Entorno
```bash
PORT=3001                    # Puerto del servidor
DB_PATH=./gps_tracking.db   # Ruta de la base de datos
CORS_ORIGIN=*               # Origen permitido para CORS
```

### Configuración del Cliente Android
- Modificar la URL del servidor en el código Android
- Configurar permisos de ubicación
- Ajustar intervalo de envío de coordenadas

## 📱 Funcionalidades de la Interfaz Web

### Panel de Control
- **Estado de conexión** en tiempo real
- **Contador de dispositivos** activos
- **Filtros de fecha y hora** para consultas
- **Selector de dispositivos** específicos

### Mapa Interactivo
- **Visualización de ubicaciones** en tiempo real
- **Marcadores personalizados** por dispositivo
- **Popups informativos** con detalles de ubicación
- **Zoom automático** a nuevas ubicaciones

### Herramientas de Navegación
- **Búsqueda de direcciones** con geocodificación
- **Cálculo de rutas** entre puntos
- **Visualización de coordenadas** al hacer clic

## 🔒 Seguridad

- **Validación de datos** en servidor y cliente
- **Sanitización de entradas** para prevenir inyecciones
- **CORS configurado** para orígenes específicos
- **Archivos sensibles excluidos** del repositorio (.gitignore)

## 🐛 Solución de Problemas

### Problemas Comunes

1. **Error de conexión WebSocket:**
   - Verificar que el servidor esté ejecutándose
   - Comprobar firewall y puertos

2. **Base de datos no se crea:**
   - Verificar permisos de escritura
   - Comprobar ruta de la base de datos

3. **App Android no envía datos:**
   - Verificar permisos de ubicación
   - Comprobar URL del servidor
   - Revisar conectividad de red

## 📈 Mejoras Futuras

- [ ] Autenticación de usuarios
- [ ] Notificaciones push
- [ ] Geofencing (cercas geográficas)
- [ ] Reportes y estadísticas
- [ ] Aplicación iOS
- [ ] API REST más completa
- [ ] Dashboard administrativo

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama para nueva funcionalidad (`git checkout -b feature/nueva-funcionalidad`)
3. Commit los cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 👨‍💻 Autor

**Milith0kun**
- GitHub: [@milith0kun](https://github.com/milith0kun)

## 📞 Soporte

Para soporte técnico o preguntas:
- Crear un issue en GitHub
- Contactar al desarrollador

---

⭐ Si este proyecto te fue útil, ¡no olvides darle una estrella!