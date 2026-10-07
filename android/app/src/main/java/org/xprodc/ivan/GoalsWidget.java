package org.xprodc.ivan;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * Виджет «Цели» — прогресс копилок приходит из bank.js через BFJson.widgetGoals(l1, l2).
 */
public class GoalsWidget extends AppWidgetProvider {

    public static final String PREFS = "bf_widget_goals";
    public static final String LABEL = "ЦЕЛИ";

    /** Вызывается из JS-интерфейса: записать строки и обновить виджет. */
    public static void setText(Context ctx, String l1, String l2) {
        WidgetHost.save(ctx, PREFS, LABEL, l1, l2, GoalsWidget.class, "Копилок нет", "Цели — в приложении");
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager am, int[] ids) {
        WidgetHost.update(ctx, PREFS, LABEL, "Копилок нет", "Цели — в приложении", GoalsWidget.class);
    }
}
