import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { BAIRROS, ZONAS, PREMISSAS, viabilidade, brl, num, rng } from './data.js';
import { carregarCidade, corners, RAIO } from './city.js';

// ---------------- estado ----------------
const S = {
  bairro: BAIRROS[0],
  city: null,
  colorMode: 'ppm',
  outorga: false,
  prem: { ...PREMISSAS, vendaM2: BAIRROS[0].vendaM2 },
  selected: null,
  view: 'iso',
};
const ISO = Math.atan(Math.SQRT2); // 54,7°
const TOP = 0.0001;
const VIEW_H = 560;


// ---------------- renderer / cena ----------------
const host = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
host.appendChild(labels.domElement);
document.body.style.background = 'radial-gradient(ellipse at 50% 30%, #eef2f3 0%, #c9d4d9 60%, #aebcc4 100%)';

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
function frustum() {
  const a = innerWidth / innerHeight;
  camera.left = (-VIEW_H * a) / 2; camera.right = (VIEW_H * a) / 2;
  camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2;
  camera.updateProjectionMatrix();
}
frustum();

scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb0bb, 1.15));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.position.set(-260, 520, 180);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -RAIO * 1.3, right: RAIO * 1.3, top: RAIO * 1.3, bottom: -RAIO * 1.3, near: 10, far: 1600 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.minZoom = 0.6; controls.maxZoom = 14;
controls.zoomToCursor = true;
const CAM_R = 2000;
setPolar(ISO);
placeCamera(new THREE.Vector3(0, 0, 0), ISO, Math.PI / 4, 1.1);

function setPolar(p) { controls.minPolarAngle = p; controls.maxPolarAngle = p; }
function placeCamera(target, polar, az, zoom) {
  const off = new THREE.Vector3().setFromSphericalCoords(CAM_R, polar, az);
  camera.position.copy(target).add(off);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  controls.target.copy(target);
}
controls.addEventListener('change', () => {
  const t = controls.target, lim = RAIO;
  const cx = THREE.MathUtils.clamp(t.x, -lim, lim), cz = THREE.MathUtils.clamp(t.z, -lim, lim);
  if (cx !== t.x || cz !== t.z) { const d = new THREE.Vector3(cx - t.x, 0, cz - t.z); t.add(d); camera.position.add(d); }
});

