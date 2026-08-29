/* Mimi - pixel cats that guard your Apple Reminders deadlines.
   main process: overlay windows, reminder polling, cursor tracking, tray, home screen. */
const path = require('path');
const { app, BrowserWindow, screen, ipcMain, dialog, shell, powerMonitor } = require('electron');
const store = require('./store');
const reminders = require('./reminders');
const { createTray } = require('./tray');

const DEV = process.argv.includes('--dev');
app.setName('Mimi');

/** @type {Map<number, BrowserWindow>} displayId -> overlay window */
const overlays = new Map();
/** @type {Map<string, object>} reminder id -> pet */
let pets = new Map();
/** @type {Map<string, object>} manually summoned test cats */
const demoPets = new Map();
/** displayId -> whether that window currently swallows mouse events */
const interactive = new Map();

let tray = null;
let homeWin = null;
let pollTimer = null;
let cursorTimer = null;
let polling = false;
let warnedAboutPermission = false;
let lastError = null;
let listNames = [];
let listNamesAt = 0;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

const COATS = ['orange', 'grey', 'tuxedo', 'cream', 'siamese', 'calico', 'void',
  'snow', 'bubblegum', 'matcha', 'blueberry', 'honey', 'ghost'];

/* The pet you picked in the gallery takes the most urgent task; everything after
   that gets a random cat, so a pile-up of deadlines is a pile-up of strangers. */
function coatFor(id, isFirst) {
  const chosen = store.load().coat;
  if (isFirst && chosen && chosen !== 'random' && COATS.includes(chosen)) return chosen;
  return COATS[hash(id) % COATS.length];
}

function displayList() { return screen.getAllDisplays(); }

function displayForPet(id) {
  const ds = displayList();
  return ds[hash(id + 'display') % ds.length].id;
}

function broadcast(channel, payload) {
  for (const win of overlays.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function petPayload() {
  return [...pets.values()].map((p) => ({
    id: p.id, title: p.title, dueAt: p.dueAt, list: p.list,
    coat: p.coat, display: p.display, demo: !!p.demo
  }));
}

function homeStatus() {
  return {
    pets: [...pets.values()].sort((a, b) => a.dueAt - b.dueAt)
      .map((p) => ({ id: p.id, title: p.title, dueAt: p.dueAt, coat: p.coat })),
    error: lastError,
    lists: listNames,
    loginItem: app.getLoginItemSettings().openAtLogin,
    version: app.getVersion()
  };
}

function pushPets() {
  broadcast('pets:update', petPayload());
  if (tray) tray.update();
  if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('home:status', homeStatus());
}

/* ------------------------------------------------------------------ */
/* overlay windows                                                     */
/* ------------------------------------------------------------------ */

function createOverlay(display) {
  const { x, y, width, height } = display.workArea;
  const win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    acceptFirstMouse: true,
    type: 'panel',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  interactive.set(display.id, false);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), {
    query: { display: String(display.id) }
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('config:update', store.load());
    win.webContents.send('pets:update', petPayload());
  });

  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  overlays.set(display.id, win);
  return win;
}

function rebuildOverlays() {
  for (const win of overlays.values()) if (!win.isDestroyed()) win.destroy();
  overlays.clear();
  interactive.clear();
  for (const d of displayList()) createOverlay(d);
  for (const p of pets.values()) p.display = displayForPet(p.id);
  pushPets();
}

function setInteractive(displayId, on) {
  if (interactive.get(displayId) === on) return;
  const win = overlays.get(displayId);
  if (!win || win.isDestroyed()) return;
  interactive.set(displayId, on);
  win.setIgnoreMouseEvents(!on, { forward: true });
}

/* ------------------------------------------------------------------ */
/* home screen                                                         */
/* ------------------------------------------------------------------ */

