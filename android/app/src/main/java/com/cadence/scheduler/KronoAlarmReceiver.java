package com.cadence.scheduler;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

public class KronoAlarmReceiver extends BroadcastReceiver {

    public static final String ACTION_FIRE_ALARM = "com.cadence.scheduler.ACTION_FIRE_ALARM";
    public static final String ACTION_STOP_ALARM = "com.cadence.scheduler.ACTION_STOP_ALARM";
    public static final String ACTION_SNOOZE_ALARM = "com.cadence.scheduler.ACTION_SNOOZE_ALARM";

    public static final String EXTRA_ALARM_ID = "alarm_id";
    public static final String EXTRA_REQ_CODE = "req_code";
    public static final String EXTRA_TITLE = "alarm_title";
    public static final String EXTRA_BODY = "alarm_body";
    public static final String EXTRA_SOUND = "alarm_sound";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();

        if (ACTION_STOP_ALARM.equals(action)) {
            // Stops ringing immediately & removes notification WITHOUT opening the app
            context.stopService(new Intent(context, KronoAlarmService.class));
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(KronoAlarmService.NOTIFICATION_ID);
            }
            return;
        }

        if (ACTION_SNOOZE_ALARM.equals(action)) {
            // Stops current alarm and schedules +5 minutes WITHOUT opening the app
            context.stopService(new Intent(context, KronoAlarmService.class));
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(KronoAlarmService.NOTIFICATION_ID);
            }

            String id = intent.getStringExtra(EXTRA_ALARM_ID);
            if (id == null || id.isEmpty()) id = "snoozed-" + System.currentTimeMillis();
            String title = intent.getStringExtra(EXTRA_TITLE);
            if (title == null || title.isEmpty()) title = "KRONO Alarm";
            String body = intent.getStringExtra(EXTRA_BODY);
            if (body == null) body = "Snoozed reminder";
            String sound = intent.getStringExtra(EXTRA_SOUND);
            if (sound == null) sound = "default";

            long snoozeAt = System.currentTimeMillis() + (5 * 60 * 1000L);
            String snoozeTitle = title.startsWith("Snoozed · ") ? title : ("Snoozed · " + title);
            int reqCode = KronoAlarmPlugin.requestCodeFor(id + "-snooze");
            KronoAlarmPlugin.scheduleExactAlarm(context, reqCode, id + "-snooze", snoozeAt, snoozeTitle, body, sound);
            return;
        }

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            rescheduleAfterBoot(context);
            return;
        }

        if (ACTION_FIRE_ALARM.equals(action)) {
            Intent serviceIntent = new Intent(context, KronoAlarmService.class);
            serviceIntent.putExtra(EXTRA_ALARM_ID, intent.getStringExtra(EXTRA_ALARM_ID));
            serviceIntent.putExtra(EXTRA_REQ_CODE, intent.getIntExtra(EXTRA_REQ_CODE, 10001));
            serviceIntent.putExtra(EXTRA_TITLE, intent.getStringExtra(EXTRA_TITLE));
            serviceIntent.putExtra(EXTRA_BODY, intent.getStringExtra(EXTRA_BODY));
            serviceIntent.putExtra(EXTRA_SOUND, intent.getStringExtra(EXTRA_SOUND));

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        }
    }

    private void rescheduleAfterBoot(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(KronoAlarmPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KronoAlarmPlugin.KEY_ALARMS_JSON, "[]");
        long now = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.optJSONObject(i);
                if (obj == null) continue;
                String id = obj.optString("id", "");
                long triggerAt = obj.optLong("triggerAtMs", 0L);
                if (id.isEmpty() || triggerAt <= now) continue;
                KronoAlarmPlugin.scheduleExactAlarm(
                        context,
                        KronoAlarmPlugin.requestCodeFor(id),
                        id,
                        triggerAt,
                        obj.optString("title", "KRONO Alarm"),
                        obj.optString("body", "Scheduled reminder"),
                        obj.optString("sound", "default")
                );
            }
        } catch (Exception ignored) {
        }
    }
}