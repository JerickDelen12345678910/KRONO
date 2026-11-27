package com.cadence.scheduler;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class ScheduleWidgetProvider extends AppWidgetProvider {

    public static final String PREFS_NAME = "cadence_widget_prefs";
    public static final String KEY_ITEMS_JSON = "schedule_items_json";
    public static final String KEY_OVERRIDE_MODE = "override_mode";
    public static final String KEY_OVERRIDE_TIME = "override_time";
    public static final String KEY_OVERRIDE_TITLE = "override_title";
    public static final String KEY_OVERRIDE_SUBTITLE = "override_subtitle";
    public static final String KEY_COMPLETED_IDS = "completed_item_ids";
    public static final String KEY_POST_GYM_RECOVERY = "pending_post_gym_recovery";
    public static final String KEY_REST_END_MS = "gym_rest_end_ms";

    public static final String ACTION_REFRESH = "com.cadence.scheduler.ACTION_REFRESH_WIDGET";
    public static final String ACTION_QUICK_DONE = "com.cadence.scheduler.ACTION_QUICK_DONE";
    public static final String ACTION_GYM_REST = "com.cadence.scheduler.ACTION_GYM_REST";
    public static final String ACTION_REST_DONE = "com.cadence.scheduler.ACTION_REST_DONE";
    public static final String ACTION_OPEN_NAV = "com.cadence.scheduler.ACTION_OPEN_NAV";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId);
        }
        scheduleNextRefresh(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        if (ACTION_REFRESH.equals(action)) {
            updateAllWidgets(context);

        } else if (ACTION_QUICK_DONE.equals(action)) {
            String itemId = intent.getStringExtra("item_id");
            boolean isGym = intent.getBooleanExtra("is_gym", false);

            Set<String> completed = new HashSet<>(prefs.getStringSet(KEY_COMPLETED_IDS, new HashSet<String>()));
            if (itemId != null && !itemId.isEmpty()) {
                completed.add(itemId);
            }

            SharedPreferences.Editor ed = prefs.edit().putStringSet(KEY_COMPLETED_IDS, completed);
            if (isGym) {
                ed.putBoolean(KEY_POST_GYM_RECOVERY, true);
            }
            ed.apply();

            Toast.makeText(context, "Done! Advancing to next schedule.", Toast.LENGTH_SHORT).show();
            updateAllWidgets(context);

        } else if (ACTION_GYM_REST.equals(action)) {
            long restEnd = System.currentTimeMillis() + 60_000L;
            prefs.edit().putLong(KEY_REST_END_MS, restEnd).apply();

            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                Intent doneIntent = new Intent(context, ScheduleWidgetProvider.class);
                doneIntent.setAction(ACTION_REST_DONE);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
                PendingIntent pi = PendingIntent.getBroadcast(context, 202, doneIntent, flags);
                am.set(AlarmManager.RTC_WAKEUP, restEnd, pi);
            }

            Toast.makeText(context, "60s rest timer started", Toast.LENGTH_SHORT).show();
            updateAllWidgets(context);

        } else if (ACTION_REST_DONE.equals(action)) {
            prefs.edit().remove(KEY_REST_END_MS).apply();
            Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(500);
                }
            }
            Toast.makeText(context, "Rest done! Next set", Toast.LENGTH_LONG).show();
            updateAllWidgets(context);

        } else if (ACTION_OPEN_NAV.equals(action)) {
            String destQuery = intent.getStringExtra("dest_query");
            if (destQuery == null || destQuery.isEmpty()) destQuery = "Destination";
            Uri gmmUri = Uri.parse("google.navigation:q=" + Uri.encode(destQuery));
            Intent mapIntent = new Intent(Intent.ACTION_VIEW, gmmUri);
            mapIntent.setPackage("com.google.android.apps.maps");
            mapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(mapIntent);
            } catch (Exception e) {
                Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/search/?api=1&query=" + Uri.encode(destQuery)));
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
            }
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, ScheduleWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        if (ids != null && ids.length > 0) {
            for (int id : ids) {
                updateSingleWidget(context, manager, id);
            }
            scheduleNextRefresh(context);
        }
    }

    private static void updateSingleWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_schedule);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openIntent, flags);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        // 1. Check active Map / Route override
        String overrideMode = prefs.getString(KEY_OVERRIDE_MODE, "");
        if (!overrideMode.isEmpty()) {
            String time = prefs.getString(KEY_OVERRIDE_TIME, "Navigating");
            String title = prefs.getString(KEY_OVERRIDE_TITLE, "Active Route");
            String subtitle = prefs.getString(KEY_OVERRIDE_SUBTITLE, "Tap ➤ Go to navigate");

            applyModeVisuals(views, overrideMode, "Route");
            views.setTextViewText(R.id.widget_time, time);
            views.setTextViewText(R.id.widget_title, title);
            views.setTextViewText(R.id.widget_subtitle, subtitle);

            if ("map".equals(overrideMode)) {
                views.setViewVisibility(R.id.widget_action_btn, View.VISIBLE);
                views.setTextViewText(R.id.widget_action_btn, "➤ Go");
                Intent navIntent = new Intent(context, ScheduleWidgetProvider.class);
                navIntent.setAction(ACTION_OPEN_NAV);
                navIntent.putExtra("dest_query", title.replace("To: ", ""));
                PendingIntent navPi = PendingIntent.getBroadcast(context, 301, navIntent, flags);
                views.setOnClickPendingIntent(R.id.widget_action_btn, navPi);
            } else {
                views.setViewVisibility(R.id.widget_action_btn, View.GONE);
            }

            manager.updateAppWidget(widgetId, views);
            return;
        }

        // 2. Current & Next Schedule Detection
        String rawJson = prefs.getString(KEY_ITEMS_JSON, "[]");
        Set<String> completedIds = prefs.getStringSet(KEY_COMPLETED_IDS, new HashSet<String>());

        Date now = new Date();
        String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now);
        String nowHm = new SimpleDateFormat("HH:mm", Locale.US).format(now);
        int nowMins = toMinutes(nowHm);

        List<JSONObject> todayItems = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(rawJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String id = obj.optString("id", "");
                if (todayStr.equals(obj.optString("date")) && !completedIds.contains(id)) {
                    todayItems.add(obj);
                }
            }
        } catch (Exception ignored) {
        }

        Collections.sort(todayItems, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                return a.optString("startTime").compareTo(b.optString("startTime"));
            }
        });

        JSONObject active = null;
        JSONObject next = null;

        for (JSONObject item : todayItems) {
            String start = item.optString("startTime", "00:00");
            String end = item.optString("endTime", "00:00");
            if (start.compareTo(nowHm) <= 0 && end.compareTo(nowHm) > 0) {
                if (active == null) active = item;
                else if (next == null) next = item;
            } else if (start.compareTo(nowHm) > 0 && next == null) {
                next = item;
            }
        }

        long restEndMs = prefs.getLong(KEY_REST_END_MS, 0L);
        boolean restingNow = restEndMs > System.currentTimeMillis();

        if (active != null) {
            String itemId = active.optString("id", "");
            String title = active.optString("title", "Scheduled Event");
            String start = active.optString("startTime", "00:00");
            String end = active.optString("endTime", "00:00");
            int rem = Math.max(1, toMinutes(end) - nowMins);

            String mode = detectMode(active);
            applyModeVisuals(views, mode, rem + "m left");

            views.setTextViewText(R.id.widget_time, "NOW · " + to12h(start) + "–" + to12h(end));
            views.setTextViewText(R.id.widget_title, title);

            String nextLine = next != null
                    ? "Next: " + next.optString("title") + " (" + to12h(next.optString("startTime", "00:00")) + ")"
                    : "Next: Nothing else today";
            views.setTextViewText(R.id.widget_subtitle, restingNow ? "Resting 60s · " + nextLine : nextLine);

            views.setViewVisibility(R.id.widget_action_btn, View.VISIBLE);
            if ("gym".equals(mode)) {
                views.setTextViewText(R.id.widget_action_btn, restingNow ? "⏱ Resting" : "⏱ 60s Rest");
                Intent restIntent = new Intent(context, ScheduleWidgetProvider.class);
                restIntent.setAction(ACTION_GYM_REST);
                PendingIntent restPi = PendingIntent.getBroadcast(context, 302, restIntent, flags);
                views.setOnClickPendingIntent(R.id.widget_action_btn, restPi);
            } else {
                views.setTextViewText(R.id.widget_action_btn, "✓ Done");
                Intent doneIntent = new Intent(context, ScheduleWidgetProvider.class);
                doneIntent.setAction(ACTION_QUICK_DONE);
                doneIntent.putExtra("item_id", itemId);
                doneIntent.putExtra("is_gym", false);
                PendingIntent donePi = PendingIntent.getBroadcast(context, 303, doneIntent, flags);
                views.setOnClickPendingIntent(R.id.widget_action_btn, donePi);
            }

        } else if (next != null) {
            // Promote next schedule to primary display when nothing is active right now, and show the following one below
            int nextIndex = todayItems.indexOf(next);
            JSONObject afterNext = (nextIndex >= 0 && nextIndex + 1 < todayItems.size()) ? todayItems.get(nextIndex + 1) : null;

            String title = next.optString("title", "Upcoming Event");
            String start = next.optString("startTime", "00:00");
            String end = next.optString("endTime", "00:00");

            String mode = detectMode(next);
            applyModeVisuals(views, mode, "Up next");

            views.setTextViewText(R.id.widget_time, "NEXT · " + to12h(start) + "–" + to12h(end));
            views.setTextViewText(R.id.widget_title, title);
            String afterLine = afterNext != null
                    ? "Then: " + afterNext.optString("title") + " (" + to12h(afterNext.optString("startTime", "00:00")) + ")"
                    : (next.optString("location", "").isEmpty() ? "Starts at " + to12h(start) : next.optString("location"));
            views.setTextViewText(R.id.widget_subtitle, afterLine);
            views.setViewVisibility(R.id.widget_action_btn, View.GONE);

        } else {
            applyModeVisuals(views, "schedule", "Free");
            views.setTextViewText(R.id.widget_time, "ALL CLEAR");
            views.setTextViewText(R.id.widget_title, "No schedule right now");
            views.setTextViewText(R.id.widget_subtitle, "Next: Schedule is open");
            views.setViewVisibility(R.id.widget_action_btn, View.GONE);
        }

        manager.updateAppWidget(widgetId, views);
    }

    private static String detectMode(JSONObject item) {
        String type = item.optString("type", item.optString("category", "")).toLowerCase(Locale.US);
        String title = item.optString("title", "").toLowerCase(Locale.US);

        if (type.contains("gym") || type.contains("workout") || type.contains("exercise")
                || title.contains("gym") || title.contains("workout") || title.contains("leg day")
                || title.contains("upper") || title.contains("lower") || title.contains("push")
                || title.contains("pull") || title.contains("arm") || title.contains("cardio")) {
            return "gym";
        }
        if (type.contains("map") || type.contains("travel") || type.contains("route")
                || title.contains("route") || title.contains("navigate") || title.contains("trip")) {
            return "map";
        }
        return "schedule";
    }

    private static void applyModeVisuals(RemoteViews views, String mode, String statusTag) {
        if ("gym".equals(mode)) {
            views.setImageViewResource(R.id.widget_mascot, R.drawable.mascot_gym);
            views.setTextViewText(R.id.widget_mode_badge, "● Workout · " + statusTag);
            views.setTextColor(R.id.widget_mode_badge, Color.parseColor("#FB923C"));
        } else if ("map".equals(mode)) {
            views.setImageViewResource(R.id.widget_mascot, R.drawable.mascot_map);
            views.setTextViewText(R.id.widget_mode_badge, "● Route · " + statusTag);
            views.setTextColor(R.id.widget_mode_badge, Color.parseColor("#4ADE80"));
        } else {
            views.setImageViewResource(R.id.widget_mascot, R.drawable.mascot_schedule);
            views.setTextViewText(R.id.widget_mode_badge, "● Schedule · " + statusTag);
            views.setTextColor(R.id.widget_mode_badge, Color.parseColor("#38BDF8"));
        }
    }

    private static void scheduleNextRefresh(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        Intent intent = new Intent(context, ScheduleWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(context, 101, intent, flags);
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.MINUTE, 5);
        alarmManager.set(AlarmManager.RTC, cal.getTimeInMillis(), pi);
    }

    private static int toMinutes(String hhmm) {
        try {
            String[] parts = hhmm.split(":");
            return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
        } catch (Exception e) {
            return 0;
        }
    }

    private static String to12h(String hhmm) {
        try {
            String[] parts = hhmm.split(":");
            int h = Integer.parseInt(parts[0]);
            String m = parts[1];
            String ampm = h >= 12 ? "PM" : "AM";
            int h12 = h % 12;
            if (h12 == 0) h12 = 12;
            return h12 + ":" + m + " " + ampm;
        } catch (Exception e) {
            return hhmm;
        }
    }
}