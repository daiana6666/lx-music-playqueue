package cn.kuwo.player.platform;

import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import com.facebook.react.bridge.*;
import cn.kuwo.player.userApi.QuickJS;
import java.lang.reflect.Proxy;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.net.ServerSocket;
import java.net.Socket;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.json.JSONObject;

/** Isolated test DB and synthetic audio; never replaces the user's database or credentials. */
public class Phase3Checks {
  private static class Result {
    Object value; boolean rejected;
    CountDownLatch done=new CountDownLatch(1);
    Promise promise=(Promise)Proxy.newProxyInstance(Promise.class.getClassLoader(),new Class<?>[]{Promise.class},(proxy,method,args) -> {
      if(method.getName().equals("resolve") || method.getName().equals("reject")) {
        rejected=method.getName().equals("reject"); value=args==null?null:args[0]; done.countDown();
      }
      return null;
    });
    Result await() throws Exception { if(!done.await(20,TimeUnit.SECONDS)) throw new AssertionError("Native operation timeout"); return this; }
  }
  private static void check(boolean value,String name) { if(!value) throw new AssertionError(name); }
  public static String run(Context target) throws Exception {
    ReactApplicationContext context=new ReactApplicationContext(target);
    target.deleteDatabase("phase3-isolated-test.db");
    UserData db=new UserData(context,"phase3-isolated-test.db");
    Result r=new Result();
    db.migrate(JavaOnlyArray.of(JavaOnlyArray.of("songs","[1,2,3]"),JavaOnlyArray.of("settings","{\"volume\":1}")),r.promise);
    check(!r.await().rejected,"migration commits");
    r=new Result(); db.migrate(JavaOnlyArray.of(JavaOnlyArray.of("songs","[]")),r.promise); r.await();
    r=new Result(); db.read("songs",r.promise); check("[1,2,3]".equals(r.await().value),"migration reentry does not overwrite");
    r=new Result(); db.write(JavaOnlyArray.of(JavaOnlyArray.of("songs","[]"),JavaOnlyArray.of("broken")),JavaOnlyArray.of(),false,r.promise);
    check(r.await().rejected,"failed transaction rejected");
    r=new Result(); db.read("songs",r.promise); check("[1,2,3]".equals(r.await().value),"partial mutation rolled back");
    String large="\""+new String(new char[700000]).replace('\0','x')+"\"";
    r=new Result(); db.write(JavaOnlyArray.of(JavaOnlyArray.of("large",large)),JavaOnlyArray.of(),false,r.promise); check(!r.await().rejected,"large chunked write");
    UserData reopened=new UserData(context,"phase3-isolated-test.db");
    r=new Result(); reopened.read("large",r.promise); check(large.equals(r.await().value),"chunked data survives new module");
    r=new Result(); db.write(JavaOnlyArray.of(JavaOnlyArray.of("songs","[9]")),JavaOnlyArray.of(),true,r.promise); r.await();
    r=new Result(); db.recover(r.promise); check(!r.await().rejected,"recovery completes");
    r=new Result(); db.read("songs",r.promise); check("[1,2,3]".equals(r.await().value),"pre-restore data recovered");
    r=new Result(); db.write(JavaOnlyArray.of(),JavaOnlyArray.of("settings"),false,r.promise); r.await();
    r=new Result(); db.scrub("settings",r.promise); r.await();
    r=new Result(); db.recover(r.promise); r.await();
    r=new Result(); db.read("settings",r.promise); check(r.await().value==null,"scrubbed secret cannot return through recovery");

    testQuickJS(context);
    testMedia(context);
    return "10 SQLite migration/transaction/chunk/recovery checks, 3 QuickJS isolation/quality/destruction checks and 3 Media3 valid/invalid/cancel checks passed.\n";
  }
  private static void testQuickJS(ReactApplicationContext context) throws Exception {
    HandlerThread worker=new HandlerThread("phase3-quickjs-test"); worker.start();
    Handler handler=new Handler(worker.getLooper());
    CountDownLatch done=new CountDownLatch(2);
    AtomicReference<Throwable> failure=new AtomicReference<>();
    AtomicReference<String> first=new AtomicReference<>(),second=new AtomicReference<>();
    QuickJS[] runtimes=new QuickJS[2];
    for(int i=0;i<2;i++) {
      final int index=i;
      Handler events=new Handler(Looper.getMainLooper(),message -> {
        if(message.obj instanceof Object[]) {
          Object[] payload=(Object[])message.obj;
          if(payload.length==2 && "response".equals(payload[0])) {
            try {
              JSONObject response=new JSONObject((String)payload[1]);
              JSONObject data=response.getJSONObject("result").getJSONObject("data");
              (index==0?first:second).set(data.getString("url"));
              check(index==0?data.isNull("quality"):"128k".equals(data.getString("quality")),"requested quality is not reported quality");
            } catch(Throwable error) { failure.set(error); }
            done.countDown();
          }
        }
        return true;
      });
      handler.post(() -> {
        try {
          QuickJS js=new QuickJS(context,events); runtimes[index]=js;
          Bundle info=new Bundle(); info.putString("id","phase3_"+index); info.putString("name","Synthetic source");
          String response=index==0?"'https://example.test/a'":"{url:'https://example.test/b',quality:'128k'}";
          info.putString("script","const privateValue="+index+"; lx.on(lx.EVENT_NAMES.request,()=>Promise.resolve("+response+")); lx.send(lx.EVENT_NAMES.inited,{status:true,sources:{kw:{type:'music',actions:['musicUrl'],qualitys:['128k','flac']}}});");
          check("".equals(js.loadScript(info)),"source initialized");
          js.callJS("request","{\"requestKey\":\"same-key\",\"data\":{\"source\":\"kw\",\"action\":\"musicUrl\",\"info\":{\"type\":\"flac\"}}}");
        } catch(Throwable error) { failure.set(error); done.countDown(); }
      });
    }
    check(done.await(15,TimeUnit.SECONDS),"source responses complete");
    if(failure.get()!=null) throw new AssertionError(failure.get());
    check("https://example.test/a".equals(first.get()) && "https://example.test/b".equals(second.get()),"source globals and callbacks isolated");
    CountDownLatch closed=new CountDownLatch(1);
    handler.post(() -> { for(QuickJS js:runtimes) if(js!=null) js.destroy(); closed.countDown(); worker.quitSafely(); });
    check(closed.await(5,TimeUnit.SECONDS),"source contexts destroy");
  }
  private static void testMedia(ReactApplicationContext context) throws Exception {
    ServerSocket server=new ServerSocket(0);
    byte[] wav=wave();
    Thread requests=new Thread(() -> {
      while(!server.isClosed()) try {
        Socket socket=server.accept();
        Thread response=new Thread(() -> {
          try(Socket connection=socket) {
            BufferedReader reader=new BufferedReader(new InputStreamReader(connection.getInputStream()));
            String line=reader.readLine(),header; while((header=reader.readLine())!=null && !header.isEmpty()) {}
            if(line!=null && line.contains("slow")) Thread.sleep(1000);
            boolean good=line!=null && !line.contains("bad"); byte[] body=good?wav:"<html>not audio</html>".getBytes("UTF-8");
            String head="HTTP/1.1 200 OK\r\nContent-Type: "+(good?"audio/wav":"text/html")+"\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n";
            connection.getOutputStream().write(head.getBytes("US-ASCII")); connection.getOutputStream().write(body); connection.getOutputStream().flush();
          } catch(Exception ignored) {}
        }); response.setDaemon(true); response.start();
      } catch(Exception ignored) { break; }
    }); requests.setDaemon(true); requests.start();
    try {
      MediaProbe probe=new MediaProbe(context); String url="http://127.0.0.1:"+server.getLocalPort();
      Result result=new Result(); probe.validate("valid",url+"/audio.wav",new JavaOnlyMap(),result.promise); check(!result.await().rejected,"valid media prepares");
      result=new Result(); probe.validate("bad",url+"/bad",new JavaOnlyMap(),result.promise); check(result.await().rejected,"HTML rejected as media");
      result=new Result(); probe.validate("cancel",url+"/slow.wav",new JavaOnlyMap(),result.promise); probe.cancel("cancel"); check(result.await().rejected,"cancel rejects and releases validator");
      probe.invalidate();
    } finally { server.close(); }
  }
  private static byte[] wave() {
    int size=44100*2;
    ByteBuffer buffer=ByteBuffer.allocate(44+size).order(ByteOrder.LITTLE_ENDIAN);
    buffer.put(new byte[]{'R','I','F','F'}).putInt(36+size).put(new byte[]{'W','A','V','E','f','m','t',' '}).putInt(16).putShort((short)1).putShort((short)1).putInt(44100).putInt(88200).putShort((short)2).putShort((short)16).put(new byte[]{'d','a','t','a'}).putInt(size);
    for(int i=0;i<44100;i++) buffer.putShort((short)(Math.sin(i*2*Math.PI*440/44100)*1000));
    return buffer.array();
  }
}
