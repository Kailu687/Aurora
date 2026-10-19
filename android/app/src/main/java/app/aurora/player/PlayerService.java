package app.aurora.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Foreground media service: shows the playback notification (notification bar, lock screen, Samsung media panel)
 * and keeps audio alive in the background. The web UI drives it through AuroraBridge.
 */
public class PlayerService extends Service {
    static final String CHANNEL = "aurora_playback";
    static final int NOTIF_ID = 7;
    static PlayerService instance;

    /** Latest state pushed from the web UI. */
    static class Media {
        String title = "", artist = "", album = "";
        Bitmap art;
        long durationMs, positionMs;
        float rate = 1f;
        boolean playing, has;
    }
    static final Media media = new Media();

    private MediaSessionCompat session;
    private NotificationManager nm;
    private boolean foreground = false;
    private final Handler main = new Handler(Looper.getMainLooper());

    static void ensureChannel(android.content.Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager m = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
            if (m.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Now playing controls");
                ch.setShowBadge(false);
                m.createNotificationChannel(ch);
            }
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        ensureChannel(this);
        session = new MediaSessionCompat(this, "AuroraSession");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { AuroraBridge.emit("play", 0); }
            @Override public void onPause() { AuroraBridge.emit("pause", 0); }
            @Override public void onSkipToNext() { AuroraBridge.emit("next", 0); }
            @Override public void onSkipToPrevious() { AuroraBridge.emit("prev", 0); }
            @Override public void onStop() { AuroraBridge.emit("pause", 0); }
            @Override public void onSeekTo(long pos) { AuroraBridge.emit("seek", pos / 1000.0); }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent != null ? intent.getAction() : null;
        if ("dismiss".equals(a)) { stopSelf(); return START_NOT_STICKY; }
        if (a != null) AuroraBridge.emit(a, 0);          // play / pause / next / prev from the notification buttons
        refresh();
        return START_NOT_STICKY;
    }

    private PendingIntent action(String name, int code) {
        Intent i = new Intent(this, PlayerService.class).setAction(name);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Rebuild session + notification from the latest media state. Must run on the main thread. */
    void refresh() {
        final Media m = media;
        if (!m.has) { stopSelf(); return; }
        session.setMetadata(new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, m.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, m.artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, m.album)
                .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, m.art)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, m.durationMs)
                .build());
        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO | PlaybackStateCompat.ACTION_STOP;
        session.setPlaybackState(new PlaybackStateCompat.Builder().setActions(actions)
                .setState(m.playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, m.positionMs, m.playing ? m.rate : 0f)
                .build());

        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(m.title).setContentText(m.artist).setSubText(m.album.isEmpty() ? null : m.album)
                .setLargeIcon(m.art)
                .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
                .setDeleteIntent(action("dismiss", 9))
                .setOnlyAlertOnce(true).setShowWhen(false).setOngoing(m.playing)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .addAction(android.R.drawable.ic_media_previous, "Previous", action("prev", 1))
                .addAction(m.playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, m.playing ? "Pause" : "Play", action(m.playing ? "pause" : "play", 2))
                .addAction(android.R.drawable.ic_media_next, "Next", action("next", 3))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        Notification n = b.build();

        try {
            if (m.playing) {
                if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                else startForeground(NOTIF_ID, n);
                foreground = true;
            } else {
                if (foreground) { stopForeground(false); foreground = false; }   // paused: keep it, but allow swipe-away
                nm.notify(NOTIF_ID, n);
            }
        } catch (Exception e) {
            nm.notify(NOTIF_ID, n);
        }
    }

    /** The user swiped Aurora away in the app switcher: stop music, remove the notification and end the process. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        media.has = false; media.playing = false;
        try { stopForeground(true); } catch (Exception ignored) { }
        try { nm.cancel(NOTIF_ID); } catch (Exception ignored) { }
        stopSelf();
        main.postDelayed(() -> android.os.Process.killProcess(android.os.Process.myPid()), 250);
    }

    @Override
    public void onDestroy() {
        instance = null;
        try { session.setActive(false); session.release(); } catch (Exception ignored) { }
        try { nm.cancel(NOTIF_ID); } catch (Exception ignored) { }
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