function openHome() {
  if (homeWin && !homeWin.isDestroyed()) {
    homeWin.show();
    homeWin.focus();
    app.focus({ steal: true });
    return;
  }
  homeWin = new BrowserWindow({
    width: 940,
    height: 760,
    minWidth: 780,
    minHeight: 560,
    title: 'Mimi',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#13131a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-home.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  homeWin.loadFile(path.join(__dirname, '..', 'home', 'index.html'));
  homeWin.once('ready-to-show', () => {
    if (app.dock) app.dock.show();
    homeWin.show();
    app.focus({ steal: true });
  });
  homeWin.on('closed', () => {
    homeWin = null;
    if (app.dock) app.dock.hide();
  });
  if (DEV) homeWin.webContents.openDevTools({ mode: 'detach' });
}

/* ------------------------------------------------------------------ */
/* cursor tracking (the overlay is click-through, so main feeds it)    */
/* ------------------------------------------------------------------ */

function startCursorTracking() {
  clearInterval(cursorTimer);
  cursorTimer = setInterval(() => {
    if (!pets.size) return;
    const pt = screen.getCursorScreenPoint();
    for (const d of displayList()) {
      const win = overlays.get(d.id);
      if (!win || win.isDestroyed()) continue;
      const wa = d.workArea;
      const inside = pt.x >= wa.x && pt.x < wa.x + wa.width && pt.y >= wa.y && pt.y < wa.y + wa.height;
      win.webContents.send('cursor:move', inside ? { x: pt.x - wa.x, y: pt.y - wa.y } : null);
    }
  }, 60);
}

/* ------------------------------------------------------------------ */
/* reminders -> pets                                                   */
/* ------------------------------------------------------------------ */

async function permissionPrompt(message) {
  if (warnedAboutPermission) return;
  warnedAboutPermission = true;
  const res = await dialog.showMessageBox({
    type: 'warning',
    message: 'Mimi needs permission to read your Reminders',
    detail: message + '\n\nOpen System Settings → Privacy & Security → Automation and switch on ' +
      '"Reminders" under Mimi (or Electron, if you started it with npm start).',
    buttons: ['Open Privacy Settings', 'Later'],
    defaultId: 0
  });
  if (res.response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
  }
}

async function refreshListNames() {
  if (Date.now() - listNamesAt < 5 * 60 * 1000) return;
  try {
    listNames = await reminders.listNames();
    listNamesAt = Date.now();
  } catch (_) { /* the poll reports the real problem */ }
}

async function poll() {
  if (polling) return;
  polling = true;
  const cfg = store.load();
  const horizon = cfg.leadMinutes * 60;
  const backstop = -Math.abs(cfg.ignoreOlderThanHours) * 3600;
  let rows;
  try {
    rows = await reminders.fetchDue(horizon, backstop);
    lastError = null;
    refreshListNames();
  } catch (err) {
    lastError = err.notAuthorized
      ? 'Reminders access is switched off'
      : (err.timedOut ? 'Reminders took too long to answer' : ('Reminders: ' + err.message));
    console.error('[purrmind] reminders lookup failed:', err.message);
    if (err.notAuthorized) permissionPrompt('macOS is blocking Mimi from talking to Reminders.');
    if (tray) tray.update();
    if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('home:status', homeStatus());
    polling = false;
    return;
  } finally {
    polling = false;
  }

  const now = Date.now();
  const wanted = rows
    .filter((r) => cfg.includeAllDay || !r.allDay)
    .filter((r) => !cfg.lists.length || cfg.lists.includes(r.list))
    .sort((a, b) => a.secondsUntilDue - b.secondsUntilDue)
    .slice(0, cfg.maxPets);

  const next = new Map();
  wanted.forEach((r, index) => {
    const existing = pets.get(r.id);
    next.set(r.id, {
      id: r.id,
      title: r.title,
      list: r.list,
      dueAt: now + r.secondsUntilDue * 1000,
      coat: existing ? existing.coat : coatFor(r.id, index === 0),
      display: existing ? existing.display : displayForPet(r.id)
    });
  });
  for (const [id, p] of demoPets) next.set(id, p);

  pets = next;
  pushPets();
}

function schedulePolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, Math.max(5, store.load().pollSeconds) * 1000);
}

