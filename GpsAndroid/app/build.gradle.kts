plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    kotlin("plugin.serialization") version "1.9.10"
}

android {
    namespace = "com.example.gpsandroid"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.gpsandroid"
        minSdk = 21  // Compatibilidad óptima - soporta Android 5.0+ (cubre 95%+ dispositivos)
        targetSdk = 34
        versionCode = 5
        versionName = "1.4"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
        
        // Configuración para múltiples arquitecturas
        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
        }
        
        // Configuración universal
        multiDexEnabled = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Configuración para APK universal
            ndk {
                abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
            }
        }
        debug {
            // Configuración para APK universal en debug
            ndk {
                abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
            }
            // Configuración de firma para debug - permite instalación en cualquier dispositivo
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    
    // Configuración para generar APK universal
    splits {
        abi {
            isEnable = false  // Deshabilitamos splits para generar APK universal
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8  // Mejor compatibilidad
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"  // Mejor compatibilidad
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.3"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Core Android dependencies - versiones optimizadas para API 21+
    implementation("androidx.core:core-ktx:1.12.0")  // Versión más reciente compatible
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    
    // Jetpack Compose BOM - versión estable y optimizada
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    
    // Material Components para compatibilidad universal
    implementation("com.google.android.material:material:1.11.0")
    
    // Location services - versión más reciente
    implementation("com.google.android.gms:play-services-location:21.0.1")
    
    // Permission handling - versión optimizada para API 21+
    implementation("com.google.accompanist:accompanist-permissions:0.32.0")
    
    // HTTP client - versión más reciente y estable
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    
    // JSON serialization - versión más reciente
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
    
    // Multidex support para dispositivos con limitaciones
    implementation("androidx.multidex:multidex:2.0.1")
    
    // Testing
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.02.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}