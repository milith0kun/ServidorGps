// Variables globales
let map;
let ws;
let reconnectInterval;
let sessionStartTime = new Date();
let totalUpdates = 0;
let accuracySum = 0;
let sessionTimer;
let dispositivos = new Map(); // Almacena información de dispositivos
let marcadores = new Map(); // Almacena marcadores por deviceId
let circulos = new Map(); // Almacena círculos de precisión por deviceId
let dispositivosVisibles = new Set(); // Dispositivos actualmente visibles
let coloresDispositivos = ['#234971ff', '#18642aff', '#b46870ff', '#ffdc74ff', '#5c3f92ff', '#fd7e14', '#20c997', '#e83e8c'];
let contadorColores = 0;

// Variables para trayectorias en tiempo real (solo datos nuevos desde que se abre la página)
let trayectorias = new Map(); // Almacena polylines de trayectorias por deviceId
let puntosHistoricos = new Map(); // Almacena puntos GPS por deviceId para dibujar trayectoria
let maxPuntosTrayectoria = 500; // Máximo de puntos en memoria para trayectoria en tiempo real

// Variables para filtro de suavizado de trayectorias (corrección de recorrido)
let puntosRawBuffer = new Map(); // Buffer de puntos sin procesar por dispositivo
let ultimoPuntoSuavizado = new Map(); // Último punto suavizado por dispositivo
const maxBufferSuavizado = 5; // Puntos a considerar para suavizado
const umbralDistanciaMinima = 1.0; // Metros - ignorar cambios menores a 1 metro (ruido GPS)
const umbralDistanciaMaxima = 100.0; // Metros - rechazar saltos mayores a 100m entre puntos consecutivos

// Variables para detección de dispositivos inactivos
let timeoutInactividad = 60000; // 60 segundos sin señal = dispositivo inactivo
let verificadorInactividad = null; // Intervalo de verificación

// Variables para rutas históricas
let rutasHistoricas = new Map(); // Almacena rutas históricas por deviceId
let modoTiempoReal = true; // Indica si estamos en modo tiempo real

// Variables para búsqueda y navegación
let marcadorBusqueda = null; // Marcador para resultados de búsqueda
let rutaActual = null; // Ruta actual en el mapa
let coordenadasSeleccionadas = null; // Coordenadas seleccionadas por clic

// Función para cargar Leaflet dinámicamente
function cargarLeaflet(callback) {
    if (typeof L !== 'undefined') {
        callback();
        return;
    }
    
    // Cargar CSS de Leaflet
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletCSS);
    
    // Cargar JS de Leaflet
    const leafletJS = document.createElement('script');
    leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    leafletJS.onload = function() {
        console.log('Leaflet cargado correctamente');
        callback();
    };
    leafletJS.onerror = function() {
        console.error('Error cargando Leaflet');
        document.getElementById('map').innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f9fa; color: #6c757d;"><h3>Error: No se pudo cargar el mapa</h3></div>';
    };
    document.head.appendChild(leafletJS);
}

// Inicializar el mapa con Leaflet (OpenStreetMap)
function initMap() {
    console.log('Inicializando mapa con OpenStreetMap (Leaflet)');
    cargarLeaflet(initMapFallback);
}

// Función para inicializar el mapa con Leaflet
function initMapFallback() {
    try {
        // Verificar si el mapa ya está inicializado
        if (map) {
            console.log('🗺️ Mapa ya inicializado, omitiendo reinicialización');
            return;
        }
        
        // Limpiar el contenido del div del mapa
        const mapDiv = document.getElementById('map');
        mapDiv.innerHTML = '';
        
        // Verificar que Leaflet esté disponible
        if (typeof L === 'undefined') {
            throw new Error('Leaflet no está disponible');
        }
        
        // Crear mapa con Leaflet centrado en Cusco, Perú
        // Configuración optimizada para móviles
        map = L.map('map', {
            center: [-13.53195, -71.967463],
            zoom: 13,
            zoomControl: true,
            touchZoom: true,
            scrollWheelZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            tap: true,
            tapTolerance: 15,
            dragging: true,
            trackResize: true
        });
        
        // Agregar capa de OpenStreetMap (mejor contraste y legibilidad)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
            minZoom: 3
        }).addTo(map);
        
        // Forzar redimensionamiento del mapa
        setTimeout(() => {
            if (map && map.invalidateSize) {
                map.invalidateSize();
            }
        }, 100);
        
        // Agregar listener para redimensionamiento de ventana
        let resizeTimeout;
        window.addEventListener('resize', function() {
            // Usar debounce para evitar múltiples llamadas
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (map && map.invalidateSize) {
                    console.log('🔄 Redimensionando mapa...');
                    map.invalidateSize(true);
                    
                    // Si hay dispositivos, centrar la vista
                    if (dispositivos.size > 0) {
                        const bounds = L.latLngBounds();
                        dispositivos.forEach(dispositivo => {
                            if (dispositivo.lat && dispositivo.lon) {
                                bounds.extend([dispositivo.lat, dispositivo.lon]);
                            }
                        });
                        if (bounds.isValid()) {
                            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
                        }
                    }
                }
            }, 250);
        });
        
        // Forzar redimensionamiento cuando cambia la orientación
        window.addEventListener('orientationchange', function() {
            setTimeout(() => {
                if (map && map.invalidateSize) {
                    console.log('🔄 Orientación cambiada, redimensionando mapa...');
                    map.invalidateSize(true);
                }
            }, 300);
        });
        
        // Observar cambios en el tamaño del contenedor del mapa
        const mapContainer = document.getElementById('map');
        if (mapContainer && 'ResizeObserver' in window) {
            const resizeObserver = new ResizeObserver(() => {
                if (map && map.invalidateSize) {
                    console.log('� Contenedor del mapa cambió de tamaño, actualizando...');
                    map.invalidateSize(true);
                }
            });
            resizeObserver.observe(mapContainer);
        }
        
        console.log('�🗺️ Mapa de Leaflet inicializado correctamente');
        window.mapProvider = 'leaflet';
        
        // Marcar que el mapa está listo
        window.mapReady = true;
        
        // Cargar datos existentes después de inicializar el mapa
        setTimeout(() => {
            cargarDatosExistentes();
        }, 500);
        
        // Forzar actualización adicional para asegurar que se renderice
        setTimeout(() => {
            if (map && map.invalidateSize) {
                map.invalidateSize(true);
                console.log('✅ Mapa forzado a redimensionar después de carga');
            }
        }, 1000);
        
    } catch (error) {
        console.error('Error inicializando Leaflet:', error);
        document.getElementById('map').innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f9fa; color: #6c757d;"><h3>Error: No se pudo cargar el mapa</h3></div>';
    }
}

// Función para obtener el siguiente color disponible
function obtenerSiguienteColor() {
    const color = coloresDispositivos[contadorColores % coloresDispositivos.length];
    contadorColores++;
    return color;
}

// Función para conectar WebSocket
function conectarWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            console.log('✅ Conectado al servidor WebSocket');
            document.getElementById('connectionStatus').className = 'status-indicator status-connected';
            document.getElementById('connectionText').textContent = 'Conectado';
            
            // Actualizar información del servidor
            actualizarInfoServidor();
            
            // Limpiar intervalo de reconexión si existe
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }
        };
        
        ws.onmessage = function(event) {
            try {
                const mensaje = JSON.parse(event.data);
                console.log('📍 Mensaje WebSocket recibido:', mensaje.tipo || 'sin tipo', mensaje.datos ? 'con datos' : 'sin datos');
                
                if (modoTiempoReal && mensaje.datos && mensaje.datos.ubicacion) {
                    // Extraer datos de ubicación del formato del servidor
                    const ubicacion = mensaje.datos.ubicacion;
                    const dispositivo = mensaje.datos.dispositivo;
                    
                    // Asegurar que el timestamp sea un número válido
                    let timestamp = ubicacion.timestamp;
                    // Convertir timestamp a número si es string
                    if (typeof timestamp === 'string') {
                        // Si es formato ISO (2025-10-02T06:34:13.461Z), convertir a Date
                        if (timestamp.includes('T') || timestamp.includes('-')) {
                            timestamp = new Date(timestamp).getTime();
                        } else {
                            timestamp = parseInt(timestamp);
                        }
                    }
                    // Validar que sea un timestamp válido
                    if (!timestamp || isNaN(timestamp) || timestamp < 1000000000000) {
                        timestamp = Date.now();
                    }
                    
                    // console.log('🕐 Timestamp original:', ubicacion.timestamp, 'Tipo:', typeof ubicacion.timestamp);
                    // console.log('🕐 Timestamp procesado:', timestamp, 'Fecha:', new Date(timestamp).toLocaleString('es-ES'));
                    
                    const datosFormateados = {
                        deviceId: ubicacion.deviceId,
                        latitude: ubicacion.lat,
                        longitude: ubicacion.lon,
                        accuracy: ubicacion.accuracy,
                        timestamp: timestamp
                    };
                    
                    // console.log('📍 Datos formateados:', datosFormateados);
                    actualizarUbicacion(datosFormateados);
                }
                
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
            }
        };
        
        ws.onclose = function() {
            console.log('❌ Conexión WebSocket cerrada');
            document.getElementById('connectionStatus').className = 'status-indicator status-disconnected';
            document.getElementById('connectionText').textContent = 'Desconectado';
            
            // Intentar reconectar cada 5 segundos
            if (!reconnectInterval) {
                reconnectInterval = setInterval(() => {
                    console.log('🔄 Intentando reconectar...');
                    conectarWebSocket();
                }, 5000);
            }
        };
        
        ws.onerror = function(error) {
            console.error('❌ Error en WebSocket:', error);
            document.getElementById('connectionStatus').className = 'status-indicator status-disconnected';
            document.getElementById('connectionText').textContent = 'Error de conexión';
        };
        
    } catch (error) {
        console.error('❌ Error creando WebSocket:', error);
        document.getElementById('connectionStatus').className = 'status-indicator status-disconnected';
        document.getElementById('connectionText').textContent = 'Error de conexión';
    }
}

