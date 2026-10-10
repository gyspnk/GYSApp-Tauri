package id.or.gys.app

import android.os.Bundle
import android.content.res.Configuration
import android.webkit.WebView
import android.webkit.CookieManager
import android.graphics.Color
import android.net.Uri
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import kotlin.math.roundToInt
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.WebMessageCompat

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null
  private var statusBackdrop: View? = null
  private var accent = "#0079a8"
  private val accentPattern = Regex("^#[0-9a-fA-F]{6}$")
  private val appOrigins = setOf("https://tauri.localhost", "http://tauri.localhost")

  private fun applyStatusAccent() {
    val color = Color.parseColor(accent)
    statusBackdrop?.setBackgroundColor(color)
    // Paint a native view behind the bar: Android 15+ ignores statusBarColor
    // under enforced edge-to-edge. The WebView remains inside consumed insets.
    val channels = listOf(Color.red(color), Color.green(color), Color.blue(color)).map {
      val s = it / 255.0
      if (s <= 0.04045) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
    }
    val luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars =
      (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05)
  }

  private fun requestWebAccent() {
    val webView = appWebView ?: return
    val url = webView.url ?: return
    val uri = Uri.parse(url)
    if ("${uri.scheme}://${uri.authority}" !in appOrigins) return
    webView.evaluateJavascript("window.dispatchEvent(new Event('gys-native-accent-request'))", null)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    appWebView = webView
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      // Origin-scoped messaging exposes only color updates, including a main
      // frame check. No Java reflection bridge or general native commands.
      WebViewCompat.addWebMessageListener(webView, "GysStatusAccent", appOrigins) {
        _, message, sourceOrigin, isMainFrame, _ ->
        val next = if (message.type == WebMessageCompat.TYPE_STRING) message.data else null
        if (isMainFrame && sourceOrigin.toString() in appOrigins && next != null && accentPattern.matches(next)) {
          accent = next.lowercase()
          getSharedPreferences("gys-chrome", MODE_PRIVATE).edit().putString("accent", accent).apply()
          applyStatusAccent()
        }
      }
    }
    // BFF auth uses HttpOnly SameSite=None cookies on workers.dev; the native
    // tauri.localhost origin is cross-site. Android disables these by default.
    CookieManager.getInstance().setAcceptCookie(true)
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
    // Android's edge stretch moves the whole viewport at scroll boundaries.
    webView.overScrollMode = View.OVER_SCROLL_NEVER
    updateTextScale()
    applyStatusAccent()
    requestWebAccent()
  }

  private fun updateTextScale() {
    // WebView defaults to 100 even when Android accessibility font size changes.
    appWebView?.settings?.textZoom = (resources.configuration.fontScale * 100).roundToInt()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    updateTextScale()
    applyStatusAccent()
    requestWebAccent()
  }

  override fun onResume() {
    super.onResume()
    updateTextScale()
    applyStatusAccent()
    requestWebAccent()
  }

  private external fun initializeCredentialContext(context: android.content.Context)

  override fun onCreate(savedInstanceState: Bundle?) {
    // Wry loads this same library later; repeated loading is safe. Initialize
    // secure storage before any frontend IPC, including the profile on More.
    System.loadLibrary("gysapp_native_lib")
    initializeCredentialContext(applicationContext)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    accent = getSharedPreferences("gys-chrome", MODE_PRIVATE).getString("accent", null)
      ?.takeIf { accentPattern.matches(it) } ?: "#0079a8"
    statusBackdrop = View(this).apply {
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      isClickable = false
    }
    (window.decorView as ViewGroup).addView(statusBackdrop,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP))
    applyStatusAccent()

    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      // Native host owns the safe viewport. WebView CSS safe-area stays zero,
      // avoiding duplicate padding in fixed headers, drawers and media players.
      val safe = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      statusBackdrop?.layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, safe.top, Gravity.TOP)
      view.setPadding(safe.left, safe.top, safe.right, maxOf(safe.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }
}
