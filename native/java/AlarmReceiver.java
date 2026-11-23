package tn.salesexpert.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// À l'heure prévue : ouvre l'app, qui prépare le rapport et lance l'envoi
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String type = intent.getStringExtra("type");
        if (type == null) return;
        AutoSend.setPending(c, type);
        Intent i = new Intent(c, MainActivity.class);
        i.putExtra("autosend", true);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { c.startActivity(i); } catch (Exception ignored) { }
    }
}