// Función para actualizar la ubicación en el mapa con datos de sensores
function actualizarUbicacion(data) {
    const { deviceId, latitude, longitude, accuracy, timestamp, accelX, accelY, accelZ, steps, speed } = data;
    
    // Empaquetar datos de sensores
    const sensorData = {
        accelX: accelX,
        accelY: accelY,
        accelZ: accelZ,
        steps: steps,
        speed: speed
    };
    
    // Validar y procesar timestamp
    let timestampValido = timestamp;
    
    // Si el timestamp es un string ISO (desde BD), convertir a milisegundos
    if (typeof timestampValido === 'string') {
        try {
            timestampValido = new Date(timestampValido).getTime();
        } catch (error) {
            console.warn('⚠️ Error parseando timestamp:', timestamp);
            timestampValido = Date.now();
        }
    }
    
    // Validar que sea un número válido
    if (!timestampValido || isNaN(timestampValido) || timestampValido < 1000000000000) {
        console.warn('⚠️ Timestamp inválido:', timestamp, 'usando timestamp actual');
        timestampValido = Date.now();
    }
    
    // Crear objeto Date para formateo
    const fechaHora = new Date(timestampValido);
    const fechaFormateada = fechaHora.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // console.log('🕐 Actualizando ubicación - Timestamp:', timestampValido, 'Fecha formateada:', fechaFormateada);
    
    // Actualizar contadores
    totalUpdates++;
    accuracySum += accuracy;
    
    // Actualizar estadísticas en la interfaz
    document.getElementById('totalUpdates').textContent = totalUpdates;
    document.getElementById('avgAccuracy').textContent = `${(accuracySum / totalUpdates).toFixed(1)}m`;
    // Contar solo dispositivos activos
    actualizarContadorActivos();
    document.getElementById('lastUpdate').textContent = fechaFormateada;
    
    // Actualizar información del dispositivo
    if (!dispositivos.has(deviceId)) {
        const color = obtenerSiguienteColor();
        dispositivos.set(deviceId, {
            id: deviceId,
            color: color,
            ultimaUbicacion: { latitude, longitude, accuracy, timestamp: timestampValido },
            ultimaActividad: Date.now(), // Timestamp de última señal recibida
            visible: true,
            activo: true
        });
        dispositivosVisibles.add(deviceId);
        
        // Crear elemento en la lista de dispositivos (verifica duplicados internamente)
        crearElementoDispositivo(deviceId, color);
        
        console.log(`✅ Nuevo dispositivo detectado: ${deviceId} (Total en Map: ${dispositivos.size})`);
        actualizarContadorActivos(); // Actualizar contador inmediatamente
    } else {
        // Actualizar ubicación existente
        const dispositivo = dispositivos.get(deviceId);
        dispositivo.ultimaUbicacion = { latitude, longitude, accuracy, timestamp: timestampValido };
        dispositivo.ultimaActividad = Date.now(); // Actualizar última actividad
        
        // console.log(`🔄 Ubicación actualizada para dispositivo existente: ${deviceId}`);
        
        // Si estaba inactivo, reactivarlo
        if (!dispositivo.activo) {
            dispositivo.activo = true;
            reactivarDispositivo(deviceId);
        }
    }
    
    // Actualizar marcador en el mapa con datos de sensores
    actualizarMarcadorDispositivo(deviceId, latitude, longitude, accuracy, timestampValido, sensorData);
    
    // Actualizar información en el panel
    document.getElementById('latitud').textContent = latitude.toFixed(6);
    document.getElementById('longitud').textContent = longitude.toFixed(6);
    document.getElementById('precision').textContent = `${accuracy}m`;
    document.getElementById('timestamp').textContent = fechaFormateada;
}

// Función para crear elemento de dispositivo en la lista
function crearElementoDispositivo(deviceId, color) {
    const deviceList = document.getElementById('deviceList');
    
    // Verificar si el elemento ya existe para evitar duplicados
    const elementoExistente = document.getElementById(`device-${deviceId}`);
    if (elementoExistente) {
        console.log(`⚠️ Elemento de dispositivo ${deviceId} ya existe, no se creará duplicado`);
        return;
    }
    
    const deviceElement = document.createElement('div');
    deviceElement.className = 'device-item';
    deviceElement.style.borderLeftColor = color;
    deviceElement.id = `device-${deviceId}`;
    
    deviceElement.innerHTML = `
        <div class="device-color" style="background-color: ${color}"></div>
        <div class="device-info">
            <div class="device-name">Dispositivo ${deviceId}</div>
            <div class="device-status">En línea</div>
        </div>
        <div class="device-toggle active" onclick="toggleDispositivo('${deviceId}')"></div>
    `;
    
    // Agregar evento de clic para centrar en el dispositivo
    deviceElement.addEventListener('click', (e) => {
        if (!e.target.classList.contains('device-toggle')) {
            centrarEnDispositivo(deviceId);
        }
    });
    
    deviceList.appendChild(deviceElement);
    console.log(`✅ Elemento de interfaz creado para dispositivo: ${deviceId}`);
}

