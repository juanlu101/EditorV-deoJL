// Arranque de la aplicación: pantalla de proyectos, barra superior, atajos y autoguardado
import { store, on, emit, newProject, resetHistory, undo, redo, canUndo, canRedo, select, ASPECTS, projectDuration, fmtTime, uid, setTime, commit } from './state.js';
import * as db from './storage.js';
import { loadProjectMedia, releaseAll } from './media.js';
import { h, ih, modal, toast, confirmDialog, promptDialog, download, pickFiles, contextMenu } from './ui.js';
import { icon } from './icons.js';
import { initPlayer, resizeCanvas, togglePlay, pause, seekBy, seekTo, setMasterVolume, previewState, pool, requestRender, previewCanvas } from './player.js';
import { initTimeline, setZoom, fitZoom, render as renderTimeline } from './timeline.js';
import { initInspector } from './inspector.js';
import { initPanels, openPanel } from './panels.js';
import { initPreview } from './preview.js';
import { openExport } from './exporter.js';
import * as A from './actions.js';
import { ensureFonts, FONTS } from './fonts.js';

const $ = s => document.querySelector(s);
let saveTimer = 0, appReady = false;

// ---------------- Pantalla de inicio ----------------
async function showHome() {
  if (store.project) { pause(); await saveNow(); pool.clear(); releaseAll(); store.project = null; store.selectedId = null; }
  $('#app').classList.add('hidden'); $('#home').classList.remove('hidden');
  document.title = 'Editor de vídeo';
  const list = await db.listProjects();
  const grid = $('#projGrid'); grid.replaceChildren();
  if (!list.length) grid.append(h('p', { class: 'empty' }, 'Todavía no tienes proyectos. ¡Crea el primero!'));
  for (const p of list) {
    const dur = p.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    const card = h('div', { class: 'proj-card', onclick: () => openProject(p.id) },
      h('div', { class: 'proj-thumb', style: p.thumb ? { backgroundImage: `url(${p.thumb})` } : {} }, !p.thumb ? ih('film', 32) : null, h('span', { class: 'ar' }, p.settings.aspect)),
      h('div', { class: 'proj-info' },
        h('div', {}, h('b', {}, p.name), h('small', {}, `${fmtTime(dur)} · ${new Date(p.updatedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`)),
        h('button', { class: 'icon-btn', title: 'Opciones', html: icon('settings-2'), onclick: e => { e.stopPropagation(); projMenu(p, e); } })));
    grid.append(card);
  }
}

