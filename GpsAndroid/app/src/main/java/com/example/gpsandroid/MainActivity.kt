package com.example.gpsandroid

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.*
import java.text.SimpleDateFormat
import java.util.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import android.util.Log
import android.content.ComponentName
import android.content.ServiceConnection
import android.os.IBinder

@Serializable
data class GpsData(
    val deviceId: String,
    val deviceName: String,
    val lat: Double,
    val lon: Double,
    val accuracy: Float,
    val timestamp: String
)

// Clases de datos para búsqueda y navegación
data class LugarBusqueda(
    val nombre: String,
    val direccion: String,
    val lat: Double,
    val lon: Double
)

data class RutaInfo(
    val distancia: String,
    val duracion: String,
    val instrucciones: List<String>
)

class MainActivity : ComponentActivity() {
    
    // Cliente de ubicación de Google Play Services
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var locationRequest: LocationRequest
    
    // Estados para la UI
    private var latitud by mutableStateOf("--")
    private var longitud by mutableStateOf("--")
    private var precision by mutableStateOf("--")
    private var ultimaActualizacion by mutableStateOf("--")
    private var tienePermisos by mutableStateOf(false)
    private var gpsActivado by mutableStateOf(false)
    private var servicioEnSegundoPlano by mutableStateOf(false)
    
    // Variables para búsqueda y navegación
    private var textoBusqueda by mutableStateOf("")
    private var resultadosBusqueda by mutableStateOf<List<LugarBusqueda>>(emptyList())
    private var mostrandoResultados by mutableStateOf(false)
    private var coordenadasSeleccionadas by mutableStateOf<Pair<Double, Double>?>(null)
    private var nombreLugarSeleccionado by mutableStateOf("")
    private var calculandoRuta by mutableStateOf(false)
    private var rutaCalculada by mutableStateOf<RutaInfo?>(null)
    
    // Cliente HTTP para enviar datos al servidor
    private val httpClient = OkHttpClient()
    private val serverUrl = "https://kickless-anamaria-nonwaxing.ngrok-free.dev/api/ubicacion" // URL del túnel ngrok
    
    // Generar ID único y persistente del dispositivo
    private fun getUniqueDeviceId(): String {
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return "android_device_${android.os.Build.MODEL}_${androidId}"
    }
    
    private val deviceId by lazy { getUniqueDeviceId() }
    private val deviceName = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
    
    // Launcher para solicitar permisos
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        tienePermisos = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        
        if (tienePermisos) {
            verificarGpsYComenzarActualizaciones()
            // Iniciar servicio en segundo plano
            iniciarServicioSegundoPlano()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Inicializar cliente de ubicación
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        
        // Iniciar servicio GPS en segundo plano
        iniciarServicioGps()
        
        // Configurar solicitud de ubicación con máxima precisión
        locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000)
            .setWaitForAccurateLocation(true) // Esperar ubicaciones más precisas
            .setMinUpdateIntervalMillis(500) // Mínimo 500ms entre actualizaciones
            .setMaxUpdateDelayMillis(2000) // Máximo 2 segundos de retraso
            .setMinUpdateDistanceMeters(1.0f) // Solo actualizar si se mueve al menos 1 metro
            .setMaxUpdates(Integer.MAX_VALUE) // Sin límite de actualizaciones
            .build()
        