// Función para actualizar marcador de dispositivo con datos de sensores
function actualizarMarcadorDispositivo(deviceId, latitude, longitude, accuracy, timestamp, sensorData = {}) {
    const dispositivo = dispositivos.get(deviceId);
    if (!dispositivo || !dispositivo.visible) return;
    
    // Verificar que el mapa esté inicializado
    if (!map) {
        console.log('⏳ Mapa no inicializado aún, esperando...');
        // Solo reintentar una vez después de un delay más corto
        setTimeout(() => {
            if (map) {
                actualizarMarcadorDispositivo(deviceId, latitude, longitude, accuracy, timestamp);
            } else {
                console.warn('⚠️ Mapa no disponible para dispositivo:', deviceId);
            }
        }, 100);
        return;
    }
    
    // Lógica para Leaflet
    let marcador = marcadores.get(deviceId);
    let circulo = circulos.get(deviceId);
    
    if (!marcador) {
        // Crear nuevo marcador
        marcador = L.circleMarker([latitude, longitude], {
            color: '#ffffff',
            weight: 2,
            fillColor: dispositivo.color,
            fillOpacity: 1,
            radius: 8
        }).addTo(map);
        
        // Crear círculo de precisión
        circulo = L.circle([latitude, longitude], {
            color: dispositivo.color,
            weight: 2,
            opacity: 0.8,
            fillColor: dispositivo.color,
            fillOpacity: 0.15,
            radius: accuracy
        }).addTo(map);
        
        marcadores.set(deviceId, marcador);
        circulos.set(deviceId, circulo);
        
        // Formatear fecha y hora para el popup
        const fechaHoraPopup = new Date(timestamp).toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // Construir información de sensores si está disponible
        let sensorInfo = '';
        if (sensorData) {
            if (sensorData.accelX !== null && sensorData.accelX !== undefined) {
                const accelMagnitude = Math.sqrt(
                    sensorData.accelX * sensorData.accelX + 
                    sensorData.accelY * sensorData.accelY + 
                    sensorData.accelZ * sensorData.accelZ
                ).toFixed(2);
                sensorInfo += `<p style="margin: 4px 0;"><strong>📊 Aceleración:</strong> ${accelMagnitude} m/s²</p>`;
            }
            if (sensorData.steps !== null && sensorData.steps !== undefined && sensorData.steps > 0) {
                sensorInfo += `<p style="margin: 4px 0;"><strong>👣 Pasos:</strong> ${sensorData.steps}</p>`;
            }
            if (sensorData.speed !== null && sensorData.speed !== undefined) {
                const speedKmh = (sensorData.speed * 3.6).toFixed(1);
                sensorInfo += `<p style="margin: 4px 0;"><strong>🏃 Velocidad:</strong> ${speedKmh} km/h</p>`;
            }
        }
        
        // Agregar popup con información incluyendo sensores
        marcador.bindPopup(`
            <div style="font-family: Arial, sans-serif;">
                <h4 style="margin: 0 0 8px 0; color: #333;">Dispositivo ${deviceId}</h4>
                <p style="margin: 4px 0;"><strong>Latitud:</strong> ${latitude.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Longitud:</strong> ${longitude.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Precisión GPS:</strong> ${accuracy}m</p>
                ${sensorInfo}
                <p style="margin: 4px 0;"><strong>Fecha y Hora:</strong> ${fechaHoraPopup}</p>
            </div>
        `);
    } else {
        // Actualizar posición del marcador existente
        marcador.setLatLng([latitude, longitude]);
        circulo.setLatLng([latitude, longitude]);
        circulo.setRadius(accuracy);
        
        // Formatear fecha y hora para el popup actualizado
        const fechaHoraActualizada = new Date(timestamp).toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // Construir información de sensores actualizada
        let sensorInfoActualizada = '';
        if (sensorData) {
            if (sensorData.accelX !== null && sensorData.accelX !== undefined) {
                const accelMagnitude = Math.sqrt(
                    sensorData.accelX * sensorData.accelX + 
                    sensorData.accelY * sensorData.accelY + 
                    sensorData.accelZ * sensorData.accelZ
                ).toFixed(2);
                sensorInfoActualizada += `<p style="margin: 4px 0;"><strong>📊 Aceleración:</strong> ${accelMagnitude} m/s²</p>`;
            }
            if (sensorData.steps !== null && sensorData.steps !== undefined && sensorData.steps > 0) {
                sensorInfoActualizada += `<p style="margin: 4px 0;"><strong>👣 Pasos:</strong> ${sensorData.steps}</p>`;
            }
            if (sensorData.speed !== null && sensorData.speed !== undefined) {
                const speedKmh = (sensorData.speed * 3.6).toFixed(1);
                sensorInfoActualizada += `<p style="margin: 4px 0;"><strong>🏃 Velocidad:</strong> ${speedKmh} km/h</p>`;
            }
        }
        
        // Actualizar popup con datos de sensores
        marcador.setPopupContent(`
            <div style="font-family: Arial, sans-serif;">
                <h4 style="margin: 0 0 8px 0; color: #333;">Dispositivo ${deviceId}</h4>
                <p style="margin: 4px 0;"><strong>Latitud:</strong> ${latitude.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Longitud:</strong> ${longitude.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Precisión GPS:</strong> ${accuracy}m</p>
                ${sensorInfoActualizada}
                <p style="margin: 4px 0;"><strong>Fecha y Hora:</strong> ${fechaHoraActualizada}</p>
            </div>
        `);
    }
    
    // Actualizar trayectoria del dispositivo con suavizado
    actualizarTrayectoria(deviceId, latitude, longitude);
}

/**
 * Calcula la distancia entre dos puntos GPS en metros (fórmula de Haversine)
 */
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distancia en metros
}

/**
 * Aplica suavizado a un punto GPS para reducir ruido y mejorar la trayectoria
 * Usa promedio móvil ponderado con rechazo de outliers
 */
function aplicarSuavizadoGPS(deviceId, latitud, longitud) {
    // Inicializar buffer si no existe
    if (!puntosRawBuffer.has(deviceId)) {
        puntosRawBuffer.set(deviceId, []);
        ultimoPuntoSuavizado.set(deviceId, { lat: latitud, lon: longitud });
        return { lat: latitud, lon: longitud };
    }
    
    const buffer = puntosRawBuffer.get(deviceId);
    const ultimoSuavizado = ultimoPuntoSuavizado.get(deviceId);
    
    // Verificar si el nuevo punto es válido
    if (buffer.length > 0) {
        const ultimoPunto = buffer[buffer.length - 1];
        const distancia = calcularDistancia(ultimoPunto.lat, ultimoPunto.lon, latitud, longitud);
        
        // Rechazar puntos con saltos muy grandes (probables errores GPS)
        if (distancia > umbralDistanciaMaxima) {
            console.warn(`⚠️ Punto rechazado: salto de ${distancia.toFixed(1)}m (max: ${umbralDistanciaMaxima}m)`);
            return ultimoSuavizado; // Devolver el último punto válido
        }
        
        // Ignorar cambios muy pequeños (ruido GPS estacionario)
        if (distancia < umbralDistanciaMinima) {
            console.log(`🔹 Ruido GPS ignorado: ${distancia.toFixed(2)}m`);
            return ultimoSuavizado;
        }
    }
    
    // Agregar punto al buffer
    buffer.push({ lat: latitud, lon: longitud, timestamp: Date.now() });
    
    // Mantener solo los últimos N puntos
    if (buffer.length > maxBufferSuavizado) {
        buffer.shift();
    }
    
    // Calcular promedio móvil ponderado
    // Los puntos más recientes tienen más peso
    let sumaLat = 0, sumaLon = 0, sumaPesos = 0;
    
    for (let i = 0; i < buffer.length; i++) {
        const peso = i + 1; // Peso creciente (1, 2, 3, 4, 5...)
        sumaLat += buffer[i].lat * peso;
        sumaLon += buffer[i].lon * peso;
        sumaPesos += peso;
    }
    
    const latSuavizada = sumaLat / sumaPesos;
    const lonSuavizada = sumaLon / sumaPesos;
    
    // Guardar punto suavizado
    const puntoSuavizado = { lat: latSuavizada, lon: lonSuavizada };
    ultimoPuntoSuavizado.set(deviceId, puntoSuavizado);
    
    // console.log(`🎯 Punto suavizado: (${latitud.toFixed(6)}, ${longitud.toFixed(6)}) → (${latSuavizada.toFixed(6)}, ${lonSuavizada.toFixed(6)})`); // Comentado para mejor rendimiento
    
    return puntoSuavizado;
}

