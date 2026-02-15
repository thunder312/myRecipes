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

Das erzeugt den Ordner `dist/` mit allen Dateien, die auf den Server kommen.

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

### 2.3 SSL mit Let's Encrypt einrichten

```bash
apt install certbot python3-certbot-nginx -y
```

### 2.4 Verzeichnis anlegen

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

Folgenden Inhalt einfügen (Domain anpassen!):

```nginx
server {
    listen 80;
    server_name rezepte.deine-domain.de;

    root /var/www/myrecipes;
    index index.html;

    # SPA: Alle Routen auf index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache-Header fuer statische Assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$ {
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

Konfiguration aktivieren:

```bash
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

## 4. Dateien hochladen

### Variante A: rsync (empfohlen)

Vom lokalen Rechner aus:

```bash
rsync -avz --delete dist/ root@dein-server-ip:/var/www/myrecipes/
```

`--delete` entfernt alte Dateien, die nicht mehr im Build sind.

### Variante B: scp

```bash
scp -r dist/* root@dein-server-ip:/var/www/myrecipes/
```

### Variante C: FileZilla / SFTP

1. FileZilla oeffnen
2. Verbinden: `sftp://dein-server-ip`, Port 22, root + Passwort
3. Lokal `dist/` oeffnen, remote `/var/www/myrecipes/`
4. Alle Dateien hochladen

---

## 5. Pruefen

Im Browser oeffnen:

```
https://rezepte.deine-domain.de
```

Die App sollte direkt laufen. Alle Daten werden lokal im Browser gespeichert (IndexedDB) - der Server liefert nur die statischen Dateien aus.

---

## 6. Updates deployen

Bei jeder Aenderung am Code:

```bash
# 1. Lokal bauen
npm run build

# 2. Hochladen
rsync -avz --delete dist/ root@dein-server-ip:/var/www/myrecipes/
```

Das war's - kein Server-Neustart noetig, da nur statische Dateien ausgetauscht werden.

---

## Optional: Deploy-Script

Erstelle eine Datei `deploy.sh` im Projektverzeichnis:

```bash
#!/bin/bash
set -e

SERVER="root@dein-server-ip"
REMOTE_PATH="/var/www/myrecipes"

echo "Building..."
npm run build

echo "Uploading..."
rsync -avz --delete dist/ $SERVER:$REMOTE_PATH/

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
| Seite zeigt "Welcome to nginx" | Dateien nicht in `/var/www/myrecipes/` oder Konfig nicht aktiviert (`ln -s`) |
| 404 bei Seitenreload | `try_files` in Nginx-Konfig fehlt |
| SSL-Fehler | DNS pruefen: `dig rezepte.deine-domain.de` muss Server-IP zeigen |
| API-Aufrufe blockiert | Kein Problem: API-Calls gehen direkt vom Browser an Anthropic, nicht ueber den Server |
| Aenderungen nicht sichtbar | Browser-Cache leeren (Strg+Shift+R) |

---

## Hinweise

- **Kein Backend noetig**: myRecipes ist eine reine Client-Side-App. Der Server liefert nur HTML/CSS/JS aus.
- **HTTPS ist Pflicht**: Die Web Crypto API (Passwort-Hashing) und die Kamera-API funktionieren nur ueber HTTPS.
- **Daten sind browser-lokal**: Jeder Browser/jedes Geraet hat seine eigene Rezeptsammlung (IndexedDB). Ein Backup laesst sich ueber Einstellungen > Export erstellen.