        // Callback para recibir actualizaciones de ubicación
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationResult.lastLocation?.let { location ->
                    // Filtrar ubicaciones incoherentes
                    if (esUbicacionValida(location)) {
                        latitud = String.format("%.6f", location.latitude)
                        longitud = String.format("%.6f", location.longitude)
                        precision = String.format("%.1f metros", location.accuracy)
                        
                        val formatter = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault())
                        ultimaActualizacion = formatter.format(Date())
                        
                        // Actualizar última ubicación válida
                        ultimaUbicacionValida = location
                        ultimoTiempoUbicacion = System.currentTimeMillis()
                        
                        // Enviar datos GPS al servidor
                        enviarDatosGpsAlServidor(location)
                        
                        Log.d("GPS_SENDER", "Ubicación válida enviada: ${location.latitude}, ${location.longitude}, precisión: ${location.accuracy}m")
                    } else {
                        Log.d("GPS_SENDER", "Ubicación rechazada por filtros de validación")
                    }
                }
            }
        }
        
        // Verificar permisos iniciales
        verificarPermisos()
        
        setContent {
            GpsAndroidTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    PantallaGps()
                }
            }
        }
    }
    
    @Composable
    fun GpsAndroidTheme(content: @Composable () -> Unit) {
        MaterialTheme(
            colorScheme = lightColorScheme(),
            content = content
        )
    }
    
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    fun PantallaGps() {
        val context = LocalContext.current
        
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Título de la aplicación
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Text(
                    text = "📍 GPS Tracker",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
            
            // Verificar estado de permisos y GPS
            when {
                !tienePermisos -> {
                    // Mostrar mensaje y botón para solicitar permisos
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "⚠️ Permisos Requeridos",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Esta aplicación necesita acceso a la ubicación para funcionar correctamente.",
                                textAlign = TextAlign.Center,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = { solicitarPermisos() },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.error
                                )
                            ) {
                                Text("Conceder Permisos")
                            }
                        }
                    }
                }
                
                !gpsActivado -> {
                    // Mostrar mensaje y botón para activar GPS
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.tertiaryContainer
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "📡 GPS Desactivado",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onTertiaryContainer
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Por favor, activa el GPS en la configuración del dispositivo.",
                                textAlign = TextAlign.Center,
                                color = MaterialTheme.colorScheme.onTertiaryContainer
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = { abrirConfiguracionUbicacion(context) },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.tertiary
                                )
                            ) {
                                Text("Abrir Configuración")
                            }
                        }
                    }
                }
                
                else -> {
                    // Mostrar información de ubicación
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Text(
                                text = "📍 Ubicación Actual",
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSecondaryContainer,
                                modifier = Modifier.padding(bottom = 16.dp)
                            )
                            
                            // Latitud
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Latitud:",
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                                Text(
                                    text = latitud,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                            }
                            
                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                            
                            // Longitud
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Longitud:",
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                                Text(
                                    text = longitud,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                            }
                            
                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                            
                            // Precisión
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Precisión:",
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                                Text(
                                    text = precision,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                            }
                            
                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                            
                            // Última actualización
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Última actualización:",
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                                Text(
                                    text = ultimaActualizacion,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                            }
                        }
                    }
                    
                    // Botón para abrir Google Maps
                    Button(
                        onClick = { abrirGoogleMaps(context) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        )
                    ) {
                        Text(
                            text = "🗺️ Abrir en Google Maps",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    
                    // Panel de búsqueda y navegación
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.tertiaryContainer
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Text(
                                text = "🔍 Búsqueda y Navegación",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                                modifier = Modifier.padding(bottom = 12.dp)
                            )
                            
                            // Campo de búsqueda
                            OutlinedTextField(
                                value = textoBusqueda,
                                onValueChange = { textoBusqueda = it },
                                label = { Text("Buscar lugar o dirección") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                trailingIcon = {
                                    IconButton(
                                        onClick = { buscarLugar() }
                                    ) {
                                        Text("🔍")
                                    }
                                }
                            )
                            
                            Spacer(modifier = Modifier.height(8.dp))
                            
                            // Botones de acción
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { buscarLugar() },
                                    modifier = Modifier.weight(1f),
                                    enabled = textoBusqueda.isNotBlank()
                                ) {
                                    Text("Buscar")
                                }
                                
                                Button(
                                    onClick = { obtenerCoordenadasActuales() },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Mis Coordenadas")
                                }
                            }
                            
                            // Mostrar coordenadas seleccionadas
                            coordenadasSeleccionadas?.let { coords ->
                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 8.dp),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.primaryContainer
                                    )
                                ) {
                                    Column(
                                        modifier = Modifier.padding(12.dp)
                                    ) {
                                        Text(
                                            text = "📍 Lugar seleccionado:",
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                        if (nombreLugarSeleccionado.isNotEmpty()) {
                                            Text(
                                                text = nombreLugarSeleccionado,
                                                color = MaterialTheme.colorScheme.onPrimaryContainer
                                            )
                                        }
                                        Text(
                                            text = "Lat: ${String.format("%.6f", coords.first)}",
                                            color = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                        Text(
                                            text = "Lon: ${String.format("%.6f", coords.second)}",
                                            color = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                        
                                        Spacer(modifier = Modifier.height(8.dp))
                                        
                                        Button(
                                            onClick = { calcularRuta() },
                                            modifier = Modifier.fillMaxWidth(),
                                            enabled = !calculandoRuta && latitud != "--"
                                        ) {
                                            if (calculandoRuta) {
                                                Text("Calculando...")
                                            } else {
                                                Text("🧭 Calcular Ruta")
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Mostrar información de ruta
                            rutaCalculada?.let { ruta ->
                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 8.dp),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                                    )
                                ) {
                                    Column(
                                        modifier = Modifier.padding(12.dp)
                                    ) {
                                        Text(
                                            text = "🗺️ Información de Ruta:",
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSecondaryContainer
                                        )
                                        Text(
                                            text = "Distancia: ${ruta.distancia}",
                                            color = MaterialTheme.colorScheme.onSecondaryContainer
                                        )
                                        Text(
                                            text = "Duración: ${ruta.duracion}",
                                            color = MaterialTheme.colorScheme.onSecondaryContainer
                                        )
                                        
                                        Button(
                                            onClick = { abrirNavegacionGoogleMaps(context) },
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(top = 8.dp)
                                        ) {
                                            Text("🧭 Navegar en Google Maps")
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Mostrar resultados de búsqueda
                    if (mostrandoResultados && resultadosBusqueda.isNotEmpty()) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp)
                            ) {
                                Text(
                                    text = "📍 Resultados de búsqueda:",
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(bottom = 8.dp)
                                )
                                
                                resultadosBusqueda.take(3).forEach { lugar ->
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 2.dp),
                                        onClick = { seleccionarLugar(lugar) }
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(12.dp)
                                        ) {
                                            Text(
                                                text = lugar.nombre,
                                                fontWeight = FontWeight.Medium
                                            )
                                            Text(
                                                text = lugar.direccion,
                                                fontSize = 12.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                                
                                Button(
                                    onClick = { mostrandoResultados = false },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 8.dp)
                                ) {
                                    Text("Cerrar resultados")
                                }
                            }
                        }
                    }
                    
                    // Botón para controlar servicio en segundo plano
                    Button(
                        onClick = {
                            if (servicioEnSegundoPlano) {
                                detenerServicioGps()
                            } else {
                                iniciarServicioSegundoPlano()
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (servicioEnSegundoPlano) 
                                MaterialTheme.colorScheme.error 
                            else 
                                MaterialTheme.colorScheme.tertiary
                        )
                    ) {
                        Text(
                            text = if (servicioEnSegundoPlano) 
                                "⏹️ Detener Servicio en Segundo Plano" 
                            else 
                                "▶️ Iniciar Servicio en Segundo Plano",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    
                    // Indicador de estado del servicio
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = if (servicioEnSegundoPlano) 
                                MaterialTheme.colorScheme.primaryContainer 
                            else 
                                MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = if (servicioEnSegundoPlano) 
                                    "🟢 Servicio activo en segundo plano" 
                                else 
                                    "🔴 Servicio inactivo",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                color = if (servicioEnSegundoPlano) 
                                    MaterialTheme.colorScheme.onPrimaryContainer 
                                else 
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            
            Spacer(modifier = Modifier.weight(1f))
            
            // Información del autor
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Text(
                    text = "App desarrollada por\nEdmil Jampier Saire Busatamante\nCódigo 174449",
                    textAlign = TextAlign.Center,
                    fontSize = 14.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
    
    private fun verificarPermisos() {
        tienePermisos = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        if (tienePermisos) {
            verificarGpsYComenzarActualizaciones()
        }
    }
    
    private fun solicitarPermisos() {
        requestPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )
    }
    
    private fun verificarGpsYComenzarActualizaciones() {
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        gpsActivado = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        
        if (gpsActivado && tienePermisos) {
            comenzarActualizacionesUbicacion()
        }
    }
    
    private fun comenzarActualizacionesUbicacion() {
        if (ActivityCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
        }
    }
    
    private fun abrirConfiguracionUbicacion(context: Context) {
        val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
        context.startActivity(intent)
    }
    
    private fun abrirGoogleMaps(context: Context) {
        if (latitud != "--" && longitud != "--") {
            val uri = Uri.parse("geo:$latitud,$longitud?q=$latitud,$longitud(Mi Ubicación)")
            val intent = Intent(Intent.ACTION_VIEW, uri)
            intent.setPackage("com.google.android.apps.maps")
            
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
            } else {
                // Si Google Maps no está instalado, abrir en el navegador
                val webUri = Uri.parse("https://maps.google.com/?q=$latitud,$longitud")
                val webIntent = Intent(Intent.ACTION_VIEW, webUri)
                context.startActivity(webIntent)
            }
        }
    }
    
    // Variables para validación de ubicaciones
    private var ultimaUbicacionValida: android.location.Location? = null
    private var ultimoTiempoUbicacion: Long = 0
    private val PRECISION_MAXIMA = 50.0f // Máxima precisión aceptable en metros
    private val VELOCIDAD_MAXIMA = 55.5f // Velocidad máxima aceptable en m/s (200 km/h)
    private val DISTANCIA_MAXIMA_SALTO = 1000.0f // Máxima distancia de salto en metros
    
    /**
     * Valida si una ubicación es coherente y precisa
     */
    private fun esUbicacionValida(location: android.location.Location): Boolean {
        // Verificar precisión básica - más estricta
        if (location.accuracy > 30.0f) { // Reducido de 50 a 30 metros
            Log.w("GPS_VALIDATION", "Ubicación rechazada por baja precisión: ${location.accuracy}m")
            return false
        }
        
        // Verificar coordenadas válidas
        if (location.latitude == 0.0 && location.longitude == 0.0) {
            Log.w("GPS_VALIDATION", "Ubicación rechazada por coordenadas nulas")
            return false
        }
        
        // Verificar rango de coordenadas válidas
        if (location.latitude < -90 || location.latitude > 90 || 
            location.longitude < -180 || location.longitude > 180) {
            Log.w("GPS_VALIDATION", "Ubicación rechazada por coordenadas fuera de rango")
            return false
        }
        
        // Verificar que no sea una ubicación mock (si está disponible)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR2) {
            if (location.isFromMockProvider) {
                Log.w("GPS_VALIDATION", "Ubicación rechazada: es una ubicación simulada")
                return false
            }
        }
        
        // Verificar que tenga un proveedor válido
        if (location.provider.isNullOrEmpty() || 
            (!location.provider.equals(android.location.LocationManager.GPS_PROVIDER) && 
             !location.provider.equals("fused"))) {
            Log.w("GPS_VALIDATION", "Ubicación rechazada: proveedor no confiable (${location.provider})")
            return false
        }
        
        // Verificar edad de la ubicación (no más de 15 segundos)
        val tiempoActual = System.currentTimeMillis()
        val tiempoUbicacion = location.time
        val diferenciaTiempo = tiempoActual - tiempoUbicacion
        
        if (diferenciaTiempo > 15000) { // Reducido de 30 a 15 segundos
            Log.w("GPS_VALIDATION", "Ubicación rechazada por ser muy antigua: ${diferenciaTiempo}ms")
            return false
        }
        
        // Verificar velocidad máxima razonable (120 km/h = 33.33 m/s)
        if (location.hasSpeed() && location.speed > 33.33f) {
            Log.w("GPS_VALIDATION", "Ubicación rechazada: velocidad muy alta (${location.speed} m/s)")
            return false
        }
        
        ultimaUbicacionValida?.let { ultimaUbicacion ->
            val tiempoTranscurrido = (System.currentTimeMillis() - ultimoTiempoUbicacion) / 1000.0f // en segundos
            val distancia = ultimaUbicacion.distanceTo(location)
            
            // Verificar saltos de distancia excesivos - más estricto
            if (distancia > 500.0f && tiempoTranscurrido < 15) { // Reducido de 1000m a 500m
                Log.w("GPS_VALIDATION", "Ubicación rechazada por salto de distancia: ${distancia}m en ${tiempoTranscurrido}s")
                return false
            }
            
            // Verificar velocidad excesiva - más estricto
            if (tiempoTranscurrido > 0) {
                val velocidad = distancia / tiempoTranscurrido
                if (velocidad > 27.78f) { // 100 km/h = 27.78 m/s, más estricto que antes
                    Log.w("GPS_VALIDATION", "Ubicación rechazada por velocidad excesiva: ${velocidad}m/s")
                    return false
                }
            }
            
            // Verificar movimientos muy pequeños (ruido GPS)
            if (distancia < 1.0 && tiempoTranscurrido < 5) {
                Log.w("GPS_VALIDATION", "Ubicación rechazada: movimiento muy pequeño (ruido GPS)")
                return false
            }
        }
        
        // Si pasa todas las validaciones, actualizar la última ubicación válida
        ultimaUbicacionValida = location
        ultimoTiempoUbicacion = System.currentTimeMillis()
        return true
    }
    
    private fun enviarDatosGpsAlServidor(location: android.location.Location) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
                formatter.timeZone = TimeZone.getTimeZone("UTC")
                
                val gpsData = GpsData(
                    deviceId = deviceId,
                    deviceName = deviceName,
                    lat = location.latitude,
                    lon = location.longitude,
                    accuracy = location.accuracy,
                    timestamp = formatter.format(Date())
                )
                
                val json = Json.encodeToString(gpsData)
                val requestBody = json.toRequestBody("application/json".toMediaType())
                
                val request = Request.Builder()
                    .url(serverUrl)
                    .post(requestBody)
                    .addHeader("Content-Type", "application/json")
                    .build()
                
                val response = httpClient.newCall(request).execute()
                
                if (response.isSuccessful) {
                    Log.d("GPS_SENDER", "Datos GPS enviados exitosamente: ${response.code}")
                } else {
                    Log.e("GPS_SENDER", "Error enviando datos GPS: ${response.code} - ${response.message}")
                }
                
                response.close()
                
            } catch (e: Exception) {
                Log.e("GPS_SENDER", "Excepción enviando datos GPS: ${e.message}", e)
            }
        }
    }
    
    override fun onResume() {
        super.onResume()
        // Verificar permisos cada vez que la aplicación regresa al primer plano
        // Esto es importante porque el usuario puede haber cambiado los permisos desde configuración
        verificarPermisos()
        if (tienePermisos) {
            verificarGpsYComenzarActualizaciones()
        }
    }
    
    override fun onPause() {
        super.onPause()
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // El servicio continúa ejecutándose en segundo plano
    }
    
    // Funciones para búsqueda y navegación
    private fun buscarLugar() {
        if (textoBusqueda.isBlank()) return
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = "https://nominatim.openstreetmap.org/search?format=json&q=${textoBusqueda}&limit=5"
                val request = Request.Builder()
                    .url(url)
                    .addHeader("User-Agent", "GpsAndroid/1.0")
                    .build()
                
                val response = httpClient.newCall(request).execute()
                val responseBody = response.body?.string()
                
                if (response.isSuccessful && responseBody != null) {
                    // Parsear respuesta JSON manualmente (simplificado)
                    val lugares = parsearResultadosBusqueda(responseBody)
                    
                    CoroutineScope(Dispatchers.Main).launch {
                        resultadosBusqueda = lugares
                        mostrandoResultados = lugares.isNotEmpty()
                    }
                } else {
                    Log.e("BusquedaLugar", "Error en búsqueda: ${response.code}")
                }
            } catch (e: Exception) {
                Log.e("BusquedaLugar", "Error al buscar lugar", e)
            }
        }
    }
    
    private fun parsearResultadosBusqueda(json: String): List<LugarBusqueda> {
        val lugares = mutableListOf<LugarBusqueda>()
        try {
            // Parseo JSON simplificado - en producción usar una librería como Gson o kotlinx.serialization
            val items = json.trim().removePrefix("[").removeSuffix("]")
                .split("},{").map { it.replace("{", "").replace("}", "") }
            
            for (item in items) {
                val campos = item.split(",")
                var nombre = ""
                var direccion = ""
                var lat = 0.0
                var lon = 0.0
                
                for (campo in campos) {
                    val partes = campo.split(":")
                    if (partes.size >= 2) {
                        val clave = partes[0].trim().replace("\"", "")
                        val valor = partes.drop(1).joinToString(":").trim().replace("\"", "")
                        
                        when (clave) {
                            "display_name" -> direccion = valor
                            "name" -> if (valor.isNotEmpty()) nombre = valor
                            "lat" -> lat = valor.toDoubleOrNull() ?: 0.0
                            "lon" -> lon = valor.toDoubleOrNull() ?: 0.0
                        }
                    }
                }
                
                if (nombre.isEmpty()) {
                    nombre = direccion.split(",").firstOrNull()?.trim() ?: "Lugar sin nombre"
                }
                
                if (lat != 0.0 && lon != 0.0) {
                    lugares.add(LugarBusqueda(nombre, direccion, lat, lon))
                }
            }
        } catch (e: Exception) {
            Log.e("ParsearBusqueda", "Error al parsear resultados", e)
        }
        return lugares
    }
    
    private fun seleccionarLugar(lugar: LugarBusqueda) {
        coordenadasSeleccionadas = Pair(lugar.lat, lugar.lon)
        nombreLugarSeleccionado = lugar.nombre
        mostrandoResultados = false
        rutaCalculada = null
    }
    
    private fun obtenerCoordenadasActuales() {
        if (latitud != "--" && longitud != "--") {
            try {
                val lat = latitud.toDouble()
                val lon = longitud.toDouble()
                coordenadasSeleccionadas = Pair(lat, lon)
                nombreLugarSeleccionado = "Mi ubicación actual"
                rutaCalculada = null
            } catch (e: Exception) {
                Log.e("CoordenadasActuales", "Error al obtener coordenadas", e)
            }
        }
    }
    
    private fun calcularRuta() {
        val coords = coordenadasSeleccionadas ?: return
        if (latitud == "--" || longitud == "--") return
        
        calculandoRuta = true
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val latActual = latitud.toDouble()
                val lonActual = longitud.toDouble()
                
                val url = "https://router.project-osrm.org/route/v1/driving/" +
                        "${lonActual},${latActual};${coords.second},${coords.first}" +
                        "?overview=false&steps=true"
                
                val request = Request.Builder()
                    .url(url)
                    .addHeader("User-Agent", "GpsAndroid/1.0")
                    .build()
                
                val response = httpClient.newCall(request).execute()
                val responseBody = response.body?.string()
                
                if (response.isSuccessful && responseBody != null) {
                    val rutaInfo = parsearRutaOSRM(responseBody)
                    
                    CoroutineScope(Dispatchers.Main).launch {
                        rutaCalculada = rutaInfo
                        calculandoRuta = false
                    }
                } else {
                    Log.e("CalcularRuta", "Error al calcular ruta: ${response.code}")
                    CoroutineScope(Dispatchers.Main).launch {
                        calculandoRuta = false
                    }
                }
            } catch (e: Exception) {
                Log.e("CalcularRuta", "Error al calcular ruta", e)
                CoroutineScope(Dispatchers.Main).launch {
                    calculandoRuta = false
                }
            }
        }
    }
    
    private fun parsearRutaOSRM(json: String): RutaInfo? {
        return try {
            // Parseo simplificado - en producción usar librería JSON apropiada
            val distanciaRegex = "\"distance\":(\\d+\\.?\\d*)".toRegex()
            val duracionRegex = "\"duration\":(\\d+\\.?\\d*)".toRegex()
            
            val distanciaMatch = distanciaRegex.find(json)
            val duracionMatch = duracionRegex.find(json)
            
            val distanciaMetros = distanciaMatch?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
            val duracionSegundos = duracionMatch?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
            
            val distanciaKm = String.format("%.1f km", distanciaMetros / 1000)
            val duracionMin = String.format("%.0f min", duracionSegundos / 60)
            
            RutaInfo(
                distancia = distanciaKm,
                duracion = duracionMin,
                instrucciones = listOf("Ruta calculada exitosamente")
            )
        } catch (e: Exception) {
            Log.e("ParsearRuta", "Error al parsear ruta", e)
            null
        }
    }
    
    private fun abrirNavegacionGoogleMaps(context: Context) {
        val coords = coordenadasSeleccionadas ?: return
        
        try {
            val uri = Uri.parse("google.navigation:q=${coords.first},${coords.second}")
            val intent = Intent(Intent.ACTION_VIEW, uri)
            intent.setPackage("com.google.android.apps.maps")
            
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
            } else {
                // Si Google Maps no está instalado, abrir en navegador
                val webUri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=${coords.first},${coords.second}")
                val webIntent = Intent(Intent.ACTION_VIEW, webUri)
                context.startActivity(webIntent)
            }
        } catch (e: Exception) {
            Log.e("NavegacionGoogleMaps", "Error al abrir navegación", e)
        }
    }
    
    // Función para iniciar el servicio GPS en segundo plano
    private fun iniciarServicioGps() {
        val serviceIntent = Intent(this, GpsService::class.java)
        ContextCompat.startForegroundService(this, serviceIntent)
        Log.d("GPS_SENDER", "Servicio GPS iniciado desde MainActivity")
    }
    
    // Función para iniciar el servicio en segundo plano
    private fun iniciarServicioSegundoPlano() {
        if (!servicioEnSegundoPlano) {
            val serviceIntent = Intent(this, GpsService::class.java)
            ContextCompat.startForegroundService(this, serviceIntent)
            servicioEnSegundoPlano = true
            Log.d("GPS_SENDER", "Servicio GPS en segundo plano iniciado")
        }
    }
    
    // Función para detener el servicio GPS
    private fun detenerServicioGps() {
        if (servicioEnSegundoPlano) {
            val serviceIntent = Intent(this, GpsService::class.java)
            stopService(serviceIntent)
            servicioEnSegundoPlano = false
            Log.d("GPS_SENDER", "Servicio GPS detenido desde MainActivity")
        }
    }
}