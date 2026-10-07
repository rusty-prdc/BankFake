package org.xprodc.ivan;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Отдаёт скачанный APK-установщик системному установщику Android (content:// URI).
 * Живёт в кэше приложения: место не занимает, системный установитель читает файл
 * через openFile(), а после обновления файл удаляется при следующем старте.
 */
public class UpdateFileProvider extends ContentProvider {

    public static final String AUTHORITY = "org.xprodc.ivan.updateprovider";
    private static final String APK_NAME = "BankFake-update.apk";

    /** Скачанное обновление (кэш/update/BankFake-update.apk). */
    public static File apkFile(Context ctx) {
        File dir = new File(ctx.getCacheDir(), "update");
        //noinspection ResultOfMethodCallIgnored dir.mkdirs();
        return new File(dir, APK_NAME);
    }

    /** Удаляет установщик после обновления (вызывается при старте приложения). */
    public static void cleanup(Context ctx) {
        File f = apkFile(ctx);
        if (f.exists()) {
            //noinspection ResultOfMethodCallIgnored f.delete();
        }
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        File f = apkFile(getContext());
        MatrixCursor c = new MatrixCursor(new String[]{"_display_name", "_size"});
        c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = apkFile(getContext());
        if (!f.exists()) throw new FileNotFoundException(f.getName());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException();
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
