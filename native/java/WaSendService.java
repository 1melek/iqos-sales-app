package tn.salesexpert.app;

import android.accessibilityservice.AccessibilityService;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;

// Service d'accessibilité : dans l'écran de partage de WhatsApp, choisit le groupe puis appuie sur Envoyer.
// Il n'agit que lorsqu'un envoi a été lancé par l'app (tâche "job_*"), jamais sinon.
public class WaSendService extends AccessibilityService {
    private static final int CLICK = AccessibilityNodeInfo.ACTION_CLICK;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean queued = false;
    private long jobStarted = 0, lastAction = 0, sentAt = 0;
    private String stage = "pick";
    private boolean searched = false, typed = false;
    private int sendClicks = 0;

    private final Runnable tick = new Runnable() {
        @Override public void run() { queued = false; step(); }
    };

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (AutoSend.prefs(this).contains("job_type")) again(400);
    }

    @Override
    public void onInterrupt() { }

    private void again(long ms) {
        if (queued) return;
        queued = true;
        handler.postDelayed(tick, ms);
    }

    private void step() {
        SharedPreferences p = AutoSend.prefs(this);
        if (!p.contains("job_type")) return;
        String type = p.getString("job_type", "");
        String group = p.getString("job_group", "").trim();
        String text = p.getString("job_text", "");
        long started = p.getLong("job_started", 0);
        long now = System.currentTimeMillis();
        if (started != jobStarted) {
            jobStarted = started; stage = "pick"; searched = false; typed = false; sendClicks = 0; sentAt = 0; lastAction = 0;
        }
        if (group.isEmpty()) { AutoSend.finish(this, type, false, "Aucun groupe choisi pour ce rapport"); return; }
        if (now - started > 120000) {
            AutoSend.finish(this, type, false, stage.equals("pick") ? "Groupe « " + group + " » introuvable dans WhatsApp" : "Bouton Envoyer introuvable");
            return;
        }
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !root.getPackageName().toString().startsWith("com.whatsapp")) { again(800); return; }
        if (now - lastAction < 700) { again(800); return; }
        String pkg = root.getPackageName().toString();

        if (stage.equals("pick")) {
            AccessibilityNodeInfo row = findGroupRow(root, group);
            if (row != null) { row.performAction(CLICK); stage = "send"; lastAction = now; again(800); return; }
            if (!searched) {
                AccessibilityNodeInfo s = findSearch(root, pkg);
                if (s != null) { s.performAction(CLICK); searched = true; lastAction = now; }
            } else if (!typed) {
                AccessibilityNodeInfo ed = findEdit(root);
                if (ed != null) {
                    Bundle b = new Bundle();
                    b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, group);
                    ed.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
                    typed = true; lastAction = now;
                }
            }
            again(800);
            return;
        }

        if (stage.equals("send")) {
            AccessibilityNodeInfo s = findSend(root, pkg);
            if (s != null) { s.performAction(CLICK); sendClicks++; sentAt = now; stage = "check"; lastAction = now; }
            again(800);
            return;
        }

        // stage "check" : si WhatsApp a ouvert la discussion avec le texte encore dans la zone de saisie, on appuie une 2e fois
        if (sendClicks < 2 && hasEntryWithText(root, pkg, text)) {
            AccessibilityNodeInfo s = findSend(root, pkg);
            if (s != null) { s.performAction(CLICK); sendClicks++; sentAt = now; lastAction = now; again(800); return; }
        }
        if (now - sentAt > 2500) AutoSend.finish(this, type, true, "Envoyé dans « " + group + " »");
        else again(800);
    }

    // ----- Recherche des éléments à l'écran -----
    private static List<AccessibilityNodeInfo> all(AccessibilityNodeInfo root) {
        List<AccessibilityNodeInfo> out = new ArrayList<>();
        List<AccessibilityNodeInfo> stack = new ArrayList<>();
        stack.add(root);
        while (!stack.isEmpty() && out.size() < 3000) {
            AccessibilityNodeInfo n = stack.remove(stack.size() - 1);
            if (n == null) continue;
            out.add(n);
            for (int i = n.getChildCount() - 1; i >= 0; i--) stack.add(n.getChild(i));
        }
        return out;
    }

    private static String str(CharSequence c) { return c == null ? "" : c.toString().trim(); }

    private static boolean isEdit(AccessibilityNodeInfo n) {
        return n.isEditable() || str(n.getClassName()).endsWith("EditText");
    }

    private static AccessibilityNodeInfo clickable(AccessibilityNodeInfo n) {
        for (int i = 0; n != null && i < 8; i++) {
            if (n.isClickable()) return n;
            n = n.getParent();
        }
        return null;
    }

    private static AccessibilityNodeInfo findGroupRow(AccessibilityNodeInfo root, String group) {
        List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByText(group);
        if (found == null) return null;
        for (AccessibilityNodeInfo n : found) {
            if (n == null || isEdit(n) || !n.isVisibleToUser()) continue;
            if (!str(n.getText()).equalsIgnoreCase(group)) continue;
            AccessibilityNodeInfo c = clickable(n);
            if (c != null) return c;
        }
        return null;
    }

    private static AccessibilityNodeInfo byId(AccessibilityNodeInfo root, String id) {
        List<AccessibilityNodeInfo> l = root.findAccessibilityNodeInfosByViewId(id);
        if (l == null) return null;
        for (AccessibilityNodeInfo n : l) if (n != null && n.isVisibleToUser() && n.isEnabled()) return n;
        return null;
    }

    private static boolean descIs(AccessibilityNodeInfo n, String... words) {
        String d = str(n.getContentDescription()).toLowerCase();
        if (d.isEmpty()) return false;
        for (String w : words) if (d.equals(w)) return true;
        return false;
    }

    private static AccessibilityNodeInfo findSearch(AccessibilityNodeInfo root, String pkg) {
        for (String id : new String[]{"menuitem_search", "search_button", "search", "search_icon"}) {
            AccessibilityNodeInfo n = byId(root, pkg + ":id/" + id);
            if (n != null) return clickable(n);
        }
        for (AccessibilityNodeInfo n : all(root))
            if (n.isVisibleToUser() && descIs(n, "rechercher", "search", "بحث")) return clickable(n);
        return null;
    }

    private static AccessibilityNodeInfo findEdit(AccessibilityNodeInfo root) {
        AccessibilityNodeInfo f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (f != null && isEdit(f)) return f;
        for (AccessibilityNodeInfo n : all(root)) if (n.isVisibleToUser() && isEdit(n)) return n;
        return null;
    }

    private static AccessibilityNodeInfo findSend(AccessibilityNodeInfo root, String pkg) {
        for (String id : new String[]{"send", "send_btn", "send_button"}) {
            AccessibilityNodeInfo n = byId(root, pkg + ":id/" + id);
            if (n != null) return clickable(n);
        }
        for (AccessibilityNodeInfo n : all(root))
            if (n.isVisibleToUser() && n.isEnabled() && descIs(n, "envoyer", "send", "إرسال")) return clickable(n);
        return null;
    }

    private static boolean hasEntryWithText(AccessibilityNodeInfo root, String pkg, String text) {
        AccessibilityNodeInfo e = byId(root, pkg + ":id/entry");
        if (e == null) return false;
        String t = str(e.getText()), want = text.trim();
        String head = want.length() > 12 ? want.substring(0, 12) : want;
        return !t.isEmpty() && t.startsWith(head);
    }
}
