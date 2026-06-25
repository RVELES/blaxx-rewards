/**
 * Globo BlaxX — núcleo agnóstico de framework (canvas 2D + d3-geo + topojson).
 * Extraído de blaxx-rewards/home.html (implementação verificada/funcional).
 *
 * Dependências (instalar no app):  npm i d3-geo topojson-client
 *
 * Uso:
 *   import { createGlobe } from './globe-core';
 *   const globe = createGlobe(canvasEl, { world, points, suppliers, tooltip });
 *   // ...
 *   globe.destroy();   // ao desmontar (cancela RAF e remove listeners)
 */
import { geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo';
import { feature, mesh } from 'topojson-client';

export function createGlobe(canvas, opts = {}) {
  const {
    world,                       // topojson (countries-110m) com objects.countries — OBRIGATÓRIO
    points = [],                 // [{ s, c, lat, lon, i }]
    suppliers = {},              // { chave: { name, cat, rgb:'R,G,B' } }
    tooltip = null,              // HTMLElement opcional para o hover-tip
    active = null,               // { chave: bool } opcional; default: todos ativos
    accent = '182,242,61',       // rgb da atmosfera/anel
    autoRotate = true,
    rotateSpeed = 0.16,
    initialRotation = [60, -14], // [lambda, phi]
  } = opts;

  if (!world || !world.objects || !world.objects.countries) {
    throw new Error('createGlobe: opts.world deve ser o topojson com objects.countries');
  }
  if (!canvas) throw new Error('createGlobe: canvas ausente');

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const SUP = suppliers, POINTS = points;
  const act = active || Object.fromEntries(Object.keys(SUP).map(k => [k, true]));
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  let rotL = initialRotation[0], rotP = initialRotation[1];
  let dragging = false, autoR = autoRotate, lastX = 0, lastY = 0, hoverId = null;
  let raf = 0, destroyed = false;

  const listeners = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push([el, ev, fn, o]); };

  const land = feature(world, world.objects.countries);
  const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
  const coast = mesh(world, world.objects.countries, (a, b) => a === b);

  function heat(x, y, col, intensity, z) {
    const hr = (16 + 14 * intensity) * (0.55 + 0.6 * z);
    const g = ctx.createRadialGradient(x, y, 0, x, y, hr);
    g.addColorStop(0, 'rgba(' + col + ',' + (0.5 * z + 0.22) + ')');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, hr, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(' + col + ',' + (0.65 + 0.35 * z) + ')';
    ctx.beginPath(); ctx.arc(x, y, 2.1 * (0.7 + 0.5 * z), 0, 7); ctx.fill();
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      const nW = Math.max(1, Math.round(rect.width * dpr)), nH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== nW || canvas.height !== nH) { canvas.width = nW; canvas.height = nH; }
    }
    const Wc = canvas.width / dpr, Hc = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, Wc, Hc);
    const cx = Wc / 2, cy = Hc / 2, R = Math.min(Wc, Hc) * 0.42;

    let atm = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.28);
    atm.addColorStop(0, 'rgba(' + accent + ',0.10)'); atm.addColorStop(1, 'rgba(' + accent + ',0)');
    ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, 7); ctx.fill();
    let sph = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    sph.addColorStop(0, '#1a2230'); sph.addColorStop(0.65, '#0e131c'); sph.addColorStop(1, '#070709');
    ctx.fillStyle = sph; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();

    const proj = geoOrthographic().translate([cx, cy]).scale(R).rotate([rotL, rotP]).clipAngle(90);
    const path = geoPath(proj, ctx);
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); path(land); ctx.fillStyle = 'rgba(58,62,80,0.95)'; ctx.fill();
    ctx.beginPath(); path(coast); ctx.strokeStyle = 'rgba(186,190,214,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); path(borders); ctx.strokeStyle = 'rgba(132,136,166,0.42)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.strokeStyle = 'rgba(' + accent + ',0.25)'; ctx.lineWidth = 1; ctx.stroke();

    for (const m of POINTS) {
      m._vis = false;
      if (!act[m.s]) continue;
      const dist = geoDistance([m.lon, m.lat], [-rotL, -rotP]);
      if (dist >= Math.PI / 2) continue;
      const p = proj([m.lon, m.lat]); if (!p) continue;
      const z = Math.cos(dist);
      heat(p[0], p[1], (SUP[m.s] && SUP[m.s].rgb) || accent, m.i, z);
      m._sx = p[0]; m._sy = p[1]; m._vis = true;
    }
    if (autoR && !dragging) rotL += rotateSpeed;
    if (!destroyed) raf = requestAnimationFrame(draw);
  }

  // ---- interações ----
  on(canvas, 'mousedown', e => { dragging = true; autoR = false; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing'; });
  canvas.style.touchAction = 'none';
  on(canvas, 'touchstart', e => { if (e.touches.length !== 1) return; dragging = true; autoR = false; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }, { passive: true });
  on(canvas, 'touchmove', e => {
    if (!dragging || e.touches.length !== 1) return; e.preventDefault();
    const t = e.touches[0];
    rotL += (t.clientX - lastX) * 0.28;
    rotP = Math.max(-88, Math.min(88, rotP - (t.clientY - lastY) * 0.28));
    lastX = t.clientX; lastY = t.clientY; if (tooltip) tooltip.style.display = 'none'; hoverId = null;
  }, { passive: false });
  on(window, 'touchend', () => { if (dragging) { dragging = false; setTimeout(() => { if (!dragging) autoR = autoRotate; }, 2500); } });
  on(window, 'mouseup', () => { if (dragging) { dragging = false; canvas.style.cursor = 'grab'; setTimeout(() => { if (!dragging) autoR = autoRotate; }, 2500); } });
  on(canvas, 'mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (dragging) {
      rotL += (e.clientX - lastX) * 0.28;
      rotP = Math.max(-88, Math.min(88, rotP - (e.clientY - lastY) * 0.28));
      lastX = e.clientX; lastY = e.clientY; if (tooltip) tooltip.style.display = 'none'; hoverId = null; return;
    }
    if (!tooltip) return;
    let best = null, bestD = 15;
    for (const m of POINTS) { if (!m._vis) continue; const d = Math.hypot(m._sx - mx, m._sy - my); if (d < bestD) { bestD = d; best = m; } }
    if (best) {
      const id = best.s + best.c;
      if (id !== hoverId) {
        hoverId = id;
        const sup = SUP[best.s] || { name: '', cat: '' };
        tooltip.innerHTML = '<div style="font-weight:700;font-size:14px;color:#fff">' + esc(best.c) + '</div>'
          + '<div style="font-size:12px;color:#9a958c;margin-top:2px">' + esc(sup.name) + ' · ' + esc(sup.cat) + '</div>';
        tooltip.style.display = 'block';
      }
      tooltip.style.left = best._sx + 'px'; tooltip.style.top = best._sy + 'px'; tooltip.style.transform = 'translate(-50%,-145%)';
      canvas.style.cursor = 'pointer';
    } else if (hoverId) { hoverId = null; tooltip.style.display = 'none'; canvas.style.cursor = 'grab'; }
  });
  on(canvas, 'mouseleave', () => { if (hoverId) { hoverId = null; if (tooltip) tooltip.style.display = 'none'; } });

  draw();

  return {
    /** Liga/desliga um fornecedor no mapa de calor. */
    setActive(key, val) { act[key] = val; },
    getActive() { return { ...act }; },
    /** Chame ao desmontar para parar o loop e remover listeners. */
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      listeners.forEach(([el, ev, fn, o]) => el.removeEventListener(ev, fn, o));
    },
  };
}
