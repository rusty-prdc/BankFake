package org.xprodc.ivan;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Общий рендер для виджетов BankFake (все используют один layout widget_bankfake,
 * отличаются только префиксом в SharedPreferences и подписью w_label).
 */
final class WidgetHost {

    private WidgetHost() {}

    /** Сохранить строки и обновить виджет. */
    static void save(Context ctx, String prefs, String label, String l1, String l2,
                     Class<? extends AppWidgetProvider> cls, String def1, String def2) {
        SharedPreferences p = ctx.getSharedPreferences(prefs, Context.MODE_PRIVATE);
        SharedPreferences.Editor e = p.edit();
        if (l1 != null && !l1.isEmpty()) e.putString("l1", l1);
        if (l2 != null && !l2.isEmpty()) e.putString("l2", l2);
        e.apply();
        update(ctx, prefs, label, def1, def2, cls);
    }

    /** Обновить виджет из SharedPreferences (если он есть на рабочем столе). */
    static void update(Context ctx, String prefs, String label, String def1, String def2,
                       Class<? extends AppWidgetProvider> cls) {
        try {
            AppWidgetManager am = AppWidgetManager.getInstance(ctx);
            if (am == null) return;
            int[] ids = am.getAppWidgetIds(new ComponentName(ctx, cls));
            if (ids == null || ids.length == 0) return;

            SharedPreferences p = ctx.getSharedPreferences(prefs, Context.MODE_PRIVATE);
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_bankfake);
            v.setTextViewText(R.id.w_label, label);
            v.setTextViewText(R.id.w_balance, p.getString("l1", def1));
            v.setTextViewText(R.id.w_sub, p.getString("l2", def2));

            Intent i = new Intent(ctx, MainActivity.class);
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, prefs.hashCode(), i, flags);
            v.setOnClickPendingIntent(R.id.w_root, pi);

            am.updateAppWidget(ids, v);
        } catch (Exception ex) {
            android.util.Log.e("BankFake", "widget update failed", ex);
        }
    }
}
