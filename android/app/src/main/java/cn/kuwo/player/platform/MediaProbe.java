package cn.kuwo.player.platform;

import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.*;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import com.facebook.react.bridge.*;
import java.util.HashMap;
import java.util.Map;

/** Prepare silently with the same Media3 engine as playback. Never takes audio focus. */
@androidx.media3.common.util.UnstableApi
public class MediaProbe extends ReactContextBaseJavaModule {
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final Map<String, Probe> probes=new HashMap<>();
  private static class Probe { ExoPlayer player; Promise promise; Runnable timeout; }
  public MediaProbe(ReactApplicationContext context) { super(context); }
  @Override public String getName() { return "MediaProbe"; }
  private void finish(String id, boolean success, String message) {
    Probe probe=probes.remove(id); if(probe==null) return;
    handler.removeCallbacks(probe.timeout); probe.player.release();
    if(success) probe.promise.resolve(true); else probe.promise.reject("MEDIA_UNAVAILABLE",message);
  }
  @ReactMethod public void validate(String id,String url,ReadableMap headers,Promise promise) {
    handler.post(() -> {
      if(probes.size()>=2 || probes.containsKey(id)) { promise.reject("MEDIA_BUSY","Media validation is busy"); return; }
      try {
        Map<String,String> requestHeaders=new HashMap<>();
        ReadableMapKeySetIterator keys=headers.keySetIterator();
        while(keys.hasNextKey()) { String key=keys.nextKey(); requestHeaders.put(key,headers.getString(key)); }
        DefaultHttpDataSource.Factory http=new DefaultHttpDataSource.Factory()
          .setUserAgent("Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36")
          .setConnectTimeoutMs(6000).setReadTimeoutMs(6000).setAllowCrossProtocolRedirects(true).setDefaultRequestProperties(requestHeaders);
        Probe probe=new Probe(); probe.promise=promise;
        probe.player=new ExoPlayer.Builder(getReactApplicationContext()).setMediaSourceFactory(new DefaultMediaSourceFactory(http)).build();
        probe.timeout=() -> finish(id,false,"音频验证超时");
        probes.put(id,probe);
        probe.player.setVolume(0); probe.player.setPlayWhenReady(false);
        probe.player.addListener(new Player.Listener() {
          @Override public void onPlaybackStateChanged(int state) {
            if(state!=Player.STATE_READY) return;
            boolean audio=false;
            for(Tracks.Group group:probe.player.getCurrentTracks().getGroups()) if(group.getType()==C.TRACK_TYPE_AUDIO && group.isSupported()) audio=true;
            finish(id,audio,audio?"":"返回的媒体没有可解码音频");
          }
          @Override public void onPlayerError(PlaybackException error) { finish(id,false,"返回的音频无法播放"); }
        });
        handler.postDelayed(probe.timeout,8000);
        probe.player.setMediaItem(MediaItem.fromUri(url)); probe.player.prepare();
      } catch(Exception e) { if(probes.containsKey(id)) finish(id,false,"音频验证失败"); else promise.reject("MEDIA_UNAVAILABLE","音频验证失败"); }
    });
  }
  @ReactMethod public void cancel(String id) { handler.post(() -> finish(id,false,"cancel request")); }
  @Override public void invalidate() { handler.post(() -> { for(String id:probes.keySet().toArray(new String[0])) finish(id,false,"cancel request"); }); super.invalidate(); }
}
