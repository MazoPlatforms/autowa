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
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
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
        AlertDialog.Builder(activity)
            .setTitle("FilmGo update available")
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
        val box = LinearLayout(activity).apply { setPadding(32, 0, 32, 12); addView(progress, ViewGroup.LayoutParams(-1, 8)) }
        val dialog = AlertDialog.Builder(activity).setTitle("Downloading FilmGo update").setView(box).setCancelable(false).show()
        executor.execute {
            try {
                val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
                val apk = File(dir, "FilmGo-${config.versionCode}.apk")
                if (apk.exists()) apk.delete()
                val connection = URL(config.apkUrl).openConnection() as HttpURLConnection
                connection.connectTimeout = 10000
                connection.readTimeout = 20000
                connection.instanceFollowRedirects = true
                connection.connect()
                if (connection.responseCode !in 200..299) error("Download failed (${connection.responseCode}).")
                val total = connection.contentLengthLong
                val digest = MessageDigest.getInstance("SHA-256")
                var received = 0L
                connection.inputStream.use { input -> FileOutputStream(apk).use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        received += read
                        if (total > 0) activity.runOnUiThread { progress.progress = ((received * 100) / total).toInt() }
                    }
                } }
                connection.disconnect()
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                if (actual != config.sha256) error("APK verification failed. The downloaded file does not match the published SHA-256.")
                activity.runOnUiThread { dialog.dismiss(); install(apk) }
            } catch (error: Exception) {
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
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
        pendingInstall = null
    }

    private fun showError(message: String) {
        if (!activity.isFinishing) AlertDialog.Builder(activity).setTitle("Update unavailable").setMessage(message).setPositiveButton("OK", null).show()
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
