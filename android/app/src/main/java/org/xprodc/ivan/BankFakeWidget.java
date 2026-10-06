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
 * Виджет «Баланс BankFake» для домашнего экрана.
 * Данные (баланс, курс, цель) приходят из bank.js через BFJson.widget(l1, l2).
 * Обновление: при открытии приложения и раз в 30 минут (updatePeriodMillis).
 */
public class BankFakeWidget extends AppWidgetProvider {

    public static final String PREFS = "bf_widget";

    /** Вызывается из JS-интерфейса: записать строки и обновить виджет. */
    public static void setText(Context ctx, String balance, String sub) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor e = p.edit();
        if (balance != null && !balance.isEmpty()) e.putString("l1", balance);
        if (sub != null) e.putString("l2", sub);
        e.apply();
        updateAll(ctx);
    }

    public static void updateAll(Context ctx) {
        try {
            AppWidgetManager am = AppWidgetManager.getInstance(ctx);
            if (am == null) return;
            int[] ids = am.getAppWidgetIds(new ComponentName(ctx, BankFakeWidget.class));
            if (ids == null || ids.length == 0) return;

            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String l1 = p.getString("l1", "2 500 ₽");
            String l2 = p.getString("l2", "Курсы и цели — в приложении");

            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_bankfake);
            v.setTextViewText(R.id.w_balance, l1);
            v.setTextViewText(R.id.w_sub, l2);

            Intent i = new Intent(ctx, MainActivity.class);
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, i, flags);
            v.setOnClickPendingIntent(R.id.w_root, pi);

            am.updateAppWidget(ids, v);
        } catch (Exception ex) {
            android.util.Log.e("BankFake", "widget update failed", ex);
        }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateAll(ctx);
    }
}
