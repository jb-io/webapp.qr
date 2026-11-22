/**
 * Privacy policy (GDPR Art. 13) in German (authoritative) and English. Kept
 * as JSX rather than in the dictionary because it is long-form text.
 *
 * Keep in sync with the code: storage keys (lib/storage.ts), when history is
 * written (Store.recordScan / recordCreated), service worker and share target.
 * Update STAND on every change of content.
 */
import { useI18n } from '../i18n/index.tsx';
import { ISSUES_URL, OPERATOR_PROFILE, REPO_URL } from '../config.ts';
import { MAX_ENTRIES } from '../../core/history.ts';

const STAND = { de: '22. November 2026', en: 'November 22, 2026' };
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

function German() {
  return (
    <div className="prose">
      <div className="page-head"><div><h1>Datenschutzerklärung</h1><p>Stand: {STAND.de}</p></div></div>

      <h2>Kurz gesagt</h2>
      <ul>
        <li>Diese App verarbeitet alles <strong>ausschließlich in deinem Browser</strong>. Gescannte Inhalte, erstellte Codes, Kamerabilder und Bilder werden an niemanden übertragen.</li>
        <li>Es gibt <strong>keine Cookies, kein Tracking, keine Analyse, keine Werbung</strong> und keine Inhalte von Drittanbietern (keine Schriften, Skripte oder Bilder von fremden Servern). Eine Content-Security-Policy verbietet der App-Seite technisch Anfragen an fremde Server; automatische Tests prüfen das bei jeder Änderung.</li>
        <li>Beim Laden der App verarbeitet der Hosting-Anbieter GitHub technisch notwendige Verbindungsdaten (Abschnitt 2).</li>
      </ul>

      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlich ist der Betreiber des GitHub-Kontos <a href={OPERATOR_PROFILE} {...ext}>jb-io</a>, eine Privatperson.
        Es handelt sich um ein privates, nicht kommerzielles und kostenloses Open-Source-Projekt ohne Werbung und ohne Einnahmen.
        Kontakt ist über die auf dem <a href={OPERATOR_PROFILE} {...ext}>GitHub-Profil</a> angegebenen Wege möglich; für technische
        Fragen und Fehlermeldungen über die <a href={ISSUES_URL} {...ext}>Issues des Projekts</a> (Beiträge dort sind öffentlich –
        bitte keine persönlichen Daten in Issues schreiben). Quellcode: <a href={REPO_URL} {...ext}>{REPO_URL}</a>.
      </p>

      <h2>2. Hosting bei GitHub Pages</h2>
      <p>
        Die App wird über GitHub Pages ausgeliefert, einen Dienst der GitHub, Inc. (USA), und dessen Dienstleister für die
        Auslieferung (Content Delivery Network, derzeit Fastly). Beim Abruf der Dateien werden automatisch technisch notwendige
        Daten verarbeitet, insbesondere deine IP-Adresse, Datum und Uhrzeit, die abgerufene Datei, Referrer und Browser-Kennung,
        um die Seite auszuliefern und den Dienst abzusichern. Ich nutze GitHub Pages zu den allgemeinen Bedingungen von GitHub;
        GitHub verarbeitet diese Verbindungsdaten nach eigenen Angaben auch zu eigenen Zwecken (Sicherheit, Missbrauchsabwehr).
        Auf diese Protokolle habe ich keinen Zugriff. Wie lange sie gespeichert werden, legt GitHub fest.
      </p>
      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer sicheren, zuverlässigen Bereitstellung).
        Eine Übermittlung in die USA ist möglich; GitHub ist unter dem EU-U.S. Data Privacy Framework zertifiziert (Art. 45 DSGVO).
        Details: <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" {...ext}>Datenschutzerklärung von GitHub</a>.
        GitHub Pages setzt beim Abruf dieser App keine Cookies.
      </p>
      <p>
        Nach dem ersten Aufruf läuft die App aus dem Speicher deines Browsers. Solange du online bist, fragt dein Browser beim
        Öffnen der App bei GitHub nach, ob es eine neue Version gibt (Abruf der Datei <code>sw.js</code>), und lädt Updates
        gegebenenfalls herunter. Dabei fallen die oben genannten Verbindungsdaten an. Ohne Netzverbindung finden keine Abrufe statt.
      </p>

      <h2>3. Speicherung auf deinem Gerät</h2>
      <p>Die App legt Daten ausschließlich lokal in deinem Browser ab, nie auf einem Server. Ich habe darauf keinen Zugriff.</p>
      <ul>
        <li><strong>Einstellungen</strong> (Sprache, Farbschema, Schalter) – Schlüssel <code>webapp.qr.settings.v1</code> im localStorage, sobald du eine Einstellung änderst.</li>
        <li>
          <strong>Verlauf</strong> – Schlüssel <code>webapp.qr.history.v1</code>. Standardmäßig eingeschaltet: Jeder erkannte Code
          wird mit Inhalt, Format, Quelle (Kamera/Bild) und Zeitpunkt gespeichert; nach dem Scan weist ein Hinweis darauf hin.
          Erstellte Codes werden mit Inhalt, Gestaltung (einschließlich eines verkleinerten Logos) und Zeitpunkt gespeichert, sobald
          du sie speicherst, herunterlädst, teilst, als Bild kopierst oder groß anzeigst. Codes mit Geheimnissen für die
          Zwei-Faktor-Anmeldung (OTP) werden nie gespeichert. Das Speichern lässt sich unter „Verlauf“ oder „Einstellungen“ für
          beide Listen getrennt abschalten.
        </li>
        <li>
          <strong>Offline-Dateien</strong> – beim ersten Aufruf speichert dein Browser die Dateien der App (Cache Storage, Service
          Worker), damit sie schnell lädt, offline funktioniert und als installierte App im Teilen-Menü erscheinen kann. Darin sind
          keine Inhalte von dir enthalten. Über das Teilen-Menü übergebene Daten liegen dort nur, bis die App sie übernommen hat,
          längstens bis zum nächsten Start der App.
        </li>
      </ul>
      <p>
        Diese Speicherung dient ausschließlich den Funktionen, die du nutzt (Einstellungen, Verlauf, Offline-Betrieb), und ist dafür
        unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Die Daten bleiben gespeichert, bis du sie löschst; je Liste werden
        höchstens {MAX_ENTRIES} Einträge aufbewahrt, ältere fallen automatisch heraus. Unter „Verlauf“ kannst du alles einsehen
        (auch die Rohdaten) und einzeln oder vollständig löschen, unter „Einstellungen → Alle Daten dieser App löschen“ entfernst du
        alles. Auch das Löschen der Websitedaten im Browser entfernt alles vollständig.
      </p>
      <p>
        Hinweis: Die App teilt sich die Browser-Adresse <code>jb-io.github.io</code> mit anderen Projekten desselben Betreibers;
        dein Browser trennt deren Speicher technisch nicht von dem dieser App.
      </p>

      <h2>4. Kamera, Bilder, Standort und Zwischenablage</h2>
      <ul>
        <li><strong>Kamera:</strong> Sie wird erst nach deinem Klick auf „Kamera starten“ aktiviert (der Browser fragt zusätzlich um Erlaubnis) und beendet, sobald ein Code erkannt wurde, du sie stoppst, die Seite wechselst oder die App in den Hintergrund geht. Die Bilder werden nur im Arbeitsspeicher ausgewertet, weder gespeichert noch übertragen.</li>
        <li><strong>Bilder</strong>, die du öffnest, einfügst oder an die App teilst, sowie Logos für eigene Codes werden nur lokal verarbeitet. Logos werden verkleinert als Teil eines erstellten Codes im Verlauf gespeichert (Abschnitt 3).</li>
        <li><strong>Standort:</strong> Nur wenn du beim Inhaltstyp „Ort“ auf „Aktuellen Standort verwenden“ klickst, fragt der Browser nach deinem Standort. Die Koordinaten werden nur in das Formular übernommen und – wie jeder Inhalt – im Verlauf gespeichert, wenn der Code dort landet.</li>
        <li><strong>Zwischenablage:</strong> Die App liest die Zwischenablage nur, wenn du selbst ein Bild einfügst (Strg+V), und schreibt nur nach deinem Klick auf „Kopieren“. Kopierte Inhalte, etwa ein WLAN-Passwort, bleiben in der Zwischenablage deines Systems, bis du sie überschreibst.</li>
      </ul>

      <h2>5. Links und externe Aktionen</h2>
      <p>
        Inhalte gescannter Codes werden zunächst nur angezeigt. Erst wenn du aktiv z. B. „Link öffnen“, „In OpenStreetMap
        öffnen“, „Anrufen“, „Teilen“ oder einen der Links zu GitHub (Quellcode, Profil, Issues) wählst, wird eine externe Seite
        bzw. eine andere App geöffnet. Dort gelten deren Datenschutzbestimmungen, auch Cookies von github.com. Die App übermittelt
        beim Öffnen von Webseiten keine Herkunftsadresse (Referrer).
      </p>

      <h2>6. Kontaktaufnahme</h2>
      <p>
        Wenn du mich kontaktierst oder ein Issue auf GitHub eröffnest, verarbeite ich deine Angaben (Name bzw. Nutzername,
        Kontaktdaten, Inhalt) nur, um dein Anliegen zu bearbeiten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; mein
        berechtigtes Interesse ist die Beantwortung deiner Anfrage. Nachrichten lösche ich, sobald das Anliegen erledigt ist und
        keine gesetzlichen Pflichten entgegenstehen. Issues sind öffentlich und unterliegen zusätzlich der Datenschutzerklärung von GitHub.
      </p>

      <h2>7. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit
        (Art. 15–20 DSGVO) sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO). Außer bei
        einer Kontaktaufnahme erhalte ich keine personenbezogenen Daten von dir; die lokal gespeicherten Daten kannst du selbst
        jederzeit einsehen und löschen.
      </p>
      <p>
        <strong>Widerspruchsrecht:</strong> Soweit eine Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO beruht, kannst du ihr aus
        Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).
      </p>
      <p>
        Du bist weder gesetzlich noch vertraglich verpflichtet, Daten bereitzustellen; ohne die technisch notwendigen
        Verbindungsdaten kann die Seite allerdings nicht ausgeliefert werden. Eine automatisierte Entscheidungsfindung
        einschließlich Profiling findet nicht statt.
      </p>
    </div>
  );
}

