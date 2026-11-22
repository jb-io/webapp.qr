/**
 * Privacy policy (GDPR Art. 13) in German and English. Kept as JSX rather
 * than in the dictionary because it is long-form text with structure.
 */
import { useI18n } from '../i18n/index.tsx';
import { ISSUES_URL, OPERATOR_PROFILE, REPO_URL } from '../config.ts';

const STAND = '2026-11-22';
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

function German() {
  return (
    <div className="prose">
      <h1>Datenschutzerklärung</h1>
      <p className="muted">Stand: {STAND}</p>

      <h2>Kurz gesagt</h2>
      <ul>
        <li>Diese App verarbeitet alles <strong>ausschließlich in deinem Browser</strong>. Gescannte Inhalte, erstellte Codes, Kamerabilder und Bilder werden an niemanden übertragen.</li>
        <li>Es gibt <strong>keine Cookies, kein Tracking, keine Analyse, keine Werbung</strong> und keine Inhalte von Drittanbietern (keine Schriften, Skripte oder Bilder von fremden Servern). Eine Content-Security-Policy lässt im Browser technisch nur Anfragen an die eigene Adresse zu.</li>
        <li>Beim Aufruf der Seite verarbeitet der Hosting-Anbieter GitHub technisch notwendige Verbindungsdaten (siehe unten).</li>
      </ul>

      <h2>1. Verantwortlicher</h2>
      <p>
        Dieses Projekt ist ein privates, nicht kommerzielles Open-Source-Projekt des GitHub-Nutzers{' '}
        <a href={OPERATOR_PROFILE} {...ext}>jb-io</a>. Kontakt ist über die{' '}
        <a href={ISSUES_URL} {...ext}>Issues des Projekts</a> oder die auf dem GitHub-Profil angegebenen Kontaktwege möglich.
        Der Quellcode ist öffentlich einsehbar: <a href={REPO_URL} {...ext}>{REPO_URL}</a>.
      </p>

      <h2>2. Hosting bei GitHub Pages</h2>
      <p>
        Die App wird über GitHub Pages ausgeliefert, einen Dienst der GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco,
        CA 94107, USA. Beim Abruf der Dateien verarbeitet GitHub automatisch technisch notwendige Daten, insbesondere deine
        IP-Adresse, Datum und Uhrzeit, die abgerufene Datei, Referrer und Browser-Kennung, um die Seite auszuliefern und die
        Sicherheit des Dienstes zu gewährleisten. Der Betreiber dieser App hat auf diese Protokolle keinen Zugriff.
      </p>
      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer sicheren, zuverlässigen Bereitstellung
        der Seite). Eine Übermittlung in die USA ist möglich; GitHub ist unter dem EU-U.S. Data Privacy Framework zertifiziert
        (Art. 45 DSGVO). Details: <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" {...ext}>Datenschutzerklärung von GitHub</a>.
      </p>
      <p>Nach dem ersten Aufruf kann die App offline aus dem Speicher deines Browsers laufen; dann finden auch keine Abrufe bei GitHub statt.</p>

      <h2>3. Speicherung auf deinem Gerät</h2>
      <p>Die App legt Daten ausschließlich lokal im Browser ab, nie auf einem Server:</p>
      <ul>
        <li><strong>Einstellungen</strong> (Sprache, Farbschema, Schalter) – Schlüssel <code>webapp.qr.settings.v1</code> im localStorage.</li>
        <li><strong>Verlauf</strong> gescannter und erstellter Codes – Schlüssel <code>webapp.qr.history.v1</code>. Das Speichern lässt sich getrennt für gescannte und erstellte Codes abschalten.</li>
        <li><strong>Offline-Dateien</strong> der App (Cache Storage, Service Worker), damit sie ohne Netz funktioniert und im Teilen-Menü erscheinen kann. Über das Teilen-Menü übergebene Daten liegen dort nur kurz, bis die App sie übernommen hat.</li>
      </ul>
      <p>
        Diese Speicherung ist für die von dir ausdrücklich gewünschten Funktionen unbedingt erforderlich
        (§ 25 Abs. 2 Nr. 2 TDDDG); verarbeitet werden die Daten nur auf deinem Gerät. Du kannst alles jederzeit unter
        „Verlauf“ einsehen (inklusive Rohdaten) und dort oder unter „Einstellungen → Alle Daten dieser App löschen“ entfernen.
        Auch das Löschen der Websitedaten im Browser entfernt alles vollständig.
      </p>

      <h2>4. Kamera, Bilder und Standort</h2>
      <ul>
        <li><strong>Kamera:</strong> Sie wird erst nach deinem Klick auf „Kamera starten“ aktiviert (der Browser fragt zusätzlich um Erlaubnis) und beim Verlassen der Seite, nach einem Treffer oder beim Stoppen sofort beendet. Die Bilder werden nur im Arbeitsspeicher ausgewertet, weder gespeichert noch übertragen.</li>
        <li><strong>Bilder</strong>, die du öffnest, einfügst oder an die App teilst, sowie Logos für eigene Codes werden nur lokal verarbeitet. Logos werden verkleinert als Teil des Verlaufs gespeichert, wenn du einen Code speicherst.</li>
        <li><strong>Standort:</strong> Nur wenn du beim Inhaltstyp „Ort“ auf „Aktuellen Standort verwenden“ klickst, fragt der Browser nach deinem Standort. Die Koordinaten werden nur in das Formular übernommen.</li>
      </ul>

      <h2>5. Links und externe Aktionen</h2>
      <p>
        Inhalte gescannter Codes werden zunächst nur angezeigt. Erst wenn du aktiv z. B. „Link öffnen“, „In OpenStreetMap
        öffnen“, „Anrufen“ oder „Teilen“ wählst, wird eine externe Seite bzw. eine andere App geöffnet. Für deren
        Datenverarbeitung ist der jeweilige Anbieter verantwortlich. Die App übermittelt dabei keine Herkunftsadresse (Referrer).
      </p>

      <h2>6. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und
        Widerspruch (Art. 15–21 DSGVO) sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO).
        Da der Betreiber selbst keine personenbezogenen Daten von dir erhält, betreffen diese Rechte in der Praxis vor allem die
        Server-Protokolle bei GitHub; die lokal gespeicherten Daten kannst du selbst jederzeit einsehen und löschen.
      </p>
    </div>
  );
}