// Función para actualizar y dibujar la trayectoria del dispositivo con suavizado
function actualizarTrayectoria(deviceId, latitude, longitude) {
    const dispositivo = dispositivos.get(deviceId);
    if (!dispositivo || !dispositivo.visible) return;
    
    // Aplicar algoritmo de suavizado para corregir ruido GPS y mejorar recorrido
    const puntoCorregido = aplicarSuavizadoGPS(deviceId, latitude, longitude);
    
    // Obtener o inicializar array de puntos históricos
    if (!puntosHistoricos.has(deviceId)) {
        puntosHistoricos.set(deviceId, []);
    }
    
    const puntos = puntosHistoricos.get(deviceId);
    
    // Agregar punto SUAVIZADO/CORREGIDO a la trayectoria
    puntos.push([puntoCorregido.lat, puntoCorregido.lon]);
    
    // Limitar cantidad de puntos para no saturar memoria (mantener últimos 1000)
    if (puntos.length > maxPuntosTrayectoria) {
        puntos.shift(); // Eliminar el punto más antiguo
    }
    
    // Obtener o crear polyline para la trayectoria
    let trayectoria = trayectorias.get(deviceId);
    
    if (!trayectoria && puntos.length >= 2) {
        // Crear nueva polyline con suavizado de Leaflet
        trayectoria = L.polyline(puntos, {
            color: dispositivo.color,
            weight: 4, // Línea más gruesa para mejor visibilidad
            opacity: 0.8,
            smoothFactor: 2.0, // Suavizado adicional de Leaflet
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
        
        trayectorias.set(deviceId, trayectoria);
        
        console.log(`🛤️ Trayectoria en tiempo real creada para ${deviceId} con ${puntos.length} puntos (incluye historial)`);
    } else if (trayectoria) {
        // Actualizar polyline existente agregando el nuevo punto
        trayectoria.setLatLngs(puntos);
        // console.log(`📈 Trayectoria actualizada para ${deviceId}: ${puntos.length} puntos totales`); // Comentado para reducir logs
    }
}

// Función para alternar visibilidad de dispositivo
function toggleDispositivo(deviceId) {
    const dispositivo = dispositivos.get(deviceId);
    if (!dispositivo) return;
    
    const toggle = document.querySelector(`#device-${deviceId} .device-toggle`);
    const marcador = marcadores.get(deviceId);
    const circulo = circulos.get(deviceId);
    const trayectoria = trayectorias.get(deviceId);
    
    if (dispositivo.visible) {
        // Ocultar dispositivo
        dispositivo.visible = false;
        dispositivosVisibles.delete(deviceId);
        toggle.classList.remove('active');
        
        if (marcador) map.removeLayer(marcador);
        if (circulo) map.removeLayer(circulo);
        if (trayectoria) map.removeLayer(trayectoria);
    } else {
        // Mostrar dispositivo
        dispositivo.visible = true;
        dispositivosVisibles.add(deviceId);
        toggle.classList.add('active');
        
        if (marcador) marcador.addTo(map);
        if (circulo) circulo.addTo(map);
        if (trayectoria) trayectoria.addTo(map);
    }
}

// Función para mostrar/ocultar todos los dispositivos
function toggleTodosDispositivos() {
    const btn = document.getElementById('toggleAll');
    const mostrarTodos = btn.textContent === 'Mostrar Todos';
    
    dispositivos.forEach((dispositivo, deviceId) => {
        const marcador = marcadores.get(deviceId);
        const circulo = circulos.get(deviceId);
        const toggle = document.querySelector(`#device-${deviceId} .device-toggle`);
        
        if (mostrarTodos) {
            dispositivo.visible = true;
            dispositivosVisibles.add(deviceId);
            if (toggle) toggle.classList.add('active');
            
            if (marcador) marcador.addTo(map);
            if (circulo) circulo.addTo(map);
        } else {
            dispositivo.visible = false;
            dispositivosVisibles.delete(deviceId);
            if (toggle) toggle.classList.remove('active');
            
            if (marcador) map.removeLayer(marcador);
            if (circulo) map.removeLayer(circulo);
        }
    });
    
    btn.textContent = mostrarTodos ? 'Ocultar Todos' : 'Mostrar Todos';
}

// Función para verificar dispositivos inactivos
function verificarDispositivosInactivos() {
    const ahora = Date.now();
    const dispositivosEliminados = [];
    
    dispositivos.forEach((dispositivo, deviceId) => {
        // Solo verificar inactividad si el dispositivo tiene ultimaActividad establecida
        // (significa que ha enviado al menos un dato en esta sesión)
        if (dispositivo.ultimaActividad) {
            const tiempoInactivo = ahora - dispositivo.ultimaActividad;
            
            // Si el dispositivo lleva más de 60 segundos sin enviar señal
            if (tiempoInactivo > timeoutInactividad && dispositivo.activo) {
                console.log(`⚠️ Dispositivo ${deviceId} inactivo (${Math.round(tiempoInactivo/1000)}s sin señal)`);
                desactivarDispositivo(deviceId);
            }
        }
        // Si no tiene ultimaActividad, es un dispositivo histórico (solo desde BD)
        // NO lo desactivamos, simplemente lo mostramos en el mapa
    });
}

// Función para desactivar un dispositivo inactivo
function desactivarDispositivo(deviceId) {
    const dispositivo = dispositivos.get(deviceId);
    if (!dispositivo) return;
    
    dispositivo.activo = false;
    
    // Ocultar marcador y círculo, PERO MANTENER LA TRAYECTORIA visible
    const marcador = marcadores.get(deviceId);
    const circulo = circulos.get(deviceId);
    const trayectoria = trayectorias.get(deviceId);
    
    if (marcador) map.removeLayer(marcador);
    if (circulo) map.removeLayer(circulo);
    
    // MANTENER la trayectoria visible para ver el recorrido histórico
    // Solo cambiar su apariencia para indicar que está inactivo
    if (trayectoria) {
        trayectoria.setStyle({
            opacity: 0.5, // Más transparente
            weight: 3,     // Más delgada
            dashArray: '5, 10' // Línea punteada para indicar inactividad
        });
    }
    
    // Actualizar UI
    const deviceElement = document.getElementById(`device-${deviceId}`);
    if (deviceElement) {
        const statusElement = deviceElement.querySelector('.device-status');
        if (statusElement) {
            statusElement.textContent = 'Sin señal';
            statusElement.style.color = '#dc3545';
        }
        deviceElement.style.opacity = '0.5';
    }
    
    // Actualizar contador de dispositivos activos
    actualizarContadorActivos();
    
    console.log(`❌ Dispositivo ${deviceId} desactivado por inactividad`);
}

// Función para reactivar un dispositivo que vuelve a enviar señal
function reactivarDispositivo(deviceId) {
    const dispositivo = dispositivos.get(deviceId);
    if (!dispositivo) return;
    
    console.log(`✅ Dispositivo ${deviceId} reactivado`);
    
    // Si estaba visible, volver a mostrar en el mapa
    if (dispositivo.visible) {
        const marcador = marcadores.get(deviceId);
        const circulo = circulos.get(deviceId);
        const trayectoria = trayectorias.get(deviceId);
        
        if (marcador) marcador.addTo(map);
        if (circulo) circulo.addTo(map);
        
        // Restaurar estilo normal de la trayectoria
        if (trayectoria) {
            trayectoria.setStyle({
                color: dispositivo.color,
                weight: 4,
                opacity: 0.8,
                dashArray: null, // Quitar línea punteada
                smoothFactor: 2.0,
                lineCap: 'round',
                lineJoin: 'round'
            });
        }
    }
    
    // Actualizar UI
    const deviceElement = document.getElementById(`device-${deviceId}`);
    if (deviceElement) {
        const statusElement = deviceElement.querySelector('.device-status');
        if (statusElement) {
            statusElement.textContent = 'En línea';
            statusElement.style.color = '#28a745';
        }
        deviceElement.style.opacity = '1';
    }
    
    // Actualizar contador de dispositivos activos
    actualizarContadorActivos();
}

// Función para actualizar contador de dispositivos activos
function actualizarContadorActivos() {
    let activos = 0;
    dispositivos.forEach(dispositivo => {
        if (dispositivo.activo) activos++;
    });
    document.getElementById('activeDevices').textContent = activos;
}

// Función para iniciar verificación periódica de dispositivos inactivos
// DESACTIVADA: Los dispositivos NO se desconectan automáticamente
function iniciarVerificacionInactividad() {
    console.log('ℹ️ Verificación de inactividad automática DESACTIVADA');
    console.log('✅ Los dispositivos permanecerán activos indefinidamente');
    
    // Sistema comentado - no verificar inactividad
    /*
    if (verificadorInactividad) {
        clearInterval(verificadorInactividad);
    }
    
    // Verificar cada 10 segundos
    verificadorInactividad = setInterval(() => {
        verificarDispositivosInactivos();
    }, 10000);
    
    console.log(`🔍 Verificación de inactividad iniciada (cada 10s, timeout: ${timeoutInactividad/1000}s)`);
    */
}

// Función para centrar la vista en todos los dispositivos
function centrarEnTodos() {
    if (!map) {
        console.warn('⚠️ Mapa no inicializado para centrar en todos');
        return;
    }
    
    if (dispositivosVisibles.size === 0) {
        console.log('📍 No hay dispositivos visibles para centrar');
        return;
    }
    
    const group = L.featureGroup();
    let dispositivosConUbicacion = 0;
    
    dispositivosVisibles.forEach(deviceId => {
        const dispositivo = dispositivos.get(deviceId);
        if (dispositivo && dispositivo.ultimaUbicacion && 
            dispositivo.ultimaUbicacion.latitude && dispositivo.ultimaUbicacion.longitude) {
            try {
                const marker = L.marker([
                    dispositivo.ultimaUbicacion.latitude,
                    dispositivo.ultimaUbicacion.longitude
                ]);
                group.addLayer(marker);
                dispositivosConUbicacion++;
            } catch (error) {
                console.warn('⚠️ Error creando marcador para', deviceId, error);
            }
        }
    });
    
    if (dispositivosConUbicacion === 0) {
        console.log('📍 No hay dispositivos con ubicación válida');
        return;
    }
    
    try {
        if (dispositivosConUbicacion === 1) {
            // Solo un dispositivo, centrar y hacer zoom
            const deviceId = Array.from(dispositivosVisibles)[0];
            const dispositivo = dispositivos.get(deviceId);
            if (dispositivo && dispositivo.ultimaUbicacion) {
                map.setView([
                    dispositivo.ultimaUbicacion.latitude,
                    dispositivo.ultimaUbicacion.longitude
                ], 16);
            }
        } else {
            // Múltiples dispositivos, ajustar bounds
            const bounds = group.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds);
            } else {
                console.warn('⚠️ Bounds inválidos, no se puede centrar');
            }
        }
    } catch (error) {
        console.error('❌ Error centrando en todos los dispositivos:', error);
    }
}

