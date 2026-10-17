// Anarchivo — el dashboard (Anarchivo Atelier) como app de escritorio.
// No es otra versión del dashboard: es una ventana sobre el mismo servidor local de `npm run dev`
// (sync + astro dev), así que tiene todo lo que solo existe en local — Conversar, Subir, Catalogar,
// Mostrar en Finder, Publicar ↑. Si ya hay un `npm run dev` corriendo en el puerto de siempre, lo usa;
// si no, lo arranca él (en un puerto libre) y lo apaga al salir.
const { app, BrowserWindow, Menu, shell, dialog, nativeImage } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

app.setName('Anarchivo');
if (!app.requestSingleInstanceLock()) app.quit();

const ICONO = path.join(__dirname, 'build', 'icono.png');
const CONFIG = () => path.join(app.getPath('userData'), 'anarchivo.json');
const leerConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG(), 'utf8')); } catch { return {}; } };
const guardarConfig = (c) => { try { fs.mkdirSync(path.dirname(CONFIG()), { recursive: true }); fs.writeFileSync(CONFIG(), JSON.stringify(c, null, 2)); } catch { /* sin disco: no se recuerda */ } };
const config = leerConfig();

let win = null, servidor = null, origen = '', propio = false, saliendo = false;
const registro = [];

// --- dónde está dashboard/: variable, lo elegido antes, lo anotado al empaquetar, o la carpeta de al lado ---
const esDashboard = (d) => d && fs.existsSync(path.join(d, 'astro.config.mjs')) && fs.existsSync(path.join(d, 'scripts', 'sync.mjs'));
function buscarDashboard() {
  const anotado = (() => { try { return fs.readFileSync(path.join(__dirname, 'dashboard-path.txt'), 'utf8').trim(); } catch { return ''; } })();
  return [process.env.ANARCHIVO_DASHBOARD, config.dashboard, anotado, path.resolve(__dirname, '..')].find(esDashboard) || null;
}
async function elegirDashboard() {
  const r = await dialog.showOpenDialog({ title: 'Dónde está la carpeta dashboard/ del playbook', properties: ['openDirectory'], message: 'Elige la carpeta dashboard/ (la que tiene astro.config.mjs)' });
  const d = r.filePaths[0];
  if (!esDashboard(d)) return null;
  config.dashboard = d; guardarConfig(config);
  return d;
}

// --- el entorno del usuario: una app abierta desde el Dock no hereda el PATH de la terminal (node, exiftool, rsync…) ---
function entornoDeShell() {
  try {
    const sh = process.env.SHELL || '/bin/zsh';
    const out = execFileSync(sh, ['-ilc', 'echo "__PATH__$PATH"; command -v node'], { encoding: 'utf8', timeout: 8000 });
    const PATH = out.match(/__PATH__(.*)/)?.[1]?.trim();
    const node = out.trim().split('\n').reverse().find((l) => /\/node$/.test(l.trim()))?.trim();
    return { PATH, node };
  } catch { return {}; }
}

const libre = (p) => new Promise((ok) => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(p, '127.0.0.1'); });
async function puertoLibre(desde) { for (let p = desde; p < desde + 50; p++) if (await libre(p)) return p; throw new Error('no hay puertos libres'); }
// un servidor que ya responde con Anarchivo (p. ej. un `npm run dev` abierto en la terminal)
async function responde(url) {
  try { const r = await fetch(`${url}/anarchivo`, { signal: AbortSignal.timeout(2500) }); return r.ok && (await r.text()).includes('Anarchivo'); } catch { return false; }
}

