/* ============================================================================
   Motor do globo da rede BlaXx: canvas 2D + d3-geo + topojson, direção Cinema.

   Extraído de blaxx-neon.html (bloco inline das linhas 482-710) sem nenhuma
   alteração de comportamento, para que mais de uma home possa usar o mesmo
   globo em vez de manter duas cópias que divergem.

   Depende de vendor/d3.min.js e vendor/topojson-client.min.js carregados antes.
   Expõe: BLAXX_SUPPLIERS, BLAXX_POINTS e blaxxCreateGlobe(canvas, opts).
   O init (qual canvas, qual zoom, o que o clique faz) fica em cada página.
   ============================================================================ */

// ============ 3 verticais parceiras · 12 cidades ilustrativas · rede em expansão ============
// Categorias reais do modelo B2B (postos, supermercados, farmácias). Sem nomes de
// marcas de terceiros: os rótulos abaixo são a vertical em si, não uma parceria
// específica anunciada.
const BLAXX_SUPPLIERS = {"postos": {"name": "Postos", "cat": "Postos", "rgb": "231,178,74"}, "mercado": {"name": "Supermercados", "cat": "Supermercados", "rgb": "79,201,106"}, "farmacia": {"name": "Farmácias", "cat": "Farmácias", "rgb": "63,198,216"}};
const BLAXX_POINTS = [{"s": "postos", "c": "São Paulo", "lat": -23.55, "lon": -46.63, "i": 1}, {"s": "postos", "c": "Curitiba", "lat": -25.43, "lon": -49.27, "i": 0.7}, {"s": "postos", "c": "Porto Alegre", "lat": -30.03, "lon": -51.23, "i": 0.6}, {"s": "postos", "c": "Belo Horizonte", "lat": -19.92, "lon": -43.94, "i": 0.7}, {"s": "mercado", "c": "Rio de Janeiro", "lat": -22.91, "lon": -43.2, "i": 1}, {"s": "mercado", "c": "Recife", "lat": -8.05, "lon": -34.9, "i": 0.6}, {"s": "mercado", "c": "Fortaleza", "lat": -3.73, "lon": -38.52, "i": 0.6}, {"s": "mercado", "c": "Salvador", "lat": -12.97, "lon": -38.51, "i": 0.7}, {"s": "farmacia", "c": "Brasília", "lat": -15.79, "lon": -47.88, "i": 0.8}, {"s": "farmacia", "c": "Campinas", "lat": -22.9, "lon": -47.06, "i": 0.6}, {"s": "farmacia", "c": "Goiânia", "lat": -16.68, "lon": -49.25, "i": 0.6}, {"s": "farmacia", "c": "Manaus", "lat": -3.1, "lon": -60.02, "i": 0.5}];

