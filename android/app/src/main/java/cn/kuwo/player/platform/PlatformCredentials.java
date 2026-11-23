package cn.kuwo.player.platform;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.security.KeyPairGeneratorSpec;
import android.os.Build;
import android.util.Base64;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Calendar;
import java.math.BigInteger;
import javax.security.auth.x500.X500Principal;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Device-bound secrets. No plaintext fallback; Android backup is disabled for this app. */
public class PlatformCredentials extends ReactContextBaseJavaModule {
  private static final String ALIAS = "lx.platform.accounts.v1";
  private final SharedPreferences prefs;

  PlatformCredentials(ReactApplicationContext context) {
    super(context);
    prefs = context.getSharedPreferences("platform_credentials_v1", Context.MODE_PRIVATE);
  }
  @Override public String getName() { return "PlatformCredentials"; }

  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (!store.containsAlias(ALIAS)) {
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      generator.init(new KeyGenParameterSpec.Builder(ALIAS,
        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256).build());
      generator.generateKey();
    }
    return (SecretKey) store.getKey(ALIAS, null);
  }
  private void validate(String name) {
    if (!name.matches("(qq_music|kugou|device|netease|webdav|sync)")) throw new IllegalArgumentException();
  }
  // Android 5 supports Keystore RSA, but Keystore AES begins at Android 6.
  // Wrap a fresh content-encryption key with the device RSA key on API 21/22.
  private KeyStore.PrivateKeyEntry legacyKey() throws Exception {
    String alias = ALIAS + ".rsa";
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (!store.containsAlias(alias)) {
      Calendar end = Calendar.getInstance();
      end.add(Calendar.YEAR, 30);
      KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA", "AndroidKeyStore");
      generator.initialize(new KeyPairGeneratorSpec.Builder(getReactApplicationContext())
        .setAlias(alias).setKeySize(2048).setSubject(new X500Principal("CN=LX Music Accounts"))
        .setSerialNumber(BigInteger.ONE).setStartDate(new java.util.Date(0)).setEndDate(end.getTime()).build());
      generator.generateKeyPair();
    }
    return (KeyStore.PrivateKeyEntry) store.getEntry(alias, null);
  }
  String encryptLegacy(String name, String value) throws Exception {
    byte[] rawKey = new byte[32];
    byte[] iv = new byte[12];
    new SecureRandom().nextBytes(rawKey);
    new SecureRandom().nextBytes(iv);
    Cipher rsa = Cipher.getInstance("RSA/ECB/PKCS1Padding");
    rsa.init(Cipher.ENCRYPT_MODE, legacyKey().getCertificate().getPublicKey());
    byte[] wrapped = rsa.doFinal(rawKey);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(rawKey, "AES"), new GCMParameterSpec(128, iv));
    cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
    byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
    Arrays.fill(rawKey, (byte) 0);
    return "2:" + Base64.encodeToString(wrapped, Base64.NO_WRAP) + ":" + Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
  }
  @ReactMethod public synchronized void read(String name, Promise promise) {
    try {
      validate(name);
      String envelope = prefs.getString(name, null);
      if (envelope == null) { promise.resolve(null); return; }
      String[] parts = envelope.split(":", -1);
      if (!((parts.length == 3 && parts[0].equals("1")) || (parts.length == 4 && parts[0].equals("2")))) throw new IllegalArgumentException();
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      int ivIndex = 1;
      SecretKey contentKey;
      if (parts[0].equals("2")) {
        Cipher rsa = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        rsa.init(Cipher.DECRYPT_MODE, legacyKey().getPrivateKey());
        byte[] rawKey = rsa.doFinal(Base64.decode(parts[1], Base64.NO_WRAP));
        contentKey = new SecretKeySpec(rawKey, "AES");
        Arrays.fill(rawKey, (byte) 0);
        ivIndex = 2;
      } else contentKey = key();
      cipher.init(Cipher.DECRYPT_MODE, contentKey, new GCMParameterSpec(128, Base64.decode(parts[ivIndex], Base64.NO_WRAP)));
      cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
      promise.resolve(new String(cipher.doFinal(Base64.decode(parts[ivIndex + 1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
    } catch (Exception error) { promise.reject("CREDENTIAL_UNAVAILABLE", "设备凭据无法解密，请重新登录"); }
  }
  @ReactMethod public synchronized void write(String name, String value, Promise promise) {
    try {
      validate(name);
      if (value.length() > 65536) throw new IllegalArgumentException();
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        if (!prefs.edit().putString(name, encryptLegacy(name, value)).commit()) throw new IllegalStateException();
        promise.resolve(null);
        return;
      }
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, key());
      cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
      String envelope = "1:" + Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
        Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
      if (!prefs.edit().putString(name, envelope).commit()) throw new IllegalStateException();
      promise.resolve(null);
    } catch (Exception error) { promise.reject("CREDENTIAL_WRITE_FAILED", "设备凭据保存失败"); }
  }
  @ReactMethod public synchronized void remove(String name, Promise promise) {
    try {
      validate(name);
      if (!prefs.edit().remove(name).commit()) throw new IllegalStateException();
      promise.resolve(null);
    } catch (Exception error) { promise.reject("CREDENTIAL_REMOVE_FAILED", "设备凭据清理失败"); }
  }
  @ReactMethod(isBlockingSynchronousMethod = true) public String randomHex(int count) {
    if (count < 1 || count > 128) throw new IllegalArgumentException();
    byte[] data = new byte[count];
    new SecureRandom().nextBytes(data);
    return hex(data);
  }
  private static String hex(byte[] data) {
    StringBuilder value = new StringBuilder(data.length * 2);
    for (byte item : data) value.append(String.format("%02x", item & 255));
    return value.toString();
  }
  @ReactMethod(isBlockingSynchronousMethod = true) public String kugouRsa(String value) {
    try {
      String pem = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIAG7QOELSYoIJvTFJhMpe1s/gbjDJX51HBNnEl5HXqTW6lQ7LC8jr9fWZTwusknp+sVGzwd40MwP6U5yDE27M/X1+UR4tvOGOqp94TJtQ1EPnWGWXngpeIW5GxoQGao1rmYWAu6oi1z9XkChrsUdC6DJE5E221wf/4WLFxwAtRQIDAQAB";
      byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
      if (bytes.length > 128) throw new IllegalArgumentException();
      Cipher cipher = Cipher.getInstance("RSA/ECB/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.decode(pem, Base64.DEFAULT))));
      return hex(cipher.doFinal(Arrays.copyOf(bytes, 128)));
    } catch (Exception error) { throw new IllegalStateException("Platform request encryption failed"); }
  }
}
