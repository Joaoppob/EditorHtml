---
name: converter-html
description: Roteiro para ler um documento HTML pronto (feito por outro agente ou ferramenta) e escrever a declaração de peça do EditorHtml. Use quando o usuário disser "converte esse HTML pra editor", "transforma essa página numa peça editável", ou trouxer um .html que quer abrir no editor de mouse.
---

# Converter HTML para declaração de peça

## O que este roteiro faz

**Você é o parser.** Não existe ferramenta automática que lê o HTML e cospe a
declaração — você olha o documento (estrutura, CSS computado, texto, imagens)
e escreve, à mão, o arquivo `.js` no formato descrito no `CLAUDE.md` da raiz.
Esta skill é o roteiro de como fazer isso sem inventar.

**O núcleo do editor conhece 4 tipos: `tt` (título), `tx` (texto), `obj`
(imagem), `reserva` (vão). Nada além disso.** Qualquer elemento visual que não
seja um desses 4 é, por padrão, **perda** — você declara que ficou de fora,
nunca finge que converteu.

## Quando usar

- Usuário trouxe um `.html` pronto e quer editá-lo no EditorHtml.
- Outro agente (ex: gerou um cartaz, slide, post em HTML/CSS puro) e o
  resultado precisa virar peça editável por mouse.

## Passo a passo

### 1. Ache o tamanho nativo

A peça precisa de `w`/`h` fixos em pixels — é o "papel" dela. Procure:
- Um contêiner raiz com `width`/`height` fixos em CSS (não `100%`, não `auto`).
- Um `viewport` ou comentário que declare o tamanho de exportação.

**Se não tiver tamanho fixo em lugar nenhum** (documento fluido, responsivo,
sem âncora de pixel) — **pare e pergunte ao usuário** qual tamanho usar. Não
adivinhe 1080×1350 porque é comum; isso é inventar dado.

### 2. Levante a posição de cada elemento visual

Para cada elemento que carrega conteúdo (texto ou imagem), você precisa da
caixa dele em pixels relativos ao contêiner nativo: `left`, `top`, `width`,
`height`.

- Se você tem acesso a navegador (camofox, Chrome, qualquer ferramenta de
  screenshot/DOM): renderize o HTML e leia `getBoundingClientRect()` de cada
  elemento — é o jeito mais confiável.
- Se não tem: leia o CSS diretamente (`left`/`top`/`width`/`height`,
  ou `margin`+`padding` acumulados se for fluxo normal) e calcule a mão. Se o
  cálculo depender de comportamento de layout que você não consegue simular
  com segurança (flexbox com `flex-grow`, grid implícito, texto que
  quebra linha de um jeito que só o navegador sabe) — declare como perda em
  vez de chutar um número.

### 3. Converta pixel → porcentagem

```
box[0] = round(left_px   / w_nativo * 100, 2)   // x
box[1] = round(top_px    / h_nativo * 100, 2)   // y
box[2] = round(width_px  / w_nativo * 100, 2)   // largura
box[3] = round(height_px / h_nativo * 100, 2)   // altura — ou null se for auto
```

Use `altura: null` quando o elemento é texto que deveria crescer com o
conteúdo (o comportamento natural de `tt`/`tx`) em vez de forçar um número que
you mediu numa renderização específica e pode não valer depois de editado.

### 4. Classifique cada elemento nos 4 tipos núcleo

| Se o elemento é... | Tipo |
|---|---|
| Texto grande, hierarquia de título/headline | `tt` |
| Texto de apoio, corpo, legenda | `tx` |
| `<img>`, `<picture>`, ou `background-image` promovido a camada própria | `obj` |
| Área vazia/reservada, placeholder sem conteúdo final ainda | `reserva` |

`z` é a ordem de pintura — normalmente a ordem do DOM (elementos depois no
HTML pintam por cima), a menos que `z-index` explícito diga o contrário.

