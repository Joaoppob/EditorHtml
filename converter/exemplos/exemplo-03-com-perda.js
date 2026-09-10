// Convertido de exemplo-03-com-perda.html em 2026-09-10.
// PERDAS DECLARADAS:
// - fundo gradiente (linear-gradient 135deg, #3a6ea5 → #e8823c) não convertido —
//   nenhum tipo núcleo representa fundo; sem tema instalado, o editor abre com
//   fundo branco. Promover isso a uma camada `obj` cobrindo a tela toda é uma
//   opção, mas não foi feita aqui de propósito, para este exemplo servir de
//   prova de que perda declarada reduz o número de fidelidade medido, em vez
//   de ser escondida.
// - cor de texto customizada (#ffffff) não convertida — os tipos núcleo `tt`/`tx`
//   não têm campo de cor no formato mínimo (ver CLAUDE.md); a cor no editor sem
//   tema é a cor padrão do renderizador.
// ESPERADO: fidelidade medida aqui deve ser sensivelmente mais baixa que os
// exemplos 01 e 02 — isso é o comportamento CORRETO da prova, não um bug.
module.exports = { pecas: [
  { slug: 'exemplo-03', n: 'Com fundo gradiente (perda proposital)', w: 700, h: 500, L: [
    { t: 'tt', tx: 'Peça com fundo gradiente', s: 52, box: [5.71, 12, 88.57, null], z: 1 },
    { t: 'tx', tx: 'Este exemplo tem um fundo que o conversor não sabe representar — vira perda declarada, não é fingido.', s: 22, box: [5.71, 44, 80, null], z: 2 },
  ]},
]};
