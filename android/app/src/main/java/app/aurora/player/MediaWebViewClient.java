package app.aurora.player;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Serves files from the music folder the user picked (Android's Storage Access Framework) to the web app at
 * https://localhost/_media/<base64url(document uri)>, with HTTP Range support so seeking works.
 */
public class MediaWebViewClient extends BridgeWebViewClient {
    private final Context ctx;

    public MediaWebViewClient(Bridge bridge, Context ctx) { super(bridge); this.ctx = ctx; }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String path = request.getUrl().getPath();
        if (path == null || !path.startsWith("/_media/")) return super.shouldInterceptRequest(view, request);
        try {
            String enc = path.substring("/_media/".length());
            Uri doc = Uri.parse(new String(Base64.decode(enc, Base64.URL_SAFE | Base64.NO_WRAP), "UTF-8"));
            ParcelFileDescriptor pfd = ctx.getContentResolver().openFileDescriptor(doc, "r");
            if (pfd == null) return notFound();
            long size = pfd.getStatSize();
            String mime = mimeFor(doc, request);

            long start = 0, end = size - 1;
            boolean partial = false;
            String range = request.getRequestHeaders().get("Range");
            if (range == null) range = request.getRequestHeaders().get("range");
            if (range != null && range.startsWith("bytes=") && size > 0) {
                String[] p = range.substring(6).split("-", 2);
                try {
                    if (p[0].isEmpty()) { start = Math.max(0, size - Long.parseLong(p[1])); }
                    else { start = Long.parseLong(p[0]); if (p.length > 1 && !p[1].isEmpty()) end = Math.min(end, Long.parseLong(p[1])); }
                    partial = true;
                } catch (NumberFormatException ignored) { start = 0; end = size - 1; }
                if (start > end || start >= size) {
                    pfd.close();
                    Map<String, String> h = new HashMap<>(); h.put("Content-Range", "bytes */" + size);
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, new java.io.ByteArrayInputStream(new byte[0]));
                }
            }
            final FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
            fis.getChannel().position(start);
            final long length = end - start + 1;
            InputStream body = new BoundedStream(fis, pfd, length);

            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Content-Length", String.valueOf(length));
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-store");
            if (partial) {
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
                return new WebResourceResponse(mime, null, 206, "Partial Content", headers, body);
            }
            return new WebResourceResponse(mime, null, 200, "OK", headers, body);
        } catch (Exception e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<String, String>(), new java.io.ByteArrayInputStream(new byte[0]));
    }

    private String mimeFor(Uri doc, WebResourceRequest req) {
        String t = ctx.getContentResolver().getType(doc);
        if (t != null && !t.equals("application/octet-stream")) return t;
        String ext = MimeTypeMap.getFileExtensionFromUrl(doc.toString());
        String m = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
        return m != null ? m : "audio/mpeg";
    }

    /** Reads at most `left` bytes, then closes the file descriptor. */
    private static class BoundedStream extends InputStream {
        private final FileInputStream in; private final ParcelFileDescriptor pfd; private long left;
        BoundedStream(FileInputStream in, ParcelFileDescriptor pfd, long left) { this.in = in; this.pfd = pfd; this.left = left; }
        @Override public int read() throws IOException { if (left <= 0) return -1; int b = in.read(); if (b >= 0) left--; return b; }
        @Override public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = in.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }
        @Override public int available() { return (int) Math.min(left, Integer.MAX_VALUE); }
        @Override public void close() throws IOException { try { in.close(); } finally { pfd.close(); } }
    }
}
