package com.trackingunit_byd.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

/**
 * Foreground Service agar WebView tetap aktif saat layar mati.
 * Ini memastikan Firebase Realtime Listener tetap jalan
 * dan suara notifikasi tetap bisa berbunyi.
 */
public class KeepAliveService extends Service {

    private static final String TAG = "KeepAlive";
    private static final String CHANNEL_ID = "tracking_unit_channel";
    private static final int NOTIFICATION_ID = 1001;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "KeepAliveService dibuat");
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.i(TAG, "KeepAliveService dimulai - Aplikasi tetap aktif di background");

        // Buat notifikasi permanen di status bar
        Intent notifIntent = new Intent(this, MainActivity.class);
        notifIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notifIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notification = new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Tracking Unit Aktif")
                .setContentText("Monitoring unit berjalan di background")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
        } else {
            notification = new Notification.Builder(this)
                .setContentTitle("Tracking Unit Aktif")
                .setContentText("Monitoring unit berjalan di background")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
        }

        startForeground(NOTIFICATION_ID, notification);

        // Acquire WakeLock agar CPU tidak tidur
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "TrackingUnit::KeepAliveWakeLock"
            );
            wakeLock.acquire();
            Log.i(TAG, "WakeLock acquired - CPU tetap aktif");
        }

        // START_STICKY = restart otomatis jika di-kill oleh sistem
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "KeepAliveService dihentikan");
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            Log.i(TAG, "WakeLock dilepaskan");
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Tracking Unit Background",
                NotificationManager.IMPORTANCE_LOW // Low = tidak bunyi, hanya icon di status bar
            );
            channel.setDescription("Menjaga aplikasi tetap aktif untuk menerima notifikasi");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                Log.i(TAG, "Notification Channel dibuat");
            }
        }
    }
}
