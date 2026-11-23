// Ajoute au projet Android généré par Capacitor le module d'envoi automatique WhatsApp :
// code Java (native/java), ressources (native/res) et déclarations dans AndroidManifest.xml.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const app = path.join(root, "android/app/src/main");
const pkgDir = path.join(app, "java/tn/salesexpert/app");
fs.mkdirSync(pkgDir, { recursive: true });
for (const f of fs.readdirSync(path.join(root, "native/java"))) fs.copyFileSync(path.join(root, "native/java", f), path.join(pkgDir, f));
for (const d of fs.readdirSync(path.join(root, "native/res"))) {
  fs.mkdirSync(path.join(app, "res", d), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, "native/res", d))) fs.copyFileSync(path.join(root, "native/res", d, f), path.join(app, "res", d, f));
}
const mf = path.join(app, "AndroidManifest.xml");
let m = fs.readFileSync(mf, "utf8");
if (!m.includes("WaSendService")) {
  m = m.replace("</application>", `
        <service android:name=".WaSendService" android:exported="true"
            android:label="@string/autosend_label"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter><action android:name="android.accessibilityservice.AccessibilityService" /></intent-filter>
            <meta-data android:name="android.accessibilityservice" android:resource="@xml/wa_send_service" />
        </service>
        <receiver android:name=".AlarmReceiver" android:exported="false" />
        <receiver android:name=".BootReceiver" android:exported="true">
            <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /></intent-filter>
        </receiver>
    </application>

    <queries>
        <package android:name="com.whatsapp" />
        <package android:name="com.whatsapp.w4b" />
    </queries>`);
  m = m.replace('<uses-permission android:name="android.permission.INTERNET" />', `<uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />`);
  if (!m.includes("WaSendService") || !m.includes("USE_EXACT_ALARM")) throw new Error("AndroidManifest.xml : modification impossible");
  fs.writeFileSync(mf, m);
}
console.log("Module d'envoi automatique ajouté au projet Android");
