# Globo BlaxX — componente portátil

Globo terrestre interativo (canvas 2D + d3-geo + topojson) com mapa de calor de
parceiros/salas VIP. Extraído de `blaxx-rewards/home.html` (implementação
verificada: renderiza ~275k px, rotação automática, arraste, toque e tooltip).

Pronto para plugar no SPA **`blaxx-pontos-app`** (Vite/React) — ex.: na rota
`/viagens` (seção "MUNDO").

## Conteúdo

| Arquivo | O quê |
|---|---|
| `globe-core.js` | Núcleo agnóstico de framework. `createGlobe(canvas, opts)` → `{ setActive, destroy }` |
| `BlaxxGlobe.jsx` | Wrapper React (monta/desmonta, carrega world data, tooltip) |
| `globe-data.js` | `SUPPLIERS` + `POINTS` (dados do mapa, editáveis) |
| `countries-110m.json` | Mapa-múndi (world-atlas TopoJSON, ~108 KB) |

## Integração no SPA (Vite/React)

```bash
npm i d3-geo topojson-client
```

1. Copie a pasta `blaxx-globe/` para `src/` do app.
2. Copie `countries-110m.json` para `public/` (servido em `/countries-110m.json`).
3. Use o componente:

```jsx
import BlaxxGlobe from './blaxx-globe/BlaxxGlobe';
import { SUPPLIERS, POINTS } from './blaxx-globe/globe-data';

export default function Viagens() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <BlaxxGlobe
        worldUrl="/countries-110m.json"
        suppliers={SUPPLIERS}
        points={POINTS}
        accent="182,242,61"   // verde-limão da marca (rgb)
        height={560}
      />
    </div>
  );
}
```

## API do núcleo (sem React)

```js
import { createGlobe } from './globe-core';
const globe = createGlobe(canvasEl, {
  world,                 // topojson com objects.countries (OBRIGATÓRIO)
  points, suppliers,     // ver globe-data.js
  tooltip: tipEl,        // HTMLElement opcional p/ hover
  accent: '182,242,61',
  autoRotate: true,
  rotateSpeed: 0.16,
});
globe.setActive('smiles', false); // liga/desliga fornecedor
globe.destroy();                  // ao desmontar (cancela RAF + listeners)
```

## Notas
- **Sem CDN / sem rede externa** além do `countries-110m.json` (servido pelo próprio app).
- `destroy()` é essencial em SPA para evitar múltiplos loops de animação / vazamentos.
- Responsivo: o canvas se redimensiona ao container a cada frame (lê `getBoundingClientRect`).
- O TopoJSON é o `countries-110m` padrão do world-atlas — pode trocar por `50m` para mais detalhe.