// Función para centrar en un dispositivo específico
function centrarEnDispositivo(deviceId) {
    const dispositivo = dispositivos.get(deviceId);
    if (!dispositivo || !dispositivo.ultimaUbicacion) return;
    
    const { latitude, longitude } = dispositivo.ultimaUbicacion;
    
    map.setView([latitude, longitude], 16);
    
    // Abrir popup si existe el marcador
    const marcador = marcadores.get(deviceId);
    if (marcador) {
        marcador.openPopup();
    }
    
    // Marcar como activo en la lista
    document.querySelectorAll('.device-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById(`device-${deviceId}`).classList.add('active');
}

// Función para mostrar ruta histórica
function mostrarRutaHistorica(deviceId, ubicaciones) {
    if (!ubicaciones || ubicaciones.length === 0) return;
    
    // Limpiar ruta anterior si existe
    if (rutasHistoricas.has(deviceId)) {
        limpiarRutaHistorica(deviceId);
    }
    
    const dispositivo = dispositivos.get(deviceId);
    const color = dispositivo ? dispositivo.color : '#007bff';
    
    if (ubicaciones.length > 1) {
        // Múltiples puntos - crear ruta
        const inicioUbicacion = ubicaciones[0];
        const finUbicacion = ubicaciones[ubicaciones.length - 1];
        
        // Crear polilínea para Leaflet
        const ruta = L.polyline(
            ubicaciones.map(u => [u.latitude, u.longitude]),
            {
                color: color,
                weight: 3,
                opacity: 0.8
            }
        ).addTo(map);
        
        // Marcador de inicio
        const marcadorInicio = L.circleMarker(
            [inicioUbicacion.latitude, inicioUbicacion.longitude],
            {
                color: '#ffffff',
                weight: 2,
                fillColor: '#28a745',
                fillOpacity: 1,
                radius: 10
            }
        ).addTo(map);
        
        // Marcador de fin
        const marcadorFin = L.circleMarker(
            [finUbicacion.latitude, finUbicacion.longitude],
            {
                color: '#ffffff',
                weight: 2,
                fillColor: '#dc3545',
                fillOpacity: 1,
                radius: 10
            }
        ).addTo(map);
        
        // Popups
        marcadorInicio.bindPopup(`
            <div style="font-family: Arial, sans-serif;">
                <h4 style="margin: 0 0 8px 0; color: #28a745;">🚀 Inicio de Ruta</h4>
                <p style="margin: 4px 0;"><strong>Dispositivo:</strong> ${deviceId}</p>
                <p style="margin: 4px 0;"><strong>Hora:</strong> ${new Date(inicioUbicacion.timestamp).toLocaleString('es-ES')}</p>
                <p style="margin: 4px 0;"><strong>Coordenadas:</strong> ${inicioUbicacion.latitude.toFixed(6)}, ${inicioUbicacion.longitude.toFixed(6)}</p>
            </div>
        `);
        
        marcadorFin.bindPopup(`
            <div style="font-family: Arial, sans-serif;">
                <h4 style="margin: 0 0 8px 0; color: #dc3545;">🏁 Fin de Ruta</h4>
                <p style="margin: 4px 0;"><strong>Dispositivo:</strong> ${deviceId}</p>
                <p style="margin: 4px 0;"><strong>Hora:</strong> ${new Date(finUbicacion.timestamp).toLocaleString('es-ES')}</p>
                <p style="margin: 4px 0;"><strong>Coordenadas:</strong> ${finUbicacion.latitude.toFixed(6)}, ${finUbicacion.longitude.toFixed(6)}</p>
            </div>
        `);
        
        // Guardar elementos de la ruta
        rutasHistoricas.set(deviceId, {
            ruta: ruta,
            marcadorInicio: marcadorInicio,
            marcadorFin: marcadorFin,
            ubicaciones: ubicaciones
        });
    } else {
        // Solo un punto
        const ubicacion = ubicaciones[0];
        
        const marcadorInicio = L.circleMarker(
            [ubicacion.latitude, ubicacion.longitude],
            {
                color: '#ffffff',
                weight: 2,
                fillColor: color,
                fillOpacity: 1,
                radius: 10
            }
        ).addTo(map);
        
        rutasHistoricas.set(deviceId, {
            marcadorInicio: marcadorInicio,
            ubicaciones: ubicaciones
        });
    }
}

// Función para limpiar el mapa completo
function limpiarMapa() {
    // Limpiar marcadores de tiempo real
    marcadores.forEach(marcador => {
        map.removeLayer(marcador);
    });
    
    // Limpiar círculos de precisión
    circulos.forEach(circulo => {
        map.removeLayer(circulo);
    });
    
    // Limpiar trayectorias
    trayectorias.forEach(trayectoria => {
        map.removeLayer(trayectoria);
    });
    
    // Limpiar rutas históricas
    rutasHistoricas.forEach(ruta => {
        if (ruta.ruta) map.removeLayer(ruta.ruta);
        if (ruta.marcadorInicio) map.removeLayer(ruta.marcadorInicio);
        if (ruta.marcadorFin) map.removeLayer(ruta.marcadorFin);
    });
    
    // Limpiar mapas de datos
    marcadores.clear();
    circulos.clear();
    trayectorias.clear();
    puntosHistoricos.clear();
    rutasHistoricas.clear();
    
    // Limpiar buffers de suavizado
    puntosRawBuffer.clear();
    ultimoPuntoSuavizado.clear();
}

// Función para limpiar solo trayectorias (mantener marcadores y dispositivos)
function limpiarTrayectorias() {
    console.log('🧹 Limpiando trayectorias...');
    
    // Limpiar trayectorias del mapa
    trayectorias.forEach((trayectoria, deviceId) => {
        if (map.hasLayer(trayectoria)) {
            map.removeLayer(trayectoria);
        }
    });
    
    // Limpiar datos de trayectorias
    trayectorias.clear();
    puntosHistoricos.clear();
    
    // Limpiar buffers de suavizado para reiniciar el filtro
    puntosRawBuffer.clear();
    ultimoPuntoSuavizado.clear();
    
    console.log('✅ Trayectorias limpiadas. Nuevos recorridos comenzarán desde cero.');
    mostrarNotificacion('🧹 Trayectorias limpiadas correctamente', 'success');
}

// Función para limpiar ruta histórica específica
function limpiarRutaHistorica(deviceId) {
    const ruta = rutasHistoricas.get(deviceId);
    if (!ruta) return;
    
    if (ruta.ruta) map.removeLayer(ruta.ruta);
    if (ruta.marcadorInicio) map.removeLayer(ruta.marcadorInicio);
    if (ruta.marcadorFin) map.removeLayer(ruta.marcadorFin);
    
    rutasHistoricas.delete(deviceId);
}

// Función para centrar en rutas históricas
function centrarEnRutasHistoricas() {
    if (rutasHistoricas.size === 0) return;
    
    const puntos = [];
    rutasHistoricas.forEach(ruta => {
        if (ruta.ubicaciones) {
            ruta.ubicaciones.forEach(ubicacion => {
                puntos.push(ubicacion);
            });
        }
    });
    
    if (puntos.length === 0) return;
    
    if (puntos.length === 1) {
        // Solo un punto
        map.setView([puntos[0].latitude, puntos[0].longitude], 16);
    } else {
        // Múltiples puntos
        const group = L.featureGroup();
        puntos.forEach(punto => {
            const marker = L.marker([punto.latitude, punto.longitude]);
            group.addLayer(marker);
        });
        map.fitBounds(group.getBounds());
    }
}

// Función para limpiar filtros
function limpiarFiltros() {
    document.getElementById('fechaInicio').value = '';
    document.getElementById('fechaFin').value = '';
    document.getElementById('dispositivoFiltro').value = '';
    
    // Limpiar rutas históricas del mapa
    limpiarMapa();
    
    // Volver al modo tiempo real
    modoTiempoReal = true;
    
    // Reconectar WebSocket si no está conectado
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        conectarWebSocket();
    }
    
    console.log('🔄 Filtros limpiados, volviendo al modo tiempo real');
}

// Función para aplicar filtros
function aplicarFiltros() {
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    const dispositivoId = document.getElementById('dispositivoFiltro').value;
    
    if (!fechaInicio || !fechaFin) {
        alert('Por favor, selecciona tanto la fecha de inicio como la de fin.');
        return;
    }
    
    // Cambiar a modo histórico
    modoTiempoReal = false;
    
    // Limpiar mapa actual
    limpiarMapa();
    
    // Construir parámetros de consulta
    const params = new URLSearchParams({
        start: fechaInicio,
        end: fechaFin
    });
    
    if (dispositivoId) {
        params.append('deviceId', dispositivoId);
    }
    
    // Realizar consulta al servidor
    fetch(`/api/locations/history?${params}`)
        .then(response => response.json())
        .then(data => {
            console.log('📊 Datos históricos recibidos:', data);
            
            if (data.length === 0) {
                alert('No se encontraron datos para el rango de fechas seleccionado.');
                return;
            }
            
            // Agrupar ubicaciones por dispositivo
            const ubicacionesPorDispositivo = new Map();
            data.forEach(ubicacion => {
                if (!ubicacionesPorDispositivo.has(ubicacion.deviceId)) {
                    ubicacionesPorDispositivo.set(ubicacion.deviceId, []);
                }
                ubicacionesPorDispositivo.get(ubicacion.deviceId).push(ubicacion);
            });
            
            // Mostrar rutas para cada dispositivo
            ubicacionesPorDispositivo.forEach((ubicaciones, deviceId) => {
                // Ordenar por timestamp
                ubicaciones.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                mostrarRutaHistorica(deviceId, ubicaciones);
            });
            
            // Centrar vista en las rutas
            setTimeout(() => {
                centrarEnRutasHistoricas();
            }, 500);
        })
        .catch(error => {
            console.error('❌ Error obteniendo datos históricos:', error);
            alert('Error al obtener los datos históricos. Por favor, inténtalo de nuevo.');
        });
}