// ============ Motor do globo (canvas 2D + d3-geo + topojson), direção Cinema ============
// Portado de design/blaxx-home-prototipo.html. Alfinetes-monograma (PO/ME/FA)
// identificam a vertical (postos/supermercados/farmácias), não uma marca específica.
function blaxxCreateGlobe(canvas, opts){
  opts = opts || {};
  var geoOrthographic = d3.geoOrthographic, geoPath = d3.geoPath,
      geoGraticule10 = d3.geoGraticule10, geoDistance = d3.geoDistance;
  var feature = topojson.feature, mesh = topojson.mesh;
  var world = opts.world, points = opts.points || [], suppliers = opts.suppliers || {};
  var accent = opts.accent || '89,253,39';
  var autoRotate = opts.autoRotate !== false;
  var rotateSpeed = opts.rotateSpeed || 0.16;
  var initialRotation = opts.initialRotation || [60, -14];
  var zoom = opts.zoom || 0.44;
  var sphHi = opts.sphHi || '#E3F1FC', sphMid = opts.sphMid || '#8EC3EA', sphLo = opts.sphLo || '#4A93D1';
  var landColor = opts.landColor || 'rgba(15,50,90,0.85)';
  var coastColor = opts.coastColor || 'rgba(8,32,60,0.55)';
  var borderColor = opts.borderColor || 'rgba(8,32,60,0.28)';
  var gratColor = opts.gratColor || 'rgba(8,32,60,0.10)';
  var ringAlpha = (opts.ringAlpha != null) ? opts.ringAlpha : 0.5;
  var atmAlpha = (opts.atmAlpha != null) ? opts.atmAlpha : 0;

  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var SUP = suppliers, POINTS = points;
  var act = Object.fromEntries(Object.keys(SUP).map(function(k){return [k, true];}));

  var rotL = initialRotation[0], rotP = initialRotation[1];
  var dragging = false, autoR = autoRotate, hovering = false, lastX = 0, lastY = 0, paused = false, destroyed = false, raf = 0;
  var listeners = [];
  var on = function(el, ev, fn, o){ el.addEventListener(ev, fn, o); listeners.push([el, ev, fn, o]); };

  var land = feature(world, world.objects.countries);
  var borders = mesh(world, world.objects.countries, function(a,b){ return a !== b; });
  var coast = mesh(world, world.objects.countries, function(a,b){ return a === b; });

  // monograma de 2 letras por vertical
  var MONO = { postos:'PO', mercado:'ME', farmacia:'FA' };

  // agrupa pontos quase colados (mesma cidade, vários parceiros) e abre um leque
  (function fanOut(){
    var FAN_RAD = 0.18 * Math.PI / 180; // ~20km
    var used = new Array(POINTS.length).fill(false);
    for (var i = 0; i < POINTS.length; i++) {
      if (used[i]) continue;
      var group = [i]; used[i] = true;
      for (var j = i + 1; j < POINTS.length; j++) {
        if (used[j]) continue;
        if (geoDistance([POINTS[i].lon,POINTS[i].lat],[POINTS[j].lon,POINTS[j].lat]) <= FAN_RAD) { group.push(j); used[j] = true; }
      }
      group.forEach(function(idx, k){ POINTS[idx]._fanIdx = k; POINTS[idx]._fanN = group.length; });
    }
  })();

  // alfinete de mapa: corpo (cor da marca) + emblema branco com monograma,
  // borda preta grossa + sombra dura (assinatura neo-brutal).
  function blipPin(tipX, tipY, col, intensity, z, label){
    var scale = (0.6 + 0.55 * z) * (0.85 + 0.3 * intensity);
    var r = 8.5 * scale;
    var cy = tipY - r * 1.7;
    function tracePin(){
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.quadraticCurveTo(tipX - r * 1.3, cy + r * 0.9, tipX - r, cy);
      ctx.arc(tipX, cy, r, Math.PI, 0, false);
      ctx.quadraticCurveTo(tipX + r * 1.3, cy + r * 0.9, tipX, tipY);
      ctx.closePath();
    }
    ctx.save(); ctx.translate(1.6 * scale, 1.6 * scale);
    tracePin(); ctx.fillStyle = 'rgba(10,11,14,0.35)'; ctx.fill(); ctx.restore();
    tracePin(); ctx.fillStyle = 'rgb(' + col + ')'; ctx.fill();
    ctx.lineWidth = Math.max(1.3, 1.6 * scale); ctx.strokeStyle = '#0A0B0E'; ctx.stroke();
    ctx.beginPath(); ctx.arc(tipX, cy, r * 0.64, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.lineWidth = Math.max(1, scale); ctx.strokeStyle = '#0A0B0E'; ctx.stroke();
    ctx.fillStyle = '#0A0B0E';
    ctx.font = '800 ' + Math.max(6, Math.round(r * 0.72)) + 'px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label || '', tipX, cy + 0.5);
    return [tipX, cy];
  }

  function draw(){
    var rect = canvas.getBoundingClientRect();
    if (rect.width > 0){
      var nW = Math.max(1, Math.round(rect.width * dpr)), nH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== nW || canvas.height !== nH){ canvas.width = nW; canvas.height = nH; }
    }
    var Wc = canvas.width / dpr, Hc = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, Wc, Hc);
    var cx = Wc / 2, cy = Hc / 2, R = Math.min(Wc, Hc) * zoom;

    if (atmAlpha > 0){
      var atm = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.28);
      atm.addColorStop(0, 'rgba(' + accent + ',' + atmAlpha + ')'); atm.addColorStop(1, 'rgba(' + accent + ',0)');
      ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, 7); ctx.fill();
    }
    var sph = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    sph.addColorStop(0, sphHi); sph.addColorStop(0.65, sphMid); sph.addColorStop(1, sphLo);
    ctx.fillStyle = sph; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();

    var proj = geoOrthographic().translate([cx, cy]).scale(R).rotate([rotL, rotP]).clipAngle(90);
    var path = geoPath(proj, ctx);
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = gratColor; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); path(land); ctx.fillStyle = landColor; ctx.fill();
    ctx.beginPath(); path(coast); ctx.strokeStyle = coastColor; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); path(borders); ctx.strokeStyle = borderColor; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.strokeStyle = 'rgba(' + accent + ',' + ringAlpha + ')'; ctx.lineWidth = 1.4; ctx.stroke();

    for (var idx = 0; idx < POINTS.length; idx++){
      var m = POINTS[idx]; m._vis = false;
      if (!act[m.s]) continue;
      var dist = geoDistance([m.lon, m.lat], [-rotL, -rotP]);
      if (dist >= Math.PI / 2) continue;
      var p = proj([m.lon, m.lat]); if (!p) continue;
      var z = Math.cos(dist);
      var col = (SUP[m.s] && SUP[m.s].rgb) || accent;
      var px = p[0], py = p[1];
      if (m._fanN > 1){ var spread = 13 * (0.6 + 0.6 * z); px += (m._fanIdx - (m._fanN - 1) / 2) * spread; }
      var label = MONO[m.s] || (SUP[m.s] && SUP[m.s].name || '?').slice(0,2).toUpperCase();
      var hit = blipPin(px, py, col, m.i, z, label);
      m._sx = hit[0]; m._sy = hit[1]; m._vis = true;
    }
    if (autoR && !dragging) rotL += rotateSpeed;
  }
  function loop(){ draw(); if (!paused && !destroyed) raf = requestAnimationFrame(loop); }

  var tooltip = opts.tooltip || null;
  var onPointClick = opts.onPointClick || null;
  var downX = 0, downY = 0, movedDist = 0, lastTipKey = '';
  var HOVER_PX = 22;
  var CLUSTER_RAD = 0.6 * Math.PI / 180; // ~65km, funde só a MESMA cidade

  function clusterAt(best){
    var seen = {}, list = [];
    for (var j = 0; j < POINTS.length; j++){
      var q = POINTS[j]; if (!q._vis) continue;
      if (geoDistance([q.lon, q.lat], [best.lon, best.lat]) > CLUSTER_RAD) continue;
      var supName = (SUP[q.s] && SUP[q.s].name) || q.s;
      if (seen[supName]) continue;
      seen[supName] = true;
      list.push({ name: supName, rgb: (SUP[q.s] && SUP[q.s].rgb) || accent });
    }
    return list;
  }
  function findNear(mx, my, thresh){
    var best = null, bestD = thresh;
    for (var i = 0; i < POINTS.length; i++){
      var m = POINTS[i]; if (!m._vis) continue;
      var d = Math.hypot(m._sx - mx, m._sy - my);
      if (d < bestD){ bestD = d; best = m; }
    }
    return best;
  }

  on(canvas, 'mousedown', function(e){ dragging = true; autoR = false; lastX = e.clientX; lastY = e.clientY; downX = e.clientX; downY = e.clientY; movedDist = 0; canvas.style.cursor = 'grabbing'; });
  canvas.style.touchAction = 'none';
  on(canvas, 'touchstart', function(e){ if (e.touches.length !== 1) return; dragging = true; autoR = false; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }, { passive: true });
  on(canvas, 'touchmove', function(e){
    if (!dragging || e.touches.length !== 1) return; e.preventDefault();
    var t = e.touches[0];
    rotL += (t.clientX - lastX) * 0.28;
    rotP = Math.max(-88, Math.min(88, rotP - (t.clientY - lastY) * 0.28));
    lastX = t.clientX; lastY = t.clientY;
  }, { passive: false });
  on(window, 'touchend', function(){ if (dragging){ dragging = false; setTimeout(function(){ if (!dragging && !hovering) autoR = autoRotate; }, 2500); } });
  on(window, 'mouseup', function(e){
    if (!dragging) return;
    dragging = false; canvas.style.cursor = 'grab';
    setTimeout(function(){ if (!dragging && !hovering) autoR = autoRotate; }, 2500);
    if (movedDist < 6 && onPointClick){
      var rect = canvas.getBoundingClientRect();
      var best = findNear(e.clientX - rect.left, e.clientY - rect.top, HOVER_PX);
      if (best) onPointClick(best, clusterAt(best));
    }
  });
  on(canvas, 'mousemove', function(e){
    if (dragging){
      movedDist += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      rotL += (e.clientX - lastX) * 0.28;
      rotP = Math.max(-88, Math.min(88, rotP - (e.clientY - lastY) * 0.28));
      lastX = e.clientX; lastY = e.clientY;
      if (tooltip) tooltip.style.display = 'none';
      return;
    }
    if (!tooltip) return;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var best = findNear(mx, my, HOVER_PX);
    if (best){
      var group = clusterAt(best);
      var cityLabel = best.c.replace(/\s*\([^)]*\)\s*$/, '');
      var key = cityLabel + '|' + group.map(function(o){ return o.name; }).join(',');
      if (key !== lastTipKey){
        lastTipKey = key;
        var chips = group.map(function(o){
          return '<span style="display:inline-flex;align-items:center;gap:5px;margin:3px 8px 0 0">' +
            '<i style="width:7px;height:7px;border-radius:50%;background:rgb(' + o.rgb + ');display:inline-block;flex:none"></i>' + o.name + '</span>';
        }).join('');
        tooltip.innerHTML = '<b style="display:block;color:#fff;margin-bottom:3px">' + cityLabel + '</b>' +
          '<div style="display:flex;flex-wrap:wrap;max-width:210px">' + chips + '</div>';
      }
      tooltip.style.left = best._sx + 'px'; tooltip.style.top = best._sy + 'px';
      tooltip.style.transform = 'translate(-50%,-128%)';
      tooltip.style.display = 'block';
      canvas.style.cursor = onPointClick ? 'pointer' : 'grab';
    } else if (tooltip.style.display !== 'none'){
      tooltip.style.display = 'none'; lastTipKey = '';
      canvas.style.cursor = 'grab';
    }
  });
  on(canvas, 'mouseenter', function(){ hovering = true; if (!dragging) autoR = false; });
  on(canvas, 'mouseleave', function(){ hovering = false; autoR = autoRotate; if (tooltip){ tooltip.style.display = 'none'; lastTipKey = ''; } });

  loop();
  return {
    pause: function(){ paused = true; cancelAnimationFrame(raf); },
    resume: function(){ if (paused){ paused = false; loop(); } },
    destroy: function(){ destroyed = true; cancelAnimationFrame(raf); listeners.forEach(function(l){ l[0].removeEventListener(l[1], l[2], l[3]); }); }
  };
}
