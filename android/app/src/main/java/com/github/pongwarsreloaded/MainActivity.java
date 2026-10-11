package com.github.pongwarsreloaded;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.hardware.input.InputManager;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.SparseArray;
import android.util.SparseIntArray;
import android.view.Choreographer;
import android.view.Display;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/** Offline TV host. All gameplay and control profiles live in the shared web game / TV adapter. */
public final class MainActivity extends Activity implements InputManager.InputDeviceListener, DisplayManager.DisplayListener {
    private static final String GAME_URL = "https://appassets.androidplatform.net/assets/index.html";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final SparseArray<JSONObject> devices = new SparseArray<>();
    private final SparseArray<float[]> pointerPositions = new SparseArray<>();
    private final SparseIntArray pointerButtons = new SparseIntArray();
    private final ArrayList<JSONObject> pending = new ArrayList<>();
    private WebView webView;
    private InputManager inputManager;
    private DisplayManager displayManager;
    private volatile String displayInfo = "{}";
    private boolean ready;
    private boolean frameScheduled;
    private boolean wantsPointerCapture;
    private boolean resumed;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        inputManager = (InputManager) getSystemService(INPUT_SERVICE);
        displayManager = (DisplayManager) getSystemService(DISPLAY_SERVICE);
        displayManager.registerDisplayListener(this, handler);
        inputManager.registerInputDeviceListener(this, handler);
        webView = new WebView(this);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        webView.setBackgroundColor(Color.rgb(23, 43, 54));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // Local resources are served under an HTTPS origin, without a server or network permission.
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocal(request.getUrl());
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse result = loader.shouldInterceptRequest(request.getUrl());
                if (result == null) return blocked();
                Map<String, String> headers = new HashMap<>();
                if (result.getResponseHeaders() != null) headers.putAll(result.getResponseHeaders());
                headers.put("Content-Security-Policy", "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'");
                headers.put("X-Content-Type-Options", "nosniff");
                result.setResponseHeaders(headers);
                return result;
            }

            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                ready = false;
                pending.clear();
            }
        });
        webView.addJavascriptInterface(new HostBridge(), "AndroidHost");
        if (Build.VERSION.SDK_INT >= 26) {
            webView.setOnCapturedPointerListener((view, event) -> {
                mouse(event, true);
                return true;
            });
        }
        setContentView(webView);
        webView.addOnLayoutChangeListener((view, l, t, r, b, oldL, oldT, oldR, oldB) -> updateDisplayInfo());
        configureDisplay();
        webView.requestFocus();
        immersive();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> {
                key(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK));
                key(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK));
            });
        }
        webView.loadUrl(GAME_URL);
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
            && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", null, new ByteArrayInputStream(new byte[0]));
    }

    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    private final class HostBridge {
        @JavascriptInterface public String getDisplayInfo() { return displayInfo; }
        @JavascriptInterface public void ready() {
            runOnUiThread(() -> {
                ready = true;
                pending.clear();
                devices.clear();
                for (int id : InputDevice.getDeviceIds()) onInputDeviceAdded(id);
                emit(json("type", "lifecycle", "action", resumed ? "resume" : "pause"));
            });
        }

        @JavascriptInterface public String getDevices() {
            JSONArray result = new JSONArray();
            for (int id : InputDevice.getDeviceIds()) result.put(describeDevice(id));
            return result.toString();
        }

        @JavascriptInterface public void setPointerCapture(boolean enabled) {
            runOnUiThread(() -> {
                wantsPointerCapture = enabled;
                updatePointerCapture();
            });
        }

        @JavascriptInterface public void exit() { runOnUiThread(() -> finish()); }
    }

    private void updatePointerCapture() {
        if (Build.VERSION.SDK_INT < 26 || webView == null) return;
        if (wantsPointerCapture && resumed && webView.hasWindowFocus()) webView.requestPointerCapture();
        else webView.releasePointerCapture();
    }

    @SuppressWarnings("deprecation")
    private void configureDisplay() {
        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode current = display.getMode();
        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        int requested = 0;
        if (current.getPhysicalWidth() <= 3840 && current.getPhysicalHeight() <= 2160) {
            for (Display.Mode candidate : display.getSupportedModes()) {
                if (DisplayPolicy.isMatchingUhd(candidate.getPhysicalWidth(), candidate.getPhysicalHeight(),
                    candidate.getRefreshRate(), current.getRefreshRate())) {
                    requested = candidate.getModeId();
                    if (requested == current.getModeId()) break;
                }
            }
        }
        if (attributes.preferredDisplayModeId != requested) {
            attributes.preferredDisplayModeId = requested;
            getWindow().setAttributes(attributes);
        }
        // Request the TV's game/low-latency mode without changing user settings.
        if (Build.VERSION.SDK_INT >= 30) getWindow().setPreferMinimalPostProcessing(true);
        updateDisplayInfo();
    }

    @SuppressWarnings("deprecation")
    private void updateDisplayInfo() {
        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode actual = display.getMode();
        // Output timing and the actual WebView surface are deliberately separate:
        // some TV platforms expose 4K HDMI while composing app UI at 1080p.
        displayInfo = json("outputWidth", actual.getPhysicalWidth(), "outputHeight", actual.getPhysicalHeight(),
            "refreshRate", actual.getRefreshRate(), "windowWidth", webView == null ? 0 : webView.getWidth(),
            "windowHeight", webView == null ? 0 : webView.getHeight(),
            "density", getResources().getDisplayMetrics().density,
            "requestedModeId", getWindow().getAttributes().preferredDisplayModeId).toString();
    }

    @Override public void onDisplayAdded(int id) { configureDisplay(); }
    @Override public void onDisplayRemoved(int id) { configureDisplay(); }
    @Override public void onDisplayChanged(int id) { configureDisplay(); }

    // API 33+ routes remote and gesture Back through the registered callback.
    // Older TVs still need the physical key path below.
    @SuppressLint("GestureBackNavigation")
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (Build.VERSION.SDK_INT >= 33 && event.getKeyCode() == KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(event);
        // Home, voice assistant, volume and other OS-owned keys keep their normal TV behavior.
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_HOME:
            case KeyEvent.KEYCODE_POWER:
            case KeyEvent.KEYCODE_SLEEP:
            case KeyEvent.KEYCODE_WAKEUP:
            case KeyEvent.KEYCODE_VOLUME_UP:
            case KeyEvent.KEYCODE_VOLUME_DOWN:
            case KeyEvent.KEYCODE_VOLUME_MUTE:
            case KeyEvent.KEYCODE_MUTE:
            case KeyEvent.KEYCODE_ASSIST:
            case KeyEvent.KEYCODE_VOICE_ASSIST:
            case KeyEvent.KEYCODE_APP_SWITCH:
            case KeyEvent.KEYCODE_SETTINGS:
            case KeyEvent.KEYCODE_PAIRING:
                return super.dispatchKeyEvent(event);
            default:
                if (event.getAction() == KeyEvent.ACTION_DOWN || event.getAction() == KeyEvent.ACTION_UP) {
                    key(event);
                    return true;
                }
                return super.dispatchKeyEvent(event);
        }
    }

    private void key(KeyEvent event) {
        String code = KeyEvent.keyCodeToString(event.getKeyCode()).replace("KEYCODE_", "");
        if (event.getKeyCode() == KeyEvent.KEYCODE_UNKNOWN && event.getScanCode() != 0) code = "SCAN_" + event.getScanCode();
        emit(json("type", "key", "device", device(event.getDeviceId()), "action",
            event.getAction() == KeyEvent.ACTION_UP ? "up" : "down",
            "keyCode", event.getKeyCode(), "code", code,
            "scanCode", event.getScanCode(), "unicode", event.getUnicodeChar(),
            "repeat", event.getRepeatCount(), "time", event.getEventTime()));
    }

    @Override public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (event.isFromSource(InputDevice.SOURCE_JOYSTICK) || event.isFromSource(InputDevice.SOURCE_GAMEPAD)) {
            JSONObject axes = new JSONObject();
            String[] names = {"x", "y", "z", "rz", "rx", "ry", "hatX", "hatY", "ltrigger", "rtrigger", "brake", "gas"};
            int[] codes = {
                MotionEvent.AXIS_X, MotionEvent.AXIS_Y, MotionEvent.AXIS_Z, MotionEvent.AXIS_RZ,
                MotionEvent.AXIS_RX, MotionEvent.AXIS_RY, MotionEvent.AXIS_HAT_X, MotionEvent.AXIS_HAT_Y,
                MotionEvent.AXIS_LTRIGGER, MotionEvent.AXIS_RTRIGGER, MotionEvent.AXIS_BRAKE, MotionEvent.AXIS_GAS};
            for (int i = 0; i < codes.length; i++) {
                put(axes, names[i], axis(event, codes[i], i >= 8, i == 6 || i == 7));
            }
            emit(json("type", "motion", "device", device(event.getDeviceId()), "action", "move", "axes", axes, "time", event.getEventTime()));
            return true;
        }
        if (event.isFromSource(InputDevice.SOURCE_MOUSE) || event.isFromSource(InputDevice.SOURCE_TOUCHPAD)) {
            mouse(event, false);
            return true;
        }
        return super.dispatchGenericMotionEvent(event);
    }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.isFromSource(InputDevice.SOURCE_MOUSE)) {
            mouse(event, false);
            return true;
        }
        return super.dispatchTouchEvent(event);
    }

    private float axis(MotionEvent event, int code, boolean trigger, boolean hat) {
        InputDevice input = event.getDevice();
        if (input == null) return 0;
        InputDevice.MotionRange range = input.getMotionRange(code, event.getSource());
        if (range == null) range = input.getMotionRange(code);
        if (range == null) return 0;
        float value = event.getAxisValue(code);
        if (hat) return InputMath.clamp(value, -1, 1);
        return trigger ? InputMath.trigger(value, range.getMin(), range.getMax(), range.getFlat())
            : InputMath.centered(value, range.getMin(), range.getMax(), range.getFlat());
    }

    private void mouse(MotionEvent event, boolean captured) {
        float width = Math.max(1, webView.getWidth()), height = Math.max(1, webView.getHeight());
        float[] previous = pointerPositions.get(event.getDeviceId());
        float x, y, dx, dy;
        if (captured) {
            dx = event.getX() / width;
            dy = event.getY() / height;
            x = InputMath.clamp((previous == null ? 0.5f : previous[0]) + dx, 0, 1);
            y = InputMath.clamp((previous == null ? 0.5f : previous[1]) + dy, 0, 1);
        } else {
            x = InputMath.clamp(event.getX() / width, 0, 1);
            y = InputMath.clamp(event.getY() / height, 0, 1);
            dx = previous == null ? 0 : x - previous[0];
            dy = previous == null ? 0 : y - previous[1];
        }
        pointerPositions.put(event.getDeviceId(), new float[]{x, y});
        String action = "move";
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_BUTTON_PRESS: action = "down"; break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_BUTTON_RELEASE: action = "up"; break;
            case MotionEvent.ACTION_CANCEL: action = "cancel"; break;
            case MotionEvent.ACTION_SCROLL: action = "scroll"; break;
        }
        emit(json("type", "motion", "device", device(event.getDeviceId()), "action", action,
            "pointer", json("x", x, "y", y, "dx", dx, "dy", dy, "captured", captured,
                "buttons", event.getButtonState(), "button", event.getActionButton(),
                "scrollX", event.getAxisValue(MotionEvent.AXIS_HSCROLL), "scrollY", event.getAxisValue(MotionEvent.AXIS_VSCROLL)),
            "time", event.getEventTime()));
        int buttons = event.getButtonState();
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN && buttons == 0) buttons = MotionEvent.BUTTON_PRIMARY;
        if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) buttons = 0;
        int oldButtons = pointerButtons.get(event.getDeviceId(), 0);
        int changed = oldButtons ^ buttons;
        pointerButtons.put(event.getDeviceId(), buttons);
        int[] masks = {MotionEvent.BUTTON_PRIMARY, MotionEvent.BUTTON_SECONDARY, MotionEvent.BUTTON_TERTIARY, MotionEvent.BUTTON_BACK, MotionEvent.BUTTON_FORWARD};
        String[] codes = {"MOUSE_PRIMARY", "MOUSE_SECONDARY", "MOUSE_TERTIARY", "MOUSE_BACK", "MOUSE_FORWARD"};
        for (int i = 0; i < masks.length; i++) {
            if ((changed & masks[i]) != 0) emit(json("type", "key", "device", device(event.getDeviceId()),
                "action", (buttons & masks[i]) != 0 ? "down" : "up", "code", codes[i], "keyCode", 0,
                "repeat", 0, "scanCode", 0, "unicode", 0, "time", event.getEventTime()));
        }
    }

    private JSONObject device(int id) {
        JSONObject cached = devices.get(id);
        if (cached != null) return cached;
        JSONObject value = describeDevice(id);
        devices.put(id, value);
        return value;
    }

    private JSONObject describeDevice(int id) {
        InputDevice input = InputDevice.getDevice(id);
        if (input == null) return json("id", id, "key", "virtual:" + id, "name", "Virtual remote / keyboard", "descriptor", "", "sources", 0, "vendorId", 0, "productId", 0);
        // Descriptor persists across reconnects; runtime id deliberately remains separate for two identical pads.
        String descriptor = input.getDescriptor();
        String profileKey = input.getVendorId() + ":" + input.getProductId() + ":" + descriptor;
        JSONArray keyCodes = new JSONArray();
        int[] candidates = new int[KeyEvent.getMaxKeyCode() + 1];
        for (int i = 0; i < candidates.length; i++) candidates[i] = i;
        boolean[] present = input.hasKeys(candidates);
        for (int i = 0; i < present.length; i++) if (present[i]) keyCodes.put(i);
        return json("id", id, "key", profileKey, "name", input.getName(), "descriptor", descriptor,
            "vendorId", input.getVendorId(), "productId", input.getProductId(), "sources", input.getSources(),
            "controllerNumber", input.getControllerNumber(), "keyboardType", input.getKeyboardType(), "keyCodes", keyCodes);
    }

    @Override public void onInputDeviceAdded(int id) {
        JSONObject value = describeDevice(id);
        devices.put(id, value);
        emit(json("type", "device", "action", "connected", "device", value));
    }

    @Override public void onInputDeviceChanged(int id) {
        onInputDeviceAdded(id);
    }

    @Override public void onInputDeviceRemoved(int id) {
        JSONObject value = devices.get(id);
        devices.remove(id);
        pointerPositions.remove(id);
        pointerButtons.delete(id);
        emit(json("type", "device", "action", "disconnected", "device", value == null ? device(id) : value));
    }

    private void emit(JSONObject event) {
        if (!ready || webView == null) return;
        // Preserve every button edge. Collapse only adjacent stick snapshots for the same device.
        if ("motion".equals(event.optString("type")) && event.has("axes") && !pending.isEmpty()) {
            JSONObject previous = pending.get(pending.size() - 1);
            if (previous.has("axes") && previous.optJSONObject("device") != null
                && previous.optJSONObject("device").optInt("id") == event.optJSONObject("device").optInt("id")) {
                pending.set(pending.size() - 1, event);
            } else pending.add(event);
        } else pending.add(event);
        if (frameScheduled) return;
        frameScheduled = true;
        Choreographer.getInstance().postFrameCallback(time -> flush());
    }

    private void flush() {
        frameScheduled = false;
        if (!ready || webView == null || pending.isEmpty()) return;
        JSONArray batch = new JSONArray(pending);
        pending.clear();
        webView.evaluateJavascript("if(window.PongAndroid&&window.PongAndroid.onInput){" + batch
            + ".forEach(function(e){window.PongAndroid.onInput(e);});}", null);
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        if (webView != null) configureDisplay();
        if (webView != null) webView.onResume();
        pointerPositions.clear();
        pointerButtons.clear();
        emit(json("type", "lifecycle", "action", "resume"));
        immersive();
        updatePointerCapture();
    }

    @Override protected void onPause() {
        resumed = false;
        emit(json("type", "lifecycle", "action", "pause"));
        flush();
        updatePointerCapture();
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            immersive();
            // Focus can return after onResume (or after a system overlay).
            // Balance focus-loss suspension without resuming a paused match.
            if (resumed) emit(json("type", "lifecycle", "action", "resume"));
        }
        else {
            emit(json("type", "lifecycle", "action", "pause"));
            flush();
        }
        pointerPositions.clear();
        pointerButtons.clear();
        updatePointerCapture();
    }

    @Override protected void onDestroy() {
        ready = false;
        pending.clear();
        if (inputManager != null) inputManager.unregisterInputDeviceListener(this);
        if (displayManager != null) displayManager.unregisterDisplayListener(this);
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidHost");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private static JSONObject json(Object... entries) {
        JSONObject result = new JSONObject();
        for (int i = 0; i < entries.length; i += 2) put(result, (String) entries[i], entries[i + 1]);
        return result;
    }

    private static void put(JSONObject target, String name, Object value) {
        try { target.put(name, value); } catch (JSONException ignored) { /* Values are fixed primitives / finite axes. */ }
    }
}
