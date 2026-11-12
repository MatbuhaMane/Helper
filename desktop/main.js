/* Family Helper for Windows: the companion lives on the whole desktop, above every window.
 * A transparent, always-on-top window covers the screen; clicks pass through it except over the companion.
 * Sign-in happens once in the normal browser (Google does not allow sign-in inside apps like this one). */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, session, nativeImage } = require('electron');
const path = require('path');

const SITE = 'https://helper.shemrivers.workers.dev';
let win = null;
let tray = null;
let signingIn = false;

if (!app.requestSingleInstanceLock()) app.quit();

function createOverlay() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x, y, width, height,
    transparent: true, frame: false, resizable: false, movable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadURL(`${SITE}/overlay/`);
  // links from the companion (the mail screen, recipes, sources) open in the normal browser – web links only
  // (never file:, or a scheme some other program registered: a page must not be able to launch things on the computer)
  const openOutside = (url) => { try { if (['https:', 'http:'].includes(new URL(url).protocol)) shell.openExternal(url); } catch (_) { /* not a URL */ } };
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SITE}/overlay`)) { e.preventDefault(); openOutside(url); }
  });
  // no camera, microphone or other device without a reason: only the microphone, for speaking to the companion
  win.webContents.session.setPermissionRequestHandler((_wc, permission, done) => done(['media', 'clipboard-sanitized-write'].includes(permission)));
  screen.on('display-metrics-changed', () => {
    const a = screen.getPrimaryDisplay().workArea;
    win?.setBounds(a);
  });
}

ipcMain.on('interactive', (_e, on) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!on, { forward: true });
  if (on) win.focus();
});

async function signedIn() {
  const c = await session.defaultSession.cookies.get({ url: SITE, name: 'sid' });
  return c.length > 0;
}

/** One-time sign-in through the browser: ask the site for a code, open the approval page, wait for the session. */
async function signIn() {
  if (signingIn) return;
  signingIn = true;
  try {
    const start = await fetch(`${SITE}/api/auth/desktop/start`, { method: 'POST' }).then((r) => r.json());
    await shell.openExternal(start.approve);
    const until = Date.now() + 10 * 60_000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`${SITE}/api/auth/desktop/poll?code=${encodeURIComponent(start.code)}`);
      if (res.status === 410) break;
      const data = await res.json();
      if (data.sid) {
        await session.defaultSession.cookies.set({
          url: SITE, name: 'sid', value: data.sid, secure: true, httpOnly: true, sameSite: 'lax',
          expirationDate: Math.floor(Date.now() / 1000) + (data.maxAge || 60 * 86400),
        });
        win?.reload();
        break;
      }
    }
  } catch (e) {
    console.error('sign-in failed', e);
  } finally {
    signingIn = false;
  }
}

async function signOut() {
  await session.defaultSession.cookies.remove(SITE, 'sid');
  win?.reload();
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('העוזר המשפחתי');
  const refresh = async () => {
    const inNow = await signedIn();
    const auto = app.getLoginItemSettings().openAtLogin;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: win?.isVisible() ? 'הסתרת העוזר' : 'הצגת העוזר', click: () => { win?.isVisible() ? win.hide() : win.show(); refresh(); } },
      { label: 'פתיחת העוזר בדפדפן', click: () => shell.openExternal(SITE) },
      { type: 'separator' },
      inNow ? { label: 'התנתקות', click: async () => { await signOut(); refresh(); } } : { label: 'התחברות', click: async () => { await signIn(); refresh(); } },
      { label: 'הפעלה עם Windows', type: 'checkbox', checked: auto, click: () => { app.setLoginItemSettings({ openAtLogin: !auto }); refresh(); } },
      { type: 'separator' },
      { label: 'יציאה', click: () => app.quit() },
    ]));
  };
  tray.on('click', () => { win?.isVisible() ? win.hide() : win.show(); refresh(); });
  refresh();
}

app.whenReady().then(async () => {
  // the companion listens through the microphone when asked (push to talk in its balloon)
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media' && wc.getURL().startsWith(SITE)));
  createOverlay();
  buildTray();
  if (!(await signedIn())) signIn();
  // first run of the installed program: start with Windows by default (can be turned off from the tray menu)
  const fs = require('fs');
  const marker = path.join(app.getPath('userData'), 'first-run-done');
  if (app.isPackaged && !fs.existsSync(marker)) {
    app.setLoginItemSettings({ openAtLogin: true });
    fs.writeFileSync(marker, new Date().toISOString());
  }
});

app.on('second-instance', () => win?.show());
app.on('window-all-closed', (e) => e.preventDefault());
