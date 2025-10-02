package com.example.gpsandroid

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.android.gms.location.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.text.SimpleDateFormat
import java.util.*
import android.provider.Settings

class GpsService : Service() {
    
    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "GPS_SERVICE_CHANNEL"
        private const val CHANNEL_NAME = "Servicio GPS"
    }
    
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var locationRequest: LocationRequest
    private val httpClient = OkHttpClient()
    
    // Configuración del servidor
    private val serverUrl = "https://gps-tracking-0etqc0.loca.lt/api/ubicacion"
    
    // Generar ID único y persistente del dispositivo
    private fun getUniqueDeviceId(): String {
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return "android_device_${android.os.Build.MODEL}_${androidId}"
    }
    
    private val deviceId by lazy { getUniqueDeviceId() }
    private val deviceName = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
    
    // Variables para validación de ubicaciones
    private var ultimaUbicacionValida: Location? = null
    private var ultimoTiempoUbicacion: Long = 0
    
    override fun onCreate() {
        super.onCreate()
        Log.d("GpsService", "Servicio GPS creado")
        
        // Crear canal de notificación
        crearCanalNotificacion()
        
        // Inicializar cliente de ubicación
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        
        // Configurar solicitud de ubicación para segundo plano
        locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000) // 10 segundos
            .setWaitForAccurateLocation(true)
            .setMinUpdateIntervalMillis(5000) // Mínimo 5 segundos
            .setMaxUpdateDelayMillis(15000) // Máximo 15 segundos
            .setMinUpdateDistanceMeters(5.0f) // Solo actualizar si se mueve al menos 5 metros
            .build()
        
        // Configurar callback de ubicación
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationResult.lastLocation?.let { location ->
                    if (esUbicacionValida(location)) {
                        enviarDatosGpsAlServidor(location)
                        Log.d("GpsService", "Ubicación enviada desde servicio: ${location.latitude}, ${location.longitude}")
                    }
                }
            }
        }
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("GpsService", "Servicio GPS iniciado")
        
        // Crear notificación persistente
        val notification = crearNotificacion()
        startForeground(NOTIFICATION_ID, notification)
        
        // Iniciar actualizaciones de ubicación
        iniciarActualizacionesUbicacion()
        
        // Reiniciar el servicio si es terminado por el sistema
        return START_STICKY
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d("GpsService", "Servicio GPS destruido")
        detenerActualizacionesUbicacion()
    }
    
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
    
    private fun crearCanalNotificacion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW // Importancia baja para no molestar
            ).apply {
                description = "Canal para el servicio de GPS en segundo plano"
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun crearNotificacion(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GPS Tracker")
            .setContentText("Enviando ubicación en segundo plano")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true) // No se puede deslizar para cerrar
            .setSilent(true) // Sin sonido ni vibración
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET) // Ocultar en pantalla de bloqueo
            .build()
    }
    
    private fun iniciarActualizacionesUbicacion() {
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED && ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.e("GpsService", "No hay permisos de ubicación")
            return
        }
        
        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )
        
        Log.d("GpsService", "Actualizaciones de ubicación iniciadas")
    }
    
    private fun detenerActualizacionesUbicacion() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        Log.d("GpsService", "Actualizaciones de ubicación detenidas")
    }
    
    // Función para validar ubicaciones (misma lógica que MainActivity)
    private fun esUbicacionValida(location: Location): Boolean {
        // Filtro 1: Verificar precisión mínima (menos de 100 metros para segundo plano)
        if (location.accuracy > 100.0f) {
            Log.d("GpsService", "Ubicación rechazada por baja precisión: ${location.accuracy}m")
            return false
        }
        
        // Filtro 2: Verificar coordenadas válidas
        if (location.latitude == 0.0 && location.longitude == 0.0) {
            Log.d("GpsService", "Ubicación rechazada: coordenadas (0,0)")
            return false
        }
        
        // Filtro 3: Verificar velocidad máxima razonable
        ultimaUbicacionValida?.let { ultimaUbicacion ->
            val tiempoTranscurrido = (System.currentTimeMillis() - ultimoTiempoUbicacion) / 1000.0
            if (tiempoTranscurrido > 0) {
                val distancia = ultimaUbicacion.distanceTo(location)
                val velocidad = distancia / tiempoTranscurrido
                
                if (velocidad > 55.5) { // 200 km/h
                    Log.d("GpsService", "Ubicación rechazada por velocidad excesiva: ${velocidad * 3.6} km/h")
                    return false
                }
            }
        }
        
        // Actualizar última ubicación válida
        ultimaUbicacionValida = location
        ultimoTiempoUbicacion = System.currentTimeMillis()
        
        return true
    }
    
    private fun enviarDatosGpsAlServidor(location: Location) {
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
                    .build()
                
                val response = httpClient.newCall(request).execute()
                
                if (response.isSuccessful) {
                    Log.d("GpsService", "Datos GPS enviados exitosamente desde servicio")
                } else {
                    Log.e("GpsService", "Error al enviar datos GPS: ${response.code}")
                }
                
                response.close()
                
            } catch (e: Exception) {
                Log.e("GpsService", "Excepción al enviar datos GPS: ${e.message}")
            }
        }
    }
}