// ---------------- animação de câmera ----------------
let tween = null;
function flyTo({ target, polar, az, zoom, dur = 1100 }) {
  const from = { target: controls.target.clone(), polar: controls.getPolarAngle(), az: controls.getAzimuthalAngle(), zoom: camera.zoom };
  let dAz = az - from.az; dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
  controls.enabled = false;
  controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
  tween = { t0: performance.now(), dur, from, to: { target, polar, az: from.az + dAz, zoom } };
}
function stepTween(now) {
  if (!tween) return;
  const k = Math.min(1, (now - tween.t0) / tween.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const { from: f, to } = tween;
  const tg = f.target.clone().lerp(to.target, e);
  placeCamera(tg, f.polar + (to.polar - f.polar) * e, f.az + (to.az - f.az) * e, f.zoom + (to.zoom - f.zoom) * e);
  if (k >= 1) {
    setPolar(to.polar);
    controls.enableRotate = S.view === 'iso';
    controls.enabled = true;
    controls.update();
    tween = null;
  }
}

// ---------------- construção da cidade ----------------
let cityGroup = null;
const lotMeshes = [];

const COR = {
  base: 0x6b5a4c, chao: 0xe6e3d6, calcada: 0xd3d0c6, asfalto: 0x565e6b, parque: 0x9fcf86,
  casas: [0xf4efe6, 0xefe5d5, 0xf3e3d3, 0xe8ecef, 0xf6f1ea, 0xe9e2d7],
  torres: [0xdde5ee, 0xe4e9ef, 0xd6dee8, 0xece9e4],
  folhas: [0x6fae5a, 0x5c9d4f, 0x84bf66, 0x4f8f47],
};

function mergeArrays(list) {
  let n = 0; for (const g of list) n += g.pos.length;
  const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n);
  let o = 0; for (const g of list) { pos.set(g.pos, o); nor.set(g.nor, o); col.set(g.col, o); o += g.pos.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function buildBuildings(buildings, rand) {
  const parts = [], c = new THREE.Color();
  for (const b of buildings) {
    const shape = new THREE.Shape(b.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    let g;
    try { g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false }); } catch { continue; }
    g.rotateX(-Math.PI / 2);
    if (g.index) g = g.toNonIndexed();
    const pal = b.h > 14 ? COR.torres : COR.casas;
    c.setHex(pal[Math.floor(rand() * pal.length)]);
    const p = g.attributes.position.array, nr = g.attributes.normal.array, col = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      // telhado levemente mais escuro, base com AO fake
      const roof = nr[i + 1] > 0.9;
      const ao = roof ? 0.93 : 0.82 + 0.18 * Math.min(1, p[i + 1] / 6);
      col[i] = c.r * ao; col[i + 1] = c.g * ao; col[i + 2] = c.b * ao;
    }
    parts.push({ pos: p, nor: nr, col });
    g.dispose();
  }
  if (!parts.length) return new THREE.Group();
  const mesh = new THREE.Mesh(mergeArrays(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function buildRoads(segs) {
  const g = new THREE.Group();
  const layer = (extra, y, color) => {
    const pos = [], idx = [];
    for (const s of segs) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz) || 1;
      const hw = (s.w + extra) / 2, nx = (-dz / L) * hw, nz = (dx / L) * hw;
      const i = pos.length / 3;
      pos.push(s.a[0] + nx, y, s.a[1] + nz, s.b[0] + nx, y, s.b[1] + nz, s.b[0] - nx, y, s.b[1] - nz, s.a[0] - nx, y, s.a[1] - nz);
      idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -y * 4 });
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
    // juntas arredondadas
    const disc = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(disc, mat, segs.length * 2);
    const M = new THREE.Matrix4(); let k = 0;
    for (const s of segs) for (const p of [s.a, s.b]) { const r = (s.w + extra) / 2; M.makeScale(r, 1, r).setPosition(p[0], y - 0.03, p[1]); inst.setMatrixAt(k++, M); }
    g.add(inst);
  };
  layer(5, 0.06, COR.calcada);
  layer(0, 0.14, COR.asfalto);
  return g;
}

function inPoly(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}

function buildParksAndTrees(city, rand) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: COR.parque, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  const spots = [];
  for (const pk of city.parks) {
    const shape = new THREE.Shape(pk.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.position.y = 0.04; m.receiveShadow = true; g.add(m);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const [x, z] of pk.poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const n = Math.min(60, ((maxX - minX) * (maxZ - minZ)) / 260);
    for (let i = 0; i < n; i++) { const p = [minX + rand() * (maxX - minX), minZ + rand() * (maxZ - minZ)]; if (inPoly(p, pk.poly)) spots.push(p); }
  }
  // arborização de calçada
  const lotPolys = city.lots.map(corners);
  const near = (p) => city.buildings.some((b) => Math.abs(b.c[0] - p[0]) < 40 && Math.abs(b.c[1] - p[1]) < 40 && inPoly(p, b.poly));
  for (const s of city.segs) {
    if (s.rank < 1 || s.rank > 3) continue;
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
    for (let t = 8; t < L - 8; t += 16 + rand() * 10) {
      if (rand() < 0.35) continue;
      const side = rand() < 0.5 ? 1 : -1, off = s.w / 2 + 1.6;
      const p = [s.a[0] + (dx * t) / L + (-dz / L) * off * side, s.a[1] + (dz * t) / L + (dx / L) * off * side];
      if (Math.abs(p[0]) > RAIO - 3 || Math.abs(p[1]) > RAIO - 3) continue;
      if (lotPolys.some((lp) => inPoly(p, lp)) || near(p)) continue;
      spots.push(p);
    }
  }
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0);
  const cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), spots.length);
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x7a5c44 }), spots.length);
  const M = new THREE.Matrix4(), c = new THREE.Color();
  spots.forEach((p, i) => {
    const s = 2.2 + rand() * 1.8, h = 2 + rand() * 2;
    M.makeScale(s, s * 1.05, s).setPosition(p[0], h + s * 0.8, p[1]); cm.setMatrixAt(i, M);
    cm.setColorAt(i, c.setHex(COR.folhas[Math.floor(rand() * COR.folhas.length)]));
    M.makeScale(1, h + 0.5, 1).setPosition(p[0], 0, p[1]); tm.setMatrixAt(i, M);
  });
  cm.castShadow = true; tm.castShadow = true;
  g.add(cm, tm);
  return g;
}

