package cn.kuwo.player.platform;

import android.app.Instrumentation;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicReference;

/** Runs in the target UID against the actual release Keystore bridge, with synthetic data only. */
public class PlatformCredentialTest extends Instrumentation {
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

  private Promise promise(AtomicReference<Object> result, AtomicReference<Boolean> rejected) {
    return (Promise) Proxy.newProxyInstance(Promise.class.getClassLoader(), new Class<?>[]{Promise.class}, (proxy, method, args) -> {
      if (method.getName().equals("resolve")) result.set(args[0]);
      if (method.getName().equals("reject")) { rejected.set(true); result.set(args == null ? null : args[0]); }
      return null;
    });
  }
  private void check(boolean valid, String name) { if (!valid) throw new AssertionError(name); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    SharedPreferences prefs = getTargetContext().getSharedPreferences("platform_credentials_v1", Context.MODE_PRIVATE);
    // Do not run against a real logged-in device.
    if (prefs.contains("qq_music")) { result.putString("error", "Refusing to replace an existing QQ credential"); finish(Activity.RESULT_CANCELED, result); return; }
    try {
      ReactApplicationContext context = new ReactApplicationContext(getTargetContext());
      PlatformCredentials credentials = new PlatformCredentials(context);
      AtomicReference<Object> value = new AtomicReference<>();
      AtomicReference<Boolean> rejected = new AtomicReference<>(false);
      Promise callback = promise(value, rejected);
      String fixture = "{\"cookie\":\"phase2-test-only-secret\",\"profile\":{\"id\":\"fixture\"}}";
      credentials.write("qq_music", fixture, callback);
      check(!rejected.get(), "write");
      String ciphertext = prefs.getString("qq_music", "");
      check(ciphertext.startsWith("1:") && !ciphertext.contains("phase2-test-only-secret") && !ciphertext.contains("cookie"), "ciphertext only");
      credentials.read("qq_music", callback);
      check(fixture.equals(value.get()), "decrypt round trip");
      new PlatformCredentials(context).read("qq_music", callback);
      check(fixture.equals(value.get()), "new module restores same device key");
      credentials.write("qq_music", fixture, callback);
      check(!ciphertext.equals(prefs.getString("qq_music", "")), "fresh GCM nonce per write");
      String legacy = credentials.encryptLegacy("qq_music", fixture);
      prefs.edit().putString("qq_music", legacy).commit();
      credentials.read("qq_music", callback);
      check(fixture.equals(value.get()) && legacy.startsWith("2:"), "RSA-wrapped compatibility envelope");
      prefs.edit().putString("qq_music", "1:AAAA:BBBB").commit();
      credentials.read("qq_music", callback);
      check(rejected.get() && "CREDENTIAL_UNAVAILABLE".equals(value.get()), "tamper detection without secret output");
      rejected.set(false);
      credentials.remove("qq_music", callback);
      check(!rejected.get() && !prefs.contains("qq_music"), "logout removes ciphertext");
      result.putString("stream", "8 Android Keystore checks passed (synthetic credential).\n" + Phase3Checks.run(getTargetContext()));
      finish(Activity.RESULT_OK, result);
    } catch (Throwable error) {
      result.putString("error", error.getClass().getSimpleName() + ": " + error.getMessage());
      finish(Activity.RESULT_CANCELED, result);
    } finally {
      prefs.edit().remove("qq_music").commit();
    }
  }
}
