package id.or.gys.app

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private external fun initializeCredentialContext(context: android.content.Context)

  override fun onCreate(savedInstanceState: Bundle?) {
    // Wry loads this same library later; repeated loading is safe. Initialize
    // secure storage before any frontend IPC, including the profile on More.
    System.loadLibrary("gysapp_native_lib")
    initializeCredentialContext(applicationContext)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      // Native host owns the safe viewport. WebView CSS safe-area stays zero,
      // avoiding duplicate padding in fixed headers, drawers and media players.
      val safe = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(safe.left, safe.top, safe.right, maxOf(safe.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }
}
