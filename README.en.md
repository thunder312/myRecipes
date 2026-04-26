# myRecipes

**myRecipes** is a personal, AI-powered recipe collection as a self-hosted web app. Recipes can be imported via URL, PDF, photo or plain text – the AI analyses and structures them automatically. The app runs on your own server and can be shared with family and friends.

> Developed by **Daniel Ertl** together with **Claude Sonnet** (Anthropic) – human and AI as a development duo.

---

## Features

### Importing Recipes
- **URL import** – paste a recipe URL and the AI automatically extracts all fields. Supports Schema.org/JSON-LD (most modern recipe sites) as well as plain-text fallback. The source URL is automatically written to the recipe notes.
- **PDF import** – import recipes from PDF files (e.g. saved web pages, scanned documents)
- **Photo / image recognition** – photos of handwritten or printed recipes; multiple pages at once
- **Camera** – take a photo directly on your mobile device
- **Free text** – paste a recipe as plain text and the AI structures it
- **Batch import** – process an entire folder of PDFs and images at once; failed files can be retried individually
- **Voice control** *(experimental)* – import a recipe by voice: tap the microphone button in the URL tab and speak a command, e.g. "Wild garlic pancakes from Chefkoch". The AI recognises the intent, builds a search URL and shows up to 5 results to choose from – the selected recipe is imported directly. Only works in Chromium-based browsers (Chrome, Edge); Firefox is not supported.

  > ⚠️ **Experimental:** Search result resolution does not work reliably on all websites. Some sites block automated requests or structure their search result pages in a way that prevents link detection. The URL field can always be filled in manually as a fallback.

### Managing Recipes
- Overview with search, filtering by category, origin, main ingredient and tags
- Sorting: alphabetical, newest first, last cooked, most cooked, **top rated first**
- Detail view with structured preparation steps including **sub-headings** (e.g. "Sauce:", "Pasta:") rendered as section titles
- Recipe images: upload a photo or capture one automatically during import – shown in the detail view and in PDFs
- **Star rating** with smiley icons (0–5), settable directly from the overview or the detail view
- **Favourites** (heart icon) per user – "Favourites only" filter in the overview
- **Duplicate recipe** – copy button creates a variant as a starting template
- Edit and delete recipes
- "Cooked today" feature with a full history of cooking dates
- Per-recipe notes with timestamps

### Cooking Mode
- Distraction-free step-by-step mode, opened directly from the detail view
- Screen stays on automatically (WakeLock API)
- Optimised for mobile devices

### PDF Export
- **A4** and **A5** (double-sided, cut-to-size) for individual recipes
- **Cookbook export** – all recipes in a cookbook as a single A4 or A5 PDF with a cover page
- Sub-headings in preparation steps are rendered as bold section titles in the PDF
- On mobile devices the PDF is opened directly in the operating system's native PDF viewer

### Shopping List
- Open directly from the detail view (with portion scaling applied)
- Pantry staples (salt, oil, …) are pre-deselected automatically
- **AI optimisation**: one click normalises quantities for the supermarket (e.g. "0.5 onions" → "1 onion", spice amounts are stripped)
- Export as plain text, PDF or copy to clipboard

### AI Features (Claude by Anthropic)
- Automatic extraction of title, ingredients, preparation steps, category, origin, main ingredient, tags, servings, difficulty and preparation time
- Recipe suggestions: "What should I cook today?" – ask a free-text question and the AI finds matching recipes from your own collection
- Saved favourite questions for quick access
- Handwriting recognition on photos
- Shopping list optimisation (realistic quantities for grocery shopping)

### Cookbooks
- Organise recipes into thematic cookbooks (e.g. "Italian", "Christmas")
- Default cookbook for all recipes
- Export cookbooks as print-ready PDFs

### User Management
- Multiple users (family, friends) with individual logins
- Roles: Administrator and regular user
- Each user can create their own recipes; admins manage all
- Password management by admin
- Personal preferences per user: language (DE/EN) and **dark mode** – stored server-side, synced across devices