// ---------------- lotes ----------------
const ramp = [new THREE.Color(0x22c55e), new THREE.Color(0xfacc15), new THREE.Color(0xef4444)];
function rampColor(t) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t < 0.5 ? ramp[0].clone().lerp(ramp[1], t * 2) : ramp[1].clone().lerp(ramp[2], (t - 0.5) * 2);
}
function lotFrame(lot) {
  // local x = frente (u), local z = profundidade com sinal sz em relação a v
  const th = Math.atan2(-lot.u[1], lot.u[0]);
  const sz = Math.sign(lot.v[0] * -lot.u[1] + lot.v[1] * lot.u[0]) || 1;
  return { th, sz };
}
function viab(lot) { return viabilidade(lot, ZONAS[lot.zona], S.prem, S.outorga); }

function buildLots(lots) {
  const g = new THREE.Group();
  lotMeshes.length = 0;
  for (const lot of lots) {
    const { th } = lotFrame(lot);
    const grp = new THREE.Group();
    grp.position.set(lot.cx, 0, lot.cz);
    grp.rotation.y = th;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(lot.frente, 0.7, lot.fundo), new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.7, emissive: 0x000000 }));
    plate.position.y = 0.35; plate.receiveShadow = true;
    plate.userData.lot = lot;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    edge.position.copy(plate.position);
    // estacas nos cantos — visual de "terreno à venda"
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.4, 5);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set((i * lot.frente) / 2, 1.2, (j * lot.fundo) / 2); pole.castShadow = true; grp.add(pole);
    }
    grp.add(plate, edge);
    const el = document.createElement('div');
    el.className = 'pin';
    el.innerHTML = `<div class="card"><b></b><span></span></div><div class="stem"></div>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); select(lot); });
    el.addEventListener('pointerenter', () => hover(lot)); el.addEventListener('pointerleave', () => hover(null));
    const pin = new CSS2DObject(el);
    pin.position.set(lot.cx, 14, lot.cz);
    g.add(grp, pin);
    lot._plate = plate; lot._pin = el;
    lotMeshes.push(plate);
  }
  return g;
}

function recolor() {
  const lots = S.city.lots;
  const vals = lots.map((l) => (S.colorMode === 'ppm' ? l.ppm : viab(l).margem));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  lots.forEach((l, i) => {
    let t = (vals[i] - lo) / (hi - lo || 1);
    if (S.colorMode === 'margin') t = 1 - t; // margem alta = verde
    const c = rampColor(t);
    l._color = c;
    l._plate.material.color.copy(c);
    l._pin.style.setProperty('--c', '#' + c.getHexString());
    const v = viab(l);
    l._pin.querySelector('b').textContent = brl(l.preco, true);
    l._pin.querySelector('span').textContent = S.colorMode === 'ppm'
      ? `${brl(l.ppm)}/m² · ${num(l.area)} m²`
      : `margem ${num(v.margem, 1)}% · ${v.env.pav} pav`;
  });
  const leg = document.getElementById('legend');
  const fmt = S.colorMode === 'ppm' ? (x) => brl(x) + '/m²' : (x) => num(x, 1) + '%';
  const [a, b] = S.colorMode === 'ppm' ? [lo, hi] : [hi, lo];
  leg.innerHTML = `<b>${S.colorMode === 'ppm' ? 'Preço do terreno por m²' : 'Margem estimada sobre VGV'}</b>
    <div class="scale" style="background:linear-gradient(90deg,#22c55e,#facc15,#ef4444)"></div>
    <div class="ends"><span>${fmt(a)}</span><span>${fmt(b)}</span></div>`;
  renderList();
}

function renderList() {
  const rows = S.city.lots.map((l) => ({ l, v: viab(l) })).sort((a, b) => b.v.margem - a.v.margem);
  document.getElementById('count').textContent = `· ${rows.length} terrenos`;
  const ol = document.getElementById('lotList');
  ol.innerHTML = '';
  for (const { l, v } of rows) {
    const li = document.createElement('li');
    if (S.selected === l) li.className = 'on';
    const col = v.margem >= 18 ? 'var(--accent)' : v.margem >= 8 ? 'var(--warn)' : 'var(--bad)';
    li.innerHTML = `<span class="t">${l.rua}, ${l.numero}</span><span class="m" style="color:${col}">${num(v.margem, 1)}%</span>
      <span class="s">${brl(l.preco, true)} · ${num(l.area)} m² · ${l.zona}</span>`;
    li.onclick = () => select(l);
    li.onmouseenter = () => hover(l); li.onmouseleave = () => hover(null);
    ol.appendChild(li);
  }
}

// ---------------- hover / seleção ----------------
let hovered = null;
function hover(lot) {
  if (hovered && hovered !== S.selected) { hovered._plate.material.emissive.setHex(0); hovered._pin.classList.remove('hover'); }
  hovered = lot;
  if (lot) { lot._plate.material.emissive.setHex(0x333333); lot._pin.classList.add('hover'); }
  renderer.domElement.style.cursor = lot ? 'pointer' : '';
}

let selGroup = null;
function buildEnvelope(lot) {
  if (selGroup) { selGroup.parent?.remove(selGroup); selGroup.traverse((o) => o.element?.remove()); }
  const v = viab(lot), env = v.env;
  const { th, sz } = lotFrame(lot);
  const g = new THREE.Group();
  g.position.set(lot.cx, 0, lot.cz); g.rotation.y = th;
  // centro da projeção: recuo frontal a partir da frente (lado -v)
  const zc = (-lot.fundo / 2 + env.recF + env.d / 2) * sz;
  // área de recuos hachurada (contorno)
  const pts = [[-env.w / 2, -env.d / 2], [env.w / 2, -env.d / 2], [env.w / 2, env.d / 2], [-env.w / 2, env.d / 2], [-env.w / 2, -env.d / 2]]
    .map(([x, z]) => new THREE.Vector3(x, 0.75, z + zc));
  const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x1d4ed8, dashSize: 1.2, gapSize: 0.8 }));
  outline.computeLineDistances(); g.add(outline);
  // volume edificável
  const H = env.altura;
  const box = new THREE.Mesh(new THREE.BoxGeometry(env.w, H, env.d), new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.28, depthWrite: false }));
  box.position.set(0, 0.7 + H / 2, zc); g.add(box);
  const fl = [];
  for (let i = 0; i <= env.pav; i++) {
    const y = 0.7 + i * 3, x = env.w / 2, z = env.d / 2;
    fl.push(-x, y, zc - z, x, y, zc - z, x, y, zc - z, x, y, zc + z, x, y, zc + z, -x, y, zc + z, -x, y, zc + z, -x, y, zc - z);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) fl.push((x * env.w) / 2, 0.7, zc + (z * env.d) / 2, (x * env.w) / 2, 0.7 + H, zc + (z * env.d) / 2);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1e40af, transparent: true, opacity: 0.7 })));
  // cotas
  const dim = (txt, x, y, z, cls = '') => { const el = document.createElement('div'); el.className = 'dim ' + cls; el.textContent = txt; const o = new CSS2DObject(el); o.position.set(x, y, z); g.add(o); };
  dim(`frente ${num(lot.frente, 1)} m`, 0, 1, (-lot.fundo / 2 - 3) * sz);
  dim(`${num(lot.fundo, 1)} m`, lot.frente / 2 + 4, 1, 0);
  dim(`${env.pav} pav · ${num(H)} m · ${num(env.projecao)} m² proj.`, 0, H + 3, zc, 'env');
  dim(`recuo ${num(env.recF)} m`, 0, 1, (-lot.fundo / 2 + env.recF / 2) * sz);
  scene.add(g);
  selGroup = g;
}

function select(lot) {
  if (tween) return;
  hover(null);
  if (S.selected && S.selected !== lot) S.selected._plate.material.emissive.setHex(0);
  S.selected = lot;
  S.view = 'top';
  document.body.classList.add('selected');
  lot._plate.material.emissive.setHex(0x1a1a1a);
  buildEnvelope(lot);
  renderDetail();
  renderList();
  flyTop(lot);
}
function lotTarget(lot, zoom) {
  const right = new THREE.Vector3(-lot.v[1], 0, lot.v[0]);
  const wpp = VIEW_H / zoom / innerHeight;
  const shift = innerWidth > 900 ? (380 / 2) * wpp : 0;
  return new THREE.Vector3(lot.cx, 0, lot.cz).addScaledVector(right, shift);
}
function flyTop(lot) {
  const zoom = Math.min(12, VIEW_H / (Math.max(lot.frente, lot.fundo) * 2.6));
  flyTo({ target: lotTarget(lot, zoom), polar: TOP, az: Math.atan2(-lot.v[0], -lot.v[1]), zoom });
}
function fly3D(lot) {
  const zoom = Math.min(10, VIEW_H / (Math.max(lot.frente, lot.fundo, viab(lot).env.altura) * 3.2));
  flyTo({ target: lotTarget(lot, zoom), polar: 1.0, az: Math.atan2(-lot.v[0], -lot.v[1]) + 0.5, zoom });
}
function deselect() {
  if (!S.selected || tween) return;
  const lot = S.selected;
  lot._plate.material.emissive.setHex(0);
  S.selected = null; S.view = 'iso';
  if (selGroup) { scene.remove(selGroup); selGroup.traverse((o) => o.element?.remove()); selGroup = null; }
  document.body.classList.remove('selected');
  document.getElementById('detail').classList.add('hidden');
  renderList();
  flyTo({ target: new THREE.Vector3(lot.cx, 0, lot.cz), polar: ISO, az: Math.PI / 4, zoom: 1.6 });
}
document.getElementById('back').onclick = deselect;
addEventListener('keydown', (e) => { if (e.key === 'Escape') deselect(); });

// ---------------- painel de detalhe ----------------
function renderDetail() {
  const lot = S.selected; if (!lot) return;
  const z = ZONAS[lot.zona];
  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <div class="d-head">
      <span class="zone-chip">${lot.zona} · ${z.nome}</span>
      <h2>${lot.rua}, ${lot.numero}</h2>
      <p>${S.bairro.nome}, Curitiba · anúncio simulado #${lot.id} · ${lot.diasAnunciado} dias no mercado</p>
    </div>
    <div class="price"><b>${brl(lot.preco)}</b><span>${brl(lot.ppm)}/m²</span></div>
    <div class="grid">
      <div class="kpi"><small>Área do terreno</small><b>${num(lot.area)} m²</b></div>
      <div class="kpi"><small>Testada × fundo</small><b>${num(lot.frente)} × ${num(lot.fundo)} m</b></div>
      <div class="kpi"><small>Situação</small><b>${lot.casaExistente ? 'Casa a demolir' : 'Vago'}</b></div>
      <div class="kpi"><small>Pavimentos possíveis</small><b id="kPav">–</b></div>
    </div>
    <div class="sec"><h4>Zoneamento (simulado)</h4>
      <table class="params">
        <tr><td>Coeficiente de aproveitamento</td><td>${num(z.ca, 1)} (até ${num(z.caMax, 1)} c/ outorga)</td></tr>
        <tr><td>Altura máxima</td><td>${z.altura} pavimentos</td></tr>
        <tr><td>Taxa de ocupação</td><td>${num(z.to * 100)}%</td></tr>
        <tr><td>Recuo frontal</td><td>${z.recuoFrontal} m</td></tr>
        <tr><td>Usos</td><td>${z.usos}</td></tr>
      </table>
    </div>
    <div class="sec"><h4>Potencial construtivo</h4>
      <div class="grid" style="margin:0">
        <div class="kpi"><small>Área computável</small><b id="kComp">–</b></div>
        <div class="kpi"><small>Área privativa vendável</small><b id="kPriv">–</b></div>
        <div class="kpi"><small>Projeção (térreo)</small><b id="kProj">–</b></div>
        <div class="kpi"><small>Área construída total</small><b id="kConst">–</b></div>
      </div>
      <button class="back" id="toggleView" style="margin:10px 0 0;width:100%">Ver volume em 3D</button>
    </div>
    <div class="sec"><h4>Premissas do estudo</h4>
      <div class="inputs">
        <label>Preço de venda (R$/m² privativo)<input type="number" data-k="vendaM2" step="100" value="${S.prem.vendaM2}"></label>
        <label>Custo de obra (R$/m² construído)<input type="number" data-k="custoObraM2" step="50" value="${S.prem.custoObraM2}"></label>
        <label>Despesas (% do VGV)<input type="number" data-k="despesasPct" step="0.5" value="${S.prem.despesasPct}"></label>
        <label>Margem alvo (%)<input type="number" data-k="margemAlvo" step="1" value="${S.prem.margemAlvo}"></label>
        <label class="chk"><input type="checkbox" id="outorga" ${S.outorga ? 'checked' : ''}> Comprar outorga onerosa (CA máx.)</label>
      </div>
    </div>
    <div class="sec"><h4>Resultado</h4><div class="verdict" id="verdict"></div></div>
    <div class="disclaimer">⚠️ Protótipo. Zoneamento, preços e anúncios são <b>simulados</b>. Mapa: © colaboradores do OpenStreetMap. Antes de qualquer decisão, confirme parâmetros na Guia Amarela (Consulta Informativa de Lote) da Prefeitura de Curitiba.</div>`;
  body.querySelectorAll('input[data-k]').forEach((inp) => (inp.oninput = () => { const v = parseFloat(inp.value); if (!isNaN(v)) { S.prem[inp.dataset.k] = v; updateResults(true); } }));
  body.querySelector('#outorga').onchange = (e) => { S.outorga = e.target.checked; buildEnvelope(lot); updateResults(true); };
  body.querySelector('#toggleView').onclick = (e) => {
    if (tween) return;
    if (S.view === 'top') { S.view = 'vol'; fly3D(lot); e.target.textContent = 'Vista superior'; }
    else { S.view = 'top'; flyTop(lot); e.target.textContent = 'Ver volume em 3D'; }
  };
  document.getElementById('detail').classList.remove('hidden');
  updateResults(false);
}