// Función para volver al tiempo real
function volverTiempoReal() {
    limpiarFiltros();
}

// Función para actualizar el temporizador de sesión
function actualizarTemporizadorSesion() {
    const ahora = new Date();
    const tiempoTranscurrido = Math.floor((ahora - sessionStartTime) / 1000);
    
    const horas = Math.floor(tiempoTranscurrido / 3600);
    const minutos = Math.floor((tiempoTranscurrido % 3600) / 60);
    const segundos = tiempoTranscurrido % 60;
    
    const tiempoFormateado = `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    document.getElementById('sessionTime').textContent = tiempoFormateado;
}

// Función para cargar datos existentes de la base de datos
async function cargarDatosExistentes() {
    try {
        // Verificar que el mapa esté inicializado
        if (!map || !window.mapReady) {
            console.log('⏳ Esperando a que el mapa esté listo...');
            setTimeout(() => {
                cargarDatosExistentes();
            }, 200);
            return;
        }
        
        console.log('📊 Cargando datos existentes de la base de datos...');
        
        // Obtener dispositivos existentes con sus ubicaciones
        const responseDispositivos = await fetch('/api/dispositivos');
        if (responseDispositivos.ok) {
            const dispositivosData = await responseDispositivos.json();
            console.log('📱 Dispositivos encontrados:', dispositivosData.dispositivos ? dispositivosData.dispositivos.length : 0);
            
            // Verificar que existan dispositivos
            if (dispositivosData.dispositivos && dispositivosData.dispositivos.length > 0) {
                // Cargar cada dispositivo desde la respuesta (ya incluye ultimaUbicacion)
                for (const dispositivo of dispositivosData.dispositivos) {
                    if (dispositivo.ultimaUbicacion) {
                        console.log(`📍 Cargando ubicación para ${dispositivo.id}:`, dispositivo.ultimaUbicacion);
                        
                        // Procesar timestamp desde BD (puede ser string ISO)
                        let timestampUbicacion = dispositivo.ultimaUbicacion.timestamp;
                        if (typeof timestampUbicacion === 'string') {
                            timestampUbicacion = new Date(timestampUbicacion).getTime();
                        }
                        
                        // Crear datos de ubicación para mostrar en el mapa
                        const datosUbicacion = {
                            deviceId: dispositivo.id,
                            latitude: dispositivo.ultimaUbicacion.lat,
                            longitude: dispositivo.ultimaUbicacion.lon,
                            accuracy: dispositivo.ultimaUbicacion.accuracy || 5.0,
                            timestamp: timestampUbicacion,
                            source: 'database'
                        };
                        
                        // Actualizar la ubicación en el mapa
                        actualizarUbicacion(datosUbicacion);
                    } else {
                        console.warn(`⚠️ Dispositivo ${dispositivo.id} no tiene ubicación registrada`);
                    }
                }
                
                // Centrar el mapa en todos los dispositivos si hay datos
                setTimeout(() => {
                    centrarEnTodos();
                }, 1000);
            }
        }
        
        console.log('✅ Datos existentes cargados correctamente');
        console.log('📍 Trayectorias comenzarán cuando lleguen datos en tiempo real');
        
        // NO cargar historial - solo mostrar trayectorias de datos nuevos
        // await cargarHistorialUbicaciones();
        
    } catch (error) {
        console.error('❌ Error cargando datos existentes:', error);
    }
}

// Función para cargar historial completo de ubicaciones y dibujar trayectorias
async function cargarHistorialUbicaciones() {
    try {
        console.log('📜 Cargando historial de ubicaciones...');
        
        // Obtener últimas 500 ubicaciones de cada dispositivo para mostrar más recorrido
        const response = await fetch('/api/ubicaciones/historial?limit=500');
        if (!response.ok) {
            console.warn('⚠️ No se pudo cargar historial de ubicaciones');
            return;
        }
        
        const data = await response.json();
        
        if (data.ubicaciones && data.ubicaciones.length > 0) {
            console.log(`📍 Historial cargado: ${data.ubicaciones.length} ubicaciones`);
            
            // Agrupar ubicaciones por dispositivo
            const ubicacionesPorDispositivo = new Map();
            
            for (const ubicacion of data.ubicaciones) {
                if (!ubicacionesPorDispositivo.has(ubicacion.device_id)) {
                    ubicacionesPorDispositivo.set(ubicacion.device_id, []);
                }
                ubicacionesPorDispositivo.get(ubicacion.device_id).push(ubicacion);
            }
            
            // Dibujar trayectorias para cada dispositivo
            for (const [deviceId, ubicaciones] of ubicacionesPorDispositivo) {
                const dispositivo = dispositivos.get(deviceId);
                if (dispositivo && ubicaciones.length >= 2) {
                    console.log(`🛤️ Dibujando trayectoria histórica para ${deviceId}: ${ubicaciones.length} puntos`);
                    
                    // Ordenar por timestamp (más antiguo primero)
                    ubicaciones.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    
                    // Agregar puntos al historial SIN filtro Kalman (ya filtrados en Android)
                    const puntos = [];
                    for (const ub of ubicaciones) {
                        // NO aplicar suavizado al cargar historial - ya está filtrado
                        puntos.push([ub.latitude, ub.longitude]);
                    }
                    
                    // Guardar en puntosHistoricos (base del historial)
                    puntosHistoricos.set(deviceId, puntos);
                    
                    // Crear trayectoria si no existe
                    if (!trayectorias.has(deviceId) && dispositivo.visible) {
                        const trayectoria = L.polyline(puntos, {
                            color: dispositivo.color,
                            weight: 4,
                            opacity: 0.8,
                            smoothFactor: 2.0,
                            lineCap: 'round',
                            lineJoin: 'round'
                        }).addTo(map);
                        
                        trayectorias.set(deviceId, trayectoria);
                        console.log(`✅ Trayectoria histórica creada para ${deviceId} con ${puntos.length} puntos desde BD`);
                        console.log(`📈 Nuevos puntos en tiempo real se agregarán a esta trayectoria`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error cargando historial de ubicaciones:', error);
    }
}

// Funciones de búsqueda y navegación
async function buscarLugar(query) {
    try {
        console.log('🔍 Buscando:', query);
        
        // Usar el servidor backend como proxy para evitar CORS
        const response = await fetch(`/api/buscar-lugar?q=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const results = await response.json();
        console.log('🗺️ Resultados encontrados:', results.length);
        return results;
    } catch (error) {
        console.error('❌ Error en búsqueda:', error);
        alert('Error al buscar lugar. Verifica tu conexión e inténtalo de nuevo.');
        return [];
    }
}

function mostrarResultadosBusqueda(results) {
    const container = document.getElementById('searchResults');
    container.innerHTML = '';
    
    if (results.length === 0) {
        container.innerHTML = '<div style="padding: 10px; text-align: center; color: #6b7280; font-style: italic;">No se encontraron resultados para la búsqueda</div>';
        container.style.display = 'block';
        return;
    }
    
    console.log('📋 Mostrando', results.length, 'resultados');
    
    results.forEach((result, index) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        
        // Obtener nombre más legible
        const nombrePrincipal = result.name || result.display_name.split(',')[0];
        const direccionCompleta = result.display_name;
        
        item.innerHTML = `
            <div class="search-result-name">${nombrePrincipal}</div>
            <div class="search-result-address">${direccionCompleta}</div>
        `;
        
        item.addEventListener('click', () => {
            console.log('✅ Lugar seleccionado:', nombrePrincipal);
            seleccionarLugar(result);
            container.style.display = 'none';
        });
        
        // Agregar efecto hover
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#f3f4f6';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });
        
        container.appendChild(item);
    });
    
    container.style.display = 'block';
}

function seleccionarLugar(lugar) {
    const lat = parseFloat(lugar.lat);
    const lon = parseFloat(lugar.lon);
    
    console.log('📍 Seleccionando lugar:', lugar.name || lugar.display_name.split(',')[0]);
    console.log('📍 Coordenadas:', lat, lon);
    
    // Limpiar marcador anterior
    if (marcadorBusqueda) {
        map.removeLayer(marcadorBusqueda);
    }
    
    // Crear nuevo marcador con icono personalizado
    marcadorBusqueda = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'search-marker',
            html: '<div style="background: #dc3545; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">📍</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        })
    }).addTo(map);
    
    const nombreLugar = lugar.name || lugar.display_name.split(',')[0];
    
    marcadorBusqueda.bindPopup(`
        <div style="font-family: Arial, sans-serif; min-width: 200px;">
            <h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">${nombreLugar}</h4>
            <p style="margin: 4px 0; font-size: 12px; color: #666; line-height: 1.4;">${lugar.display_name}</p>
            <p style="margin: 4px 0; font-size: 12px;"><strong>Coordenadas:</strong> ${lat.toFixed(6)}, ${lon.toFixed(6)}</p>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <button onclick="establecerComoDestino('${nombreLugar.replace(/'/g, "\\'")}', ${lat}, ${lon})" 
                        style="padding: 6px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; flex: 1;">
                    🎯 Usar como destino
                </button>
                <button onclick="copiarCoordenadasLugar(${lat}, ${lon})" 
                        style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    📋 Copiar
                </button>
            </div>
        </div>
    `).openPopup();
    
    // Centrar mapa en el lugar con zoom apropiado
    map.setView([lat, lon], 16);
    
    // Limpiar campo de búsqueda
    document.getElementById('searchInput').value = '';
}

