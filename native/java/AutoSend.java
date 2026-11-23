package tn.salesexpert.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.util.Map;

// Outils communs : alarmes, tâche d'envoi en cours, résultat du dernier envoi
public final class AutoSend {
    static final String PREFS = "autosend";
    static final String[] WA = {"com.whatsapp", "com.whatsapp.w4b"};

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String waPackage(Context c) {
        PackageManager pm = c.getPackageManager();
        for (String p : WA) {
            try { pm.getPackageInfo(p, 0); return p; } catch (PackageManager.NameNotFoundException ignored) { }
        }
        return null;
    }

    static boolean serviceEnabled(Context c) {
        String list = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (list == null) return false;
        ComponentName me = new ComponentName(c, WaSendService.class);
        for (String s : list.split(":")) {
            ComponentName cn = ComponentName.unflattenFromString(s);
            if (me.equals(cn)) return true;
        }
        return false;
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    private static PendingIntent alarmIntent(Context c, String type) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.setAction("tn.salesexpert.app.AUTOSEND");
        i.setData(Uri.parse("autosend://" + type));
        i.putExtra("type", type);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(c, type.hashCode(), i, flags);
    }

    static void schedule(Context c, String type, long at) {
        prefs(c).edit().putLong("at_" + type, at).apply();
        setAlarm(c, type, at);
    }

    private static void setAlarm(Context c, String type, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmIntent(c, type);
        if (Build.VERSION.SDK_INT >= 23) {
            if (canExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    static void cancel(Context c, String type) {
        prefs(c).edit().remove("at_" + type).apply();
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(c, type));
    }

    // Après un redémarrage du téléphone
    static void rescheduleAll(Context c) {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> e : prefs(c).getAll().entrySet()) {
            if (!e.getKey().startsWith("at_") || !(e.getValue() instanceof Long)) continue;
            long at = (Long) e.getValue();
            String type = e.getKey().substring(3);
            setAlarm(c, type, Math.max(at, now + 60000));
        }
    }

    static void setPending(Context c, String type) {
        prefs(c).edit().putString("pending", type).putLong("pending_at", System.currentTimeMillis()).remove("at_" + type).apply();
    }

    static String takePending(Context c) {
        SharedPreferences p = prefs(c);
        String t = p.getString("pending", null);
        long at = p.getLong("pending_at", 0);
        p.edit().remove("pending").remove("pending_at").apply();
        if (t == null || System.currentTimeMillis() - at > 15 * 60000) return null;
        return t;
    }

    // Démarre un envoi : partage du texte vers WhatsApp, le service choisit le groupe et appuie sur Envoyer
    static boolean send(Context c, String type, String text, String group) {
        String pkg = waPackage(c);
        if (pkg == null) { finish(c, type, false, "WhatsApp n'est pas installé"); return false; }
        prefs(c).edit()
                .putString("job_type", type).putString("job_group", group == null ? "" : group)
                .putString("job_text", text).putLong("job_started", System.currentTimeMillis()).apply();
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text);
        i.setPackage(pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(i);
        return true;
    }

    static void finish(Context c, String type, boolean ok, String msg) {
        prefs(c).edit()
                .remove("job_type").remove("job_group").remove("job_text").remove("job_started")
                .putString("last_type", type == null ? "" : type).putBoolean("last_ok", ok)
                .putString("last_msg", msg == null ? "" : msg).putLong("last_at", System.currentTimeMillis()).apply();
    }
}