function updateResults(recolorAll) {
  const lot = S.selected; if (!lot) return;
  const v = viab(lot);
  const $ = (id) => document.getElementById(id);
  $('kPav').textContent = `${v.env.pav} (${num(v.env.altura)} m)`;
  $('kComp').textContent = `${num(v.env.computavel)} m²`;
  $('kPriv').textContent = `${num(v.privativa)} m²`;
  $('kProj').textContent = `${num(v.env.projecao)} m²`;
  $('kConst').textContent = `${num(v.construida)} m²`;
  const cls = v.margem >= S.prem.margemAlvo ? 'ok' : v.margem >= S.prem.margemAlvo / 2 ? 'mid' : 'bad';
  const lbl = { ok: 'Viável', mid: 'Marginal', bad: 'Inviável' }[cls];
  const barCol = { ok: 'var(--accent)', mid: 'var(--warn)', bad: 'var(--bad)' }[cls];
  const gap = v.terrenoMax - lot.preco;
  $('verdict').innerHTML = `
    <div class="row"><span>VGV estimado</span><b>${brl(v.vgv)}</b></div>
    <div class="row"><span>Custo de obra</span><b>− ${brl(v.obra)}</b></div>
    <div class="row"><span>Despesas (vendas, impostos, projetos)</span><b>− ${brl(v.despesas)}</b></div>
    <div class="row"><span>Terreno + ITBI/cartório</span><b>− ${brl(v.terreno)}</b></div>
    ${v.outorga ? `<div class="row"><span>Outorga onerosa</span><b>− ${brl(v.outorga)}</b></div>` : ''}
    <div class="row"><span>Lucro</span><b style="color:${barCol}">${brl(v.lucro)}</b></div>
    <div class="big"><div><small style="color:var(--muted)">Margem sobre VGV</small><br><b>${num(v.margem, 1)}%</b></div><span class="tag ${cls}">${lbl}</span></div>
    <div class="bar"><i style="width:${THREE.MathUtils.clamp(v.margem / 40, 0, 1) * 100}%;background:${barCol}"></i></div>
    <div class="row" style="margin-top:10px"><span>Preço máx. do terreno p/ ${num(S.prem.margemAlvo)}%</span><b>${brl(Math.max(0, v.terrenoMax))}</b></div>
    <div class="row"><span>${gap >= 0 ? 'Folga na negociação' : 'Desconto necessário'}</span><b style="color:${gap >= 0 ? 'var(--accent)' : 'var(--bad)'}">${brl(Math.abs(gap))} (${num((Math.abs(gap) / lot.preco) * 100, 1)}%)</b></div>`;
  if (recolorAll) { buildEnvelope(lot); recolor(); }
}

