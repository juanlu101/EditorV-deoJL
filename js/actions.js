// Acciones de edición compartidas por paneles, línea de tiempo y atajos
import { store, makeClip, placeClip, commit, select, getClip, getMedia, splitClip, removeClip, duplicateClip, clipEnd,
  trackClips, overlaps, addTrack, uid, emit, cleanupEmptyTracks, visualItemsAt, srcTime, getTrack } from './state.js';
import { importFile, cache } from './media.js';
import { toast } from './ui.js';
import { pool } from './player.js';

export function addMediaToTimeline(m, trackId = null, start = null) {
  if (start == null) start = store.time;
  let c;
  if (m.type === 'image') c = makeClip('image', { mediaId: m.id, duration: 5, name: m.name, fit: 'contain' });
  else c = makeClip(m.type, { mediaId: m.id, duration: m.duration, name: m.name, fit: 'contain' });
  if (!trackId) {
    // primera pista del tipo que tenga hueco
    const type = m.type === 'audio' ? 'audio' : 'visual';
    const tracks = store.project.tracks.filter(t => t.type === type && !t.locked);
    const main = type === 'visual' ? tracks[tracks.length - 1] : tracks[0];
    trackId = (main && !overlaps(main.id, start, start + c.duration)) ? main.id : tracks.find(t => !overlaps(t.id, start, start + c.duration))?.id;
  }
  placeClip(c, trackId, start);
  select(c.id);
  commit();
  return c;
}

// Añade un elemento superpuesto (texto, forma, sticker...) en el cursor
export function addOverlay(kind, opts = {}, duration = 4) {
  const c = makeClip(kind, { duration, ...opts });
  const start = store.time;
  const visual = store.project.tracks.filter(t => t.type === 'visual' && !t.locked);
  let target = null;
  if (kind === 'color') target = visual[visual.length - 1]?.id;
  else {
    const cand = visual.slice(0, -1).find(t => !overlaps(t.id, start, start + duration));
    if (cand) target = cand.id;
    else if (visual.length === 1 && !store.project.clips.some(x => x.trackId === visual[0].id)) target = visual[0].id;
    else target = addTrack('visual').id;
  }
  placeClip(c, target, start);
  select(c.id); commit();
  return c;
}

export async function importAndAdd(files, { trackId = null, start = null, addToTimeline = false } = {}) {
  const added = [];
  for (const f of files) {
    try {
      toast(`Importando ${f.name}…`, 'info', 1500);
      const m = await importFile(f);
      added.push(m);
    } catch (e) { toast(e.message, 'error', 6000); }
  }
  commit();
  if (addToTimeline) {
    let t = start ?? store.time;
    for (const m of added) { const c = addMediaToTimeline(m, trackId, t); t = clipEnd(c); }
  }
  return added;
}

export function splitAtPlayhead() {
  const t = store.time;
  let c = getClip(store.selectedId);
  if (!c || t <= c.start || t >= clipEnd(c)) {
    // sin selección: divide todos los clips bajo el cursor en pistas desbloqueadas
    const targets = store.project.clips.filter(x => t > x.start + 0.05 && t < clipEnd(x) - 0.05 && !getTrack(x.trackId)?.locked);
    if (!targets.length) { toast('Coloca el cursor sobre un clip para dividirlo'); return; }
    targets.forEach(x => splitClip(x, t));
  } else {
    const b = splitClip(c, t);
    if (b) select(b.id);
  }
  commit();
}

export function deleteSelected(ripple = false) {
  const c = getClip(store.selectedId); if (!c) return;
  if (getTrack(c.trackId)?.locked) { toast('La pista está bloqueada'); return; }
  removeClip(c.id, ripple);
  cleanupEmptyTracks();
  emit('select'); commit();
}

export function duplicateSelected() {
  const c = getClip(store.selectedId); if (!c) return;
  const d = duplicateClip(c); select(d.id); commit();
}

export function copySelected() { const c = getClip(store.selectedId); if (c) { store.clipboard = JSON.stringify(c); toast('Clip copiado'); } }
export function paste() {
  if (!store.clipboard) return;
  const c = JSON.parse(store.clipboard); c.id = uid(); c.transition = null;
  placeClip(c, c.trackId, store.time); select(c.id); commit();
}

