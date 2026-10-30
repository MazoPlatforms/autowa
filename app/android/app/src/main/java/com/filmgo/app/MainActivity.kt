package com.filmgo.app

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.graphics.drawable.GradientDrawable

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var offlineView: View
    private lateinit var root: FrameLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var loadingText: TextView
    private lateinit var retryButton: Button
    private val mainHandler = Handler(Looper.getMainLooper())
    private lateinit var updateManager: UpdateManager

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        window.statusBarColor = Color.rgb(9, 9, 11)
        window.navigationBarColor = Color.rgb(9, 9, 11)
        root = FrameLayout(this).apply { setBackgroundColor(Color.rgb(9, 9, 11)) }
        webView = createWebView()
        offlineView = createOfflineView()
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        root.addView(offlineView, FrameLayout.LayoutParams(-1, -1))
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            visibility = View.GONE
            progressDrawable = GradientDrawable().apply { setColor(Color.rgb(244, 244, 245)) }
        }
        root.addView(progressBar, FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP))
        setContentView(root)
        loadLiveWebsite()
        updateManager = UpdateManager(this)
        updateManager.check()
    }

    private fun createWebView() = WebView(this).apply {
        setLayerType(View.LAYER_TYPE_HARDWARE, null)
        setBackgroundColor(Color.rgb(9, 9, 11))
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = false
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            saveFormData = false
            offscreenPreRaster = true
            setEnableSmoothTransition(false)
            userAgentString = "$userAgentString FilmGoAndroid/1.0"
        }
        webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                showWebsite()
                progressBar.visibility = View.VISIBLE
                progressBar.progress = 4
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                showWebsite()
                progressBar.progress = 100
                mainHandler.postDelayed({ progressBar.visibility = View.GONE }, 180)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame != false) showOfflineReady()
            }

            override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, errorResponse: android.webkit.WebResourceResponse?) {
                if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 200) >= 400) showOfflineReady()
            }
        }
        webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (webView.visibility == View.VISIBLE) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress.coerceAtLeast(4)
                    if (newProgress >= 100) mainHandler.postDelayed({ progressBar.visibility = View.GONE }, 180)
                }
            }
        }
    }

    private fun createOfflineView(): View {
        val inter = Typeface.createFromAsset(assets, "inter_regular.ttf")
        val semi = Typeface.createFromAsset(assets, "inter_semibold.ttf")
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(24), dp(28), dp(24))
            setBackgroundColor(Color.rgb(9, 9, 11))
            val logo = ImageView(this@MainActivity).apply { setImageResource(com.filmgo.app.R.drawable.filmgo_lockup); scaleType = ImageView.ScaleType.CENTER_INSIDE }
            addView(logo, LinearLayout.LayoutParams(dp(150), dp(48)))
            addView(TextView(this@MainActivity).apply {
                text = "You’re offline"; textSize = 28f; typeface = semi; setTextColor(Color.rgb(244, 244, 245)); gravity = Gravity.CENTER
            }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(28) })
            addView(TextView(this@MainActivity).apply {
                text = "FilmGo needs an internet connection to load the latest movie library.\nConnect and try again."; textSize = 14f; typeface = inter; setTextColor(Color.rgb(161, 161, 170)); gravity = Gravity.CENTER; setLineSpacing(4f, 1f)
            }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
            loadingText = TextView(this@MainActivity).apply {
                text = ""; textSize = 12f; typeface = inter; setTextColor(Color.rgb(161, 161, 170)); gravity = Gravity.CENTER; visibility = View.GONE
            }
            addView(loadingText, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(18) })
            retryButton = Button(this@MainActivity).apply {
                text = "Try again"; textSize = 14f; typeface = semi; isAllCaps = false; setTextColor(Color.rgb(24, 24, 27));
                background = rounded(Color.rgb(244, 244, 245), 14); setPadding(dp(14), 0, dp(14), 0); stateListAnimator = null
                setOnClickListener { loadLiveWebsite() }
            }
            addView(retryButton, LinearLayout.LayoutParams(dp(150), dp(50)).apply { topMargin = dp(12) })
        }
    }

    private fun loadLiveWebsite() {
        showRetryLoading()
        if (hasNetwork()) {
            showWebsite()
            webView.loadUrl(liveWebsiteUrl())
        } else {
            mainHandler.postDelayed({ showOfflineReady() }, 650)
        }
    }

    private fun showWebsite() { offlineView.visibility = View.GONE; webView.visibility = View.VISIBLE; retryButton.isEnabled = true; loadingText.visibility = View.GONE }
    private fun showRetryLoading() {
        webView.stopLoading(); webView.visibility = View.GONE; offlineView.visibility = View.VISIBLE
        retryButton.isEnabled = false; retryButton.text = "Checking…"; loadingText.text = "Checking your connection…"; loadingText.visibility = View.VISIBLE
        progressBar.progress = 8; progressBar.visibility = View.VISIBLE
    }
    private fun showOfflineReady() {
        webView.stopLoading(); webView.visibility = View.GONE; offlineView.visibility = View.VISIBLE
        retryButton.isEnabled = true; retryButton.text = "Try again"; loadingText.visibility = View.GONE; progressBar.visibility = View.GONE
    }

    private fun hasNetwork(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    override fun onBackPressed() {
        if (webView.visibility == View.VISIBLE && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onResume() {
        super.onResume()
        if (::updateManager.isInitialized) updateManager.resumeInstall()
    }

    override fun onDestroy() {
        if (::updateManager.isInitialized) updateManager.close()
        webView.stopLoading(); webView.loadUrl("about:blank"); webView.clearHistory(); webView.removeAllViews(); webView.destroy(); super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: Int, radius: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat() }

    /** Reconstruct the endpoint at runtime so it is not present as plaintext in classes.dex. */
    private fun liveWebsiteUrl(): String {
        val encrypted = intArrayOf(50, 46, 46, 42, 41, 96, 117, 117, 60, 51, 54, 55, 61, 53, 116, 59, 42, 42, 41, 116, 55, 51, 41, 46, 40, 59, 54, 116, 40, 47, 52, 117)
        val key = 0x5A xor ((System.getProperty("java.vm.version")?.length ?: 0) and 0)
        return buildString(encrypted.size) { encrypted.forEach { append((it xor key).toChar()) } }
    }
}
