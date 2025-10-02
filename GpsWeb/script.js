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
let coloresDispositivos = ['#007bff', '#28a745', '#dc3545', '#ffc107', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c'];
let contadorColores = 0;

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
                console.log('📍 Mensaje recibido:', mensaje);
                
                if (modoTiempoReal && mensaje.datos && mensaje.datos.ubicacion) {
                    // Extraer datos de ubicación del formato del servidor
                    const ubicacion = mensaje.datos.ubicacion;
                    const dispositivo = mensaje.datos.dispositivo;
                    
                    // Asegurar que el timestamp sea un número válido
                    let timestamp = ubicacion.timestamp;
                    if (typeof timestamp === 'string') {
                        timestamp = parseInt(timestamp);
                    }
                    if (!timestamp || isNaN(timestamp)) {
                        timestamp = Date.now();
                    }
                    
                    console.log('🕐 Timestamp original:', ubicacion.timestamp, 'Tipo:', typeof ubicacion.timestamp);
                    console.log('🕐 Timestamp procesado:', timestamp, 'Fecha:', new Date(timestamp).toLocaleString('es-ES'));
                    
                    const datosFormateados = {
                        deviceId: ubicacion.deviceId,
                        latitude: ubicacion.lat,
                        longitude: ubicacion.lon,
                        accuracy: ubicacion.accuracy,
                        timestamp: timestamp
                    };
                    
                    console.log('📍 Datos formateados:', datosFormateados);
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

// Función para actualizar la ubicación en el mapa
function actualizarUbicacion(data) {
    const { deviceId, latitude, longitude, accuracy, timestamp } = data;
    
    // Validar y procesar timestamp
    let timestampValido = timestamp;
    if (!timestampValido || isNaN(timestampValido)) {
        console.warn('⚠️ Timestamp inválido, usando timestamp actual');
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
    
    console.log('🕐 Actualizando ubicación - Timestamp:', timestampValido, 'Fecha formateada:', fechaFormateada);
    
    // Actualizar contadores
    totalUpdates++;
    accuracySum += accuracy;
    
    // Actualizar estadísticas en la interfaz
    document.getElementById('totalUpdates').textContent = totalUpdates;
    document.getElementById('avgAccuracy').textContent = `${(accuracySum / totalUpdates).toFixed(1)}m`;
    document.getElementById('activeDevices').textContent = dispositivos.size;
    document.getElementById('lastUpdate').textContent = fechaFormateada;
    
    // Actualizar información del dispositivo
    if (!dispositivos.has(deviceId)) {
        const color = obtenerSiguienteColor();
        dispositivos.set(deviceId, {
            id: deviceId,
            color: color,
            ultimaUbicacion: { latitude, longitude, accuracy, timestamp: timestampValido },
            visible: true
        });
        dispositivosVisibles.add(deviceId);
        
        // Crear elemento en la lista de dispositivos
        crearElementoDispositivo(deviceId, color);
    } else {
        // Actualizar ubicación existente
        const dispositivo = dispositivos.get(deviceId);
        dispositivo.ultimaUbicacion = { latitude, longitude, accuracy, timestamp: timestampValido };
    }
    
    // Actualizar marcador en el mapa
    actualizarMarcadorDispositivo(deviceId, latitude, longitude, accuracy, timestampValido);
    
    // Actualizar información en el panel
    document.getElementById('latitud').textContent = latitude.toFixed(6);
    document.getElementById('longitud').textContent = longitude.toFixed(6);
    document.getElementById('precision').textContent = `${accuracy}m`;
    document.getElementById('timestamp').textContent = fechaFormateada;
}

// Función para crear elemento de dispositivo en la lista
function crearElementoDispositivo(deviceId, color) {
    const deviceList = document.getElementById('deviceList');
    
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
}

// Función para actualizar marcador de dispositivo
function actualizarMarcadorDispositivo(deviceId, latitude, longitude, accuracy, timestamp) {
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
        
        // Agregar popup con información
        marcador.bindPopup(`
            <div style="font-family: Arial, sans-serif;">
                <h4 style="margin: 0 0 8px 0; color: #333;">Dispositivo ${deviceId}</h4>
                <p style="margin: 4px 0;"><strong>Latitud:</strong> ${latitude.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Longitud:</strong> ${longitude.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Precisión:</strong> ${accuracy}m</p>
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
        
        // Actualizar popup
        marcador.setPopupContent(`
            <div style="font-family: Arial, sans-serif;">
                <h4 style="margin: 0 0 8px 0; color: #333;">Dispositivo ${deviceId}</h4>
                <p style="margin: 4px 0;"><strong>Latitud:</strong> ${latitude.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Longitud:</strong> ${longitude.toFixed(6)}</p>
                <p style="margin: 4px 0;"><strong>Precisión:</strong> ${accuracy}m</p>
                <p style="margin: 4px 0;"><strong>Fecha y Hora:</strong> ${fechaHoraActualizada}</p>
            </div>
        `);
    }
}

// Función para alternar visibilidad de dispositivo
function toggleDispositivo(deviceId) {
    const dispositivo = dispositivos.get(deviceId);
    if (!dispositivo) return;
    
    const toggle = document.querySelector(`#device-${deviceId} .device-toggle`);
    const marcador = marcadores.get(deviceId);
    const circulo = circulos.get(deviceId);
    
    if (dispositivo.visible) {
        // Ocultar dispositivo
        dispositivo.visible = false;
        dispositivosVisibles.delete(deviceId);
        toggle.classList.remove('active');
        
        if (marcador) map.removeLayer(marcador);
        if (circulo) map.removeLayer(circulo);
    } else {
        // Mostrar dispositivo
        dispositivo.visible = true;
        dispositivosVisibles.add(deviceId);
        toggle.classList.add('active');
        
        if (marcador) marcador.addTo(map);
        if (circulo) circulo.addTo(map);
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

// Función para limpiar el mapa
function limpiarMapa() {
    // Limpiar marcadores de tiempo real
    marcadores.forEach(marcador => {
        map.removeLayer(marcador);
    });
    
    // Limpiar círculos de precisión
    circulos.forEach(circulo => {
        map.removeLayer(circulo);
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
    rutasHistoricas.clear();
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
        
        // Obtener dispositivos existentes
        const responseDispositivos = await fetch('/api/dispositivos');
        if (responseDispositivos.ok) {
            const dispositivosData = await responseDispositivos.json();
            console.log('📱 Dispositivos encontrados:', dispositivosData.dispositivos ? dispositivosData.dispositivos.length : 0);
            
            // Verificar que existan dispositivos
            if (dispositivosData.dispositivos && dispositivosData.dispositivos.length > 0) {
                // Cargar cada dispositivo
                for (const dispositivo of dispositivosData.dispositivos) {
                // Obtener la última ubicación de cada dispositivo
                const responseUbicacion = await fetch(`/api/dispositivos/${dispositivo.id}`);
                if (responseUbicacion.ok) {
                    const ubicacionData = await responseUbicacion.json();
                    if (ubicacionData.ultimaUbicacion) {
                        console.log(`📍 Cargando ubicación para ${dispositivo.id}:`, ubicacionData.ultimaUbicacion);
                        
                        // Simular datos de ubicación para mostrar en el mapa
                        const datosUbicacion = {
                            deviceId: dispositivo.id,
                            latitude: ubicacionData.ultimaUbicacion.lat,
                            longitude: ubicacionData.ultimaUbicacion.lon,
                            accuracy: ubicacionData.ultimaUbicacion.accuracy || 5.0,
                            timestamp: ubicacionData.ultimaUbicacion.timestamp,
                            source: 'database'
                        };
                        
                        // Actualizar la ubicación en el mapa
                        actualizarUbicacion(datosUbicacion);
                    }
                }
                
                }
                
                // Centrar el mapa en todos los dispositivos si hay datos
                setTimeout(() => {
                    centrarEnTodos();
                }, 1000);
            }
        }
        
        console.log('✅ Datos existentes cargados correctamente');
    } catch (error) {
        console.error('❌ Error cargando datos existentes:', error);
    }
}

// Funciones de búsqueda y navegación
async function buscarLugar(query) {
    try {
        console.log('🔍 Buscando:', query);
        
        // Usar Nominatim de OpenStreetMap para búsqueda con User-Agent
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&countrycodes=pe`, {
            headers: {
                'User-Agent': 'GPS-Android-Web-App/1.0 (contact@example.com)'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const results = await response.json();
        console.log('🗺️ Resultados encontrados:', results.length);
        return results;
    } catch (error) {
        console.error('❌ Error en búsqueda:', error);
        alert('Error al buscar lugar. Por favor, inténtalo de nuevo.');
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
    
    // Iniciar temporizador de sesión
    sessionTimer = setInterval(actualizarTemporizadorSesion, 1000);
    
    // Conectar WebSocket
    conectarWebSocket();
    
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