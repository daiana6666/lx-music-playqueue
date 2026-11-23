package cn.kuwo.player.platform;

import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebStorage;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.ViewGroup;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.util.UUID;

/** The official OAuth page owns account/password/QR interaction. No injected login form. */
public class PlatformLogin extends ReactContextBaseJavaModule {
  private final Handler handler = new Handler(Looper.getMainLooper());
  private Dialog dialog;
  private WebView browser;
  private Promise pending;
  private int generation;
  private static final String DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  PlatformLogin(ReactApplicationContext context) {
    super(context);
    // A process can be killed without a dialog dismissal. Never restore an unfinished OAuth session.
    handler.post(() -> {
      CookieManager.getInstance().removeAllCookies(removed -> CookieManager.getInstance().flush());
      WebStorage.getInstance().deleteAllData();
    });
  }
  @Override public String getName() { return "PlatformLogin"; }

  private void finish(String cookie, String error) {
    generation++;
    Promise promise = pending;
    pending = null;
    handler.removeCallbacksAndMessages(null);
    if (browser != null) { browser.stopLoading(); browser.loadUrl("about:blank"); browser.clearHistory(); browser.clearCache(true); browser.clearFormData(); browser.destroy(); browser = null; }
    WebStorage.getInstance().deleteAllData();
    if (dialog != null) { dialog.setOnDismissListener(null); dialog.dismiss(); dialog = null; }
    CookieManager.getInstance().removeAllCookies(removed -> {
      CookieManager.getInstance().flush();
      if (promise == null) return;
      if (cookie != null) promise.resolve(cookie);
      else promise.reject("LOGIN_CANCELLED", error == null ? "登录已取消" : error);
    });
  }

  private boolean handleUrl(String url) {
    Uri uri = Uri.parse(url);
    String host = uri.getHost();
    String scheme = uri.getScheme();
    if ("https".equals(scheme) && host != null && (host.equals("qq.com") || host.endsWith(".qq.com"))) return false;
    if ("about:blank".equals(url)) return false;
    // Only the official QQ application can receive an authentication handoff.
    if ("mqqapi".equals(scheme) || "mqqopensdkapi".equals(scheme) || "mqq".equals(scheme)) {
      try {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage("com.tencent.mobileqq");
        getCurrentActivity().startActivity(intent);
      } catch (Exception ignored) {}
    }
    return true;
  }

  @ReactMethod public void openQQ(boolean desktop, Promise promise) {
    handler.post(() -> {
      finish(null, "登录已替换");
      Activity activity = getCurrentActivity();
      if (activity == null || activity.isFinishing()) { promise.reject("LOGIN_UNAVAILABLE", "当前无法打开登录页面"); return; }
      pending = promise;
      final int current = generation;
      CookieManager.getInstance().removeAllCookies(removed -> {
        if (current != generation || pending == null) return;
        dialog = new Dialog(activity, android.R.style.Theme_Material_Light_NoActionBar);
        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        TextView label = new TextView(activity);
        label.setText(desktop ? "QQ 音乐授权 · 选择“快捷登录”扫码" : "QQ 音乐官方授权 · 登录后自动返回");
        label.setPadding(24, 18, 24, 12);
        layout.addView(label);
        Button refresh = new Button(activity);
        refresh.setText("刷新授权页 / 二维码");
        layout.addView(refresh);
        browser = new WebView(activity);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSaveFormData(false);
        if (desktop) settings.setUserAgentString(DESKTOP_UA);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, true);
        browser.setWebViewClient(new WebViewClient() {
          @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return handleUrl(request.getUrl().toString()); }
          @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return handleUrl(url); }
          @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) label.setText("授权页加载失败，请检查网络后刷新");
          }
        });
        layout.addView(browser, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        Button close = new Button(activity);
        close.setText("取消登录");
        close.setOnClickListener(view -> finish(null, null));
        layout.addView(close);
        dialog.setContentView(layout);
        dialog.setOnDismissListener(view -> finish(null, null));
        dialog.show();
        String redirect = "https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/";
        String url = Uri.parse("https://graph.qq.com/oauth2.0/show").buildUpon()
          .appendQueryParameter("which", "Login").appendQueryParameter("display", desktop ? "pc" : "mobile")
          .appendQueryParameter("client_id", "100497308").appendQueryParameter("response_type", "code")
          .appendQueryParameter("redirect_uri", redirect).appendQueryParameter("scope", "get_user_info,get_app_friends")
          .appendQueryParameter("state", UUID.randomUUID().toString()).build().toString();
        refresh.setOnClickListener(view -> { if (browser != null) browser.loadUrl(url); });
        browser.loadUrl(url);
        final long deadline = System.currentTimeMillis() + 5 * 60 * 1000;
        handler.postDelayed(new Runnable() {
          @Override public void run() {
            if (current != generation || pending == null) return;
            if (System.currentTimeMillis() > deadline) { finish(null, "授权已超时，请重新登录"); return; }
            String cookie = CookieManager.getInstance().getCookie("https://u.y.qq.com/");
            if (cookie != null && cookie.matches("(?s).*(?:^|;\\s*)(?:qqmusic_key|qm_keyst)=[^;]+.*") &&
                cookie.matches("(?s).*(?:^|;\\s*)(?:uin|qqmusic_uin)=[^;]+.*")) {
              finish(cookie, null);
              return;
            }
            handler.postDelayed(this, 800);
          }
        }, 800);
      });
    });
  }
  @ReactMethod public void cancel(Promise promise) {
    handler.post(() -> { finish(null, null); promise.resolve(null); });
  }
  @Override public void invalidate() { handler.post(() -> finish(null, null)); super.invalidate(); }
}
