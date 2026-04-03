# myRecipes

**myRecipes** ist eine persönliche, KI-gestützte Rezeptsammlung als Self-Hosted Web-App. Rezepte lassen sich per URL, PDF, Foto oder freiem Text importieren – die KI analysiert und strukturiert sie automatisch. Die App läuft auf einem eigenen Server und ist für Familie und Freunde freigegeben.

> Entwickelt von **Daniel Ertl** gemeinsam mit **Claude Sonnet** (Anthropic) – Mensch und KI als Entwicklungsduo.

---

## Features

### Rezepte importieren
- **URL-Import** – Rezept-URL eingeben, die KI extrahiert alle Felder automatisch. Unterstützt Schema.org/JSON-LD (Chefkoch, Essen & Trinken etc.) sowie Plaintext-Fallback. Die Quell-URL wird automatisch in die Notizen geschrieben.
- **PDF-Import** – Rezepte aus PDF-Dateien (z. B. abgespeicherte Webseiten, eingescannte Seiten)
- **Foto-/Bilderkennung** – Fotos von handgeschriebenen oder gedruckten Rezepten; auch mehrere Seiten auf einmal
- **Kamera** – Direkt auf dem Mobilgerät abfotografieren
- **Freitext** – Rezept als Text einfügen, KI strukturiert ihn
- **Massenimport** – Ganzen Ordner mit PDFs und Bildern auf einmal verarbeiten; fehlgeschlagene Dateien lassen sich erneut versuchen

### Rezepte verwalten
- Übersicht mit Suche, Filterung nach Kategorie, Herkunft, Hauptzutat, Tags
- Detailansicht mit strukturierten Zubereitungsschritten inkl. **Unter-Überschriften** (z. B. „Soße:", „Nudeln:") als eigene Abschnittstitel
- Rezept bearbeiten, löschen
- „Heute gekocht"-Funktion mit Protokoll der Kochdaten
- Notizen pro Rezept mit Zeitstempel

### PDF-Export
- **A4** und **A5** (doppelseitig druckbar, schneidbar) für einzelne Rezepte
- **Kochbuch-Export** – alle Rezepte eines Kochbuchs als A4- oder A5-PDF mit Deckblatt
- Unter-Überschriften in Zubereitungsschritten werden im PDF als fette Abschnittstitel gerendert
- Auf mobilen Geräten wird das PDF direkt im nativen PDF-Viewer des Betriebssystems geöffnet

### KI-Funktionen (Claude von Anthropic)
- Automatische Extraktion von Titel, Zutaten, Zubereitung, Kategorie, Herkunft, Hauptzutat, Tags, Portionen, Schwierigkeit, Zubereitungszeit
- Rezeptvorschläge: „Was koche ich heute?" – Freitext-Frage, die KI sucht passende Rezepte aus der eigenen Sammlung
- Gespeicherte Lieblingsfragen für schnellen Zugriff
- Erkennung von Handschrift auf Fotos

### Kochbücher
- Rezepte in thematische Kochbücher sortieren (z. B. „Italienisch", „Weihnachten")
- Standard-Kochbuch für alle Rezepte
- Kochbücher als druckfertiges PDF exportieren

### Benutzerverwaltung
- Mehrere Benutzer (Familie, Freunde) mit eigenem Login
- Rollen: Administrator und normaler Benutzer
- Jeder Benutzer kann eigene Rezepte anlegen; Admins verwalten alle
- Passwort-Verwaltung durch Admin

### Backup & Daten
- Vollständiger Datenbank-Export und -Import als JSON
- Datenbankformat: SQLite (eine einzige Datei, leicht zu sichern)

---

## Technologie-Stack

