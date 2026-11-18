'use strict';

const $ = (id) => document.getElementById(id);
const els = {
  camera: $('cameraInput'), gallery: $('galleryInput'), placeholder: $('placeholder'),
  desc: $('desc'), count: $('count'), useDate: $('useDate'), useGeo: $('useGeo'),
  geoStatus: $('geoStatus'), canvas: $('canvas'), result: $('result'),
  share: $('shareBtn'), msg: $('msg'), install: $('installBtn'),
};

const MAX_SIDE = 1600;          // lado mayor del print (px)
let photo = null;               // HTMLImageElement cargada
let coords = null;              // {lat, lon, acc}
let printBlob = null;
let renderTimer = null;

// ---------- Foto ----------
function onFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (photo) URL.revokeObjectURL(photo.src);
    photo = img;
    els.placeholder.hidden = true;
    scheduleRender(0);
  };
  img.onerror = () => setMsg('No se pudo leer la imagen.');
  img.src = url;
}
els.camera.addEventListener('change', onFile);
els.gallery.addEventListener('change', onFile);

// ---------- Descripción / opciones ----------
els.desc.addEventListener('input', () => {
  els.count.textContent = `${els.desc.value.length}/280`;
  try { localStorage.setItem('fp-draft', els.desc.value); } catch (_) {}
  scheduleRender();
});
try { els.desc.value = localStorage.getItem('fp-draft') || ''; } catch (_) {}
els.count.textContent = `${els.desc.value.length}/280`;

els.useDate.addEventListener('change', () => scheduleRender(0));
els.useGeo.addEventListener('change', () => {
  if (!els.useGeo.checked) { coords = null; els.geoStatus.hidden = true; scheduleRender(0); return; }
  if (!('geolocation' in navigator)) { geoInfo('Este dispositivo no ofrece GPS.'); els.useGeo.checked = false; return; }
  geoInfo('Obteniendo ubicación…');
  navigator.geolocation.getCurrentPosition(
    (p) => {
      coords = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      geoInfo(`📍 ${fmtCoords(coords)} (±${Math.round(coords.acc)} m)`);
      scheduleRender(0);
    },
    (err) => { geoInfo('No se pudo obtener la ubicación: ' + err.message); els.useGeo.checked = false; },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
});
function geoInfo(t) { els.geoStatus.hidden = false; els.geoStatus.textContent = t; }
function fmtCoords(c) { return `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`; }

// ---------- Composición del print ----------
function scheduleRender(delay = 250) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, delay);
}

function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
      if (line) out.push(line);
      // palabra más larga que el ancho: cortar por caracteres
      let w = word;
      while (ctx.measureText(w).width > maxWidth) {
        let i = w.length;
        while (i > 1 && ctx.measureText(w.slice(0, i)).width > maxWidth) i--;
        out.push(w.slice(0, i)); w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

function render() {
  if (!photo) return;
  const scale = Math.min(1, MAX_SIDE / Math.max(photo.naturalWidth, photo.naturalHeight));
  const W = Math.round(photo.naturalWidth * scale);
  const H = Math.round(photo.naturalHeight * scale);

  const ctx = els.canvas.getContext('2d');
  const pad = Math.round(W * 0.04);
  const fontSize = Math.max(18, Math.round(W * 0.034));
  const metaSize = Math.round(fontSize * 0.72);
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, Roboto, sans-serif`;

  const text = els.desc.value.trim();
  const lines = text ? wrapLines(ctx, text, W - pad * 2) : [];
  const meta = [];
  if (els.useDate.checked) meta.push(new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }));
  if (els.useGeo.checked && coords) meta.push('📍 ' + fmtCoords(coords));

  const lineH = Math.round(fontSize * 1.3);
  const bandH = (lines.length || meta.length)
    ? pad * 2 + lines.length * lineH + (meta.length ? Math.round(metaSize * 1.6) : 0) - (lines.length ? 0 : pad * 0.5)
    : 0;

  els.canvas.width = W;
  els.canvas.height = H + Math.round(bandH);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, els.canvas.height);
  ctx.drawImage(photo, 0, 0, W, H); // los navegadores actuales ya aplican la orientación EXIF

  if (bandH) {
    let y = H + pad;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#111827';
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, Roboto, sans-serif`;
    for (const l of lines) { ctx.fillText(l, pad, y); y += lineH; }
    if (meta.length) {
      ctx.fillStyle = '#6b7280';
      ctx.font = `400 ${metaSize}px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText(meta.join('   ·   '), pad, y + (lines.length ? Math.round(metaSize * 0.4) : 0));
    }
  }

  els.canvas.toBlob((blob) => {
    if (!blob) { setMsg('No se pudo generar el print.'); return; }
    printBlob = blob;
    if (els.result.src) URL.revokeObjectURL(els.result.src);
    els.result.src = URL.createObjectURL(blob);
    els.result.hidden = false;
    els.share.disabled = false;
  }, 'image/jpeg', 0.9);
}

// ---------- Compartir / guardar ----------
function fileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `print_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}

els.share.addEventListener('click', async () => {
  if (!printBlob) return;
  const file = new File([printBlob], fileName(), { type: 'image/jpeg' });
  const data = { files: [file], title: 'FotoPrint', text: els.desc.value.trim() };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share(data); afterSend('Enviado ✔'); }
    catch (err) { if (err.name !== 'AbortError') setMsg('No se pudo enviar: ' + err.message); }
  } else {
    download();
    afterSend('Descargado ✔');
  }
});

// Tras enviar: limpia la descripción (y el borrador) y vuelve a generar la vista previa.
function afterSend(text) {
  els.desc.value = '';
  els.count.textContent = '0/280';
  try { localStorage.removeItem('fp-draft'); } catch (_) {}
  setMsg(text);
  setTimeout(() => setMsg(''), 2500);
  scheduleRender(0);
}

function download() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(printBlob);
  a.download = fileName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function setMsg(t) { els.msg.textContent = t; }

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e; els.install.hidden = false;
});
els.install.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null; els.install.hidden = true;
});