// ---------------- picking ----------------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let down = null;
function pick(e) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(lotMeshes, false)[0];
  return hit?.object.userData.lot || null;
}
renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || e.button !== 0) return;
  const lot = pick(e);
  if (lot) select(lot);
});
renderer.domElement.addEventListener('pointermove', (e) => { if (e.buttons) return; const l = pick(e); if (l !== hovered) hover(l); });

// ---------------- carregamento ----------------
async function load(b) {
  const loader = document.getElementById('loader');
  loader.classList.remove('done');
  if (S.selected) { S.selected = null; document.body.classList.remove('selected'); document.getElementById('detail').classList.add('hidden'); }
  if (selGroup) { scene.remove(selGroup); selGroup.traverse((o) => o.element?.remove()); selGroup = null; }
  if (cityGroup) { scene.remove(cityGroup); cityGroup.traverse((o) => { o.geometry?.dispose(); o.element?.remove(); }); }
  S.bairro = b; S.prem.vendaM2 = b.vendaM2;
  const city = await carregarCidade(b, (t) => (document.getElementById('loaderText').textContent = t));
  try { montarCena(b, city); } catch (e) {
    console.error(e);
    document.getElementById('loaderText').textContent = 'Erro ao montar a cena: ' + e.message;
    return;
  }
  loader.classList.add('done');
}