| Bereich | Technologie |
|---|---|
| **Frontend** | Vanilla JavaScript (ES Modules), kein Framework |
| **Build** | Webpack 5 (Dev + Prod Config, Code-Splitting) |
| **Backend** | Node.js + Express |
| **Datenbank** | SQLite via `better-sqlite3` |
| **PDF-Erzeugung** | jsPDF |
| **PDF-Parsing** | pdf.js (`pdfjs-dist`) |
| **KI-Analyse** | Anthropic Claude API (claude-sonnet) |
| **Auth** | Token-basiert (Bearer Token, 15 min TTL) |
| **Webserver (Prod)** | nginx mit SSL (Let's Encrypt) |
| **Prozess-Manager** | systemd |

---

## Voraussetzungen

1. **Ein öffentlich erreichbarer Server** – z. B. ein vServer bei Strato, Hetzner, DigitalOcean o. ä. mit einer eigenen Domain. Der Server braucht Node.js (≥ 18), npm und nginx.
2. **Ein Anthropic API-Key** – alle KI-Funktionen (Import, Analyse, Vorschläge) laufen über die Claude API. Einen Key bekommt man unter [console.anthropic.com](https://console.anthropic.com). Der Key wird nach der Installation im Admin-Bereich der App eingetragen und serverseitig gespeichert.

---

## Installation & Einrichtung

### 1. Repository klonen und Abhängigkeiten installieren

```bash
git clone https://github.com/thunder312/myRecipes.git
cd myRecipes
npm install
```

### 2. Datenbank initialisieren

Beim ersten Start wird die SQLite-Datenbank automatisch angelegt. Falls eine Migration nötig ist:

```bash
node server/migrate.js
```

Die Datenbank liegt unter `data/recipes.db` – diese Datei niemals überschreiben!

### 3. Lokal entwickeln

```bash
npm run dev
```

Startet gleichzeitig:
- Node-Backend auf Port **3000**
- Webpack Dev Server auf Port **8080** (mit Hot Reload und API-Proxy)

Aufruf im Browser: `http://localhost:8080`

Beim ersten Start wird automatisch ein Admin-Benutzer angelegt:

| | |
|---|---|
| **Benutzername** | `admin` |
| **Passwort** | `admin` |

> **Wichtig:** Passwort nach dem ersten Login sofort unter **Einstellungen → Passwort ändern** ändern!

> **Tipp für mobile Geräte im lokalen Netz:** In `webpack.config.dev.js` ist `host: '0.0.0.0'` gesetzt. Die eigene IP-Adresse (`ipconfig`) im WLAN-Gerät eingeben: `http://192.168.x.x:8080`

### 4. Produktions-Build erstellen

```bash
npm run build
```

Output landet im Ordner `dist/`.

### 5. Server einrichten (am Beispiel Strato vServer / Debian)

#### Node.js installieren
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

#### App auf den Server übertragen

```bash
# Frontend
scp -r dist/ user@DEINE-IP:/var/www/myrecipes/dist/

# Backend
scp server/index.js server/db.js package.json user@DEINE-IP:/var/www/myrecipes/
scp -r server/routes/ user@DEINE-IP:/var/www/myrecipes/server/

# Abhängigkeiten auf dem Server installieren
ssh user@DEINE-IP "cd /var/www/myrecipes && npm install --omit=dev"
```

#### systemd-Service einrichten

Datei `/etc/systemd/system/myrecipes.service`:

```ini
[Unit]
Description=myRecipes Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/myrecipes
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable myrecipes
systemctl start myrecipes
```

#### nginx als Reverse Proxy

```nginx
server {
    server_name rezepte.deine-domain.de;

    root /var/www/myrecipes/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

SSL mit Certbot einrichten:
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d rezepte.deine-domain.de
```

### 6. Anthropic API-Key eintragen

1. App im Browser aufrufen
2. Als Administrator einloggen
3. **Einstellungen** → **Anthropic API-Key** → Key eintragen und speichern

Der Key wird serverseitig in der SQLite-Datenbank gespeichert und nie an den Client übertragen.

---

## Projektstruktur

```
myRecipes/
├── dist/                  ← Webpack-Build (wird deployed)
├── js/
│   ├── views/             ← Frontend-Views (overview, detail, import, suggest, cookbooks, settings)
│   ├── utils/             ← Hilfsfunktionen (auth, helpers, recipe-form)
│   ├── api.js             ← Claude API-Kommunikation
│   ├── import.js          ← Import-Logik (URL, PDF, Bild, Text)
│   ├── pdf-generator.js   ← PDF-Export (A4/A5, Kochbuch)
│   └── db.js              ← Frontend DB-Zugriff via API
├── server/
│   ├── index.js           ← Express-Server, Auth, Token-Verwaltung
│   ├── db.js              ← SQLite-Datenbankzugriff
│   ├── migrate.js         ← Datenbankmigrationen
│   └── routes/            ← API-Routen (recipes, auth, cookbooks, backup, ...)
├── css/
│   └── style.css          ← Stylesheet
├── data/
│   └── recipes.db         ← SQLite-Datenbank (NICHT in Git!)
├── webpack.config.dev.js
├── webpack.config.prod.js
└── package.json
```

---

## Lizenz

MIT – freie Nutzung, Weiterentwicklung und Selbst-Hosting erwünscht.

---

*Dieses Projekt entstand in enger Zusammenarbeit zwischen **Daniel Ertl** und **Claude Sonnet** (Anthropic) – als Beispiel dafür, wie Mensch und KI gemeinsam produktive Software entwickeln können.*