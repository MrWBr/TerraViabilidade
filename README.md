# Terra · Viabilidade Imobiliária (protótipo)

Mapa isométrico 3D de bairros de Curitiba com terrenos à venda, parâmetros de zoneamento e estudo de viabilidade (método residual) por lote.

- **Mapa:** ruas, edificações e parques reais do OpenStreetMap (Overpass API), carregados no navegador. Se a API estiver fora, cai num bairro procedural (modo demo).
- **Terrenos, preços e zoneamento:** *simulados* para demonstração.
- **Clique num terreno:** a câmera vai para vista superior, mostra recuos, projeção e o volume máximo edificável; a barra lateral traz zoneamento, potencial construtivo e a conta de viabilidade com premissas editáveis.

Sem build: HTML + ES modules + Three.js (vendorizado em `vendor/`). Para rodar local: `python3 -m http.server` e abrir `http://localhost:8000`.

## Próximos passos (produto real)
1. Zoneamento real: camadas do GeoCuritiba (zoneamento, lotes fiscais) + Guia Amarela por indicação fiscal.
2. Anúncios: parcerias/feeds de imobiliárias ou APIs licenciadas (scraping de portais costuma violar os termos de uso).
3. Custo de obra atrelado ao CUB-PR mensal; preço de venda por lançamentos comparáveis.
4. Backend com cache dos dados e conta de usuário (SaaS).

Mapa © colaboradores do OpenStreetMap (ODbL).
