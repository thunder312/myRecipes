const { Router } = require('express');
const { getUserBringConfig, setUserBringConfig, updateUserBringToken } = require('../db');

const router = Router();

const BRING_API = 'https://api.getbring.com/rest';
const BRING_HEADERS = {
  'X-BRING-API-KEY': 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp',
  'X-BRING-CLIENT': 'webApp',
  'X-BRING-CLIENT-SOURCE': 'webApp',
  'X-BRING-APPLICATION': 'bring',
  'X-BRING-COUNTRY': 'DE',
  'Accept': 'application/json',
  'User-Agent': 'Bring!/23030101 (iPhone; iOS 16.0; Scale/2.00)',
};

async function bringFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...BRING_HEADERS, ...options.headers },
  });
}

async function authenticateBring(email, password) {
  const res = await bringFetch(`${BRING_API}/v2/bringauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Bring! Anmeldung fehlgeschlagen (${res.status})`);
  }
  return res.json();
}

async function fetchListsForUser(privateUuid, publicUuid, token) {
  const res = await bringFetch(`${BRING_API}/bringusers/${privateUuid}/lists`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-BRING-USER-UUID': privateUuid,
      'X-BRING-PUBLIC-USER-UUID': publicUuid,
    },
  });
  if (!res.ok) throw { status: res.status };
  const data = await res.json();
  return data.lists || [];
}

async function pushItemsToList(listUuid, items, token, privateUuid, publicUuid) {
  for (const item of items) {
    const body = new URLSearchParams({ purchase: item, specification: '', recently: '' }).toString();
    const r = await bringFetch(`${BRING_API}/bringlists/${listUuid}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-BRING-USER-UUID': privateUuid,
        'X-BRING-PUBLIC-USER-UUID': publicUuid,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (r.status === 401) throw { status: 401 };
  }
}

// POST /api/bring/connect – authenticate and save credentials
router.post('/connect', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  try {
    const data = await authenticateBring(email, password);
    const existing = getUserBringConfig(req.user.userId) || {};
    setUserBringConfig(req.user.userId, {
      email,
      password,
      accessToken: data.access_token,
      userUuid: data.uuid,
      publicUserUuid: data.publicUuid,
      listUuid: existing.listUuid || data.bringListUUID || null,
    });
    res.json({ success: true, userUuid: data.uuid });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Verbindung fehlgeschlagen' });
  }
});

// GET /api/bring/config – get current config (no password returned)
router.get('/config', (req, res) => {
  const config = getUserBringConfig(req.user.userId);
  if (!config?.email) return res.json({ connected: false });
  res.json({
    connected: true,
    email: config.email,
    listUuid: config.listUuid,
    userUuid: config.userUuid,
  });
});

// PUT /api/bring/config – save selected list UUID
router.put('/config', (req, res) => {
  const { listUuid } = req.body;
  const config = getUserBringConfig(req.user.userId);
  if (!config?.email) return res.status(400).json({ error: 'Kein Bring!-Account hinterlegt' });
  setUserBringConfig(req.user.userId, { ...config, listUuid: listUuid || null });
  res.json({ success: true });
});

// DELETE /api/bring/config – disconnect
router.delete('/config', (req, res) => {
  setUserBringConfig(req.user.userId, {
    email: null, password: null, listUuid: null,
    accessToken: null, userUuid: null, publicUserUuid: null,
  });
  res.json({ success: true });
});

// GET /api/bring/lists – list available Bring! lists
router.get('/lists', async (req, res) => {
  const config = getUserBringConfig(req.user.userId);
  if (!config?.email) return res.status(400).json({ error: 'Kein Bring!-Account hinterlegt' });
  try {
    let { accessToken: token, userUuid, publicUserUuid, email, password } = config;
    if (!token || !publicUserUuid) {
      const data = await authenticateBring(email, password);
      token = data.access_token;
      userUuid = data.uuid;
      publicUserUuid = data.publicUuid;
      updateUserBringToken(req.user.userId, token, userUuid, publicUserUuid);
    }
    let lists;
    try {
      lists = await fetchListsForUser(userUuid, publicUserUuid, token);
    } catch (e) {
      if (e.status === 401) {
        const data = await authenticateBring(email, password);
        token = data.access_token;
        userUuid = data.uuid;
        publicUserUuid = data.publicUuid;
        updateUserBringToken(req.user.userId, token, userUuid, publicUserUuid);
        lists = await fetchListsForUser(userUuid, publicUserUuid, token);
      } else {
        throw new Error(`Bring! Listen-Abruf fehlgeschlagen (${e.status ?? e.message ?? 'Netzwerkfehler'})`);
      }
    }
    res.json(lists);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Listen-Abruf fehlgeschlagen' });
  }
});

// POST /api/bring/push – push items to the selected Bring! list
router.post('/push', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Keine Artikel angegeben' });
  const config = getUserBringConfig(req.user.userId);
  if (!config?.email) return res.status(400).json({ error: 'Kein Bring!-Account hinterlegt' });
  if (!config.listUuid) return res.status(400).json({ error: 'Keine Bring!-Liste ausgewählt. Bitte in den Einstellungen konfigurieren.' });
  try {
    let { accessToken: token, userUuid, publicUserUuid, email, password, listUuid } = config;
    if (!token || !publicUserUuid) {
      const data = await authenticateBring(email, password);
      token = data.access_token;
      userUuid = data.uuid;
      publicUserUuid = data.publicUuid;
      updateUserBringToken(req.user.userId, token, userUuid, publicUserUuid);
    }
    try {
      await pushItemsToList(listUuid, items, token, userUuid, publicUserUuid);
    } catch (e) {
      if (e.status === 401) {
        const data = await authenticateBring(email, password);
        token = data.access_token;
        userUuid = data.uuid;
        publicUserUuid = data.publicUuid;
        updateUserBringToken(req.user.userId, token, userUuid, publicUserUuid);
        await pushItemsToList(listUuid, items, token, userUuid, publicUserUuid);
      } else {
        throw new Error(`Bring! Push fehlgeschlagen (${e.status ?? e.message ?? 'Netzwerkfehler'})`);
      }
    }
    res.json({ success: true, count: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Push fehlgeschlagen' });
  }
});

module.exports = router;
