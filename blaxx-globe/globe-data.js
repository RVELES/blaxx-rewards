/**
 * Dados do globo BlaxX (fornecedores + pontos no mapa).
 * Extraído de blaxx-rewards/home.html (CONFIG.suppliers / CONFIG.points).
 * Edite à vontade — `s` em POINTS deve casar com uma chave de SUPPLIERS.
 */

// chave -> { name, cat, rgb:'R,G,B' (cor do ponto no mapa) }
export const SUPPLIERS = {
  smiles:   { name: 'Smiles',          cat: 'Milhas',    rgb: '231,178,74'  },
  latam:    { name: 'LATAM Pass',      cat: 'Milhas',    rgb: '224,96,160'  },
  azul:     { name: 'Azul Fidelidade', cat: 'Milhas',    rgb: '79,143,240'  },
  accor:    { name: 'Accor ALL',       cat: 'Hotéis',    rgb: '79,201,106'  },
  marriott: { name: 'Marriott Bonvoy', cat: 'Hotéis',    rgb: '155,108,240' },
  priority: { name: 'Priority Pass',   cat: 'Salas VIP', rgb: '63,198,216'  },
};

// { s: chave do fornecedor, c: nome exibido, lat, lon, i: intensidade 0.1–1 }
export const POINTS = [
  { s: 'smiles', c: 'São Paulo', lat: -23.5, lon: -46.6, i: 1 },
  { s: 'smiles', c: 'Rio de Janeiro', lat: -22.9, lon: -43.2, i: .8 },
  { s: 'smiles', c: 'Brasília', lat: -15.8, lon: -47.9, i: .6 },
  { s: 'smiles', c: 'Recife', lat: -8, lon: -34.9, i: .5 },
  { s: 'smiles', c: 'Buenos Aires', lat: -34.6, lon: -58.4, i: .6 },
  { s: 'smiles', c: 'Orlando', lat: 28.5, lon: -81.3, i: .7 },
  { s: 'smiles', c: 'Lisboa', lat: 38.7, lon: -9.1, i: .6 },
  { s: 'latam', c: 'Santiago', lat: -33.4, lon: -70.6, i: .9 },
  { s: 'latam', c: 'Lima', lat: -12, lon: -77, i: .7 },
  { s: 'latam', c: 'São Paulo', lat: -23.55, lon: -46.63, i: .9 },
  { s: 'latam', c: 'Bogotá', lat: 4.7, lon: -74, i: .6 },
  { s: 'latam', c: 'Madri', lat: 40.4, lon: -3.7, i: .7 },
  { s: 'latam', c: 'Miami', lat: 25.7, lon: -80.2, i: .7 },
  { s: 'latam', c: 'Sydney', lat: -33.8, lon: 151.2, i: .6 },
  { s: 'azul', c: 'Campinas', lat: -23, lon: -47.1, i: .9 },
  { s: 'azul', c: 'Recife', lat: -8.05, lon: -34.88, i: .6 },
  { s: 'azul', c: 'Belo Horizonte', lat: -19.9, lon: -43.9, i: .6 },
  { s: 'azul', c: 'Manaus', lat: -3.1, lon: -60, i: .5 },
  { s: 'azul', c: 'Fort Lauderdale', lat: 26.1, lon: -80.1, i: .6 },
  { s: 'azul', c: 'Lisboa', lat: 38.72, lon: -9.13, i: .5 },
  { s: 'accor', c: 'Paris', lat: 48.8, lon: 2.3, i: 1 },
  { s: 'accor', c: 'Londres', lat: 51.5, lon: -0.1, i: .8 },
  { s: 'accor', c: 'Bangkok', lat: 13.7, lon: 100.5, i: .7 },
  { s: 'accor', c: 'Dubai', lat: 25.2, lon: 55.3, i: .8 },
  { s: 'accor', c: 'São Paulo', lat: -23.52, lon: -46.6, i: .7 },
  { s: 'accor', c: 'Singapura', lat: 1.3, lon: 103.8, i: .7 },
  { s: 'accor', c: 'Sydney', lat: -33.86, lon: 151.2, i: .6 },
  { s: 'marriott', c: 'Nova York', lat: 40.7, lon: -74, i: 1 },
  { s: 'marriott', c: 'Londres', lat: 51.51, lon: -0.12, i: .8 },
  { s: 'marriott', c: 'Tóquio', lat: 35.6, lon: 139.7, i: .8 },
  { s: 'marriott', c: 'Dubai', lat: 25.21, lon: 55.27, i: .7 },
  { s: 'marriott', c: 'Los Angeles', lat: 34, lon: -118.2, i: .7 },
  { s: 'marriott', c: 'Xangai', lat: 31.2, lon: 121.5, i: .7 },
  { s: 'marriott', c: 'Cancún', lat: 21.1, lon: -86.8, i: .6 },
  { s: 'priority', c: 'Dubai (DXB)', lat: 25.25, lon: 55.36, i: 1 },
  { s: 'priority', c: 'Londres (LHR)', lat: 51.47, lon: -0.45, i: .8 },
  { s: 'priority', c: 'Singapura (SIN)', lat: 1.36, lon: 103.99, i: .8 },
  { s: 'priority', c: 'Frankfurt (FRA)', lat: 50.04, lon: 8.56, i: .7 },
  { s: 'priority', c: 'Hong Kong (HKG)', lat: 22.3, lon: 114.2, i: .7 },
  { s: 'priority', c: 'Istambul (IST)', lat: 41, lon: 28.9, i: .7 },
  { s: 'priority', c: 'Guarulhos (GRU)', lat: -23.43, lon: -46.47, i: .8 },
  { s: 'priority', c: 'Doha (DOH)', lat: 25.3, lon: 51.5, i: .6 },
];
