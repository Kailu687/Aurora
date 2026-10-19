package app.aurora.player;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/** Exposed to the web app as window.AuroraAndroid. Every method returns a plain string so the UI can show errors. */
public class AuroraBridge {
    private static AuroraBridge cur;
    private final Activity act;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final androidx.activity.result.ActivityResultLauncher<Uri> treeLauncher;

    AuroraBridge(Activity act, WebView web, androidx.activity.result.ActivityResultLauncher<Uri> treeLauncher) { this.act = act; this.web = web; this.treeLauncher = treeLauncher; cur = this; }

    /** Native -> JS with a JSON payload. */
    static void emitJson(final String event, final String json) {
        final AuroraBridge b = cur; if (b == null) return;
        b.main.post(() -> b.web.evaluateJavascript("window.A&&A.nativeEvent&&A.nativeEvent('" + event + "'," + json + ")", null));
    }

    // ----- music folder (Storage Access Framework): linked, never copied -----
    @JavascriptInterface
    public String pickFolder() { main.post(() -> treeLauncher.launch(null)); return "ok"; }

    static void onTreePicked(Activity a, Uri uri) {
        try {
            if (uri == null) { emitJson("folder", "null"); return; }
            a.getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            String name = "Music";
            Uri docUri = android.provider.DocumentsContract.buildDocumentUriUsingTree(uri, android.provider.DocumentsContract.getTreeDocumentId(uri));
            try (android.database.Cursor c = a.getContentResolver().query(docUri, new String[]{android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            }
            JSONObject o = new JSONObject(); o.put("uri", uri.toString()); o.put("name", name);
            emitJson("folder", o.toString());
        } catch (Exception e) { emitJson("folder", "{\"error\":" + JSONObject.quote(String.valueOf(e)) + "}"); }
    }

    /** Lists every audio / .lrc file under a picked folder as a JSON array. */
    @JavascriptInterface
    public String scan(String treeUri) {
        try {
            Uri tree = Uri.parse(treeUri);
            org.json.JSONArray out = new org.json.JSONArray();
            walk(tree, android.provider.DocumentsContract.getTreeDocumentId(tree), "", out);
            return out.toString();
        } catch (Exception e) { return "error: " + e; }
    }

    private static final java.util.regex.Pattern COVER = java.util.regex.Pattern.compile("(?i)(cover|folder|front|album|albumart[^/]*|artwork)\\.(jpe?g|png)$");
    private static final java.util.regex.Pattern WANTED = java.util.regex.Pattern.compile("(?i).*\\.(mp3|m4a|mp4|m4b|aac|wav|flac|ogg|oga|opus|webm|weba|lrc)$");

    private void walk(Uri tree, String docId, String rel, org.json.JSONArray out) throws Exception {
        Uri children = android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        String[] cols = {android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID, android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                android.provider.DocumentsContract.Document.COLUMN_MIME_TYPE, android.provider.DocumentsContract.Document.COLUMN_SIZE};
        try (android.database.Cursor c = act.getContentResolver().query(children, cols, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String id = c.getString(0), name = c.getString(1), mime = c.getString(2);
                if (name == null || name.startsWith(".")) continue;
                if (android.provider.DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) { walk(tree, id, rel + name + "/", out); continue; }
                if (!WANTED.matcher(name).matches() && !COVER.matcher(name).matches() && (mime == null || !mime.startsWith("audio/"))) continue;
                JSONObject o = new JSONObject();
                o.put("uri", android.provider.DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                o.put("name", name); o.put("size", c.getLong(3)); o.put("rel", rel + name);
                out.put(o);
            }
        }
    }

    /** True while the app still holds read permission for a previously picked folder. */
    @JavascriptInterface
    public boolean hasAccess(String treeUri) {
        for (android.content.UriPermission p : act.getContentResolver().getPersistedUriPermissions()) if (p.getUri().toString().equals(treeUri) && p.isReadPermission()) return true;
        return false;
    }

    /** Native -> JS: notification button / lock-screen command. */
    static void emit(final String cmd, final double arg) {
        final AuroraBridge b = cur; if (b == null) return;
        b.main.post(() -> b.web.evaluateJavascript("window.A&&A.nativeCmd&&A.nativeCmd('" + cmd + "'," + arg + ")", null));
    }

    private boolean permissionGranted() {
        return Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("device", Build.MANUFACTURER + " " + Build.MODEL);
            o.put("permission", permissionGranted());
            o.put("enabled", NotificationManagerCompat.from(act).areNotificationsEnabled());
            o.put("service", PlayerService.instance != null);
            return o.toString();
        } catch (Exception e) { return "{\"error\":\"" + e + "\"}"; }
    }

    @JavascriptInterface
    public String requestPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !permissionGranted()) {
            main.post(() -> ActivityCompat.requestPermissions(act, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 11));
            return "requested";
        }
        return "already granted";
    }

