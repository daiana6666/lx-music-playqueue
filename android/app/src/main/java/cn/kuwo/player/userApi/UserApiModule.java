package cn.kuwo.player.userApi;

import android.os.Bundle;
import android.os.Message;
import com.facebook.react.bridge.*;
import java.util.LinkedHashMap;
import java.util.Map;

/** Each runtime has its own QuickJS thread, context, timer queue and event generation. */
public class UserApiModule extends ReactContextBaseJavaModule {
  private final Map<String, JavaScriptThread> runtimes = new LinkedHashMap<>();
  private final Map<String, JsHandler> events = new LinkedHashMap<>();
  private final ReactApplicationContext context;
  public UserApiModule(ReactApplicationContext context) { super(context); this.context=context; }
  @Override public String getName() { return "UserApiModule"; }
  @ReactMethod public void addListener(String name) {}
  @ReactMethod public void removeListeners(Integer count) {}
  @ReactMethod public synchronized void loadScript(ReadableMap data, Promise promise) {
    String id=data.getString("runtimeId");
    if(runtimes.containsKey(id) || runtimes.size()>=3 || data.getString("script").length()>2000000) {
      promise.reject("RUNTIME_LIMIT", "Source runtime capacity or script size exceeded"); return;
    }
    Bundle info=Arguments.toBundle(data);
    JavaScriptThread thread=new JavaScriptThread(context,info);
    JsHandler handler=new JsHandler(context.getMainLooper(),new UtilsEvent(context),id);
    runtimes.put(id,thread); events.put(id,handler);
    thread.setUncaughtExceptionHandler((failed, error) -> {
      handler.sendMessage(handler.obtainMessage(HandlerWhat.INIT_FAILED,"Source runtime terminated"));
    });
    thread.prepareHandler(handler);
    thread.getHandler().sendEmptyMessage(HandlerWhat.INIT);
    promise.resolve(true);
  }
  @ReactMethod public synchronized void sendAction(String id, String action, String info) {
    JavaScriptThread thread=runtimes.get(id);
    if(thread==null) return;
    Message message=thread.getHandler().obtainMessage(HandlerWhat.ACTION,new Object[]{action,info});
    thread.getHandler().sendMessage(message);
  }
  @ReactMethod public synchronized void destroy(String id, Promise promise) {
    JavaScriptThread thread=runtimes.get(id);
    if(thread==null) { promise.resolve(true); return; }
    JsHandler handler=events.remove(id); if(handler!=null) handler.close();
    thread.getHandler().removeCallbacksAndMessages(null);
    thread.getHandler().sendMessage(thread.getHandler().obtainMessage(HandlerWhat.DESTROY,(Runnable)() -> {
      synchronized(UserApiModule.this) { runtimes.remove(id); }
      promise.resolve(true);
    }));
  }
  @ReactMethod public synchronized void runtimeCount(Promise promise) { promise.resolve(runtimes.size()); }
  @Override public synchronized void invalidate() {
    for(Map.Entry<String,JavaScriptThread> item:runtimes.entrySet()) {
      JsHandler handler=events.get(item.getKey()); if(handler!=null) handler.close();
      item.getValue().getHandler().removeCallbacksAndMessages(null);
      item.getValue().getHandler().sendEmptyMessage(HandlerWhat.DESTROY);
    }
    events.clear(); runtimes.clear(); super.invalidate();
  }
}