function projMenu(p, e) {
  contextMenu(e.clientX, e.clientY, [
    { label: 'Abrir', icon: 'folder-open', action: () => openProject(p.id) },
    { label: 'Renombrar', icon: 'pencil', action: async () => { const n = await promptDialog('Nombre del proyecto', p.name); if (n) { p.name = n; await db.saveProject(p); showHome(); } } },
    { label: 'Duplicar', icon: 'copy', action: async () => { await db.duplicateProject(p.id, uid); showHome(); } },
    { label: 'Guardar como archivo', icon: 'download', action: async () => { toast('Preparando archivo…'); download(await db.exportProjectFile(p), safe(p.name) + '.vproj'); } },
    '-',
    { label: 'Eliminar', icon: 'trash-2', danger: true, action: async () => { if (await confirmDialog('Eliminar proyecto', `¿Seguro que quieres eliminar «${p.name}»? No se puede deshacer.`, 'Eliminar', true)) { await db.deleteProject(p.id); showHome(); } } },
  ]);
}
const safe = s => (s || 'proyecto').replace(/[\\/:*?"<>|]+/g, '_');

function newProjectDialog() {
  let aspect = '16:9';
  const name = h('input', { class: 'inp', value: `Proyecto ${new Date().toLocaleDateString('es-ES')}` });
  const opts = h('div', { class: 'aspect-grid' }, ...Object.entries(ASPECTS).map(([k, a]) => {
    const r = a.w / a.h, bw = r >= 1 ? 54 : 54 * r, bh = r >= 1 ? 54 / r : 54;
    const b = h('button', { class: 'aspect-btn' + (k === aspect ? ' on' : ''), onclick: () => { aspect = k; opts.querySelectorAll('.aspect-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); } },
      h('div', { class: 'ab-box', style: { width: bw + 'px', height: bh + 'px' } }), h('b', {}, k), h('span', {}, a.label.replace(/^[^(]*\(?/, '').replace(')', '') || a.label));
    return b;
  }));
  modal({ title: 'Nuevo proyecto', width: 560, body: h('div', {}, h('label', { class: 'lbl' }, 'Nombre'), name, h('label', { class: 'lbl' }, 'Formato'), opts, h('p', { class: 'hint' }, 'Podrás cambiar el formato más adelante.')),
    buttons: [{ label: 'Cancelar' }, { label: 'Crear proyecto', primary: true, onClick: async () => {
      const p = newProject(name.value.trim() || 'Mi proyecto', aspect);
      await db.saveProject(p); openProject(p.id);
    } }] });
}

async function openProject(id) {
  const p = await db.getProject(id);
  if (!p) { toast('No se encontró el proyecto', 'error'); return; }
  delete p.thumb;
  store.project = p; store.selectedId = null; store.time = 0;
  $('#home').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#projName').value = p.name; document.title = p.name + ' · Editor de vídeo';
  await db.cleanupOrphans(p).catch(() => {});
  await loadProjectMedia(p);
  const fonts = p.clips.filter(c => c.kind === 'text').map(c => c.font);
  ensureFonts(fonts).then(() => requestRender());
  if (!appReady) initApp();
  resetHistory();
  emit('project'); emit('select'); emit('time');
  resizeCanvas();
  setTimeout(() => { if (projectDuration() > 0) fitZoom(); else setZoom(60); }, 50);
  if (!localStorage.getItem('helpSeen')) { localStorage.setItem('helpSeen', '1'); setTimeout(showHelp, 400); }
  if (p.media.some(m => m.missing)) toast('Faltan algunos archivos del proyecto en este navegador', 'error', 6000);
}

// ---------------- Autoguardado ----------------
function scheduleSave() { setSaveState('saving'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
async function saveNow() {
  clearTimeout(saveTimer);
  if (!store.project) return;
  try {
    let thumb = null;
    const cv = previewCanvas();
    if (cv && cv.width > 2) { const t = document.createElement('canvas'); t.width = 240; t.height = Math.round(240 * cv.height / cv.width); t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height); thumb = t.toDataURL('image/jpeg', 0.7); }
    await db.saveProject({ ...store.project, thumb });
    setSaveState('saved');
  } catch (e) { setSaveState('error'); toast('No se pudo guardar: ' + e.message, 'error'); }
}
function setSaveState(s) {
  const el = $('#saveState');
  el.className = 'save-state ' + s;
  el.innerHTML = s === 'saving' ? 'Guardando…' : s === 'saved' ? icon('check', 14) + ' Guardado' : 'Error al guardar';
}

// ---------------- Interfaz principal ----------------
function initApp() {
  appReady = true;
  initPlayer($('#preview'));
  initPreview($('#overlay'));
  initTimeline($('#timeline'));
  initInspector($('#inspector'));
  initPanels($('#leftPanel'), $('#rail'));
  on('dirty', scheduleSave);
  on('history', () => { $('#btnUndo').disabled = !canUndo(); $('#btnRedo').disabled = !canRedo(); });
  on('play', () => { $('#btnPlay').innerHTML = icon(store.playing ? 'pause' : 'play', 26); });
  on('time', () => { $('#tCur').textContent = fmtTime(store.time, true); $('#tDur').textContent = fmtTime(projectDuration(), true); });
  on('project', () => { $('#tDur').textContent = fmtTime(projectDuration(), true); });
  new ResizeObserver(() => resizeCanvas()).observe($('.preview-box'));

  $('#btnHome').onclick = showHome;
  $('#projName').addEventListener('change', e => { store.project.name = e.target.value.trim() || 'Mi proyecto'; document.title = store.project.name; commit(); });
  $('#projName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnExport').onclick = openExport;
  $('#btnHelp').onclick = showHelp;
  $('#btnSaveFile').onclick = async () => { await saveNow(); toast('Preparando archivo de proyecto…'); download(await db.exportProjectFile(store.project), safe(store.project.name) + '.vproj'); toast('Guarda el archivo .vproj en tu pendrive o nube para abrirlo en otro ordenador.', 'ok', 6000); };
  $('#btnSettings').onclick = () => { select(null); };

  $('#btnPlay').onclick = togglePlay;
  $('#btnStart').onclick = () => seekTo(0);
  $('#btnEnd').onclick = () => seekTo(projectDuration());
  $('#btnPrev').onclick = () => seekBy(-1 / store.project.settings.fps);
  $('#btnNext').onclick = () => seekBy(1 / store.project.settings.fps);
  $('#vol').oninput = e => setMasterVolume(+e.target.value);
  $('#quality').onchange = e => { previewState.quality = +e.target.value; resizeCanvas(); };
  $('#btnFull').onclick = () => { const el = $('.preview-wrap'); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.(); };

  // soltar archivos en la vista previa
  const pw = $('.preview-wrap');
  pw.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/x-media')) { e.preventDefault(); pw.classList.add('drop'); } });
  pw.addEventListener('dragleave', () => pw.classList.remove('drop'));
  pw.addEventListener('drop', async e => {
    e.preventDefault(); pw.classList.remove('drop');
    const mid = e.dataTransfer.getData('text/x-media');
    if (mid) { const m = store.project.media.find(x => x.id === mid); if (m) A.addMediaToTimeline(m); return; }
    if (e.dataTransfer.files.length) A.importAndAdd([...e.dataTransfer.files], { addToTimeline: true });
  });

  // redimensionar línea de tiempo
  const saved = +localStorage.getItem('tlHeight'); if (saved) document.documentElement.style.setProperty('--tl-h', saved + 'px');
  $('#tlResizer').addEventListener('pointerdown', e => {
    const y0 = e.clientY, h0 = $('#timeline').getBoundingClientRect().height;
    const mv = ev => { const hh = Math.max(150, Math.min(innerHeight - 260, h0 - (ev.clientY - y0))); document.documentElement.style.setProperty('--tl-h', hh + 'px'); localStorage.setItem('tlHeight', hh); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  document.addEventListener('keydown', onKey);
}

function onKey(e) {
  if (!store.project || $('#app').classList.contains('hidden')) return;
  if (document.querySelector('.modal-wrap')) return;
  const tag = e.target.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !(tag === 'INPUT' && ['range', 'checkbox', 'color'].includes(e.target.type))) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  const fps = store.project.settings.fps;
  let handled = true;
  if (k === ' ') togglePlay();
  else if (ctrl && k === 'z' && !e.shiftKey) undo();
  else if ((ctrl && k === 'y') || (ctrl && e.shiftKey && k === 'z')) redo();
  else if (ctrl && k === 'd') A.duplicateSelected();
  else if (ctrl && k === 'c') A.copySelected();
  else if (ctrl && k === 'v') A.paste();
  else if (ctrl && k === 's') toast('Tu proyecto se guarda automáticamente ✓', 'ok');
  else if (ctrl && k === 'e') openExport();
  else if (k === 's' || (ctrl && k === 'b')) A.splitAtPlayhead();
  else if (k === 'delete' || k === 'backspace') A.deleteSelected(e.shiftKey);
  else if (k === 'arrowleft') seekBy(e.shiftKey ? -1 : -1 / fps);
  else if (k === 'arrowright') seekBy(e.shiftKey ? 1 : 1 / fps);
  else if (k === 'home') seekTo(0);
  else if (k === 'end') seekTo(projectDuration());
  else if (k === '+' || k === '=') setZoom(store.zoom * 1.4);
  else if (k === '-') setZoom(store.zoom / 1.4);
  else if (k === 'escape') select(null);
  else if (k === 't' && !ctrl) openPanel('text');
  else handled = false;
  if (handled) e.preventDefault();
}

// ---------------- Ayuda ----------------
const KEYS = [['Espacio', 'Reproducir / pausar'], ['S', 'Dividir clip en el cursor'], ['Supr', 'Eliminar clip'], ['Mayús + Supr', 'Eliminar y cerrar hueco'], ['Ctrl + Z / Ctrl + Y', 'Deshacer / rehacer'],
  ['Ctrl + D', 'Duplicar clip'], ['Ctrl + C / Ctrl + V', 'Copiar / pegar clip'], ['← / →', 'Fotograma anterior / siguiente'], ['Mayús + ← / →', 'Retroceder / avanzar 1 segundo'],
  ['Inicio / Fin', 'Ir al principio / final'], ['+ / -', 'Zoom de la línea de tiempo'], ['Ctrl + rueda', 'Zoom con el ratón'], ['Ctrl + E', 'Exportar'], ['Esc', 'Quitar selección']];
function showHelp() {
  modal({ title: 'Ayuda rápida', width: 680, body: h('div', { class: 'help' },
    h('div', { class: 'help-steps' },
      ...[['upload', 'Importa', 'Arrastra tus vídeos, fotos y música al panel «Multimedia».'], ['film', 'Monta', 'Arrástralos a la línea de tiempo. Corta con S y recorta tirando de los bordes del clip.'],
        ['type', 'Decora', 'Añade textos, subtítulos, transiciones, filtros, pegatinas y música.'], ['sliders-horizontal', 'Ajusta', 'Selecciona un clip y cambia sus propiedades en el panel derecho.'],
        ['download', 'Exporta', 'Pulsa «Exportar» y obtendrás un MP4 en tu carpeta Descargas.']].map(([ic, t, d], i) =>
        h('div', { class: 'help-step' }, h('div', { class: 'hs-n' }, String(i + 1)), ih(ic, 20), h('b', {}, t), h('span', {}, d)))),
    h('h4', {}, 'Atajos de teclado'),
    h('table', { class: 'keys' }, ...KEYS.map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, d)))),
    h('h4', {}, 'Dónde se guarda tu trabajo'),
    h('p', {}, 'El proyecto se guarda solo en este navegador de este ordenador. Si vas a usar otro ordenador, pulsa «Guardar archivo» (icono del disquete) y lleva el archivo .vproj en un pendrive o en tu nube. En la pantalla de inicio puedes abrirlo con «Abrir archivo».'),
    h('p', { class: 'hint' }, 'Funciona mejor en Google Chrome o Microsoft Edge. Ningún archivo se sube a internet: todo se procesa en tu ordenador.'),
  ), buttons: [{ label: 'Entendido', primary: true }] });
}

// ---------------- Inicio ----------------
function boot() {
  $('#btnNew').onclick = newProjectDialog;
  $('#btnOpenFile').onclick = async () => {
    const [f] = await pickFiles('.vproj', false); if (!f) return;
    try { toast('Abriendo proyecto…'); const p = await db.importProjectFile(f, uid); openProject(p.id); }
    catch (e) { toast(e.message, 'error'); }
  };
  $('#btnHomeHelp').onclick = showHelp;
  if (!('VideoEncoder' in window)) $('#compat').classList.remove('hidden');
  ensureFonts(FONTS.slice(0, 6));
  showHome();
  addEventListener('beforeunload', () => { if (store.project) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && store.project) saveNow(); });
}
boot();
