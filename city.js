// Geometria da cidade: OpenStreetMap (Overpass) com fallback procedural + geração de lotes.
import { ZONAS, rng } from './data.js';

export const RAIO = 420; // metade do lado do recorte (m)

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const LARGURA = { motorway: 18, trunk: 16, primary: 15, secondary: 12, tertiary: 10, unclassified: 8, residential: 8, living_street: 6, pedestrian: 5, service: 4.5 };
const RANK = { motorway: 5, trunk: 5, primary: 4, secondary: 3, tertiary: 2, unclassified: 1, residential: 1, living_street: 1, pedestrian: 0, service: 0 };

function projetor(lat0, lon0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), kz = 110540;
  return (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];
}

async function fetchOverpass(b, signal) {
  const dLat = (RAIO * 1.05) / 110540, dLon = (RAIO * 1.05) / (111320 * Math.cos((b.lat * Math.PI) / 180));
  const bbox = `${b.lat - dLat},${b.lon - dLon},${b.lat + dLat},${b.lon + dLon}`;
  const q = `[out:json][timeout:25];(
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service)$"](${bbox});
    way["building"](${bbox});
    way["leisure"~"^(park|garden|pitch|playground)$"](${bbox});
    way["landuse"~"^(grass|recreation_ground|forest|meadow)$"](${bbox});
  );out geom;`;
  const cacheKey = 'terra-osm-v2-' + b.id;
  try { const c = sessionStorage.getItem(cacheKey); if (c) return JSON.parse(c); } catch (_) {}
  // dispara nos servidores em paralelo; o primeiro que responder vence. Timeout cobre também a leitura do corpo.
  const ctrls = ENDPOINTS.map(() => new AbortController());
  const timer = setTimeout(() => ctrls.forEach((c) => c.abort()), 25000);
  try {
    const j = await Promise.any(ENDPOINTS.map(async (url, i) => {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctrls[i].signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.elements?.length) throw new Error('vazio');
      return j;
    }));
    try { sessionStorage.setItem(cacheKey, JSON.stringify(j)); } catch (_) {}
    return j;
  } finally {
    clearTimeout(timer);
    ctrls.forEach((c) => c.abort());
  }
}

function clipSeg(a, b, R) {
  // Liang–Barsky no quadrado [-R, R]
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const p = [-dx, dx, -dz, dz], q = [a[0] + R, R - a[0], a[1] + R, R - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dz], [a[0] + t1 * dx, a[1] + t1 * dz]];
}

