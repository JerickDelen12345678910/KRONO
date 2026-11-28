package com.cadence.scheduler;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.core.app.NotificationCompat;

public class KronoAlarmService extends Service {

    public static final int NOTIFICATION_ID = 909101;
    public static final String CHANNEL_ID = "krono-native-alarm-channel-v1";

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private final Handler autoStopHandler = new Handler(Looper.getMainLooper());
    private final Runnable autoStopRunnable = this::stopSelf;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && KronoAlarmReceiver.ACTION_STOP_ALARM.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String alarmId = intent != null ? intent.getStringExtra(KronoAlarmReceiver.EXTRA_ALARM_ID) : "krono-alarm";
        String title = intent != null ? intent.getStringExtra(KronoAlarmReceiver.EXTRA_TITLE) : "KRONO Alarm";
        String body = intent != null ? intent.getStringExtra(KronoAlarmReceiver.EXTRA_BODY) : "Scheduled reminder is ringing";
        String sound = intent != null ? intent.getStringExtra(KronoAlarmReceiver.EXTRA_SOUND) : "chrono_chime";

        if (title == null || title.isEmpty()) title = "KRONO Alarm";
        if (body == null || body.isEmpty()) body = "Scheduled reminder is ringing";
        if (sound == null || sound.isEmpty()) sound = "chrono_chime";

        ensureNotificationChannel();
        Notification notification = buildAlarmNotification(alarmId, title, body, sound);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        startAlarmAudioAndVibration(sound);

        autoStopHandler.removeCallbacks(autoStopRunnable);
        autoStopHandler.postDelayed(autoStopRunnable, 60_000L);

        return START_NOT_STICKY;
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "KRONO Active Alarms",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Ringing alarms with instant stop and snooze controls");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(channel);
        }
    }

    private Notification buildAlarmNotification(String alarmId, String title, String body, String sound) {
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent stopIntent = new Intent(this, KronoAlarmReceiver.class);
        stopIntent.setAction(KronoAlarmReceiver.ACTION_STOP_ALARM);
        PendingIntent stopPi = PendingIntent.getBroadcast(this, 7001, stopIntent, piFlags);

        Intent snoozeIntent = new Intent(this, KronoAlarmReceiver.class);
        snoozeIntent.setAction(KronoAlarmReceiver.ACTION_SNOOZE_ALARM);
        snoozeIntent.putExtra(KronoAlarmReceiver.EXTRA_ALARM_ID, alarmId);
        snoozeIntent.putExtra(KronoAlarmReceiver.EXTRA_TITLE, title);
        snoozeIntent.putExtra(KronoAlarmReceiver.EXTRA_BODY, body);
        snoozeIntent.putExtra(KronoAlarmReceiver.EXTRA_SOUND, sound);
        PendingIntent snoozePi = PendingIntent.getBroadcast(this, 7002, snoozeIntent, piFlags);

        PendingIntent deletePi = PendingIntent.getBroadcast(this, 7003, stopIntent, piFlags);

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra("stop_alarm_on_open", true);
        PendingIntent openPi = PendingIntent.getActivity(this, 7004, openIntent, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(false)
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .setDeleteIntent(deletePi)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Alarm", stopPi)
                .addAction(android.R.drawable.ic_popup_reminder, "Snooze 5 min", snoozePi)
                .build();
    }

    private Uri resolvePresetAlarmUri(String soundKey) {
        String key = soundKey == null ? "chrono_chime" : soundKey.trim().toLowerCase();
        if ("default".equals(key) || "custom".equals(key)) key = "chrono_chime";
        else if ("gentle".equals(key)) key = "zen_marimba";
        else if ("bright".equals(key)) key = "titan_pulse";

        int rawResId = getResources().getIdentifier(key, "raw", getPackageName());
        if (rawResId == 0) {
            rawResId = getResources().getIdentifier("chrono_chime", "raw", getPackageName());
        }
        if (rawResId != 0) {
            return Uri.parse("android.resource://" + getPackageName() + "/" + rawResId);
        }

        Uri fallback = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (fallback == null) fallback = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        return fallback;
    }

    private void startAlarmAudioAndVibration(String soundKey) {
        stopAlarmAudioAndVibration();

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        AudioAttributes alarmAttrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        if (audioManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(alarmAttrs)
                    .setAcceptsDelayedFocusGain(false)
                    .build();
            audioManager.requestAudioFocus(focusRequest);
        }

        Uri alarmUri = resolvePresetAlarmUri(soundKey);

        try {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alarmUri);
            mediaPlayer.setAudioAttributes(alarmAttrs);
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception ignored) {
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = new long[]{0, 500, 300, 500, 300};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void stopAlarmAudioAndVibration() {
        autoStopHandler.removeCallbacks(autoStopRunnable);
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {
            }
            mediaPlayer = null;
        }
        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception ignored) {
            }
            vibrator = null;
        }
        if (audioManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            try {
                audioManager.abandonAudioFocusRequest(focusRequest);
            } catch (Exception ignored) {
            }
            focusRequest = null;
        }
    }

    @Override
    public void onDestroy() {
        stopAlarmAudioAndVibration();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
