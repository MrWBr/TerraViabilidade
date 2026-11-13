// Parâmetros de mercado e zoneamento — TODOS ILUSTRATIVOS para o protótipo.
// Em produção: zoneamento via GeoCuritiba / Guia Amarela (Consulta Informativa de Lote),
// preços via integração com portais/parceiros, custo de obra via CUB-PR (Sinduscon-PR).

export const BAIRROS = [
  { id: 'agua-verde', nome: 'Água Verde',       lat: -25.4489, lon: -49.2859, terrenoM2: 4200, vendaM2: 10500 },
  { id: 'batel',      nome: 'Batel',            lat: -25.4420, lon: -49.2905, terrenoM2: 6500, vendaM2: 14000 },
  { id: 'ecoville',   nome: 'Ecoville (Mossunguê)', lat: -25.4380, lon: -49.3375, terrenoM2: 3800, vendaM2: 11500 },
  { id: 'portao',     nome: 'Portão',           lat: -25.4757, lon: -49.2932, terrenoM2: 2900, vendaM2: 8000 },
  { id: 'cabral',     nome: 'Cabral',           lat: -25.4105, lon: -49.2585, terrenoM2: 3600, vendaM2: 9800 },
];

// Zonas simplificadas inspiradas na Lei 15.511/2019 (Curitiba). Números aproximados p/ demonstração.
export const ZONAS = {
  'ZR-2': { nome: 'Zona Residencial 2', ca: 1.0, caMax: 1.0, altura: 2, to: 0.5, recuoFrontal: 5, usos: 'Residencial unifamiliar' },
  'ZR-3': { nome: 'Zona Residencial 3', ca: 1.0, caMax: 1.5, altura: 3, to: 0.5, recuoFrontal: 5, usos: 'Residencial uni/multifamiliar' },
  'ZR-4': { nome: 'Zona Residencial 4', ca: 2.0, caMax: 3.0, altura: 6, to: 0.5, recuoFrontal: 5, usos: 'Multifamiliar, comércio vicinal' },
  'ZUM':  { nome: 'Zona de Uso Misto',  ca: 2.0, caMax: 3.0, altura: 8, to: 0.6, recuoFrontal: 5, usos: 'Misto residencial/comercial' },
  'EE':   { nome: 'Eixo Estrutural',    ca: 4.0, caMax: 5.0, altura: 30, to: 0.5, recuoFrontal: 5, usos: 'Alta densidade, misto' },
};

export const PREMISSAS = {
  custoObraM2: 2900,     // R$/m² construído médio (CUB-PR + extras; garagem puxa a média p/ baixo) — ilustrativo
  fatorConstruida: 1.45, // área construída total / área computável (garagens, áreas comuns)
  fatorPrivativa: 0.92,  // área privativa vendável / área computável
  despesasPct: 16,       // corretagem, RET, marketing, projetos, aprovação (% do VGV)
  itbiPct: 3.0,          // ITBI + cartório (% do terreno)
  outorgaFator: 0.6,     // custo da outorga por m² adicional, como fração do R$/m² do terreno
  margemAlvo: 20,
};

// RNG determinístico
export function rng(seed) {
  let a = 0;
  for (const c of String(seed)) a = (a * 31 + c.charCodeAt(0)) | 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Envoltória: recuos + taxa de ocupação + altura → pavimentos possíveis
export function envoltoria(lot, zona, usarOutorga) {
  const ca = usarOutorga ? zona.caMax : zona.ca;
  const computavel = lot.area * ca;
  const recF = zona.recuoFrontal;
  // recuo lateral/fundos simplificado: 0 até 2 pav, H/6 (mín 2,5 m) acima
  const pavAlvo = Math.min(zona.altura, Math.max(1, Math.ceil(computavel / (lot.area * zona.to))));
  const recL = pavAlvo <= 2 ? 0 : Math.max(2.5, (pavAlvo * 3) / 6);
  let w = Math.max(4, lot.frente - 2 * recL);
  let d = Math.max(4, lot.fundo - recF - recL);
  const maxProj = lot.area * zona.to;
  if (w * d > maxProj) { const k = Math.sqrt(maxProj / (w * d)); w *= k; d *= k; }
  const projecao = w * d;
  const pav = Math.min(zona.altura, Math.max(1, Math.ceil(computavel / projecao)));
  const computavelReal = Math.min(computavel, projecao * pav);
  return { ca, computavel: computavelReal, projecao, pav, w, d, recF, recL, altura: pav * 3 };
}

export function viabilidade(lot, zona, p, usarOutorga) {
  const env = envoltoria(lot, zona, usarOutorga);
  const privativa = env.computavel * p.fatorPrivativa;
  const construida = env.computavel * p.fatorConstruida;
  const vgv = privativa * p.vendaM2;
  const obra = construida * p.custoObraM2;
  const despesas = vgv * p.despesasPct / 100;
  const terreno = lot.preco * (1 + p.itbiPct / 100);
  const outorga = usarOutorga ? Math.max(0, env.computavel - lot.area * zona.ca) * lot.ppm * p.outorgaFator : 0;
  const custo = obra + despesas + terreno + outorga;
  const lucro = vgv - custo;
  const margem = vgv > 0 ? (lucro / vgv) * 100 : -100;
  // método residual: quanto se poderia pagar no terreno para atingir a margem alvo
  const terrenoMax = (vgv * (1 - p.margemAlvo / 100) - obra - despesas - outorga) / (1 + p.itbiPct / 100);
  return { env, privativa, construida, vgv, obra, despesas, terreno, outorga, custo, lucro, margem, terrenoMax };
}

export const brl = (v, compact = false) => {
  if (compact) {
    const a = Math.abs(v);
    if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
    if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  }
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};
export const num = (v, d = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
