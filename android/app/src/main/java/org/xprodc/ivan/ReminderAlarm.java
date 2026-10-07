package org.xprodc.ivan;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import java.util.Calendar;

/**
 * Напоминание о платеже: ежедневное уведомление в заданное время с текстом пользователя.
 * Клон утреннего брифинга (BriefingAlarm), без новых разрешений —
 * setInexactRepeating не требует SCHEDULE_EXACT_ALARM, время может «плыть» в пределах окна.
 * Текст и время приходят из bank.js через BFJson.reminder(text, hour, minute).
 */
public class ReminderAlarm {

    private static final int REQ_CODE = 7703;
    private static final String PREFS = "bf_reminder";

    /** Поставить/переставить ежедневное напоминание. */
    public static void schedule(Context ctx, String text, int hour, int minute) {
        try {
            if (text == null || text.trim().isEmpty()) { cancel(ctx); return; }
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            p.edit().putString("text", text.trim())
                    .putInt("hour", Math.max(0, Math.min(23, hour)))
                    .putInt("minute", Math.max(0, Math.min(59, minute)))
                    .apply();

            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, Receiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_CODE, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, hour);
            c.set(Calendar.MINUTE, minute);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            if (c.getTimeInMillis() <= System.currentTimeMillis()) c.add(Calendar.DAY_OF_YEAR, 1);
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(),
                    AlarmManager.INTERVAL_DAY, pi);
        } catch (Exception e) {
            android.util.Log.e("BankFake", "reminder schedule failed", e);
        }
    }

    /** Выключить напоминание. */
    public static void cancel(Context ctx) {
        try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(ctx, Receiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_CODE, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            if (am != null) am.cancel(pi);
            pi.cancel();
        } catch (Exception e) {
            android.util.Log.e("BankFake", "reminder cancel failed", e);
        }
    }

    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String text = p.getString("text", "");
            if (text.isEmpty()) return;
            MainActivity.notifyNow(ctx, "Напоминание о платеже", text);
        }
    }
}
