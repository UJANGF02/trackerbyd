package com.trackingunit_byd.app;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Inisialisasi Android Text-to-Speech Engine
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                // Set bahasa Indonesia
                int result = tts.setLanguage(new Locale("id", "ID"));
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    // Fallback ke English jika Indonesian tidak tersedia
                    tts.setLanguage(Locale.US);
                    Log.w("TTS", "Bahasa Indonesia tidak tersedia, fallback ke English");
                }
                // Set pitch lebih tinggi supaya terdengar feminine
                tts.setPitch(1.3f);
                tts.setSpeechRate(1.0f);
                ttsReady = true;
                Log.i("TTS", "Text-to-Speech Engine siap!");
            } else {
                Log.e("TTS", "Gagal inisialisasi TTS Engine, status: " + status);
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();

        // Dapatkan WebView dari Capacitor Bridge lalu konfigurasi
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();

            // Izinkan audio/video putar otomatis tanpa perlu klik user
            settings.setMediaPlaybackRequiresUserGesture(false);

            // Pastikan JavaScript aktif (seharusnya sudah, tapi untuk jaga-jaga)
            settings.setJavaScriptEnabled(true);

            // Tambahkan JavaScript Interface supaya web bisa panggil TTS Android native
            webView.addJavascriptInterface(new TTSBridge(), "AndroidTTS");
            Log.i("WebView", "WebView dikonfigurasi: media autoplay ON, TTS bridge terpasang");
        }
    }

    /**
     * JavaScript Bridge untuk Text-to-Speech Android Native.
     * Dari JavaScript, panggil: AndroidTTS.speak("teks yang mau diucapkan")
     */
    public class TTSBridge {

        @JavascriptInterface
        public void speak(String text) {
            if (tts != null && ttsReady && text != null && !text.isEmpty()) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "notif_tts");
                Log.i("TTS", "Mengucapkan: " + text);
            } else {
                Log.w("TTS", "TTS belum siap atau teks kosong");
            }
        }

        @JavascriptInterface
        public void speakWithRate(String text, float rate, float pitch) {
            if (tts != null && ttsReady && text != null && !text.isEmpty()) {
                tts.setPitch(pitch);
                tts.setSpeechRate(rate);
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "notif_tts");
                Log.i("TTS", "Mengucapkan (rate=" + rate + ", pitch=" + pitch + "): " + text);
            }
        }

        @JavascriptInterface
        public void stop() {
            if (tts != null) {
                tts.stop();
            }
        }

        @JavascriptInterface
        public boolean isReady() {
            return ttsReady;
        }
    }

    @Override
    public void onDestroy() {
        // Bersihkan resource TTS saat app ditutup
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