function English() {
  return (
    <div className="prose">
      <h1>Privacy policy</h1>
      <p className="muted">Last updated: {STAND}. The German version is authoritative.</p>

      <h2>In short</h2>
      <ul>
        <li>This app processes everything <strong>exclusively in your browser</strong>. Scanned content, created codes, camera frames and images are never transmitted to anyone.</li>
        <li>There are <strong>no cookies, no tracking, no analytics, no ads</strong> and no third-party content (no fonts, scripts or images from other servers). A Content Security Policy technically only permits requests to the app’s own address.</li>
        <li>When you load the page, the hosting provider GitHub processes technically necessary connection data (see below).</li>
      </ul>

      <h2>1. Controller</h2>
      <p>
        This is a private, non-commercial open-source project by the GitHub user{' '}
        <a href={OPERATOR_PROFILE} {...ext}>jb-io</a>. You can get in touch via the{' '}
        <a href={ISSUES_URL} {...ext}>project’s issues</a> or the contact options on the GitHub profile.
        Source code: <a href={REPO_URL} {...ext}>{REPO_URL}</a>.
      </p>

      <h2>2. Hosting on GitHub Pages</h2>
      <p>
        The app is delivered via GitHub Pages, a service of GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107,
        USA. When files are requested, GitHub automatically processes technically necessary data, in particular your IP address,
        date and time, the requested file, referrer and user agent, to deliver the site and keep the service secure. The operator
        of this app has no access to these logs.
      </p>
      <p>
        Legal basis is Art. 6(1)(f) GDPR (legitimate interest in a secure and reliable delivery). Data may be transferred to the
        USA; GitHub is certified under the EU-U.S. Data Privacy Framework (Art. 45 GDPR). Details:{' '}
        <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" {...ext}>GitHub Privacy Statement</a>.
      </p>
      <p>After the first visit, the app can run offline from your browser’s storage; no requests to GitHub happen then.</p>

      <h2>3. Storage on your device</h2>
      <ul>
        <li><strong>Settings</strong> (language, colour scheme, switches) – key <code>webapp.qr.settings.v1</code> in localStorage.</li>
        <li><strong>History</strong> of scanned and created codes – key <code>webapp.qr.history.v1</code>. Saving can be switched off separately for scanned and created codes.</li>
        <li><strong>Offline files</strong> of the app (Cache Storage, service worker) so that it works without network and can appear in the share menu. Data shared into the app is kept there only until the app has picked it up.</li>
      </ul>
      <p>
        This storage is strictly necessary for functions you explicitly request (§ 25(2) no. 2 TDDDG) and the data is only
        processed on your device. You can inspect everything under “History” (including raw data) and delete it there or via
        “Settings → Delete all data of this app”. Clearing the site data in your browser removes everything as well.
      </p>

      <h2>4. Camera, images and location</h2>
      <ul>
        <li><strong>Camera:</strong> only activated after you click “Start camera” (your browser asks for permission as well) and stopped as soon as a code is found, you stop it or leave the page. Frames are analysed in memory only – never stored or transmitted.</li>
        <li><strong>Images</strong> you open, paste or share into the app, and logos for your own codes, are processed locally only. Logos are stored downscaled as part of the history when you save a code.</li>
        <li><strong>Location:</strong> only when you click “Use current location” for the “Location” content type does the browser ask for your position. The coordinates are only put into the form.</li>
      </ul>

      <h2>5. Links and external actions</h2>
      <p>
        Content of scanned codes is only displayed at first. Only when you actively choose e.g. “Open link”, “Open in
        OpenStreetMap”, “Call” or “Share” is an external site or another app opened; its provider is responsible for any
        processing there. The app does not send a referrer.
      </p>

      <h2>6. Your rights</h2>
      <p>
        You have the right of access, rectification, erasure, restriction, data portability and objection (Art. 15–21 GDPR) and
        the right to lodge a complaint with a supervisory authority (Art. 77 GDPR). As the operator receives no personal data
        from you, these rights mainly concern GitHub’s server logs in practice; you can inspect and delete locally stored data
        yourself at any time.
      </p>
    </div>
  );
}

export function PrivacyPage() {
  const { lang } = useI18n();
  return <article className="card">{lang === 'de' ? <German /> : <English />}</article>;
}
