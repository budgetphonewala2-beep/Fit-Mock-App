import java.util.Properties

plugins {
    id("com.android.application")
    // Wires google-services.json into Firebase's generated resources.
    id("com.google.gms.google-services")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing for Google Play. android/key.properties (git-ignored) holds
// storeFile, storePassword, keyAlias and keyPassword for the upload keystore
// (kept outside the repo). Without it, release builds fall back to the
// debug key so `flutter run --release` still works, but Play rejects those.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "app.fitmonk.fitmonk_shell"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications 17.x needs core library desugaring.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "app.fitmonk.fitmonk_shell"
        // firebase_messaging / flutter_local_notifications need at least 23.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        multiDexEnabled = true
    }

    signingConfigs {
        if (keystoreProperties.containsKey("storeFile")) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
                ?: signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

// The project lives on an exFAT/HFS+ drive that emits macOS AppleDouble
// (._*) sidecar files, which AGP's resource parser rejects. Sweep them
// out of the intermediates before AGP touches them.
tasks.register<Delete>("cleanAppleDoubleSidecars") {
    delete(fileTree(project.projectDir) { include("**/._*") })
    delete(fileTree(project.rootDir) { include("**/._*") })
}

tasks.matching { it.name == "preBuild" }.configureEach {
    dependsOn("cleanAppleDoubleSidecars")
}
