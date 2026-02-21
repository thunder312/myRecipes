# myRecipes auf Strato vServer deployen

## Voraussetzungen

- Strato vServer mit SSH-Zugang (Linux, z.B. Ubuntu/Debian)
- Eine Domain oder Subdomain (z.B. `rezepte.deine-domain.de`)
- Lokaler Rechner: Node.js + npm installiert

---

## 1. Projekt lokal bauen

Auf deinem lokalen Rechner:

```bash
cd /pfad/zu/myReceipts
npm install
npm run build
```

Das erzeugt den Ordner `dist/` mit dem Frontend.

---

## 2. Server vorbereiten (einmalig)

### 2.1 Per SSH verbinden

```bash
ssh root@dein-server-ip
```

### 2.2 Nginx installieren

```bash
apt update && apt upgrade -y
apt install nginx -y
systemctl enable nginx
systemctl start nginx
```

### 2.3 Node.js installieren

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version  # sollte v20.x zeigen
```

### 2.4 SSL mit Let's Encrypt einrichten

```bash
apt install certbot python3-certbot-nginx -y
```

### 2.5 Verzeichnis anlegen

```bash
mkdir -p /var/www/myrecipes
chown -R www-data:www-data /var/www/myrecipes
```

---

## 3. Nginx konfigurieren (einmalig)

Neue Konfiguration anlegen:

```bash
nano /etc/nginx/sites-available/myrecipes
```

Folgenden Inhalt einfuegen (Domain anpassen!):

```nginx
server {
    listen 80;
    server_name rezepte.deine-domain.de;

    # API-Requests an den Express-Server weiterleiten
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 50M;
    }

    # Frontend: Statische Dateien
    location / {
        root /var/www/myrecipes/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Cache-Header fuer statische Assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$ {
        root /var/www/myrecipes/dist;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Sicherheits-Header
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip-Komprimierung
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    gzip_min_length 1000;
}
```

Default-Konfig entfernen und neue aktivieren:

```bash
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/myrecipes /etc/nginx/sites-enabled/
nginx -t            # Syntax pruefen
systemctl reload nginx
```

### 3.1 SSL-Zertifikat holen

Vorher: DNS muss auf die Server-IP zeigen (A-Record in Strato DNS-Verwaltung setzen).

```bash
certbot --nginx -d rezepte.deine-domain.de
```

Certbot passt die Nginx-Konfig automatisch an (Redirect HTTP -> HTTPS).

---

## 4. Dateien hochladen und Server einrichten

### 4.1 Dateien hochladen

Vom lokalen Rechner aus:

```bash
# Frontend
rsync -avz --delete dist/ root@dein-server-ip:/var/www/myrecipes/dist/

# Backend
rsync -avz server/ root@dein-server-ip:/var/www/myrecipes/server/
rsync -avz package.json package-lock.json root@dein-server-ip:/var/www/myrecipes/
```

### 4.2 Server-Dependencies installieren

```bash
ssh root@dein-server-ip
cd /var/www/myrecipes
npm install --production
```

### 4.3 Datenbank initialisieren

Die Datenbank wird beim ersten Start automatisch erstellt (`data/recipes.db`).

Optional: Bestehendes Backup importieren:

```bash
node server/migrate.js /pfad/zu/myrecipes-backup.json
```

### 4.4 Systemd-Service einrichten

```bash
nano /etc/systemd/system/myrecipes.service
```

Inhalt:

```ini
[Unit]
Description=myRecipes Server
After=network.target

[Service]
WorkingDirectory=/var/www/myrecipes
ExecStart=/usr/bin/node server/index.js
Environment=NODE_ENV=production
Environment=PORT=3000
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

Service aktivieren und starten:

```bash
# Verzeichnisrechte setzen
chown -R www-data:www-data /var/www/myrecipes

# Service registrieren und starten
systemctl daemon-reload
systemctl enable myrecipes
systemctl start myrecipes

# Status pruefen
systemctl status myrecipes
```

---

## 5. Pruefen

Im Browser oeffnen:

```
https://rezepte.deine-domain.de
```

Beim ersten Aufruf eines geschuetzten Bereichs (Import, Einstellungen) wird ein Master-Passwort abgefragt.

---

## 6. Updates deployen

Bei jeder Aenderung am Code:

```bash
# 1. Lokal bauen
npm run build

# 2. Frontend hochladen
rsync -avz --delete dist/ root@dein-server-ip:/var/www/myrecipes/dist/

# 3. Backend hochladen (falls geaendert)
rsync -avz server/ root@dein-server-ip:/var/www/myrecipes/server/
rsync -avz package.json package-lock.json root@dein-server-ip:/var/www/myrecipes/

# 4. Dependencies aktualisieren und Server neustarten
ssh root@dein-server-ip "cd /var/www/myrecipes && npm install --production && systemctl restart myrecipes"
```

---

## Optional: Deploy-Script

Erstelle eine Datei `deploy.sh` im Projektverzeichnis:

```bash
#!/bin/bash
set -e

SERVER="root@dein-server-ip"
REMOTE_PATH="/var/www/myrecipes"

echo "Building frontend..."
npm run build

echo "Uploading frontend..."
rsync -avz --delete dist/ $SERVER:$REMOTE_PATH/dist/

echo "Uploading backend..."
rsync -avz server/ $SERVER:$REMOTE_PATH/server/
rsync -avz package.json package-lock.json $SERVER:$REMOTE_PATH/

echo "Installing dependencies and restarting..."
ssh $SERVER "cd $REMOTE_PATH && npm install --production && systemctl restart myrecipes"

echo "Done! Live at https://rezepte.deine-domain.de"
```

Ausfuehrbar machen und nutzen:

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## Troubleshooting

| Problem | Loesung |
|---------|---------|
| Seite zeigt "Welcome to nginx" | Nginx-Konfig nicht aktiviert (`ln -s`) oder `default` noch in sites-enabled |
| 404 bei Seitenreload | `try_files` in Nginx-Konfig fehlt |
| API gibt 502 Bad Gateway | Express-Server laeuft nicht: `systemctl status myrecipes` pruefen |
| SSL-Fehler | DNS pruefen: `dig rezepte.deine-domain.de` muss Server-IP zeigen |
| Anthropic-API-Aufrufe blockiert | Kein Problem: API-Calls gehen direkt vom Browser an Anthropic |
| Aenderungen nicht sichtbar | Browser-Cache leeren (Strg+Shift+R) |
| Server startet nicht | Logs pruefen: `journalctl -u myrecipes -f` |

---

## Hinweise

- **Backend**: Express-Server mit SQLite-Datenbank. Nginx leitet `/api/*` an Express weiter, alles andere kommt aus `dist/`.
- **HTTPS ist Pflicht**: Die Kamera-API funktioniert nur ueber HTTPS. Session-Cookies sind im Produktionsmodus auf `secure` gesetzt.
- **Daten zentral auf dem Server**: Alle Geraete/Browser greifen auf dieselbe Rezeptsammlung zu. Ein Backup laesst sich ueber Einstellungen > Export erstellen.
- **Datenbank-Backup**: Die SQLite-Datei liegt unter `/var/www/myrecipes/data/recipes.db`. Fuer ein Backup reicht es, diese Datei zu kopieren.