export function detachAudio(c) {
  if (c.kind !== 'video') return;
  const m = getMedia(c.mediaId);
  if (m && m.hasAudio === false) { toast('Este vídeo no tiene sonido'); return; }
  const a = makeClip('audio', { mediaId: c.mediaId, start: c.start, duration: c.duration, in: c.in, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, name: (c.name || 'Audio') + ' (audio)' });
  c.audioDetached = true;
  const audioTrack = store.project.tracks.find(t => t.type === 'audio' && !overlaps(t.id, a.start, clipEnd(a)));
  placeClip(a, audioTrack?.id, a.start);
  select(a.id); commit();
  toast('Audio separado en su propia pista');
}

export async function freezeFrame(c) {
  if (c?.kind !== 'video') { toast('Selecciona un clip de vídeo'); return; }
  const t = store.time;
  if (t < c.start || t >= clipEnd(c)) { toast('Coloca el cursor sobre el clip'); return; }
  const m = getMedia(c.mediaId);
  const v = document.createElement('video'); v.muted = true; v.src = cache.urls.get(c.mediaId);
  await new Promise(r => { v.onloadeddata = r; });
  v.currentTime = srcTime(c, t);
  await new Promise(r => { v.onseeked = r; });
  const cv = document.createElement('canvas'); cv.width = m.width; cv.height = m.height;
  cv.getContext('2d').drawImage(v, 0, 0);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const file = new File([blob], `fotograma_${Math.round(t * 10) / 10}s.png`, { type: 'image/png' });
  const im = await importFile(file);
  // dividir el clip y meter la imagen congelada en medio (3 s)
  const b = splitClip(c, t);
  const freeze = makeClip('image', { mediaId: im.id, duration: 3, name: 'Fotograma congelado', fit: c.fit, x: c.x, y: c.y, scale: c.scale, rotation: c.rotation, filters: { ...c.filters }, cropL: c.cropL, cropR: c.cropR, cropT: c.cropT, cropB: c.cropB });
  const shift = 3;
  if (b) for (const x of trackClips(c.trackId)) if (x.start >= t - 0.001) x.start += shift;
  placeClip(freeze, c.trackId, t);
  select(freeze.id); commit();
  toast('Fotograma congelado añadido (3 s)');
}

export function applyTransition(c, type, duration) {
  if (!c) { toast('Selecciona primero un clip'); return false; }
  const tr = getTrack(c.trackId);
  if (tr.type !== 'visual') { toast('Las transiciones son para clips de vídeo o imagen'); return false; }
  const list = trackClips(c.trackId);
  const prev = list[list.indexOf(c) - 1];
  if (!prev || Math.abs(clipEnd(prev) - c.start) > 0.02) {
    // sin clip anterior pegado: usar animación de entrada equivalente
    const map = { crossfade: 'fade', dip: 'fade', flash: 'fade', 'slide-left': 'slide-right', 'slide-right': 'slide-left', 'slide-up': 'rise', 'slide-down': 'drop', zoom: 'zoom-in', blur: 'blur', spin: 'spin' };
    c.animIn = { type: map[type] || 'fade', duration };
    commit();
    toast('No hay un clip pegado antes: se ha aplicado como animación de entrada');
    return true;
  }
  c.transition = type === 'none' ? null : { type, duration };
  commit();
  return true;
}

export function applyTransitionToAll(type, duration) {
  let n = 0;
  for (const tr of store.project.tracks.filter(t => t.type === 'visual')) {
    const list = trackClips(tr.id);
    for (let i = 1; i < list.length; i++) if (Math.abs(clipEnd(list[i - 1]) - list[i].start) < 0.02) { list[i].transition = type === 'none' ? null : { type, duration }; n++; }
  }
  commit();
  toast(n ? `Transición aplicada a ${n} corte(s)` : 'No hay clips pegados entre sí');
}

export function closeGaps(trackId) {
  let t = 0;
  for (const c of trackClips(trackId)) { c.start = t; t = clipEnd(c); }
  commit();
}

export { pool };