// --- pantalla de espera ---
function contar(linea, fase) {
  const l = String(linea).replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (l) { registro.push(l); registro.splice(0, registro.length - 200); }
  if (win && !win.isDestroyed() && win.webContents.getURL().startsWith('file:')) {
    win.webContents.executeJavaScript(`window.estado && window.estado(${JSON.stringify(fase || '')}, ${JSON.stringify(l)})`).catch(() => {});
  }
}
const correr = (cmd, args, opts, fase) => new Promise((ok, mal) => {
  const p = spawn(cmd, args, { ...opts, detached: true });
  p.stdout.on('data', (c) => String(c).split('\n').forEach((l) => contar(l, fase)));
  p.stderr.on('data', (c) => String(c).split('\n').forEach((l) => contar(l, fase)));
  p.on('error', mal);
  p.on('close', (code) => (code === 0 ? ok() : mal(new Error(`${path.basename(args[0] || cmd)} terminó con código ${code}`))));
  return p;
});

async function arrancar() {
  // 1. ¿ya hay uno?
  // (ANARCHIVO_PROPIO=1 lo salta: siempre arranca uno propio)
  if (!process.env.ANARCHIVO_PROPIO) for (const url of ['http://localhost:4321', 'http://127.0.0.1:4321']) if (await responde(url)) { origen = url; contar(`usando el servidor que ya corre en ${url}`, 'listo'); return; }

  let dir = buscarDashboard();
  if (!dir) { contar('no encuentro la carpeta dashboard/', 'elegir'); dir = await elegirDashboard(); }
  if (!dir) throw new Error('Sin la carpeta dashboard/ no hay nada que abrir.');

  const { PATH, node } = entornoDeShell();
  // sin node en el sistema, el propio Electron hace de node (ELECTRON_RUN_AS_NODE)
  const conNode = node && fs.existsSync(node);
  const bin = conNode ? node : process.execPath;
  const env = { ...process.env, ...(PATH ? { PATH } : {}), ...(conNode ? {} : { ELECTRON_RUN_AS_NODE: '1' }), FORCE_COLOR: '0' };
  contar(`dashboard: ${dir}`, 'sync');
  contar(conNode ? `node: ${node}` : 'node: el de Electron', 'sync');

  // 2. sync (lee el playbook, regenera el índice; la primera vez CLIP tarda ~1 min)
  if (!config.saltarSync) await correr(bin, [path.join(dir, 'scripts', 'sync.mjs')], { cwd: dir, env }, 'sync');

  // 3. astro dev en un puerto libre
  const puerto = await puertoLibre(4322);
  origen = `http://localhost:${puerto}`;
  propio = true;
  servidor = spawn(bin, [path.join(dir, 'node_modules', 'astro', 'astro.js'), 'dev', '--port', String(puerto), '--host', 'localhost'], { cwd: dir, env, detached: true });
  servidor.stdout.on('data', (c) => String(c).split('\n').forEach((l) => contar(l, 'servidor')));
  servidor.stderr.on('data', (c) => String(c).split('\n').forEach((l) => contar(l, 'servidor')));
  servidor.on('close', (code) => {
    servidor = null;
    if (!saliendo) dialog.showMessageBox({ type: 'error', message: 'El servidor del dashboard se detuvo.', detail: registro.slice(-12).join('\n') || `código ${code}`, buttons: ['Volver a arrancar', 'Salir'] })
      .then(({ response }) => (response === 0 ? (app.relaunch(), app.exit(0)) : app.quit()));
  });
  for (let i = 0; i < 240; i++) { if (await responde(origen)) return; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('El servidor no respondió en 2 minutos.');
}

function apagar() {
  saliendo = true;
  if (servidor && propio) { try { process.kill(-servidor.pid, 'SIGTERM'); } catch { try { servidor.kill(); } catch { /* ya no está */ } } }
}

// --- la ventana ---
function crearVentana() {
  const b = config.ventana || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...b, minWidth: 720, minHeight: 520, title: 'Anarchivo', icon: ICONO, show: false,
    backgroundColor: '#161615', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 },
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const recordar = () => { if (!win.isMinimized() && !win.isFullScreen()) { config.ventana = win.getBounds(); guardarConfig(config); } };
  win.on('resize', recordar); win.on('move', recordar);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'espera.html'));
  // sin barra de título: una franja arriba para arrastrar la ventana (por encima de la página, sin tapar sus controles)
  win.webContents.on('did-finish-load', () => {
    if (win.webContents.getURL().startsWith(origen)) win.webContents.insertCSS('html::after{content:"";position:fixed;top:0;left:0;right:0;height:22px;-webkit-app-region:drag;z-index:2147483647}');
  });
  // lo de fuera (dossier, Nextcloud, Things…) se abre en el navegador o en su app; lo del servidor, aquí
  const deFuera = (url) => !url.startsWith(origen) && !url.startsWith('file:') && !url.startsWith('blob:') && !url.startsWith('data:');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (deFuera(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow', overrideBrowserWindowOptions: { icon: ICONO, backgroundColor: '#161615' } };
  });
  win.webContents.on('will-navigate', (e, url) => { if (deFuera(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

function menu() {
  const ir = (ruta) => () => win && origen && win.loadURL(`${origen}${ruta}`);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Anarchivo', submenu: [
      { role: 'about', label: 'Acerca de Anarchivo' }, { type: 'separator' },
      { label: 'Ajustes…', accelerator: 'CmdOrCtrl+,', click: () => win?.webContents.executeJavaScript("dispatchEvent(new Event('anarchivo:ajustes'))").catch(() => {}) },
      { label: 'Reiniciar el servidor', click: () => { app.relaunch(); app.exit(0); } },
      { type: 'separator' },
      { label: 'Sincronizar el archivo', accelerator: 'CmdOrCtrl+Shift+S', click: async () => {
        if (!origen) return;
        const r = await fetch(`${origen}/__sync`, { method: 'POST' }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
        if (r.ok) win?.reload(); else dialog.showMessageBox({ type: 'warning', message: 'No se pudo sincronizar', detail: r.error || '' });
      } },
      { label: 'Abrir en el navegador', click: () => origen && shell.openExternal(`${origen}/anarchivo`) },
      { label: 'Elegir la carpeta dashboard/…', click: async () => { if (await elegirDashboard()) { app.relaunch(); app.exit(0); } } },
      { label: 'Arrancar sin sincronizar', type: 'checkbox', checked: !!config.saltarSync, click: (i) => { config.saltarSync = i.checked; guardarConfig(config); } },
      { type: 'separator' }, { role: 'hide', label: 'Ocultar Anarchivo' }, { role: 'hideOthers', label: 'Ocultar otros' }, { type: 'separator' }, { role: 'quit', label: 'Salir de Anarchivo' },
    ] },
    { label: 'Edición', submenu: [{ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
    { label: 'Ir', submenu: [
      { label: 'Anarchivo', accelerator: 'CmdOrCtrl+1', click: ir('/anarchivo') },
      { label: 'Resumen', accelerator: 'CmdOrCtrl+2', click: ir('/resumen') },
      { label: 'Bitácora', accelerator: 'CmdOrCtrl+3', click: ir('/bitacora') },
      { type: 'separator' }, { label: 'Atrás', accelerator: 'CmdOrCtrl+[', click: () => win?.webContents.navigationHistory.goBack() },
    ] },
    { label: 'Ver', submenu: [{ role: 'reload', label: 'Recargar' }, { type: 'separator' }, { role: 'resetZoom', label: 'Tamaño real' }, { role: 'zoomIn', label: 'Ampliar' }, { role: 'zoomOut', label: 'Reducir' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Pantalla completa' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }] },
    { role: 'windowMenu', label: 'Ventana' },
  ]));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.setIcon(nativeImage.createFromPath(ICONO));
  app.setAboutPanelOptions({ applicationName: 'Anarchivo', applicationVersion: app.getVersion(), copyright: 'Anarchivo Atelier · MIT', iconPath: ICONO });
  menu();
  crearVentana();
  try {
    await arrancar();
    if (win) await win.loadURL(`${origen}/anarchivo`);
  } catch (e) {
    contar(e.message, 'error');
  }
});
app.on('activate', () => { if (!win) { crearVentana(); if (origen) win.loadURL(`${origen}/anarchivo`); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', apagar);
process.on('exit', apagar);
