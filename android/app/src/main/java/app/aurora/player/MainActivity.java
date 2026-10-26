package app.aurora.player;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private ActivityResultLauncher<Uri> treePicker;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // must be registered before the activity starts
        treePicker = registerForActivityResult(new ActivityResultContracts.OpenDocumentTree(), uri -> AuroraBridge.onTreePicked(this, uri));
        super.onCreate(savedInstanceState);
        final WebView w = getBridge().getWebView();
        w.addJavascriptInterface(new AuroraBridge(this, w, treePicker), "AuroraAndroid");
        getBridge().setWebViewClient(new MediaWebViewClient(getBridge(), this));

        // Back button: let the web app close/step back first; at the home screen send the app to the background (never exit)
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                w.evaluateJavascript("(function(){try{return !!(window.A&&A.handleBack&&A.handleBack())}catch(e){return false}})()", value -> {
                    if (!"true".equals(value)) moveTaskToBack(true);
                });
            }
        });
    }

    // the answer to the microphone prompt (AI Audition) goes straight back to the web app
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 12) AuroraBridge.emitJson("mic", grantResults.length > 0 && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED ? "true" : "false");
    }
}
