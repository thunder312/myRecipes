const express = require('express');
const path = require('path');
const crypto = require('crypto');

const { getDB } = require('./db');
const recipesRouter = require('./routes/recipes');
const settingsRouter = require('./routes/settings');
const authRouter = require('./routes/auth');
const backupRouter = require('./routes/backup');
const cookbooksRouter = require('./routes/cookbooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
getDB();

// Parse JSON bodies (large limit for base64 blobs)
app.use(express.json({ limit: '50mb' }));

// --- Token-based auth ---
// Simple in-memory token store. Tokens are generated on login and validated on each request.
// For a single-user app this is perfectly fine.
const activeTokens = new Map(); // token -> { createdAt }
const TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of activeTokens) {
    if (now - data.createdAt > TOKEN_MAX_AGE) {
      activeTokens.delete(token);
    }
  }
}

function createToken() {
  cleanExpiredTokens();
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, { createdAt: Date.now() });
  return token;
}

function validateToken(token) {
  if (!token) return false;
  const data = activeTokens.get(token);
  if (!data) return false;
  if (Date.now() - data.createdAt > TOKEN_MAX_AGE) {
    activeTokens.delete(token);
    return false;
  }
  // Refresh on activity (sliding window)
  data.createdAt = Date.now();
  return true;
}

function invalidateToken(token) {
  activeTokens.delete(token);
}

// Make token functions available to routes
app.set('auth', { createToken, validateToken, invalidateToken });

// Auth middleware for protected routes
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (validateToken(token)) {
    return next();
  }
  res.status(401).json({ error: 'Nicht authentifiziert' });
}

// API routes
app.use('/api/auth', authRouter);
// Recipes: GET is public (overview/detail), write operations require auth
app.use('/api/recipes', (req, res, next) => {
  if (req.method === 'GET') return next();
  requireAuth(req, res, next);
}, recipesRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/backup', requireAuth, backupRouter);
// Cookbooks: GET public, write requires auth
app.use('/api/cookbooks', (req, res, next) => {
  if (req.method === 'GET') return next();
  requireAuth(req, res, next);
}, cookbooksRouter);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

// Error handler
app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

app.listen(PORT, () => {
  console.log(`myRecipes server running on http://localhost:${PORT}`);
});
