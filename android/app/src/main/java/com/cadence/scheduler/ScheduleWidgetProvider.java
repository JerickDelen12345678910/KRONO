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
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ScheduleWidgetProvider extends AppWidgetProvider {

    public static final String PREFS_NAME = "cadence_widget_prefs";
    public static final String KEY_ITEMS_JSON = "schedule_items_json";
    public static final String KEY_OVERRIDE_MODE = "override_mode";
    public static final String KEY_OVERRIDE_TIME = "override_time";
    public static final String KEY_OVERRIDE_TITLE = "override_title";
    public static final String KEY_OVERRIDE_SUBTITLE = "override_subtitle";
    public static final String KEY_COMPLETED_IDS = "completed_item_ids";
    public static final String KEY_POST_GYM_RECOVERY = "pending_post_gym_recovery";

    public static final String ACTION_REFRESH = "com.cadence.scheduler.ACTION_REFRESH_WIDGET";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId);
        }
        scheduleNextRefresh(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
        updateSingleWidget(context, appWidgetManager, appWidgetId);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent != null && ACTION_REFRESH.equals(intent.getAction())) {
            updateAllWidgets(context);
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

    private static void applyResponsiveLayout(RemoteViews views, AppWidgetManager manager, int widgetId, boolean hasLocation) {
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int minW = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 260) : 260;
        int minH = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110) : 110;

        boolean isCompactW = minW < 200;
        boolean isShortH = minH < 88;
        boolean isLarge = minW >= 300 && minH >= 120;

        // Top bar visibility: hide on ultra-compact height/width so primary schedule remains crisp
        views.setViewVisibility(R.id.widget_top_bar, (isShortH || isCompactW) ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_brand, minW < 235 ? View.GONE : View.VISIBLE);

        // Mascot frame & text scaling based on widget bounds
        if (isCompactW || isShortH) {
            views.setTextViewTextSize(R.id.widget_time, TypedValue.COMPLEX_UNIT_SP, 10f);
            views.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP, 15f);
            views.setTextViewTextSize(R.id.widget_subtitle, TypedValue.COMPLEX_UNIT_SP, 10f);
            views.setViewVisibility(R.id.widget_location, View.GONE);
            views.setViewVisibility(R.id.widget_subtitle, isShortH ? View.GONE : View.VISIBLE);
        } else if (isLarge) {
            views.setTextViewTextSize(R.id.widget_time, TypedValue.COMPLEX_UNIT_SP, 12f);
            views.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP, 20f);
            views.setTextViewTextSize(R.id.widget_location, TypedValue.COMPLEX_UNIT_SP, 12f);
            views.setTextViewTextSize(R.id.widget_subtitle, TypedValue.COMPLEX_UNIT_SP, 12f);
            views.setViewVisibility(R.id.widget_location, hasLocation ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.widget_subtitle, View.VISIBLE);
        } else {
            views.setTextViewTextSize(R.id.widget_time, TypedValue.COMPLEX_UNIT_SP, 11f);
            views.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP, 17f);
            views.setTextViewTextSize(R.id.widget_location, TypedValue.COMPLEX_UNIT_SP, 11f);
            views.setTextViewTextSize(R.id.widget_subtitle, TypedValue.COMPLEX_UNIT_SP, 11f);
            views.setViewVisibility(R.id.widget_location, hasLocation ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.widget_subtitle, View.VISIBLE);
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
            String subtitle = prefs.getString(KEY_OVERRIDE_SUBTITLE, "Live route tracking");

            applyModeVisuals(views, overrideMode, "LIVE ETA");
            views.setTextViewText(R.id.widget_time, time.toUpperCase(Locale.US));
            views.setTextViewText(R.id.widget_title, title);
            views.setTextViewText(R.id.widget_subtitle, subtitle);
            applyResponsiveLayout(views, manager, widgetId, false);
            manager.updateAppWidget(widgetId, views);
            return;
        }

        // 2. Current & Next Schedule Detection
        String rawJson = prefs.getString(KEY_ITEMS_JSON, "[]");
        Date now = new Date();
        String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now);
        String nowHm = new SimpleDateFormat("HH:mm", Locale.US).format(now);
        int nowMins = toMinutes(nowHm);

        List<JSONObject> todayItems = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(rawJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                if (todayStr.equals(obj.optString("date"))) {
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

        if (active != null) {
            String displayCode = resolveWidgetLabel(active, "Scheduled");
            String start = active.optString("startTime", "00:00");
            String end = active.optString("endTime", "00:00");
            String location = active.optString("location", "").trim();
            int rem = Math.max(1, toMinutes(end) - nowMins);

            String mode = detectMode(active);
            applyModeVisuals(views, mode, rem + "m left");

            views.setTextViewText(R.id.widget_time, "NOW · " + to12h(start) + " – " + to12h(end));
            views.setTextViewText(R.id.widget_title, displayCode);
            if (!location.isEmpty()) {
                views.setTextViewText(R.id.widget_location, "📍 " + location);
            }

            String nextLine = next != null
                    ? "Up next: " + resolveWidgetLabel(next, "Next") + " (" + to12h(next.optString("startTime", "00:00")) + ")"
                    : "Up next: No more classes today";
            views.setTextViewText(R.id.widget_subtitle, nextLine);
            applyResponsiveLayout(views, manager, widgetId, !location.isEmpty());

        } else if (next != null) {
            int nextIndex = todayItems.indexOf(next);
            JSONObject afterNext = (nextIndex >= 0 && nextIndex + 1 < todayItems.size()) ? todayItems.get(nextIndex + 1) : null;

            String displayCode = resolveWidgetLabel(next, "Upcoming");
            String start = next.optString("startTime", "00:00");
            String end = next.optString("endTime", "00:00");
            String location = next.optString("location", "").trim();

            String mode = detectMode(next);
            applyModeVisuals(views, mode, "UP NEXT");

            views.setTextViewText(R.id.widget_time, "NEXT · " + to12h(start) + " – " + to12h(end));
            views.setTextViewText(R.id.widget_title, displayCode);
            if (!location.isEmpty()) {
                views.setTextViewText(R.id.widget_location, "📍 " + location);
            }

            String afterLine = afterNext != null
                    ? "Then: " + resolveWidgetLabel(afterNext, "Later") + " (" + to12h(afterNext.optString("startTime", "00:00")) + ")"
                    : "Starts at " + to12h(start);
            views.setTextViewText(R.id.widget_subtitle, afterLine);
            applyResponsiveLayout(views, manager, widgetId, !location.isEmpty());

        } else {
            applyModeVisuals(views, "schedule", "FREE");
            views.setTextViewText(R.id.widget_time, "ALL CLEAR TODAY");
            views.setTextViewText(R.id.widget_title, "No Active Schedule");
            views.setTextViewText(R.id.widget_subtitle, "Your timeline is open");
            applyResponsiveLayout(views, manager, widgetId, false);
        }

        manager.updateAppWidget(widgetId, views);
    }

    private static String resolveWidgetLabel(JSONObject item, String fallback) {
        String code = item.optString("courseCode", "").trim();
        if (!code.isEmpty()) return code;
        String title = item.optString("title", fallback).trim();
        return title.isEmpty() ? fallback : title;
    }

    private static String detectMode(JSONObject item) {
        String type = item.optString("type", item.optString("category", "")).toLowerCase(Locale.US);
        String title = item.optString("title", "").toLowerCase(Locale.US);

        if (type.contains("gym") || type.contains("workout") || type.contains("fitness") || type.contains("exercise")
                || title.contains("gym") || title.contains("workout") || title.contains("push")
                || title.contains("pull") || title.contains("leg") || title.contains("cardio")) {
            return "gym";
        }
        if (type.contains("map") || type.contains("travel") || type.contains("route")
                || title.contains("route") || title.contains("trip")) {
            return "map";
        }
        return "schedule";
    }

    private static void applyModeVisuals(RemoteViews views, String mode, String statusTag) {
        if ("gym".equals(mode)) {
            views.setImageViewResource(R.id.widget_mascot, R.drawable.mascot_gym);
            views.setTextViewText(R.id.widget_mode_badge, "● FITNESS · " + statusTag);
            views.setTextColor(R.id.widget_mode_badge, Color.parseColor("#FB923C"));
            views.setTextColor(R.id.widget_time, Color.parseColor("#FDBA74"));
        } else if ("map".equals(mode)) {
            views.setImageViewResource(R.id.widget_mascot, R.drawable.mascot_map);
            views.setTextViewText(R.id.widget_mode_badge, "● ROUTE · " + statusTag);
            views.setTextColor(R.id.widget_mode_badge, Color.parseColor("#34D399"));
            views.setTextColor(R.id.widget_time, Color.parseColor("#6EE7B7"));
        } else {
            views.setImageViewResource(R.id.widget_mascot, R.drawable.mascot_schedule);
            views.setTextViewText(R.id.widget_mode_badge, "● SCHEDULE · " + statusTag);
            views.setTextColor(R.id.widget_mode_badge, Color.parseColor("#38BDF8"));
            views.setTextColor(R.id.widget_time, Color.parseColor("#7DD3FC"));
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