function centroid(poly) { let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length]; }
function polyArea(poly) { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

function parseOSM(json, b, rand) {
  const proj = projetor(b.lat, b.lon);
  const R = RAIO;
  const segs = [], buildings = [], parks = [];
  const tall = b.id === 'batel' || b.id === 'ecoville' || b.id === 'agua-verde';
  for (const el of json.elements) {
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.map((g) => proj(g.lat, g.lon));
    const t = el.tags || {};
    if (t.highway) {
      const w = LARGURA[t.highway] ?? 6;
      for (let i = 0; i < pts.length - 1; i++) {
        const c = clipSeg(pts[i], pts[i + 1], R);
        if (c) segs.push({ a: c[0], b: c[1], w, type: t.highway, rank: RANK[t.highway] ?? 0, name: t.name || null });
      }
    } else {
      if (pts.length > 3 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
      if (pts.length < 3) continue;
      const c = centroid(pts);
      if (Math.abs(c[0]) > R - 2 || Math.abs(c[1]) > R - 2) continue;
      if (pts.some((p) => Math.abs(p[0]) > R || Math.abs(p[1]) > R)) continue;
      if (t.building) {
        let h = parseFloat(t.height);
        if (!h && t['building:levels']) h = parseFloat(t['building:levels']) * 3.1;
        if (!h) {
          const area = Math.abs(polyArea(pts));
          const r = rand();
          if (area > 350 && tall && r < 0.35) h = 18 + rand() * 50;
          else if (area > 200 && r < 0.25) h = 9 + rand() * 12;
          else h = 3.5 + rand() * 4;
        }
        buildings.push({ poly: pts, h: Math.min(h, 140), c });
      } else parks.push({ poly: pts });
    }
  }
  return { segs, buildings, parks };
}

const NOMES = ['Rua das Araucárias', 'Rua dos Ipês', 'Rua Gralha Azul', 'Rua Pinhão', 'Rua Erva-Mate', 'Rua Capivari', 'Rua Iguaçu', 'Rua Barigui', 'Rua Belém', 'Rua Atuba', 'Rua Passaúna', 'Rua Tarumã'];

function procedural(b, rand) {
  const R = RAIO, segs = [], buildings = [], parks = [];
  const xs = [], zs = [];
  for (let x = -R + 40; x < R; x += 105 + rand() * 25) xs.push(x);
  for (let z = -R + 30; z < R; z += 85 + rand() * 20) zs.push(z);
  const avX = xs[Math.floor(xs.length / 2)];
  xs.forEach((x, i) => {
    const prim = x === avX;
    segs.push({ a: [x, -R], b: [x, R], w: prim ? 15 : 8, type: prim ? 'primary' : 'residential', rank: prim ? 4 : 1, name: prim ? 'Av. República Argentina' : NOMES[i % NOMES.length] });
  });
  zs.forEach((z, i) => segs.push({ a: [-R, z], b: [R, z], w: i % 3 === 1 ? 10 : 8, type: i % 3 === 1 ? 'tertiary' : 'residential', rank: i % 3 === 1 ? 2 : 1, name: NOMES[(i + 5) % NOMES.length] }));
  const X = [-R, ...xs, R], Z = [-R, ...zs, R];
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
    const x0 = X[i] + 6, x1 = X[i + 1] - 6, z0 = Z[j] + 6, z1 = Z[j + 1] - 6;
    if (x1 - x0 < 20 || z1 - z0 < 20) continue;
    if (rand() < 0.07) { parks.push({ poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] }); continue; }
    const nearAv = Math.min(Math.abs(X[i] - avX), Math.abs(X[i + 1] - avX)) < 5;
    // casas ao longo das quatro faces do quarteirão
    const face = (ax, az, ux, uz, len, vx, vz, depth) => {
      let s = 0;
      while (s < len - 8) {
        const f = 9 + rand() * 8;
        if (s + f > len) break;
        const d = Math.min(depth, 12 + rand() * 12);
        const tower = nearAv ? rand() < 0.35 : rand() < 0.025;
        const h = tower ? 20 + rand() * 55 : 3.5 + rand() * 5;
        const p0 = [ax + ux * (s + 1), az + uz * (s + 1)], p1 = [ax + ux * (s + f - 1), az + uz * (s + f - 1)];
        const off = 3;
        const poly = [
          [p0[0] + vx * off, p0[1] + vz * off], [p1[0] + vx * off, p1[1] + vz * off],
          [p1[0] + vx * (off + d), p1[1] + vz * (off + d)], [p0[0] + vx * (off + d), p0[1] + vz * (off + d)],
        ];
        buildings.push({ poly, h, c: centroid(poly) });
        s += f;
      }
    };
    const dz = (z1 - z0) / 2 - 2, dx = (x1 - x0) / 2 - 2;
    face(x0 + 14, z0, 1, 0, x1 - x0 - 28, 0, 1, dz);
    face(x0 + 14, z1, 1, 0, x1 - x0 - 28, 0, -1, dz);
    face(x0, z0, 0, 1, z1 - z0, 1, 0, Math.min(dx, 14));
    face(x1, z0, 0, 1, z1 - z0, -1, 0, Math.min(dx, 14));
  }
  return { segs, buildings, parks };
}

// ----- geometria auxiliar -----
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
function inPoly(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}
function rectPts(c, u, v, f, d) {
  const hf = f / 2, hd = d / 2, pts = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++)
    pts.push([c[0] + u[0] * hf * i / 2 + v[0] * hd * j / 2, c[1] + u[1] * hf * i / 2 + v[1] * hd * j / 2]);
  return pts;
}
export function corners(lot) {
  const { cx, cz, u, v, frente: f, fundo: d } = lot;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + u[0] * f / 2 * i + v[0] * d / 2 * j, cz + u[1] * f / 2 * i + v[1] * d / 2 * j]);
}

// índice espacial simples (grade) para não comparar cada lote com todas as ruas/prédios
const CELL = 40;
function makeGrid(items, bboxOf) {
  const g = new Map();
  items.forEach((it, idx) => {
    const [x0, z0, x1, z1] = bboxOf(it);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = i + ',' + j; let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(idx);
      }
  });
  return (x0, z0, x1, z1) => {
    const out = new Set();
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) for (const idx of g.get(i + ',' + j) || []) out.add(idx);
    return [...out].map((i) => items[i]);
  };
}
const ptsBox = (pts, pad = 0) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0 - pad, z0 - pad, x1 + pad, z1 + pad]; };

