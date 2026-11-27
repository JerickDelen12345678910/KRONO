package com.cadence.scheduler;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "KronoAlarm")
public class KronoAlarmPlugin extends Plugin {

    public static final String PREFS_NAME = "krono_native_alarms";
    public static final String KEY_ALARMS_JSON = "scheduled_alarms_json";

    @PluginMethod
    public void scheduleAlarms(PluginCall call) {
        JSArray alarms = call.getArray("alarms");
        Context ctx = getContext();
        if (ctx == null || alarms == null) {
            call.resolve();
            return;
        }

        try {
            // Cancel previously registered native alarms first
            cancelStoredAlarms(ctx);

            JSONArray validToStore = new JSONArray();
            long now = System.currentTimeMillis();

            for (int i = 0; i < alarms.length(); i++) {
                JSONObject obj = alarms.optJSONObject(i);
                if (obj == null) continue;

                String id = obj.optString("id", "");
                long triggerAt = obj.optLong("triggerAtMs", 0L);
                String title = obj.optString("title", "KRONO Alarm");
                String body = obj.optString("body", "Scheduled reminder");
                String sound = obj.optString("sound", "default");

                if (id.isEmpty() || triggerAt <= now) continue;

                int reqCode = requestCodeFor(id);
                scheduleExactAlarm(ctx, reqCode, id, triggerAt, title, body, sound);
                validToStore.put(obj);
            }

            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_ALARMS_JSON, validToStore.toString())
                    .apply();

            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to schedule native alarms: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelAlarms(PluginCall call) {
        JSArray ids = call.getArray("ids");
        Context ctx = getContext();
        if (ctx == null) {
            call.resolve();
            return;
        }

        if (ids != null) {
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i, "");
                if (!id.isEmpty()) {
                    cancelSingleAlarm(ctx, requestCodeFor(id));
                }
            }
        }
        stopActiveAlarmService(ctx);
        call.resolve();
    }

    @PluginMethod
    public void stopRinging(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            stopActiveAlarmService(ctx);
        }
        call.resolve();
    }

    public static void scheduleExactAlarm(Context ctx, int reqCode, String alarmId, long triggerAtMs, String title, String body, String sound) {
        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent fireIntent = new Intent(ctx, KronoAlarmReceiver.class);
        fireIntent.setAction(KronoAlarmReceiver.ACTION_FIRE_ALARM);
        fireIntent.putExtra(KronoAlarmReceiver.EXTRA_ALARM_ID, alarmId);
        fireIntent.putExtra(KronoAlarmReceiver.EXTRA_REQ_CODE, reqCode);
        fireIntent.putExtra(KronoAlarmReceiver.EXTRA_TITLE, title);
        fireIntent.putExtra(KronoAlarmReceiver.EXTRA_BODY, body);
        fireIntent.putExtra(KronoAlarmReceiver.EXTRA_SOUND, sound);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent firePi = PendingIntent.getBroadcast(ctx, reqCode, fireIntent, flags);

        Intent showIntent = new Intent(ctx, MainActivity.class);
        showIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent showPi = PendingIntent.getActivity(ctx, reqCode + 50000, showIntent, flags);

        // setAlarmClock guarantees exact wake-up & audio playback even in Doze mode or while TikTok/Facebook is running
        AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(triggerAtMs, showPi);
        alarmManager.setAlarmClock(clockInfo, firePi);
    }

    public static void cancelSingleAlarm(Context ctx, int reqCode) {
        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent fireIntent = new Intent(ctx, KronoAlarmReceiver.class);
        fireIntent.setAction(KronoAlarmReceiver.ACTION_FIRE_ALARM);
        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode, fireIntent, flags);
        if (pi != null) {
            alarmManager.cancel(pi);
            pi.cancel();
        }
    }

    public static void cancelStoredAlarms(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_ALARMS_JSON, "[]");
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.optJSONObject(i);
                if (obj != null) {
                    String id = obj.optString("id", "");
                    if (!id.isEmpty()) cancelSingleAlarm(ctx, requestCodeFor(id));
                }
            }
        } catch (Exception ignored) {
        }
    }

    public static void stopActiveAlarmService(Context ctx) {
        Intent stopIntent = new Intent(ctx, KronoAlarmService.class);
        stopIntent.setAction(KronoAlarmReceiver.ACTION_STOP_ALARM);
        ctx.stopService(stopIntent);
    }

    public static int requestCodeFor(String id) {
        int hash = 216613626;
        for (int i = 0; i < id.length(); i++) {
            hash ^= id.charAt(i);
            hash *= 16777619;
        }
        return (Math.abs(hash) % 1000000) + 10000;
    }
}