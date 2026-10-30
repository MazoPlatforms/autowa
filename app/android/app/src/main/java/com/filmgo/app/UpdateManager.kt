package com.filmgo.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.graphics.Color
import android.graphics.Typeface
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

private data class UpdateConfig(
    val versionCode: Int,
    val versionName: String,
    val minimumVersionCode: Int,
    val force: Boolean,
    val apkUrl: String,
    val sha256: String,
    val message: String,
    val notes: List<String>
)

class UpdateManager(private val activity: Activity) {
    private val executor = Executors.newSingleThreadExecutor()
    private var pendingInstall: File? = null

    fun check() {
        executor.execute {
            try {
                val connection = URL(configUrl()).openConnection() as HttpURLConnection
                connection.connectTimeout = 4500
                connection.readTimeout = 6500
                connection.setRequestProperty("Cache-Control", "no-cache, no-store")
                connection.setRequestProperty("Pragma", "no-cache")
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                connection.disconnect()
                val json = JSONObject(body)
                if (json.optString("package_name") != activity.packageName) return@execute
                val config = UpdateConfig(
                    json.optInt("latest_version_code", 0),
                    json.optString("latest_version_name", ""),
                    json.optInt("minimum_supported_version_code", 1),
                    json.optBoolean("force_update", false),
                    json.optString("apk_url", ""),
                    json.optString("sha256", "").lowercase(),
                    json.optString("message", "A new FilmGo update is available."),
                    json.optJSONArray("release_notes")?.let { array -> List(array.length()) { i -> array.optString(i) } } ?: emptyList()
                )
                val installedVersion = currentVersionCode()
                if (config.versionCode > installedVersion) {
                    activity.runOnUiThread { showUpdateDialog(config) }
                } else if (installedVersion < config.minimumVersionCode) {
                    activity.runOnUiThread { showUpdateDialog(config) }
                }
            } catch (_: Exception) {
                // Update checks are best-effort and must never block website loading.
            }
        }
    }

