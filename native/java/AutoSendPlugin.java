package tn.salesexpert.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AutoSend")
public class AutoSendPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences p = AutoSend.prefs(getContext());
        JSObject r = new JSObject();
        r.put("enabled", AutoSend.serviceEnabled(getContext()));
        r.put("whatsapp", AutoSend.waPackage(getContext()) != null);
        r.put("exact", AutoSend.canExact(getContext()));
        r.put("busy", p.contains("job_type"));
        JSObject last = new JSObject();
        last.put("type", p.getString("last_type", ""));
        last.put("ok", p.getBoolean("last_ok", false));
        last.put("msg", p.getString("last_msg", ""));
        last.put("at", p.getLong("last_at", 0));
        r.put("last", last);
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { getContext().startActivity(i); } catch (Exception ignored) { }
        }
        call.resolve();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        String type = call.getString("type");
        Double at = call.getDouble("at");
        if (type == null || at == null) { call.reject("type et at requis"); return; }
        AutoSend.schedule(getContext(), type, at.longValue());
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String type = call.getString("type");
        if (type != null) AutoSend.cancel(getContext(), type);
        call.resolve();
    }

    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject r = new JSObject();
        String t = AutoSend.takePending(getContext());
        r.put("type", t == null ? "" : t);
        call.resolve(r);
    }

    @PluginMethod
    public void send(PluginCall call) {
        String type = call.getString("type", "");
        String text = call.getString("text");
        String group = call.getString("group", "");
        if (text == null) { call.reject("text requis"); return; }
        if (!AutoSend.serviceEnabled(getContext())) {
            AutoSend.finish(getContext(), type, false, "Service d'envoi automatique désactivé");
            JSObject r = new JSObject(); r.put("ok", false); call.resolve(r); return;
        }
        boolean ok;
        try { ok = AutoSend.send(getContext(), type, text, group); } catch (Exception e) { ok = false; AutoSend.finish(getContext(), type, false, e.getMessage()); }
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }
}
