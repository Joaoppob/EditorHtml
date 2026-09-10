// Convertido de exemplo-01-simples.html em 2026-09-10.
// PERDAS DECLARADAS:
// - nenhuma: o documento de teste usa só texto plano e uma imagem, sem fundo
//   complexo, sombra, fonte customizada ou elemento fora dos 4 tipos núcleo.
//   (peça de fixture pra provar o comparador — não é um caso real de conversão)
module.exports = { pecas: [
  { slug: 'exemplo-01', n: 'Exemplo simples', w: 800, h: 600, L: [
    { t: 'tt', tx: 'Exemplo de peça simples', s: 56, box: [6, 10, 88, null], z: 1 },
    { t: 'tx', tx: 'Documento HTML de teste para a prova de fidelidade do conversor.', s: 24, box: [6, 40, 82, null], z: 2 },
    { t: 'obj', src: './fixture-imagem.png', box: [6, 60, 30, 26.67], z: 3 },
  ]},
]};
