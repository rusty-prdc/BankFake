package org.xprodc.ivan;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;

/**
 * Утренний брифинг: ежедневное уведомление ~9:00 (без новых разрешений —
 * setInexactRepeating не требует SCHEDULE_EXACT_ALARM, время может «плыть» в пределах системного окна).
 *
 * Текст генерирует ИИ на нашем сервере (тот же endpoint, что и чат-ассистент);
 * адрес хранится зашифрованным (base64 + XOR) и не читается строкой из APK.
 * Если сети/ИИ нет — запасной шаблон из данных виджета (баланс + курсы).
 */
public class BriefingAlarm {

    private static final int REQ_CODE = 7701;
    private static final int HOUR_OF_DAY = 9;

    /* адрес backend — как в bank.html (base64(XOR(json)), ключ bankfake) */
    private static final String ENC =
            "OUMGHxIRUUpNBQtGBA4fFlFPBloFDQQQBk8ADhJbWVBQWFxJSkMDERYRHVFJTg8ATwMBHxVSRQ1TAgIEEwVFCwcVTEdECR8REltBRAIERgcNFR1YSAlaBg4OGw9IDw4RQDw=";
    private static final String XOR_KEY = "bankfake";

    /** Поставить ежедневное напоминание (вызывается при каждом открытии приложения). */
    public static void schedule(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, Receiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_CODE, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, HOUR_OF_DAY);
            c.set(Calendar.MINUTE, 0);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            if (c.getTimeInMillis() <= System.currentTimeMillis()) c.add(Calendar.DAY_OF_YEAR, 1);
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(),
                    AlarmManager.INTERVAL_DAY, pi);
        } catch (Exception e) {
            android.util.Log.e("BankFake", "briefing schedule failed", e);
        }
    }

    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(final Context ctx, Intent intent) {
            // данные виджета: баланс (l1) и строка курсов/цели (l2)
            SharedPreferences p = ctx.getSharedPreferences(BankFakeWidget.PREFS, Context.MODE_PRIVATE);
            final String balance = p.getString("l1", "");
            final String sub = p.getString("l2", "");
            if (balance.isEmpty()) return;   // приложение ещё не открывалось — не беспокоим
            new Thread(() -> sendBriefing(ctx, balance, sub)).start();
        }
    }

    /* ---------------- запрос к ИИ ---------------- */

    private static String firstApiBase() {
        try {
            byte[] raw = android.util.Base64.decode(ENC, android.util.Base64.DEFAULT);
            StringBuilder sb = new StringBuilder(raw.length);
            for (int i = 0; i < raw.length; i++) {
                sb.append((char) ((raw[i] & 0xFF) ^ XOR_KEY.charAt(i % XOR_KEY.length())));
            }
            JSONArray arr = new JSONArray(sb.toString());
            return arr.length() > 0 ? arr.getString(0) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String askAi(String balance, String sub) {
        String base = firstApiBase();
        if (base == null) return null;
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("message", "Составь короткий утренний брифинг для банковского приложения: "
                    + "2 строки, по-русски, без эмодзи, начни с «Доброе утро!». "
                    + "Данные клиента: баланс " + balance + "; " + sub + ".");
            body.put("user_id", "briefing");
            body.put("profile", new JSONObject());
            body.put("history", new JSONArray());

            conn = (HttpURLConnection) new URL(base + "/api/assistant/chat").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(25000);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setDoOutput(true);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            InputStream in = (code >= 400 ? conn.getErrorStream() : conn.getInputStream());
            if (in == null) return null;
            StringBuilder sb = new StringBuilder();
            byte[] buf = new byte[2048];
            int n;
            while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            in.close();
            if (code < 200 || code >= 300) return null;
            JSONObject res = new JSONObject(sb.toString());
            if (res.optBoolean("ok") && res.has("message")) {
                String m = res.getString("message").trim();
                return m.isEmpty() ? null : m;
            }
            return null;
        } catch (Exception e) {
            android.util.Log.w("BankFake", "briefing ai failed", e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void sendBriefing(Context ctx, String balance, String sub) {
        try {
            String text = askAi(balance, sub);
            if (text == null || text.length() > 600) {
                // запасной вариант без сети
                text = "Доброе утро! Баланс: " + balance + (sub.isEmpty() ? "" : ". " + sub);
            }
            MainActivity.notifyNow(ctx, "Утренний брифинг", text);
        } catch (Exception e) {
            android.util.Log.e("BankFake", "briefing failed", e);
        }
    }
}