function summonTestCat() {
  const id = 'demo-' + Date.now();
  const titles = ['Pet me, I am a test cat', 'Test cat reporting for duty', 'Meow check 1 2 3'];
  const pet = {
    id,
    title: titles[Math.floor(Math.random() * titles.length)],
    list: 'Test',
    dueAt: Date.now() + 3 * 60 * 1000,
    coat: coatFor(id, pets.size === 0),
    display: screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id,
    demo: true
  };
  demoPets.set(id, pet);
  pets.set(id, pet);
  pushPets();
}

async function completePet(id) {
  if (demoPets.has(id)) {
    demoPets.delete(id);
    pets.delete(id);
    broadcast('pet:finished', id);
    pushPets();
    return { ok: true };
  }
  try {
    const ok = await reminders.complete(id);
    if (ok) {
      broadcast('pet:finished', id);
      pets.delete(id);
      pushPets();
    }
    setTimeout(poll, 1200);
    return { ok };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/* ipc                                                                 */
/* ------------------------------------------------------------------ */

ipcMain.on('ui:interactive', (e, on) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  for (const [id, w] of overlays) if (w === win) setInteractive(id, !!on);
});

ipcMain.handle('pet:complete', (_e, id) => completePet(id));
ipcMain.handle('config:get', () => store.load());
const QUERY_KEYS = ['leadMinutes', 'lists', 'includeAllDay', 'ignoreOlderThanHours', 'maxPets', 'pollSeconds', 'coat'];
let configPollTimer = null;
ipcMain.handle('config:set', (_e, patch) => {
  const cfg = store.save(patch || {});
  broadcast('config:update', cfg);
  if (tray) tray.update();
  // a slider drag fires a lot of these; only re-ask Reminders when it matters, and not too often
  if (Object.keys(patch || {}).some((k) => QUERY_KEYS.includes(k))) {
    clearTimeout(configPollTimer);
    configPollTimer = setTimeout(() => { schedulePolling(); poll(); }, 400);
  }
  return cfg;
});
ipcMain.handle('home:status', () => homeStatus());
ipcMain.handle('home:summon', () => { summonTestCat(); });
ipcMain.handle('home:refresh', () => { warnedAboutPermission = false; return poll(); });
ipcMain.handle('home:privacy', () => {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
});
ipcMain.handle('home:loginItem', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on, openAsHidden: true });
  if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('home:status', homeStatus());
});
ipcMain.handle('home:quit', () => app.quit());

/* ------------------------------------------------------------------ */
/* lifecycle                                                           */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openHome);

  app.whenReady().then(async () => {
    if (app.dock) app.dock.hide();

    for (const d of displayList()) createOverlay(d);
    startCursorTracking();

    tray = createTray({
      getPets: () => [...pets.values()].sort((a, b) => a.dueAt - b.dueAt),
      getConfig: () => store.load(),
      getError: () => lastError,
      onComplete: (id) => completePet(id),
      onConfig: (patch) => {
        const cfg = store.save(patch);
        broadcast('config:update', cfg);
        schedulePolling();
        poll();
      },
      onHome: openHome,
      onSummon: summonTestCat,
      onRefresh: () => { warnedAboutPermission = false; poll(); },
      onOpenConfig: () => { store.save({}); shell.openPath(store.filePath()); },
      onQuit: () => app.quit()
    });

    screen.on('display-added', rebuildOverlays);
    screen.on('display-removed', rebuildOverlays);
    screen.on('display-metrics-changed', rebuildOverlays);
    powerMonitor.on('resume', () => setTimeout(poll, 3000));

    if (!store.load().homeSeen) {
      store.save({ homeSeen: true });
      openHome();
    }

    try {
      await reminders.ping();
    } catch (err) {
      lastError = err.notAuthorized ? 'Reminders access is switched off' : ('Reminders: ' + err.message);
      if (err.notAuthorized) permissionPrompt('macOS is blocking Mimi from talking to Reminders.');
    }
    poll();
    schedulePolling();
  });

  app.on('activate', openHome);
  app.on('window-all-closed', () => { /* menu bar app: stay alive */ });
}