function English() {
  return (
    <div className="prose">
      <div className="page-head"><div><h1>Privacy policy</h1><p>Last updated: {STAND.en}. The German version is authoritative.</p></div></div>

      <h2>In short</h2>
      <ul>
        <li>This app processes everything <strong>exclusively in your browser</strong>. Scanned content, created codes, camera frames and images are never transmitted to anyone.</li>
        <li>There are <strong>no cookies, no tracking, no analytics, no ads</strong> and no third-party content (no fonts, scripts or images from other servers). A Content Security Policy technically prevents the app page from contacting other servers; automated tests check this on every change.</li>
        <li>When the app is loaded, the hosting provider GitHub processes technically necessary connection data (section 2).</li>
      </ul>

      <h2>1. Controller</h2>
      <p>
        The controller is the operator of the GitHub account <a href={OPERATOR_PROFILE} {...ext}>jb-io</a>, a private individual.
        This is a private, non-commercial, free open-source project without ads and without revenue. You can get in touch via the
        options listed on the <a href={OPERATOR_PROFILE} {...ext}>GitHub profile</a>; for technical questions and bug reports via
        the <a href={ISSUES_URL} {...ext}>project’s issues</a> (posts there are public – please do not put personal data into
        issues). Source code: <a href={REPO_URL} {...ext}>{REPO_URL}</a>.
      </p>

      <h2>2. Hosting on GitHub Pages</h2>
      <p>
        The app is delivered via GitHub Pages, a service of GitHub, Inc. (USA), and its delivery providers (content delivery
        network, currently Fastly). When files are requested, technically necessary data is processed automatically, in
        particular your IP address, date and time, the requested file, referrer and user agent, to deliver the site and secure the
        service. I use GitHub Pages under GitHub’s general terms; according to GitHub, it also processes this data for its own
        purposes (security, abuse prevention). I have no access to these logs; GitHub decides how long they are kept.
      </p>
      <p>
        Legal basis is Art. 6(1)(f) GDPR (legitimate interest in secure and reliable delivery). Data may be transferred to the USA;
        GitHub is certified under the EU-U.S. Data Privacy Framework (Art. 45 GDPR). Details:{' '}
        <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" {...ext}>GitHub Privacy Statement</a>.
        GitHub Pages sets no cookies when serving this app.
      </p>
      <p>
        After the first visit the app runs from your browser’s storage. While you are online, your browser checks GitHub for a new
        version whenever the app is opened (request for <code>sw.js</code>) and downloads updates if there are any; this produces
        the connection data described above. Without a network connection no requests are made.
      </p>

      <h2>3. Storage on your device</h2>
      <p>The app stores data only locally in your browser, never on a server. I have no access to it.</p>
      <ul>
        <li><strong>Settings</strong> (language, colour scheme, switches) – key <code>webapp.qr.settings.v1</code> in localStorage, once you change a setting.</li>
        <li>
          <strong>History</strong> – key <code>webapp.qr.history.v1</code>. On by default: every detected code is stored with its
          content, format, source (camera/image) and time; a note after the scan points this out. Created codes are stored with
          content, design (including a downscaled logo) and time once you save, download, share, copy or show them large. Codes
          containing two-factor (OTP) secrets are never stored. Saving can be switched off separately for both lists under
          “History” or “Settings”.
        </li>
        <li>
          <strong>Offline files</strong> – on the first visit your browser stores the app’s files (Cache Storage, service worker)
          so that it loads fast, works offline and can appear in the share menu as an installed app. They contain none of your
          content. Data shared into the app is kept there only until the app has picked it up, at most until the app is next started.
        </li>
      </ul>
      <p>
        This storage only serves the functions you use (settings, history, offline mode) and is strictly necessary for them
        (§ 25(2) no. 2 TDDDG). Data stays until you delete it; at most {MAX_ENTRIES} entries per list are kept, older ones drop out
        automatically. Under “History” you can inspect everything (including raw data) and delete entries one by one or all at
        once; “Settings → Delete all data of this app” removes everything. Clearing the site data in your browser does so as well.
      </p>
      <p>
        Note: the app shares the browser address <code>jb-io.github.io</code> with other projects of the same operator; your
        browser does not technically separate their storage from this app’s.
      </p>

      <h2>4. Camera, images, location and clipboard</h2>
      <ul>
        <li><strong>Camera:</strong> only activated after you click “Start camera” (your browser asks for permission as well) and stopped as soon as a code is found, you stop it, change page or the app goes to the background. Frames are analysed in memory only – never stored or transmitted.</li>
        <li><strong>Images</strong> you open, paste or share into the app, and logos for your own codes, are processed locally only. Logos are stored downscaled as part of a created code in the history (section 3).</li>
        <li><strong>Location:</strong> only when you click “Use current location” for the “Location” type does the browser ask for your position. The coordinates are only put into the form and – like any content – stored in the history if the code ends up there.</li>
        <li><strong>Clipboard:</strong> the app only reads the clipboard when you paste an image yourself (Ctrl+V) and only writes to it after you click “Copy”. Copied content, e.g. a Wi-Fi password, stays in your system clipboard until overwritten.</li>
      </ul>

      <h2>5. Links and external actions</h2>
      <p>
        Content of scanned codes is only displayed at first. Only when you actively choose e.g. “Open link”, “Open in
        OpenStreetMap”, “Call”, “Share” or one of the links to GitHub (source code, profile, issues) is an external site or another
        app opened; their privacy terms apply there, including cookies of github.com. The app does not send a referrer when
        opening websites.
      </p>

      <h2>6. Contacting me</h2>
      <p>
        If you contact me or open an issue on GitHub, I process your details (name or user name, contact data, content) only to
        handle your request. Legal basis is Art. 6(1)(f) GDPR; my legitimate interest is answering your request. I delete messages
        once the matter is settled unless legal obligations require otherwise. Issues are public and also subject to GitHub’s
        privacy statement.
      </p>

      <h2>7. Your rights</h2>
      <p>
        You have the right of access, rectification, erasure, restriction and data portability (Art. 15–20 GDPR) and the right to
        lodge a complaint with a supervisory authority (Art. 77 GDPR). Apart from when you contact me, I receive no personal data
        from you; you can inspect and delete locally stored data yourself at any time.
      </p>
      <p>
        <strong>Right to object:</strong> where processing is based on Art. 6(1)(f) GDPR, you may object to it at any time on
        grounds relating to your particular situation (Art. 21 GDPR).
      </p>
      <p>
        You are not legally or contractually obliged to provide data; without the technically necessary connection data the site
        cannot be delivered, though. There is no automated decision-making, including profiling.
      </p>
    </div>
  );
}

export function PrivacyPage() {
  const { lang } = useI18n();
  return <article className="card privacy">{lang === 'de' ? <German /> : <English />}</article>;
}
