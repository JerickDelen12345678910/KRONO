package com.cadence.scheduler;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScheduleWidgetPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        registerPlugin(KronoAlarmPlugin.class);
        super.onCreate(savedInstanceState);
        handleAlarmIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleAlarmIntent(intent);
    }

    private void handleAlarmIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("stop_alarm_on_open", false)) {
            KronoAlarmPlugin.stopActiveAlarmService(this);
        }
    }
}