function montarCena(b, city) {
  S.city = city;
  const rand = rng(b.id + '-viz');
  cityGroup = new THREE.Group();
  // base do diorama
  const R = RAIO;
  const base = new THREE.Mesh(new THREE.BoxGeometry(2 * R + 10, 18, 2 * R + 10), [
    new THREE.MeshStandardMaterial({ color: COR.base }), new THREE.MeshStandardMaterial({ color: COR.base }),
    new THREE.MeshStandardMaterial({ color: COR.chao, roughness: 1 }), new THREE.MeshStandardMaterial({ color: COR.base }),
    new THREE.MeshStandardMaterial({ color: COR.base }), new THREE.MeshStandardMaterial({ color: COR.base }),
  ]);
  base.position.y = -9; base.receiveShadow = true;
  const grass = new THREE.Mesh(new THREE.BoxGeometry(2 * R + 10, 2.5, 2 * R + 10), new THREE.MeshStandardMaterial({ color: 0x8fbf74 }));
  grass.position.y = -1.3;
  cityGroup.add(base, grass);
  cityGroup.add(buildRoads(city.segs));
  cityGroup.add(buildParksAndTrees(city, rand));
  cityGroup.add(buildBuildings(city.buildings, rand));
  cityGroup.add(buildLots(city.lots));
  scene.add(cityGroup);
  recolor();
  const st = document.getElementById('status');
  st.className = 'badge ' + (city.fonte === 'osm' ? 'live' : 'demo');
  st.innerHTML = city.fonte === 'osm' ? '● OSM ao vivo · © OpenStreetMap' : '● Modo demo (OSM indisponível)';
  S.view = 'iso';
  controls.enableRotate = true;
  setPolar(ISO);
  placeCamera(new THREE.Vector3(0, 0, 0), ISO, Math.PI / 4, 1.1);
}

const sel = document.getElementById('bairro');
for (const b of BAIRROS) sel.add(new Option(b.nome, b.id));
sel.onchange = () => load(BAIRROS.find((b) => b.id === sel.value));
document.querySelectorAll('#colorMode button').forEach((btn) => (btn.onclick = () => {
  document.querySelectorAll('#colorMode button').forEach((x) => x.classList.toggle('on', x === btn));
  S.colorMode = btn.dataset.mode; recolor();
}));

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); frustum(); });

renderer.setAnimationLoop((now) => {
  stepTween(now);
  if (!tween) controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

load(S.bairro);
window.__terra = S; // debug
