package org.xprodc.ivan;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * BankFake — приложение на WebView (пакет org.xprodc.ivan).
 *
 * Данные: filesDir/bankfake.json (мостик window.BFJson.load()/save(json)).
 * Фото: выбор из галереи через WebChromeClient.onShowFileChooser.
 * Push: настоящие системные уведомления (window.BFJson.push(title, text)).
 * Ассистент: обращается к API по адресу window.BF_AI_APIS (нужен интернет).
 */
public class MainActivity extends Activity {

    private static final String DATA_FILE = "bankfake.json";
    private static final String CHANNEL_ID = "bankfake_push";
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_POST_NOTIFICATIONS = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // localStorage — запасной вариант
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);     // file:///android_asset/*
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);             // не зависеть от системного масштаба текста
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            /** «Загрузить своё фото» — открываем галерею. */
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                openFileChooser(callback, params);
                return true;
            }
        });
        webView.addJavascriptInterface(new JsonStore(), "BFJson");
        WebView.setWebContentsDebuggingEnabled(true);

        createNotificationChannel();
        askNotificationPermission();
        BriefingAlarm.schedule(this);   // ежедневный утренний брифинг ~9:00
        UpdateFileProvider.cleanup(this); // после обновления удаляем APK-установщик

        webView.loadUrl("file:///android_asset/bank.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    /* ================= Галерея (загрузка фото) ================= */

    private void openFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        filePathCallback = callback;

        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        String type = "*/*";
        if (params != null && params.getAcceptTypes() != null && params.getAcceptTypes().length > 0
                && params.getAcceptTypes()[0] != null && !params.getAcceptTypes()[0].trim().isEmpty()) {
            type = params.getAcceptTypes()[0].trim();
        }
        intent.setType(type);
        try {
            startActivityForResult(intent, REQ_FILE_CHOOSER);
        } catch (Exception e) {
            android.util.Log.e("BankFake", "file chooser failed", e);
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ================= Настоящие push-уведомления ================= */

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                    "Уведомления BankFake", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Зарплата, вклады, покупки и другие события");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void askNotificationPermission() {
        // Android 13+ — разрешение на уведомления спрашиваем при старте
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            try {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_POST_NOTIFICATIONS);
            } catch (Exception e) {
                android.util.Log.w("BankFake", "requestPermissions failed", e);
            }
        }
    }

    private void showNotification(String title, String text) {
        notifyNow(this, title, text);
    }

    /** Публичный helper: показать уведомление из любого контекста (в т.ч. из BroadcastReceiver). */
    static void notifyNow(Context ctx, String title, String text) {
        try {
            if (Build.VERSION.SDK_INT >= 33
                    && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return; // пользователь запретил уведомления
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm0 = ctx.getSystemService(NotificationManager.class);
                if (nm0 != null && nm0.getNotificationChannel(CHANNEL_ID) == null) {
                    NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                            "Уведомления BankFake", NotificationManager.IMPORTANCE_HIGH);
                    ch.setDescription("Зарплата, вклады, покупки и другие события");
                    nm0.createNotificationChannel(ch);
                }
            }
            android.app.Notification n = new android.app.Notification.Builder(ctx, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_bankfake)
                    .setContentTitle(title == null || title.isEmpty() ? "BankFake" : title)
                    .setContentText(text == null ? "" : text)
                    .setStyle(new android.app.Notification.BigTextStyle().bigText(text == null ? "" : text))
                    .setAutoCancel(true)
                    .build();
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) nm.notify((int) (System.currentTimeMillis() & 0x7fffffffL), n);
        } catch (Exception e) {
            android.util.Log.e("BankFake", "notify failed", e);
        }
    }

    /* ================= Хранилище JSON ================= */

    private File dataFile() {
        return new File(getFilesDir(), DATA_FILE);
    }

    /** Публичный API для JS: JSON-хранилище + push. */
    public class JsonStore {

        @JavascriptInterface
        public String load() {
            File f = dataFile();
            if (!f.exists()) return "";
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] buf = new byte[(int) f.length()];
                int off = 0, n;
                while (off < buf.length && (n = in.read(buf, off, buf.length - off)) > 0) off += n;
                return new String(buf, 0, off, StandardCharsets.UTF_8);
            } catch (Exception e) {
                android.util.Log.e("BankFake", "load failed", e);
                return "";
            }
        }

        @JavascriptInterface
        public void save(String json) {
            if (json == null) return;
            File tmp = new File(getFilesDir(), DATA_FILE + ".tmp");
            File dst = dataFile();
            try {
                byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(bytes);
                    out.getFD().sync();               // сначала пишем во временный файл
                }
                if (!tmp.renameTo(dst)) {             // rename на Android заменяет файл атомарно
                    try (FileOutputStream out = new FileOutputStream(dst)) {
                        out.write(bytes);
                        out.getFD().sync();
                    }
                    //noinspection ResultOfMethodCallIgnored
                    tmp.delete();
                }
            } catch (Exception e) {
                android.util.Log.e("BankFake", "save failed", e);
            }
        }

        /** Настоящее системное push-уведомление (вызывается из bank.js). */
        @JavascriptInterface
        public void push(final String title, final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showNotification(title, text);
                }
            });
        }

        /** Обновление виджета на домашнем экране: баланс + строка (курсы/цель). */
        @JavascriptInterface
        public void widget(String balance, String sub) {
            BankFakeWidget.setText(getApplicationContext(), balance, sub);
        }

        /** Открыть внешнюю ссылку (RuStore, скачивание APK) в браузере/магазине. */
        @JavascriptInterface
        public void openLink(String url) {
            if (url == null) return;
            String u = url.trim();
            if (!u.startsWith("http://") && !u.startsWith("https://")) return;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
            } catch (Exception e) {
                android.util.Log.e("BankFake", "openLink failed", e);
            }
        }

        /**
         * Обновление: само скачивает APK и открывает установщик Android.
         * Файл лежит в кэше и удаляется при следующем старте приложения
         * (UpdateFileProvider.cleanup), чтобы место не занимать.
         */
        @JavascriptInterface
        public void installApk(final String url) {
            if (url == null) return;
            final String u = url.trim();
            if (!u.startsWith("https://") || !u.toLowerCase().endsWith(".apk")) return;
            notifyNow(MainActivity.this, "Обновление", "Скачиваю новую версию BankFake…");
            new Thread(new Runnable() {
                @Override
                public void run() {
                    if (downloadApk(u)) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                openInstaller();
                            }
                        });
                    } else {
                        notifyNow(MainActivity.this, "Обновление",
                                "Не удалось скачать обновление. Попробуйте позже.");
                    }
                }
            }, "bf-update").start();
        }
    }

    /** Скачивает APK обновления в кэш. true — успешно. */
    private boolean downloadApk(String url) {
        File dst = UpdateFileProvider.apkFile(this);
        HttpURLConnection conn = null;
        try {
            File dir = dst.getParentFile();
            if (dir != null && !dir.exists()) {
                //noinspection ResultOfMethodCallIgnored dir.mkdirs();
            }
            //noinspection ResultOfMethodCallIgnored dst.delete(); // старый установщик

            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(60000);
            conn.connect();
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) return false;
            try (InputStream in = conn.getInputStream();
                 FileOutputStream out = new FileOutputStream(dst)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                out.getFD().sync();
            }
            if (dst.length() < 50_000) {  // это не APK — защита от мусора
                //noinspection ResultOfMethodCallIgnored dst.delete();
                return false;
            }
            return true;
        } catch (Exception e) {
            android.util.Log.e("BankFake", "downloadApk failed", e);
            //noinspection ResultOfMethodCallIgnored dst.delete();
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Открывает системный установитель на скачанный APK. */
    private void openInstaller() {
        File apk = UpdateFileProvider.apkFile(this);
        if (!apk.exists()) return;
        try {
            // Android 8+: при первом разе нужно «Разрешить с этого источника»
            if (!getPackageManager().canRequestPackageInstalls()) {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
                notifyNow(this, "Обновление",
                        "Разрешите установку из этого источника и нажмите «Установить» ещё раз");
                return;
            }
            Uri uri = Uri.parse("content://" + UpdateFileProvider.AUTHORITY + "/" + apk.getName());
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            android.util.Log.e("BankFake", "openInstaller failed", e);
            notifyNow(this, "Обновление", "Не удалось открыть установщик. Попробуйте позже.");
        }
    }
}