function establecerComoDestino(nombre, lat, lon) {
    document.getElementById('routeDestination').value = `${nombre} (${lat.toFixed(6)}, ${lon.toFixed(6)})`;
    coordenadasSeleccionadas = { lat, lon, nombre };
    
    // Habilitar botón de calcular ruta
    document.getElementById('calculateRoute').disabled = false;
    
    // Cerrar popup
    if (marcadorBusqueda) {
        marcadorBusqueda.closePopup();
    }
}

// Hacer la función global para que funcione desde los popups
window.establecerComoDestino = establecerComoDestino;

// Función para copiar coordenadas de un lugar específico
function copiarCoordenadasLugar(lat, lon) {
    const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    navigator.clipboard.writeText(coords).then(() => {
        // Mostrar notificación temporal
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 10px 15px;
            border-radius: 6px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        notification.textContent = '✓ Coordenadas copiadas al portapapeles';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 3000);
    }).catch(err => {
        console.error('Error copiando coordenadas:', err);
        alert(`Coordenadas: ${coords}`);
    });
}

// Hacer las funciones globales
window.copiarCoordenadasLugar = copiarCoordenadasLugar;

async function calcularRuta() {
    if (!coordenadasSeleccionadas) {
        alert('Por favor selecciona un destino primero usando la búsqueda');
        return;
    }
    
    // Obtener ubicación de origen (último dispositivo activo o más reciente)
    let origen = null;
    let dispositivoOrigen = null;
    
    // Buscar el dispositivo más reciente y visible
    for (const [deviceId, dispositivo] of dispositivos) {
        if (dispositivo.visible && dispositivo.ultimaUbicacion) {
            if (!origen || dispositivo.ultimaUbicacion.timestamp > origen.timestamp) {
                origen = dispositivo.ultimaUbicacion;
                dispositivoOrigen = deviceId;
            }
        }
    }
    
    if (!origen) {
        alert('No hay dispositivos activos para calcular la ruta. Asegúrate de que al menos un dispositivo esté visible y enviando ubicaciones.');
        return;
    }
    
    console.log('🚗 Calculando ruta desde dispositivo:', dispositivoOrigen);
    console.log('📍 Origen:', origen.latitude, origen.longitude);
    console.log('🎯 Destino:', coordenadasSeleccionadas.lat, coordenadasSeleccionadas.lon);
    
    try {
        // Mostrar indicador de carga
        const calcBtn = document.getElementById('calculateRoute');
        const originalText = calcBtn.textContent;
        calcBtn.textContent = '⏳ Calculando...';
        calcBtn.disabled = true;
        
        // Usar OSRM para cálculo de rutas con mejor configuración
        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${origen.longitude},${origen.latitude};${coordenadasSeleccionadas.lon},${coordenadasSeleccionadas.lat}?overview=full&geometries=geojson&steps=true&alternatives=false`,
            {
                headers: {
                    'User-Agent': 'GPS-Android-Web-App/1.0'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            console.log('✅ Ruta calculada exitosamente');
            mostrarRuta(data.routes[0]);
        } else {
            throw new Error('No se encontró una ruta válida');
        }
        
        // Restaurar botón
        calcBtn.textContent = originalText;
        calcBtn.disabled = false;
        
    } catch (error) {
        console.error('❌ Error calculando ruta:', error);
        alert(`Error al calcular la ruta: ${error.message}. Verifica que ambos puntos sean accesibles por carretera.`);
        
        // Restaurar botón
        const calcBtn = document.getElementById('calculateRoute');
        calcBtn.textContent = '🧭 Calcular Ruta';
        calcBtn.disabled = false;
    }
}

function mostrarRuta(ruta) {
    // Limpiar ruta anterior
    if (rutaActual) {
        map.removeLayer(rutaActual);
    }
    
    // Limpiar panel de información anterior
    const rutaInfoAnterior = document.querySelector('.route-info');
    if (rutaInfoAnterior) {
        rutaInfoAnterior.remove();
    }
    
    // Crear nueva ruta
    const coordinates = ruta.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    rutaActual = L.polyline(coordinates, {
        color: '#ff6b6b',
        weight: 5,
        opacity: 0.8,
        lineJoin: 'round',
        lineCap: 'round'
    }).addTo(map);
    
    // Agregar animación a la ruta
    rutaActual.on('add', function() {
        const pathElement = rutaActual.getElement();
        if (pathElement) {
            pathElement.style.strokeDasharray = '10, 5';
            pathElement.style.animation = 'dash 1s linear infinite';
        }
    });
    
    // Ajustar vista para mostrar toda la ruta con padding
    map.fitBounds(rutaActual.getBounds(), { 
        padding: [30, 30],
        maxZoom: 16 
    });
    
    // Calcular información de la ruta
    const distancia = (ruta.distance / 1000).toFixed(1);
    const duracion = Math.round(ruta.duration / 60);
    const horas = Math.floor(duracion / 60);
    const minutos = duracion % 60;
    
    let tiempoTexto;
    if (horas > 0) {
        tiempoTexto = `${horas}h ${minutos}min`;
    } else {
        tiempoTexto = `${minutos} min`;
    }
    
    // Crear panel de información mejorado
    const routeInfo = document.createElement('div');
    routeInfo.className = 'route-info';
    routeInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="font-size: 18px;">🗺️</span>
            <h4 style="margin: 0; color: #1f2937;">Información de Ruta</h4>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #059669;">📏</span>
                <span><strong>Distancia:</strong> ${distancia} km</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #dc2626;">⏱️</span>
                <span><strong>Tiempo estimado:</strong> ${tiempoTexto}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #7c3aed;">🎯</span>
                <span><strong>Destino:</strong> ${coordenadasSeleccionadas.nombre}</span>
            </div>
        </div>
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <button onclick="abrirEnGoogleMaps()" style="width: 100%; padding: 8px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                🗺️ Abrir en Google Maps
            </button>
        </div>
    `;
    
    // Agregar al mapa
    document.querySelector('.map-container').appendChild(routeInfo);
    
    // Habilitar botón de limpiar ruta
    document.getElementById('clearRoute').disabled = false;
    
    console.log(`✅ Ruta mostrada: ${distancia} km, ${tiempoTexto}`);
}

// Función para abrir en Google Maps
function abrirEnGoogleMaps() {
    if (!coordenadasSeleccionadas) return;
    
    // Obtener ubicación de origen
    let origen = null;
    for (const [deviceId, dispositivo] of dispositivos) {
        if (dispositivo.visible && dispositivo.ultimaUbicacion) {
            if (!origen || dispositivo.ultimaUbicacion.timestamp > origen.timestamp) {
                origen = dispositivo.ultimaUbicacion;
            }
        }
    }
    
    if (origen) {
        const url = `https://www.google.com/maps/dir/${origen.latitude},${origen.longitude}/${coordenadasSeleccionadas.lat},${coordenadasSeleccionadas.lon}`;
        window.open(url, '_blank');
    }
}

// Hacer la función global
window.abrirEnGoogleMaps = abrirEnGoogleMaps;

function limpiarRuta() {
    console.log('🧹 Limpiando ruta...');
    
    // Limpiar ruta del mapa
    if (rutaActual) {
        map.removeLayer(rutaActual);
        rutaActual = null;
        console.log('✅ Ruta removida del mapa');
    }
    
    // Limpiar panel de información
    const routeInfo = document.querySelector('.route-info');
    if (routeInfo) {
        routeInfo.remove();
        console.log('✅ Panel de información removido');
    }
    
    // Limpiar marcador de búsqueda si existe
    if (marcadorBusqueda) {
        map.removeLayer(marcadorBusqueda);
        marcadorBusqueda = null;
        console.log('✅ Marcador de búsqueda removido');
    }
    
    // Limpiar marcador de destino si existe
    if (marcadorDestino) {
        map.removeLayer(marcadorDestino);
        marcadorDestino = null;
        console.log('✅ Marcador de destino removido');
    }
    
    // Limpiar destino y coordenadas
    document.getElementById('routeDestination').value = '';
    document.getElementById('clickedCoordinates').textContent = 'Lat: --, Lon: --';
    document.getElementById('copyCoordinates').disabled = true;
    coordenadasSeleccionadas = null;
    window.lastClickedCoords = null;
    
    // Deshabilitar y actualizar botones
    const clearBtn = document.getElementById('clearRoute');
    const calcBtn = document.getElementById('calculateRoute');
    
    clearBtn.disabled = true;
    calcBtn.disabled = true;
    calcBtn.textContent = '🧭 Calcular Ruta';
    
    // Mostrar notificación temporal
    mostrarNotificacion('🧹 Ruta y marcadores limpiados', 'info');
    
    console.log('✅ Limpieza completada');
}

// Función auxiliar para mostrar notificaciones
function mostrarNotificacion(mensaje, tipo = 'success', duracion = 3000) {
    const notification = document.createElement('div');
    const backgroundColor = tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : '#3b82f6';
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${backgroundColor};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10001;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    notification.textContent = mensaje;
    document.body.appendChild(notification);
    
    // Auto-remove after specified duration
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.style.animation = 'slideOutRight 0.3s ease-in forwards';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }
    }, duracion);
}