`s` (tamanho de fonte, para `tt`/`tx`) vem do `font-size` computado, em px.

### 5. O que NÃO converte — declare a perda, não finja

Nunca invente um tipo de tema (`kk`, `campo`, `fil`, `marca`, `pose`, `ponto`,
`no`, `gesto`, `grifo`, `liga`, `picto`, ou qualquer outro) para "salvar" um
elemento que não é um dos 4 tipos núcleo, a menos que o usuário tenha
explicitamente pedido pra mapear contra um tema instalado e você tenha
confirmado que aquele tema declara aquele tipo. Por padrão, sem tema, isso é
perda.

Coisas que tipicamente **não convertem** e precisam virar item de perda:

- Fundo com imagem/textura/gradiente complexo (`background-image`,
  `background: linear-gradient(...)`, `radial-gradient`) — a menos que você
  promova o fundo a uma camada `obj` cobrindo a caixa toda, o que é uma
  decisão explícita, não automática.
- Sombra, blur, blend mode, filtro CSS (`box-shadow`, `filter`,
  `mix-blend-mode`, `backdrop-filter`).
- Animação, transição, qualquer coisa que muda no tempo.
- Fonte customizada não instalada no sistema (arquivo `.woff`/`.woff2`/`.ttf`
  referenciado) — cite o nome da fonte na perda, não embarque o binário sem
  checar licença.
- SVG decorativo, ícone vetorial complexo, forma livre.
- Elemento interativo: botão, formulário, vídeo, iframe.
- `clip-path`, máscara, recorte não-retangular — o formato `box` é sempre um
  retângulo alinhado aos eixos.
- Rotação (`transform: rotate(...)`) ou qualquer `transform` não-trivial.
- Texto com múltiplos estilos misturados dentro do mesmo bloco (negrito +
  cor diferente numa palavra só, por exemplo) — a camada `tx`/`tt` é texto
  plano com um `s` só; texto rico parcial é perda de formatação, mesmo que o
  conteúdo textual em si seja preservado.

### 6. Escreva o arquivo

Grave em `pecas/<nome>.js` (ou onde o usuário pedir) seguindo o formato do
`CLAUDE.md`. No topo do arquivo, como comentário, liste as perdas declaradas
no passo 5 — isso é parte da entrega, não um adendo opcional:

```js
// Convertido de <origem.html> em <data>.
// PERDAS DECLARADAS:
// - fundo gradiente (linear-gradient 135deg, #xxx→#yyy) não convertido — sem tipo núcleo pra isso
// - ícone SVG decorativo no canto superior direito, descartado
// - fonte "Custom Grotesk" não instalada, texto renderizado com a fonte padrão do editor
module.exports = { pecas: [
  { slug:'...', n:'...', w:..., h:..., L:[ ... ] },
]};
```

### 7. Prove a conversão

Depois de escrever a declaração, rode a prova de fidelidade:

```bash
node converter/fidelidade.js <original.html> <peca.js> <slug>
```

Ela renderiza os dois lados e mede a diferença **média por pixel** (não
percentual de pixels que batem — essa régua satura perto de 90%+ em qualquer
peça com bastante fundo vazio, boa ou ruim, e não separa nada) mais a fração
de pixels fora de banda. E roda um controle deslocado de propósito ao lado —
se o controle não se separar da conversão por pelo menos o piso mínimo
(default 3×, imprimido no output como escolha desta rodada, não lei), a
ferramenta se recusa a dar número e você não deve reportar nada dela como
confiável.

**Reporte ao usuário os números como saíram** — diferença média, fração fora
de banda, dos dois lados (conversão e controle), e o fator de discriminação
entre eles — junto da lista de perdas. A ferramenta não decide "isso está
bom"; ela só mede e garante que a medida não é ruído. Nunca troque isso por
"converti com sucesso" sem o número por trás, e nunca invente um corte de
aprovação que a ferramenta não deu.
