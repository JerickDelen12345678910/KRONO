package com.cadence.scheduler;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "ScheduleWidget")
public class ScheduleWidgetPlugin extends Plugin {

    @PluginMethod
    public void syncItems(PluginCall call) {
        String itemsJson = call.getString("itemsJson", "[]");
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(ScheduleWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(ScheduleWidgetProvider.KEY_ITEMS_JSON, itemsJson)
            .remove(ScheduleWidgetProvider.KEY_OVERRIDE_MODE)
            .apply();
        ScheduleWidgetProvider.updateAllWidgets(context);
        call.resolve();
    }

    @PluginMethod
    public void setActiveMode(PluginCall call) {
        String mode = call.getString("mode", "schedule");
        String time = call.getString("time", "");
        String title = call.getString("title", "");
        String subtitle = call.getString("subtitle", "");

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(ScheduleWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        if (mode == null || mode.isEmpty() || "auto".equalsIgnoreCase(mode)) {
            editor.remove(ScheduleWidgetProvider.KEY_OVERRIDE_MODE);
        } else {
            editor.putString(ScheduleWidgetProvider.KEY_OVERRIDE_MODE, mode.toLowerCase())
                  .putString(ScheduleWidgetProvider.KEY_OVERRIDE_TIME, time)
                  .putString(ScheduleWidgetProvider.KEY_OVERRIDE_TITLE, title)
                  .putString(ScheduleWidgetProvider.KEY_OVERRIDE_SUBTITLE, subtitle);
        }
        editor.apply();

        ScheduleWidgetProvider.updateAllWidgets(context);
        call.resolve();
    }

    @PluginMethod
    public void getWidgetState(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(ScheduleWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);

        int streak = prefs.getInt("streak_count", 0);
        boolean pendingRecovery = prefs.getBoolean(ScheduleWidgetProvider.KEY_POST_GYM_RECOVERY, false);
        Set<String> completed = prefs.getStringSet(ScheduleWidgetProvider.KEY_COMPLETED_IDS, new HashSet<String>());

        JSArray completedArr = new JSArray();
        for (String id : completed) {
            completedArr.put(id);
        }

        JSObject ret = new JSObject();
        ret.put("streak", streak);
        ret.put("pendingPostGymRecovery", pendingRecovery);
        ret.put("completedIds", completedArr);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearRecoveryPrompt(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(ScheduleWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(ScheduleWidgetProvider.KEY_POST_GYM_RECOVERY, false).apply();
        call.resolve();
    }
}