// Agregar estilos para las animaciones si no existen
if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Variable global para el marcador de destino
let marcadorDestino = null;

function configurarEventosClick() {
    if (!map) return;
    
    map.on('click', function(e) {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        
        // Eliminar marcador anterior si existe
        if (marcadorDestino) {
            map.removeLayer(marcadorDestino);
        }
        
        // Crear nuevo marcador en el punto clickeado
        const iconoDestino = L.divIcon({
            className: 'custom-marker-destination',
            html: '<div style="background: #dc3545; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><div style="width: 10px; height: 10px; background: white; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(45deg);"></div></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        
        marcadorDestino = L.marker([lat, lon], { icon: iconoDestino })
            .addTo(map)
            .bindPopup(`<strong>📍 Destino Marcado</strong><br>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`);
        
        // Actualizar display de coordenadas
        document.getElementById('clickedCoordinates').textContent = `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`;
        document.getElementById('copyCoordinates').disabled = false;
        
        // Actualizar campo de destino
        document.getElementById('routeDestination').value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        document.getElementById('calculateRoute').disabled = false;
        document.getElementById('clearRoute').disabled = false;
        
        // Guardar coordenadas
        window.lastClickedCoords = { lat, lon };
        coordenadasSeleccionadas = { lat, lon };
        
        // Mostrar notificación
        mostrarNotificacion('📍 Punto marcado! Haz clic en "Ir a este punto" para crear la ruta', 3000);
    });
}

function copiarCoordenadas() {
    if (window.lastClickedCoords) {
        const coords = `${window.lastClickedCoords.lat.toFixed(6)}, ${window.lastClickedCoords.lon.toFixed(6)}`;
        navigator.clipboard.writeText(coords).then(() => {
            // Mostrar feedback visual
            const btn = document.getElementById('copyCoordinates');
            const originalText = btn.textContent;
            btn.textContent = '✓ Copiado';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Error copiando coordenadas:', err);
            alert('Error al copiar coordenadas');
        });
    }
}

// Inicialización cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Iniciando aplicación GPS Android...');
    
    // Inicializar el mapa primero
    initMap();
    
    // Configurar eventos de botones
    document.getElementById('toggleAll').addEventListener('click', toggleTodosDispositivos);
    document.getElementById('centerAll').addEventListener('click', centrarEnTodos);
    document.getElementById('clearTrajectories').addEventListener('click', limpiarTrayectorias);
    
    // Configurar eventos de búsqueda y navegación
    console.log('🔧 Configurando eventos de búsqueda...');
    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');
    
    if (!searchButton) {
        console.error('❌ ERROR: No se encontró el botón searchButton');
        alert('ERROR: Botón de búsqueda no encontrado. Recarga la página.');
        return;
    }
    
    if (!searchInput) {
        console.error('❌ ERROR: No se encontró el input searchInput');
        alert('ERROR: Campo de búsqueda no encontrado. Recarga la página.');
        return;
    }
    
    console.log('✅ Elementos de búsqueda encontrados correctamente');
    
    searchButton.addEventListener('click', async function() {
        console.log('🔍 Click en botón de búsqueda detectado');
        const query = searchInput.value.trim();
        console.log('📝 Query ingresado:', query);
        
        if (!query) {
            alert('Por favor ingresa un lugar para buscar');
            return;
        }
        
        if (query) {
            this.textContent = '🔍 Buscando...';
            this.disabled = true;
            try {
                console.log('📡 Llamando a buscarLugar()...');
                const results = await buscarLugar(query);
                console.log('📦 Resultados recibidos:', results.length);
                mostrarResultadosBusqueda(results);
            } catch (error) {
                console.error('❌ Error en búsqueda:', error);
                alert('Error al buscar: ' + error.message);
            } finally {
                this.textContent = 'Buscar';
                this.disabled = false;
            }
        }
    });
    
    searchInput.addEventListener('keypress', async function(e) {
        if (e.key === 'Enter') {
            console.log('⌨️ Enter presionado en campo de búsqueda');
            const query = this.value.trim();
            console.log('📝 Query:', query);
            
            if (!query) {
                alert('Por favor ingresa un lugar para buscar');
                return;
            }
            
            if (query) {
                const searchBtn = document.getElementById('searchButton');
                searchBtn.textContent = '🔍 Buscando...';
                searchBtn.disabled = true;
                try {
                    console.log('📡 Llamando a buscarLugar() desde Enter...');
                    const results = await buscarLugar(query);
                    console.log('📦 Resultados:', results.length);
                    mostrarResultadosBusqueda(results);
                } catch (error) {
                    console.error('❌ Error:', error);
                    alert('Error al buscar: ' + error.message);
                } finally {
                    searchBtn.textContent = 'Buscar';
                    searchBtn.disabled = false;
                }
            }
        }
    });
    
    document.getElementById('searchInput').addEventListener('input', function() {
        if (this.value.trim().length === 0) {
            document.getElementById('searchResults').style.display = 'none';
        }
    });
    
    document.getElementById('calculateRoute').addEventListener('click', calcularRuta);
    document.getElementById('clearRoute').addEventListener('click', limpiarRuta);
    document.getElementById('copyCoordinates').addEventListener('click', copiarCoordenadas);
    
    // Configurar eventos de clic en el mapa
    setTimeout(configurarEventosClick, 1000);
    
    // Iniciar temporizador de sesión
    sessionTimer = setInterval(actualizarTemporizadorSesion, 1000);
    
    // Conectar WebSocket
    conectarWebSocket();
    
    // Sistema de verificación de inactividad DESACTIVADO
    // Los dispositivos NO se desconectan automáticamente
    // iniciarVerificacionInactividad();
    console.log('ℹ️ Sistema de desconexión automática por inactividad DESACTIVADO');
    
    // Actualizar información del servidor dinámicamente
    actualizarInfoServidor();
    
    console.log('✅ Aplicación inicializada correctamente');
    
    // Los datos existentes se cargarán automáticamente desde initMapFallback
});

// Función para actualizar la información del servidor
async function actualizarInfoServidor() {
    try {
        // Obtener información del servidor desde el endpoint
        const response = await fetch('/api/server-info');
        if (response.ok) {
            const serverInfo = await response.json();
            
            // Actualizar la información en la interfaz
            const serverInfoElement = document.getElementById('serverInfo');
            if (serverInfoElement) {
                let displayText = '';
                
                // URL del túnel estática (no cambia)
                const tunnelUrlEstatica = 'https://gps-tracking-static.loca.lt';
                
                // Determinar qué IP mostrar - siempre mostrar IP de instancia y puerto
                if (serverInfo.servidor.tipo === 'AWS EC2' && serverInfo.ipPublica) {
                    // Para AWS, mostrar la IP pública de la instancia
                    displayText = `AWS: ${serverInfo.ipPublica}:${serverInfo.puerto} | Túnel: ${tunnelUrlEstatica}`;
                } else if (serverInfo.ipPublica) {
                    // Si hay IP pública disponible, mostrarla
                    displayText = `Servidor: ${serverInfo.ipPublica}:${serverInfo.puerto} | Túnel: ${tunnelUrlEstatica}`;
                } else {
                    // Fallback a IP local
                    displayText = `Local: ${serverInfo.ipLocal}:${serverInfo.puerto} | Túnel: ${tunnelUrlEstatica}`;
                }
                
                serverInfoElement.textContent = displayText;
                console.log('📡 Información del servidor actualizada:', displayText);
            }
        } else {
            console.warn('⚠️  No se pudo obtener información del servidor');
        }
    } catch (error) {
        console.error('❌ Error actualizando información del servidor:', error);
        
        // Fallback: mostrar información básica con túnel estático
        const serverInfoElement = document.getElementById('serverInfo');
        if (serverInfoElement) {
            const currentHost = window.location.hostname;
            const currentPort = window.location.port || '3000';
            const tunnelUrlEstatica = 'https://gps-tracking-static.loca.lt';
            serverInfoElement.textContent = `Servidor: ${currentHost}:${currentPort} | Túnel: ${tunnelUrlEstatica}`;
        }
    }
}

// Inicialización completada - solo usando Leaflet