package org.xprodc.ivan;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * Виджет «Курсы валют» — строки ($ / € / ¥) приходят из bank.js через BFJson.widgetRates(l1, l2).
 */
public class RatesWidget extends AppWidgetProvider {

    public static final String PREFS = "bf_widget_rates";
    public static final String LABEL = "КУРСЫ ЦБ";

    /** Вызывается из JS-интерфейса: записать строки и обновить виджет. */
    public static void setText(Context ctx, String l1, String l2) {
        WidgetHost.save(ctx, PREFS, LABEL, l1, l2, RatesWidget.class, "$ — · € —", "Курсы — в приложении");
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager am, int[] ids) {
        WidgetHost.update(ctx, PREFS, LABEL, "$ — · € —", "Курсы — в приложении", RatesWidget.class);
    }
}
