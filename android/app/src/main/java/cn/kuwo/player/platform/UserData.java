package cn.kuwo.player.platform;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import com.facebook.react.bridge.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Versioned user data. Every mutation and recovery snapshot is a SQLite transaction. */
public class UserData extends ReactContextBaseJavaModule {
  private final SQLiteOpenHelper helper;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  public UserData(ReactApplicationContext context) {
    this(context, "lx-user-data.db");
  }
  UserData(ReactApplicationContext context, String fileName) {
    super(context);
    helper = new SQLiteOpenHelper(context, fileName, null, 1) {
      @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE data (key TEXT NOT NULL, part INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(key,part))");
        db.execSQL("CREATE TABLE recovery (key TEXT NOT NULL, part INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(key,part))");
        db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      }
      @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported user data schema; old database retained");
      }
    };
  }
  @Override public String getName() { return "UserData"; }
  private interface Operation { Object run(SQLiteDatabase db) throws Exception; }
  private void run(Promise promise, Operation operation) {
    executor.execute(() -> {
      try { promise.resolve(operation.run(helper.getWritableDatabase())); }
      catch (Exception e) { promise.reject("USER_DATA", "User data operation failed; previous transaction retained", e); }
    });
  }
  private boolean ready(SQLiteDatabase db) {
    try (Cursor c = db.rawQuery("SELECT value FROM meta WHERE key='imported'", null)) { return c.moveToFirst(); }
  }
  private void put(SQLiteDatabase db, String key, String value) {
    db.delete("data", "key=?", new String[]{key});
    for (int offset=0, part=0; offset<value.length(); offset+=200000, part++) {
      ContentValues row = new ContentValues(); row.put("key", key); row.put("part", part);
      row.put("value", value.substring(offset, Math.min(value.length(), offset+200000)));
      db.insertOrThrow("data", null, row);
    }
  }
  private void applyRows(SQLiteDatabase db, ReadableArray rows) {
    for (int i=0; i<rows.size(); i++) { ReadableArray row=rows.getArray(i); put(db,row.getString(0),row.getString(1)); }
  }
  @ReactMethod public void initialized(Promise p) { run(p, db -> ready(db)); }
  @ReactMethod public void migrate(ReadableArray rows, Promise p) {
    run(p, db -> {
      if (ready(db)) return true;
      db.beginTransaction();
      try {
        applyRows(db, rows);
        db.execSQL("INSERT INTO recovery SELECT * FROM data");
        db.execSQL("INSERT INTO meta VALUES ('imported','1')");
        db.setTransactionSuccessful();
      } finally { db.endTransaction(); }
      return true;
    });
  }
  @ReactMethod public void read(String key, Promise p) {
    run(p, db -> {
      StringBuilder value = new StringBuilder();
      try (Cursor c=db.rawQuery("SELECT value FROM data WHERE key=? ORDER BY part",new String[]{key})) {
        if (!c.moveToFirst()) return null;
        do { value.append(c.getString(0)); } while(c.moveToNext());
      }
      return value.toString();
    });
  }
  @ReactMethod public void keys(Promise p) {
    run(p, db -> { WritableArray keys=Arguments.createArray();
      try(Cursor c=db.rawQuery("SELECT DISTINCT key FROM data ORDER BY key",null)) { while(c.moveToNext()) keys.pushString(c.getString(0)); }
      return keys;
    });
  }
  @ReactMethod public void write(ReadableArray rows, ReadableArray removals, boolean snapshot, Promise p) {
    run(p, db -> {
      db.beginTransaction();
      try {
        if(snapshot) { db.execSQL("DELETE FROM recovery"); db.execSQL("INSERT INTO recovery SELECT * FROM data"); }
        for(int i=0;i<removals.size();i++) db.delete("data","key=?",new String[]{removals.getString(i)});
        applyRows(db,rows); db.setTransactionSuccessful();
      } finally { db.endTransaction(); }
      return true;
    });
  }
  @ReactMethod public void recover(Promise p) {
    run(p, db -> {
      db.beginTransaction();
      try {
        try(Cursor c=db.rawQuery("SELECT COUNT(*) FROM recovery",null)) { c.moveToFirst(); if(c.getInt(0)==0) throw new IllegalStateException("No recovery data"); }
        db.execSQL("DELETE FROM data"); db.execSQL("INSERT INTO data SELECT * FROM recovery"); db.setTransactionSuccessful();
      } finally { db.endTransaction(); }
      return true;
    });
  }
  /** Remove migrated secrets from the upgrade/restore recovery copy too. */
  @ReactMethod public void scrub(String key, Promise p) {
    run(p,db -> {
      db.beginTransaction();
      try {
        db.delete("recovery","key=?",new String[]{key});
        db.execSQL("INSERT INTO recovery SELECT * FROM data WHERE key=?",new Object[]{key});
        db.setTransactionSuccessful();
      } finally { db.endTransaction(); }
      return true;
    });
  }
}