### Backup & Data
- Full database export and import as JSON
- Database format: SQLite (a single file, easy to back up)

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JavaScript (ES Modules), no framework |
| **Build** | Webpack 5 (Dev + Prod config, code splitting) |
| **Backend** | Node.js + Express |
| **Database** | SQLite via `better-sqlite3` |
| **PDF generation** | jsPDF |
| **PDF parsing** | pdf.js (`pdfjs-dist`) |
| **AI analysis** | Anthropic Claude API (claude-sonnet) |
| **Auth** | Token-based (Bearer token, 15 min TTL) |
| **Web server (prod)** | nginx with SSL (Let's Encrypt) |
| **Process manager** | systemd |

---

## Prerequisites

Two things are essential to run myRecipes:

1. **A publicly reachable server** – e.g. a VPS at Strato, Hetzner, DigitalOcean or similar, with your own domain. The server needs Node.js (≥ 18), npm and nginx.
2. **An Anthropic API key** – all AI features (import, analysis, suggestions) use the Claude API. Get a key at [console.anthropic.com](https://console.anthropic.com). After installation the key is entered in the admin area of the app and stored server-side.

---

## Installation & Setup

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/thunder312/myRecipes.git
cd myRecipes
npm install
```

### 2. Initialise the database

The SQLite database is created automatically on first start. If a migration is needed:

```bash
node server/migrate.js
```

The database lives at `data/recipes.db` – never overwrite this file!

### 3. Local development

```bash
npm run dev
```

Starts simultaneously:
- Node backend on port **3000**
- Webpack Dev Server on port **8080** (with hot reload and API proxy)

Open in your browser: `http://localhost:8080`

On first start an admin user is created automatically:

| | |
|---|---|
| **Username** | `admin` |
| **Password** | `admin` |

> **Important:** Change the password immediately after first login via **Settings → Change Password**!

> **Tip for mobile devices on the same Wi-Fi:** `webpack.config.dev.js` sets `host: '0.0.0.0'`. Find your local IP (`ipconfig` / `ifconfig`) and open `http://192.168.x.x:8080` on your mobile device.

### 4. Production build

```bash
npm run build
```

Output is placed in the `dist/` folder.

### 5. Server setup (example: Debian-based VPS)

#### Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

#### Transfer the app to the server

```bash
# Frontend
scp -r dist/ user@YOUR-IP:/var/www/myrecipes/dist/

# Backend
scp server/index.js server/db.js package.json user@YOUR-IP:/var/www/myrecipes/
scp -r server/routes/ user@YOUR-IP:/var/www/myrecipes/server/

# Install production dependencies on the server
ssh user@YOUR-IP "cd /var/www/myrecipes && npm install --omit=dev"
```

#### Set up a systemd service

Create `/etc/systemd/system/myrecipes.service`:

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

#### nginx as a reverse proxy

```nginx
server {
    server_name recipes.your-domain.com;

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

Set up SSL with Certbot:
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d recipes.your-domain.com
```

### 6. Enter the Anthropic API key

1. Open the app in your browser
2. Log in as administrator
3. **Settings** → **Anthropic API Key** → enter the key and save

The key is stored server-side in the SQLite database and is never sent to the client.

---

## Project Structure

```
myRecipes/
├── dist/                  ← Webpack build (deployed to server)
├── js/
│   ├── views/             ← Frontend views (overview, detail, import, suggest, cookbooks, settings)
│   ├── utils/             ← Helper functions (auth, helpers, recipe-form)
│   ├── api.js             ← Claude API communication
│   ├── import.js          ← Import logic (URL, PDF, image, text)
│   ├── pdf-generator.js   ← PDF export (A4/A5, cookbook)
│   └── db.js              ← Frontend database access via API
├── server/
│   ├── index.js           ← Express server, auth, token management
│   ├── db.js              ← SQLite database access
│   ├── migrate.js         ← Database migrations
│   └── routes/            ← API routes (recipes, auth, cookbooks, backup, …)
├── css/
│   └── style.css          ← Stylesheet
├── data/
│   └── recipes.db         ← SQLite database (NOT in Git!)
├── webpack.config.dev.js
├── webpack.config.prod.js
└── package.json
```

---

## License

MIT – free to use, extend and self-host.

---

*This project was built in close collaboration between **Daniel Ertl** and **Claude Sonnet** (Anthropic) – a demonstration of what human and AI can create together.*