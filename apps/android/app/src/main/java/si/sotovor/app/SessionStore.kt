package si.sotovor.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

interface CredentialStore {
    fun current(): Credentials?
    fun replace(expected: Credentials?, value: Credentials?): Boolean
}

@Singleton
class SessionStore @Inject constructor(@ApplicationContext context: Context, private val json: Json) : CredentialStore {
    private val encrypted = AtomicFile(File(context.filesDir, "native-session"))
    private val alias = "sotovor-session-aes"
    private val changes = MutableStateFlow<Credentials?>(null)
    val sessions = changes.asStateFlow()
    private var initialized = false

    private fun key(create: Boolean): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        if (!create) throw GeneralSecurityException("Missing session key")
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build())
            generateKey()
        }
    }

    @Synchronized
    override fun current(): Credentials? {
        if (initialized) return changes.value
        val value = try {
            val bytes = encrypted.readFully()
            if (bytes.size < 29 || bytes[0] != 1.toByte()) throw GeneralSecurityException("Invalid encrypted session")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(create = false), GCMParameterSpec(128, bytes, 1, 12))
            json.decodeFromString<Credentials>(cipher.doFinal(bytes, 13, bytes.size - 13).decodeToString())
        } catch (_: FileNotFoundException) {
            null
        } catch (_: GeneralSecurityException) {
            encrypted.delete()
            null
        } catch (_: IllegalArgumentException) {
            encrypted.delete()
            null
        }
        initialized = true
        changes.value = value
        return value
    }

    @Synchronized
    override fun replace(expected: Credentials?, value: Credentials?): Boolean {
        if (current() != expected) return false
        if (value == null) {
            encrypted.delete()
        } else {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key(create = true))
            check(cipher.iv.size == 12)
            val bytes = byteArrayOf(1) + cipher.iv + cipher.doFinal(json.encodeToString(value).encodeToByteArray())
            val output = encrypted.startWrite()
            try {
                output.write(bytes)
                encrypted.finishWrite(output)
            } catch (error: IOException) {
                encrypted.failWrite(output)
                throw error
            }
        }
        changes.value = value
        return true
    }
}
