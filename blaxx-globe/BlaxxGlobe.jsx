/**
 * <BlaxxGlobe /> — wrapper React do globo BlaxX (para o SPA blaxx-pontos-app).
 *
 * Instalar deps no app:  npm i d3-geo topojson-client
 * Coloque countries-110m.json em /public (ou importe e passe via prop `world`).
 *
 * Exemplo:
 *   import BlaxxGlobe from './blaxx-globe/BlaxxGlobe';
 *   import { SUPPLIERS, POINTS } from './blaxx-globe/globe-data';
 *
 *   <BlaxxGlobe worldUrl="/countries-110m.json" suppliers={SUPPLIERS} points={POINTS} height={560} />
 */
import { useEffect, useRef, useState } from 'react';
import { createGlobe } from './globe-core';

export default function BlaxxGlobe({
  world: worldProp,          // topojson já carregado (alternativa a worldUrl)
  worldUrl,                  // ex.: '/countries-110m.json'
  points = [],
  suppliers = {},
  accent = '182,242,61',
  height = 560,
  style,
  className,
}) {
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const [world, setWorld] = useState(worldProp || null);

  // carrega o world data se vier por URL
  useEffect(() => {
    if (worldProp) { setWorld(worldProp); return; }
    if (!worldUrl) return;
    let alive = true;
    fetch(worldUrl).then(r => r.json()).then(w => { if (alive) setWorld(w); })
      .catch(e => console.error('BlaxxGlobe: falha ao carregar world data:', e));
    return () => { alive = false; };
  }, [worldProp, worldUrl]);

  // monta/desmonta o globo
  useEffect(() => {
    if (!world || !canvasRef.current) return;
    const g = createGlobe(canvasRef.current, {
      world, points, suppliers, accent, tooltip: tipRef.current,
    });
    return () => g.destroy();
  }, [world, points, suppliers, accent]);

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height, cursor: 'grab', ...style }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div
        ref={tipRef}
        style={{
          display: 'none', position: 'absolute', background: '#16161c',
          border: '1px solid rgba(255,255,255,.14)', borderRadius: 11, padding: '9px 13px',
          pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 6,
          boxShadow: '0 14px 38px rgba(0,0,0,.55)',
        }}
      />
    </div>
  );
}
