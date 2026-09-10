---
name: nova-peca
description: Roteiro para criar uma peça nova do zero (sem HTML de origem) no formato do EditorHtml. Use quando o usuário pedir "cria uma peça nova", "monta um cartaz do zero", "quero um post novo pra editar no editor" — sem um documento HTML existente para converter.
---

# Criar uma peça nova

## Quando usar

- Não existe HTML de origem — é criação do zero. Se existir um HTML pronto que
  o usuário quer trazer para cá, use a skill `converter-html` em vez desta.
- Usuário descreveu o que quer em palavras ("um cartaz com título, uma foto e
  um texto de apoio") e espera que você monte a declaração inicial pra editar
  visualmente depois.

## O que você precisa decidir antes de escrever

1. **Tamanho nativo (`w`, `h`)** — pergunte se o usuário não disse. Não
   assuma um formato de rede social por padrão; peça o tamanho ou o uso
   (impresso? tela? qual proporção?).
2. **Quantas camadas e de que tipo** — o núcleo só tem 4 tipos:
   - `tt` — o título/headline
   - `tx` — texto de apoio/corpo
   - `obj` — imagem
   - `reserva` — espaço marcado pra preencher depois (útil quando o usuário
     ainda não tem a imagem final, mas já sabe onde ela vai)
3. **Composição** — pense em porcentagem de área do nativo, não pixel fixo.
   Margens de leitura confortáveis: comece com ~6% de respiro nas bordas
   laterais, a menos que o usuário peça sangria total.

## Passo a passo

1. Confirme `w`/`h` e o propósito da peça com o usuário.
2. Esboce a composição em texto antes de escrever código — liste as camadas,
   tipo, posição aproximada, ordem de pintura (`z`).
3. Escreva o arquivo em `pecas/<nome>.js`:
   ```js
   module.exports = { pecas: [
     { slug: '<slug-unico>', n: '<Nome legível>', w: <largura>, h: <altura>, L: [
       { t: 'tt', tx: '<título>', s: <tamanho-px>, box: [x, y, largura, null], z: 1 },
       { t: 'tx', tx: '<apoio>',  s: <tamanho-px>, box: [x, y, largura, null], z: 2 },
       { t: 'reserva', box: [x, y, largura, altura], z: 3 },
     ]},
   ]};
   ```
4. Use `altura: null` em `tt`/`tx` sempre que o texto deve crescer com o
   conteúdo. Só fixe altura numérica quando o elemento realmente tem tamanho
   rígido (imagem, vão reservado).
5. Depois de escrever, use a skill `abrir-editor` para subir o editor
   (`npx editorhtml abrir pecas/<nome>.js`) e mostrar o resultado — o ajuste
   fino de posição é trabalho de mouse do usuário, não seu.

## O que não fazer

- Não invente tipo de camada fora dos 4 do núcleo torcendo pra funcionar —
  se o usuário quer algo que só um tema resolveria (paleta, marca, ícone
  decorativo), diga que isso depende de um tema instalado (`temas/`) e que
  sem ele a peça abre com os 4 tipos básicos apenas.
- Não chute tamanho de fonte ou posição "porque parece certo" sem o usuário
  ter dado nenhuma pista de hierarquia — pergunte o que é mais importante na
  peça (o título? a imagem?) e deixe isso guiar `s` e ordem de leitura.
