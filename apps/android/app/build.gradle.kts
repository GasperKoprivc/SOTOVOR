import java.net.URI
import java.util.Properties
import groovy.json.JsonSlurper

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.kapt)
    alias(libs.plugins.hilt)
}

val firebaseConfigured = file("google-services.json").isFile
if (firebaseConfigured) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.lifecycle("Sotovor Android: Firebase configuration absent. Push is disabled.")
}
val local = Properties().apply {
    rootProject.file("local.properties").takeIf { it.isFile }?.inputStream()?.use { load(it) }
}
fun url(property: String, fallback: String, allowHttp: Boolean): String {
    val value = providers.gradleProperty(property).orNull ?: local.getProperty(property) ?: fallback
    val parsed = URI(value)
    require(parsed.host != null && (parsed.scheme == "https" || (allowHttp && parsed.scheme == "http")) &&
        parsed.rawUserInfo == null && parsed.rawQuery == null && parsed.rawFragment == null &&
        (parsed.rawPath.isNullOrEmpty() || parsed.rawPath == "/")) { "Invalid URL for $property" }
    return value.trimEnd('/') + "/"
}
val debugUrl = url("sotovorDebugUrl", "http://10.0.2.2:3000/", true)
val releaseUrl = url("sotovorReleaseUrl", "https://sotovor.example.com/", false)
val updateUrl = providers.gradleProperty("sotovorUpdateUrl").orNull ?: local.getProperty("sotovorUpdateUrl")
    ?: releaseUrl + "prenesi"
require(URI(updateUrl).scheme == "https" && URI(updateUrl).host != null && '"' !in updateUrl) { "Invalid sotovorUpdateUrl" }
val rootManifest = JsonSlurper().parse(rootProject.file("../../package.json")) as Map<*, *>
val sotovorVersion = rootManifest["version"].toString()
require(Regex("^(0|[1-9]\\d*)\\.(0|[1-9]\\d?)\\.(0|[1-9]\\d?)$").matches(sotovorVersion)) { "Invalid package.json version" }
val (major, minor, patch) = sotovorVersion.split('.').map(String::toLong)
val derivedVersionCode = major * 10000 + minor * 100 + patch
require(derivedVersionCode in 1..2100000000L) { "Invalid Android versionCode" }
val signing = listOf("ANDROID_KEYSTORE_FILE", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD")
    .map { providers.environmentVariable(it).orNull.orEmpty() }
val signedRelease = signing.all { it.isNotBlank() }
require(signedRelease || signing.all { it.isBlank() }) { "Configure all four Android signing values or leave all of them empty." }

android {
    namespace = "si.sotovor.app"
    compileSdk = 36
    defaultConfig {
        applicationId = "si.sotovor.app"
        minSdk = 26
        targetSdk = 36
        versionCode = derivedVersionCode.toInt()
        versionName = sotovorVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("boolean", "FIREBASE_CONFIGURED", firebaseConfigured.toString())
        buildConfigField("String", "PUBLIC_URL", "\"$releaseUrl\"")
        buildConfigField("String", "UPDATE_URL", "\"$updateUrl\"")
        manifestPlaceholders["inviteHost"] = URI(releaseUrl).host
    }
    signingConfigs {
        if (signedRelease) create("production") {
            storeFile = file(signing[0])
            storePassword = signing[1]
            keyAlias = signing[2]
            keyPassword = signing[3]
        }
    }
    buildTypes {
        debug { buildConfigField("String", "BASE_URL", "\"$debugUrl\"") }
        release {
            buildConfigField("String", "BASE_URL", "\"$releaseUrl\"")
            if (signedRelease) signingConfig = signingConfigs.getByName("production")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }
kapt { correctErrorTypes = true }

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.material)
    implementation(libs.activity)
    implementation(libs.lifecycle.compose)
    implementation(libs.lifecycle.viewmodel)
    implementation(libs.navigation)
    implementation(libs.hilt.android)
    kapt(libs.hilt.compiler)
    implementation(libs.serialization)
    implementation(libs.retrofit)
    implementation(libs.retrofit.json)
    implementation(libs.okhttp)
    implementation(libs.datastore)
    implementation(libs.splash)
    implementation(libs.browser)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    debugImplementation(libs.compose.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.mockwebserver)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.coroutines.test)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.test)
    androidTestImplementation(libs.android.test.runner)
    androidTestImplementation(libs.android.test.espresso)
    debugImplementation(libs.compose.test.manifest)
}