    @JavascriptInterface
    public String openSettings() {
        main.post(() -> {
            try {
                Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, act.getPackageName());
                act.startActivity(i);
            } catch (Exception e) {
                try { act.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.getPackageName()))); } catch (Exception ignored) { }
            }
        });
        return "ok";
    }

    /** JSON: {title, artist, album, art(base64 jpeg), duration(s), position(s), rate, playing} */
    @JavascriptInterface
    public String update(String json) {
        try {
            JSONObject o = new JSONObject(json);
            PlayerService.Media m = PlayerService.media;
            m.title = o.optString("title"); m.artist = o.optString("artist"); m.album = o.optString("album");
            m.durationMs = Math.round(o.optDouble("duration", 0) * 1000); m.positionMs = Math.round(o.optDouble("position", 0) * 1000);
            m.rate = (float) o.optDouble("rate", 1); m.playing = o.optBoolean("playing"); m.has = true;
            String art = o.optString("art", "");
            if (!art.isEmpty()) {
                byte[] d = Base64.decode(art, Base64.DEFAULT);
                Bitmap bmp = BitmapFactory.decodeByteArray(d, 0, d.length);
                if (bmp != null) m.art = bmp;
            } else if (o.optBoolean("clearArt")) m.art = null;
            final boolean startIt = PlayerService.instance == null;
            main.post(() -> {
                try {
                    if (startIt) ContextCompat.startForegroundService(act, new Intent(act, PlayerService.class));
                    else if (PlayerService.instance != null) PlayerService.instance.refresh();
                } catch (Exception e) { emit("error", 0); }
            });
            return "ok";
        } catch (Exception e) { return "error: " + e; }
    }

    // ----- DJ voice: Android WebView has no speechSynthesis voices, so use the phone's own text-to-speech -----
    private android.speech.tts.TextToSpeech tts;

    private void speakNow(String t, double rate, double pitch) {
        tts.setSpeechRate((float) rate); tts.setPitch((float) pitch);
        tts.speak(t, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "aurora");
    }

    @JavascriptInterface
    public String speak(final String text, final double rate, final double pitch) {
        try {
            main.post(() -> {
                if (tts != null) { speakNow(text, rate, pitch); return; }
                tts = new android.speech.tts.TextToSpeech(act.getApplicationContext(), status -> {
                    if (status != android.speech.tts.TextToSpeech.SUCCESS) { tts = null; emit("ttsdone", 0); return; }
                    tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                        @Override public void onStart(String id) { }
                        @Override public void onDone(String id) { emit("ttsdone", 0); }
                        @Override public void onError(String id) { emit("ttsdone", 0); }
                    });
                    speakNow(text, rate, pitch);
                });
            });
            return "ok";
        } catch (Exception e) { return "error: " + e; }
    }

    @JavascriptInterface
    public String stopSpeak() {
        main.post(() -> { if (tts != null) tts.stop(); });
        return "ok";
    }

    /**
     * Small async HTTPS GET used for album-cover lookup (bypasses browser CORS). Only Apple's search / artwork hosts are allowed.
     * Result arrives as A.nativeEvent('http', {id, ok, body (text or base64), error}).
     */
    @JavascriptInterface
    public String httpGet(final String reqId, final String url, final boolean binary) {
        try {
            final Uri u = Uri.parse(url);
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase();
            if (!"https".equals(u.getScheme()) || !(host.equals("itunes.apple.com") || host.endsWith(".mzstatic.com"))) return "error: host not allowed";
        } catch (Exception e) { return "error: bad url"; }
        new Thread(() -> {
            JSONObject o = new JSONObject();
            try {
                o.put("id", reqId);
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(15000); c.setRequestProperty("User-Agent", "Aurora/1.5");
                java.io.InputStream in = c.getInputStream();
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[16384]; int n; long total = 0;
                while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); total += n; if (total > 6_000_000) throw new java.io.IOException("too large"); }
                in.close();
                o.put("ok", true);
                o.put("body", binary ? Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP) : new String(bo.toByteArray(), "UTF-8"));
            } catch (Exception e) {
                try { o.put("ok", false); o.put("error", String.valueOf(e)); } catch (Exception ignored) { }
            }
            emitJson("http", o.toString());
        }).start();
        return "ok";
    }

    @JavascriptInterface
    public String stop() {
        PlayerService.media.has = false;
        main.post(() -> act.stopService(new Intent(act, PlayerService.class)));
        return "ok";
    }
}
