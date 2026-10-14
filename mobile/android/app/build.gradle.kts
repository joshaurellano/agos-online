import java.util.Properties

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    // END: FlutterFire Configuration
    id("com.google.firebase.crashlytics")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

// ── Release signing (android/key.properties) ─────────────────────────────────
// Google Play only accepts apps signed with YOUR upload key, never the debug
// key. Create a keystore and android/key.properties as described in
// docs/RELEASE_CHECKLIST.md. Both are secrets: keep them out of git (see
// key.properties.example). Without key.properties, release builds fall back
// to the debug key so local `flutter run --release` still works.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKey = keystorePropertiesFile.exists()
if (hasReleaseKey) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
} else {
    logger.warn("WARNING: android/key.properties not found — release builds are signed with the DEBUG key and cannot be uploaded to Google Play.")
}

// ─────────────────────────────────────────────────────────────────────────────

android {
    namespace = "com.gr4.agos"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion
    
    compileOptions {
        isCoreLibraryDesugaringEnabled = true          // ← was: coreLibraryDesugaringEnabled true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.gr4.agos"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    // ── Environments ────────────────────────────────────────────────────────
    // dev  = separate Firebase project (and Supabase project) for testing, so a
    //        test alert can never reach a real resident's phone. Installs
    //        side by side with the real app (id + ".dev", name "AGOS Dev").
    // prod = the real app.
    // The google-services plugin automatically reads
    //   src/dev/google-services.json   for the dev flavor
    //   src/prod/google-services.json  for the prod flavor
    // Run with:  flutter run --flavor dev      /      flutter run --flavor prod
    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            resValue("string", "app_name", "AGOS")
        }
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "AGOS Dev")
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}

androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { output ->
            (output as? com.android.build.api.variant.impl.VariantOutputImpl)
                ?.outputFileName?.set("agos-${variant.name}.apk")
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}