import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val signingProperties = Properties().apply {
    val propertiesFile = rootProject.file("keystore.properties")
    if (propertiesFile.exists()) propertiesFile.inputStream().use { load(it) }
}

android {
    namespace = "com.filmgo.app"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    sourceSets {
        getByName("main") {
            assets.setSrcDirs(listOf("src/main/assets/fonts"))
        }
    }

    defaultConfig {
        applicationId = "com.filmgo.app"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        create("production") {
            storeFile = file("../${signingProperties["storeFile"] ?: "filmgo-release.keystore"}")
            storePassword = signingProperties["storePassword"] as String?
            keyAlias = signingProperties["keyAlias"] as String?
            keyPassword = signingProperties["keyPassword"] as String?
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("production")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlinOptions { jvmTarget = "21" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
}
