import groovy.json.JsonSlurper
import java.net.URI
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.kapt)
    id("org.jlleitschuh.gradle.ktlint") version "14.2.0"
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
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
    require(
        parsed.host != null && (parsed.scheme == "https" || (allowHttp && parsed.scheme == "http")) &&
            parsed.rawUserInfo == null && parsed.rawQuery == null && parsed.rawFragment == null &&
            (parsed.rawPath.isNullOrEmpty() || parsed.rawPath == "/")
    ) { "Invalid URL for $property" }
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
        if (signedRelease) {
            create("production") {
                storeFile = file(signing[0])
                storePassword = signing[1]
                keyAlias = signing[2]
                keyPassword = signing[3]
            }
        }
    }
    bundle { language { enableSplit = false } }
    buildTypes {
        debug { buildConfigField("String", "BASE_URL", "\"$debugUrl\"") }
        release {
            buildConfigField("String", "BASE_URL", "\"$releaseUrl\"")
            if (signedRelease) signingConfig = signingConfigs.getByName("production")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    // The QA variant runs release R8 rules against the local test API.
    buildTypes.create("qa") {
        initWith(buildTypes.getByName("release"))
        applicationIdSuffix = ".qa"
        signingConfig = signingConfigs.getByName("debug")
        isDebuggable = false
        matchingFallbacks += listOf("release")
        buildConfigField("String", "BASE_URL", "\"$debugUrl\"")
    }
    lint {
        abortOnError = true
        checkReleaseBuilds = true
        // These warning-level issues block release together with all ordinary lint errors.
        error += setOf(
            "ContentDescription", "LabelFor", "ClickableViewAccessibility", "UnknownIssueId",
            "HardcodedText", "SetTextI18n", "MissingTranslation", "NewApi", "UnsafeOptInUsageError"
        )
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
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
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.10.5")
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
    implementation("androidx.concurrent:concurrent-futures-ktx:1.3.0")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    androidTestImplementation(libs.android.test.runner)
    androidTestImplementation(libs.android.test.espresso)
    debugImplementation(libs.compose.test.manifest)
}

ktlint {
    version.set("1.7.1")
    android.set(true)
}

detekt {
    buildUponDefaultConfig = false
    config.setFrom(rootProject.file("config/detekt.yml"))
}

tasks.register("dependencyInventory") {
    group = "verification"
    description = "Export the resolved release runtime dependencies for the OSV audit."
    doLast {
        val dependencies = configurations.getByName("releaseRuntimeClasspath")
            .resolvedConfiguration.resolvedArtifacts
            .map { it.moduleVersion.id }
            .distinctBy { it.toString() }
            .sortedBy { it.toString() }
            .map { mapOf("name" to "${it.group}:${it.name}", "version" to it.version) }
        val target = layout.buildDirectory.file("reports/dependency-inventory.json").get().asFile
        target.parentFile.mkdirs()
        target.writeText(groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(dependencies)))
    }
}
