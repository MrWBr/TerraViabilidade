// Terrenos reais — curadoria manual de anúncios públicos (coleta em 12/11/2026).
// Apenas dados factuais do anúncio: endereço, preço pedido, área, medidas e zona quando informadas.
// Sem fotos, sem nome/contato de anunciante. Coordenadas: Nominatim (© OpenStreetMap).
// precisao: 'numero' = geocodificado no número; 'rua' = só a rua foi encontrada (posição aproximada).

export const COLETA = '12/11/2026';

export const TERRENOS_REAIS = {
  'agua-verde-real': [
    { rua: 'Rua Goiás', numero: 475, lat: -25.4659384, lon: -49.2866181, precisao: 'numero',
      preco: 1199000, area: 429, frente: 11, fundo: 39, zonaAnuncio: 'ZR4',
      fonte: 'Viva Real', url: 'https://www.vivareal.com.br/imovel/lote-terreno-agua-verde-bairros-curitiba-429m2-venda-RS1199000-id-2807746157/' },
    { rua: 'Rua Silveira Peixoto', numero: 765, lat: -25.4468972, lon: -49.2847833, precisao: 'numero',
      preco: 2700000, area: 540, frente: 18, fundo: 30, zonaAnuncio: 'ZR4',
      fonte: 'Viva Real', url: 'https://www.vivareal.com.br/imovel/lote-terreno-agua-verde-bairros-curitiba-540m2-venda-RS2500000-id-2870368006/' },
    { rua: 'Rua Otávio Francisco Dias', numero: 771, lat: -25.4601085, lon: -49.2780024, precisao: 'numero',
      preco: 1450000, area: 669.5, frente: 13, fundo: 51.5, zonaAnuncio: 'ZR4.1',
      fonte: 'Viva Real', url: 'https://www.vivareal.com.br/imovel/lote-terreno-agua-verde-bairros-curitiba-670m2-venda-RS1450000-id-2698215463/' },
    { rua: 'Rua Coronel Dulcídio', numero: 1947, lat: -25.4487694, lon: -49.2783799, precisao: 'rua',
      preco: 2300000, area: 550, frente: 11, fundo: 50, zonaAnuncio: 'ZR4', obs: 'Anúncio cita testada 11 m e laterais 55 m; usada a área informada.',
      fonte: 'Imovelweb', url: 'https://www.imovelweb.com.br/terrenos-agua-verde-curitiba.html' },
    { rua: 'Rua Rio de Janeiro', numero: 1400, lat: -25.4637626, lon: -49.2776140, precisao: 'numero',
      preco: 920000, area: 361, zonaAnuncio: 'ZR3',
      fonte: 'Imovelweb', url: 'https://www.imovelweb.com.br/terrenos-agua-verde-curitiba.html' },
    { rua: 'Rua Samuel Cézar', numero: 837, lat: -25.4576746, lon: -49.2800869, precisao: 'numero',
      preco: 1100000, area: 416,
      fonte: 'Imovelweb', url: 'https://www.imovelweb.com.br/terrenos-agua-verde-curitiba.html' },
    { rua: 'Rua Otávio Francisco Dias', numero: 269, lat: -25.4559434, lon: -49.2761045, precisao: 'numero',
      preco: 1420000, area: 537,
      fonte: 'Imovelweb', url: 'https://www.imovelweb.com.br/terrenos-venda-agua-verde-curitiba-perto-de-iw-drakkar-beer-food-rua-chile-2067.html' },
    { rua: 'Rua Francisco Negrão', numero: 775, lat: -25.4572966, lon: -49.2740548, precisao: 'numero',
      preco: 2800000, area: 1775,
      fonte: 'Viva Real', url: 'https://www.vivareal.com.br/imovel/lote-terreno-agua-verde-bairros-curitiba-1775m2-venda-RS2800000-id-2432929521/' },
    { rua: 'Rua Marquês do Paraná', numero: 397, lat: -25.4573372, lon: -49.2849750, precisao: 'numero',
      preco: 2500000, area: 563, frente: 16, fundo: 35.2, zonaAnuncio: 'ZR4', situacao: 'Esquina, com casa',
      obs: 'Esquina com a Rua José Cadilhe (34 m de frente para ela). Anunciado como casa; vendido pelo terreno.',
      fonte: 'Viva Real', url: 'https://www.vivareal.com.br/imovel/casa-3-quartos-agua-verde-bairros-curitiba-com-garagem-283m2-venda-RS2500000-id-2884863382/' },
    { rua: 'Rua Alferes Ângelo Sampaio', numero: 210, lat: -25.4513112, lon: -49.2784991, precisao: 'numero',
      preco: 2200000, area: 757,
      fonte: 'Imovelweb / Wimoveis', url: 'https://www.imovelweb.com.br/terrenos-agua-verde-curitiba.html' },
  ],
};