    private fun showUpdateDialog(config: UpdateConfig) {
        if (activity.isFinishing || (Build.VERSION.SDK_INT >= 17 && activity.isDestroyed)) return
        notifyUpdate(config)
        val notes = config.notes.joinToString("\n") { "• $it" }
        val body = buildString {
            append(config.message)
            if (config.versionName.isNotBlank()) append("\n\nVersion ${config.versionName}")
            if (notes.isNotBlank()) append("\n\n$notes")
        }

        val title = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(28, 22, 28, 8)
            addView(ImageView(activity).apply {
                setImageResource(com.filmgo.app.R.drawable.filmgo_app)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
            }, LinearLayout.LayoutParams(48, 48))
            addView(TextView(activity).apply {
                text = "FilmGo update available"
                textSize = 20f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setTextColor(Color.rgb(244, 244, 245))
                setPadding(18, 0, 0, 0)
            }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        AlertDialog.Builder(activity)
            .setCustomTitle(title)
            .setMessage(body)
            .setCancelable(!config.force)
            .setNegativeButton(if (config.force) null else "Later", null)
            .setPositiveButton("Download and install") { _, _ -> download(config) }
            .show()
    }

    private fun download(config: UpdateConfig) {
        if (!validApkUrl(config.apkUrl) || !Regex("[0-9a-f]{64}").matches(config.sha256)) {
            showError("The update configuration is incomplete or invalid.")
            return
        }
        val progress = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        val status = android.widget.TextView(activity).apply {
            text = "Preparing download…"
            textSize = 13f
            setTextColor(android.graphics.Color.rgb(161, 161, 170))
            setPadding(0, 14, 0, 4)
        }
        val box = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 0, 32, 12)
            addView(progress, ViewGroup.LayoutParams(-1, 8))
            addView(status, ViewGroup.LayoutParams(-1, -2))
        }
        val dialog = AlertDialog.Builder(activity).setTitle("Downloading FilmGo update").setView(box).setCancelable(false).show()
        executor.execute {
            try {
                val dir = File(activity.filesDir, "updates").apply { mkdirs() }
                val apk = File(dir, "FilmGo-${config.versionCode}.apk")
                val partial = File(dir, "FilmGo-${config.versionCode}.apk.part")
                if (apk.exists() && sha256File(apk) == config.sha256) {
                    activity.runOnUiThread {
                        progress.isIndeterminate = true
                        status.text = "Verified download found. Opening installer…"
                        dialog.dismiss()
                        install(apk)
                    }
                    return@execute
                }
                if (apk.exists()) apk.delete()
                if (partial.exists()) partial.delete()
                val connection = URL(config.apkUrl).openConnection() as HttpURLConnection
                connection.connectTimeout = 10000
                connection.readTimeout = 20000
                connection.instanceFollowRedirects = true
                connection.connect()
                if (connection.responseCode !in 200..299) error("Download failed (${connection.responseCode}).")
                val total = connection.contentLengthLong
                activity.runOnUiThread {
                    progress.isIndeterminate = total <= 0
                    status.text = if (total > 0) "Downloading 0%" else "Downloading…"
                }
                val digest = MessageDigest.getInstance("SHA-256")
                var received = 0L
                connection.inputStream.use { input -> FileOutputStream(partial).use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        received += read
                        activity.runOnUiThread {
                            if (total > 0) {
                                progress.progress = ((received * 100) / total).toInt()
                                status.text = "Downloading ${progress.progress}%"
                            } else {
                                status.text = "Downloaded ${formatBytes(received)}"
                            }
                        }
                    }
                } }
                connection.disconnect()
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                if (actual != config.sha256) error("APK verification failed. The downloaded file does not match the published SHA-256.")
                if (!partial.renameTo(apk)) error("Unable to keep the verified update file.")
                activity.runOnUiThread { dialog.dismiss(); install(apk) }
            } catch (error: Exception) {
                runCatching { File(activity.filesDir, "updates/FilmGo-${config.versionCode}.apk.part").delete() }
                activity.runOnUiThread { dialog.dismiss(); showError(error.message ?: "Unable to download the update.") }
            }
        }
    }

    private fun install(apk: File) {
        pendingInstall = apk
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
            val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
            activity.startActivity(settingsIntent)
            return
        }
        launchInstaller(apk)
    }

    fun resumeInstall() {
        val apk = pendingInstall ?: return
        if (Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls()) launchInstaller(apk)
    }

    private fun launchInstaller(apk: File) {
        if (!apk.exists()) { pendingInstall = null; return }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            activity.startActivity(intent)
            pendingInstall = null
        } catch (error: Exception) {
            showError(error.message ?: "Unable to open the Android installer.")
        }
    }

    private fun showError(message: String) {
        if (!activity.isFinishing) AlertDialog.Builder(activity).setTitle("Update unavailable").setMessage(message).setPositiveButton("OK", null).show()
    }

    private fun formatBytes(bytes: Long): String = when {
        bytes >= 1024 * 1024 -> "%.1f MB".format(bytes / (1024f * 1024f))
        bytes >= 1024 -> "%.0f KB".format(bytes / 1024f)
        else -> "$bytes B"
    }

    private fun sha256File(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun notifyUpdate(config: UpdateConfig) {
        if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = activity.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("updates", "App updates", NotificationManager.IMPORTANCE_DEFAULT))
        val notification = if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(activity, "updates") else android.app.Notification.Builder(activity)
        manager.notify(1001, notification.setSmallIcon(com.filmgo.app.R.drawable.ic_stat_filmgo).setContentTitle("FilmGo update available").setContentText(config.message).setAutoCancel(true).build())
    }

    private fun validApkUrl(value: String): Boolean {
        val uri = runCatching { Uri.parse(value) }.getOrNull() ?: return false
        val host = uri.host ?: return false
        return uri.scheme == "https" && host in setOf("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com")
    }

    private fun currentVersionCode(): Long {
        val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    }

    private fun configUrl(): String {
        val encrypted = intArrayOf(50, 46, 46, 42, 41, 96, 117, 117, 61, 51, 41, 46, 116, 61, 51, 46, 50, 47, 56, 47, 41, 63, 40, 57, 53, 52, 46, 63, 52, 46, 116, 57, 53, 55, 117, 51, 46, 32, 55, 32, 52, 117, 60, 105, 57, 63, 98, 63, 56, 109, 107, 57, 98, 98, 106, 62, 60, 105, 105, 63, 98, 57, 99, 108, 109, 107, 108, 62, 106, 59, 108, 99, 105, 99, 117, 40, 59, 45)
        return buildString(encrypted.size) { encrypted.forEach { append((it xor 0x5A).toChar()) } }
    }

    fun close() { executor.shutdownNow() }
}