function gerarLotes(city, b, rand, alvo = 18) {
  const { segs, buildings, parks } = city;
  const segQ = makeGrid(segs, (s) => ptsBox([s.a, s.b], s.w / 2 + 3));
  const bldQ = makeGrid(buildings, (bd) => ptsBox(bd.poly));
  const parkQ = makeGrid(parks, (p) => ptsBox(p.poly));
  // sorteio ponderado pelo comprimento: ruas do OSM vêm quebradas em trechos curtos
  const cand = segs.filter((s) => s.rank >= 1 && Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 4);
  const acc = []; let tot = 0;
  for (const s of cand) { tot += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); acc.push(tot); }
  const pickSeg = () => { const r = rand() * tot; let lo = 0, hi = acc.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (acc[m] < r) lo = m + 1; else hi = m; } return cand[lo]; };
  const lots = [];
  let tries = 0;
  while (lots.length < alvo && tries++ < 3000 && cand.length) {
    const s = pickSeg();
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    const u = [dx / L, dz / L];
    const side = rand() < 0.5 ? 1 : -1;
    const v = [-u[1] * side, u[0] * side]; // aponta da rua para o fundo do lote
    const f = Math.round(12 + rand() * 18), d = Math.round(26 + rand() * 18);
    const t = rand();
    const off = s.w / 2 + 2.5 + d / 2;
    const c = [s.a[0] + dx * t + v[0] * off, s.a[1] + dz * t + v[1] * off];
    if (Math.abs(c[0]) > RAIO - 40 || Math.abs(c[1]) > RAIO - 40) continue;
    if (lots.some((l) => Math.hypot(l.cx - c[0], l.cz - c[1]) < (Math.max(l.frente, l.fundo) + Math.max(f, d)) / 2 + 8)) continue;
    const cor = corners({ cx: c[0], cz: c[1], u, v, frente: f, fundo: d });
    const box = ptsBox(cor);
    const pts = rectPts(c, u, v, f, d);
    if (segQ(...box).some((o) => pts.some((p) => distSeg(p, o.a, o.b) < o.w / 2 + 1.5))) continue;
    if (parkQ(...box).some((pk) => pts.some((p) => inPoly(p, pk.poly)))) continue;
    if (bldQ(...box).some((bd) => bd.h > 14 && (pts.some((p) => inPoly(p, bd.poly)) || bd.poly.some((p) => inPoly(p, cor))))) continue;
    const vizinhos = segQ(c[0] - 80, c[1] - 80, c[0] + 80, c[1] + 80);
    // rua de referência = segmento com nome mais próximo
    let rua = s.name;
    if (!rua) { let best = 1e9; for (const o of vizinhos) if (o.name) { const dd = distSeg(c, o.a, o.b); if (dd < best) { best = dd; rua = o.name; } } }
    // via mais estruturante por perto → zona
    let near = { rank: 0, d: 1e9 };
    for (const o of vizinhos) { const dd = distSeg(c, o.a, o.b); if (o.rank >= 2 && dd < 70 && (o.rank > near.rank || (o.rank === near.rank && dd < near.d))) near = { rank: o.rank, d: dd }; }
    let zona;
    if (near.rank >= 4) zona = 'EE';
    else if (near.rank === 3) zona = 'ZUM';
    else if (near.rank === 2) zona = 'ZR-4';
    else { const r = rand(); zona = r < 0.45 ? 'ZR-3' : r < 0.75 ? 'ZR-4' : 'ZR-2'; }
    const fz = { EE: 1.55, ZUM: 1.3, 'ZR-4': 1.12, 'ZR-3': 1.0, 'ZR-2': 0.85 }[zona];
    const area = f * d;
    const ppm = Math.round((b.terrenoM2 * fz * (0.78 + rand() * 0.5)) / 10) * 10;
    const preco = Math.round((area * ppm) / 5000) * 5000;
    lots.push({ id: 100 + lots.length * 7 + Math.floor(rand() * 5), rua: rua || 'Rua sem nome', numero: 100 + Math.floor(rand() * 2400), cx: c[0], cz: c[1], u, v, frente: f, fundo: d, area, zona, ppm: Math.round(preco / area), preco, diasAnunciado: 3 + Math.floor(rand() * 200), casaExistente: false });
  }
  // remove edificações baixas que caem dentro dos lotes (vira "terreno com casa a demolir")
  city.buildings = buildings.filter((bd) => {
    const hit = lots.find((l) => inPoly(bd.c, corners(l)));
    if (hit) hit.casaExistente = true;
    return !hit;
  });
  return lots;
}

export async function carregarCidade(b, onStatus) {
  let city = null, fonte = 'demo';
  try {
    onStatus?.('Buscando ruas e edificações no OpenStreetMap… (até 25 s)');
    const t0 = performance.now();
    const json = await fetchOverpass(b);
    onStatus?.(`Montando o bairro (${json.elements.length} elementos)…`);
    await new Promise((r) => setTimeout(r, 30)); // deixa a mensagem aparecer
    const rand = rng(b.id);
    city = parseOSM(json, b, rand);
    if (city.segs.length < 10) throw new Error('poucos dados');
    city.lots = gerarLotes(city, b, rand);
    if (city.lots.length < 4) throw new Error('poucos lotes encaixados: ' + city.lots.length);
    fonte = 'osm';
    console.info(`OSM ok em ${Math.round(performance.now() - t0)} ms: ${city.segs.length} trechos, ${city.buildings.length} prédios, ${city.lots.length} lotes`);
  } catch (e) {
    console.warn('OSM indisponível, usando cidade procedural:', e);
    onStatus?.('Mapa real indisponível, gerando bairro de demonstração…');
    const rand = rng(b.id);
    city = procedural(b, rand);
    city.lots = gerarLotes(city, b, rand);
  }
  city.fonte = fonte;
  return city;
}

export { ZONAS };
