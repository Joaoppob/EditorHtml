# CLAUDE.md — EditorHtml

Você é um agente Claude Code que acabou de ser instalado neste repositório.
Este documento assume que você nunca viu este projeto antes. Leia antes de
fazer qualquer coisa.

---

## O que é isto

**EditorHtml é um editor visual, de mouse, para peças gráficas escritas como
declaração HTML/JS.** Em vez de abrir um editor de imagem, você declara os
elementos de uma peça (texto, título, imagem, vão reservado) num arquivo
JavaScript simples, sobe um servidor local, e edita arrastando na tela —
posição, tamanho, texto — como se fosse Figma/Canva, mas o resultado é sempre
esse arquivo de declaração, legível e versionável em texto puro.

Não é um framework de site. Não é um editor de vídeo. É um editor de **peças
estáticas em grade percentual** — cartazes, posts, capas, slides — pensado
para quem desenha por composição de camadas, não por CSS solto.

---

## O formato de peça

Uma peça vive num arquivo `.js` CommonJS que exporta uma lista de peças:

```js
module.exports = { pecas: [
  { slug:'capa', n:'Capa', w:1080, h:1350, L:[
    { t:'tt', tx:'Título', s:72, box:[6,10,88,null], z:2 },
    { t:'tx', tx:'Apoio',  s:36, box:[6,40,82,null], z:3 },
    { t:'obj', src:'./img/foto.jpg', box:[6,60,88,30], z:1 },
  ]},
]};
```

Campos por peça:

| Campo | Significado |
|---|---|
| `slug` | identificador único da peça no arquivo |
| `n` | nome legível (aparece na lista do editor) |
| `w`, `h` | tamanho nativo em pixels (o "papel" da peça) |
| `L` | lista de camadas, na ordem de leitura (não de pintura — pintura é `z`) |

Campos por camada:

| Campo | Significado |
|---|---|
| `t` | tipo da camada — ver os 4 tipos abaixo |
| `tx` | texto (para `tt`/`tx`) |
| `s` | tamanho de fonte em px (para `tt`/`tx`) |
| `src` | caminho da imagem (para `obj`) |
| `box` | `[x, y, largura, altura]` — tudo em **% do tamanho nativo** (`w`/`h` da peça). `altura: null` = altura automática, cresce com o conteúdo |
| `z` | ordem de pintura — maior pinta por cima |

**O editor conhece 4 tipos de camada — o núcleo, e só o núcleo:**

- `tt` — título
- `tx` — texto de apoio
- `obj` — imagem
- `reserva` — vão reservado (espaço marcado, sem conteúdo ainda)

Qualquer outro tipo (`t` diferente desses 4) é **tema** — decoração,
paleta, marca d'água, ícone, o que for. O editor não trava nem esconde uma
camada de tipo desconhecido: desenha a caixa, deixa mover e redimensionar, e
avisa no painel que aquele tipo não tem tema instalado para pintá-lo. Isso é
esperado quando não há tema — o editor funciona igual, só sem o verniz.

---

## Como abrir

Dentro da raiz do repositório (onde está o `package.json` deste pacote):

```bash
npx editorhtml servir              # serve pecas/ inteira, abre a lista
npx editorhtml abrir <caminho.js>  # serve o diretório daquele arquivo, abre direto na peça
```

Porta fixa: **8811**. O comando abre o navegador padrão sozinho; se não
conseguir (ambiente sem tela), ele imprime a URL — abra manualmente.

Zero dependência de produção — `npx` funciona sem `npm install` prévio. Se
reclamar de bin não resolvido, rode `npm install` uma vez na raiz e tente de
novo.

---

## Onde ficam as peças

`pecas/` é o acervo padrão — cada arquivo `.js` lá dentro segue o formato
acima. `npx editorhtml servir` sempre aponta pra essa pasta.

Se a peça que você quer editar está em outro lugar (outro projeto, uma pasta
de trabalho separada), use `npx editorhtml abrir <caminho>` apontando pro
arquivo — o editor serve o diretório dele, não precisa estar dentro de
`pecas/`.

---

## Quando o usuário disser "abre o editor nessa peça"

1. Ache o arquivo `.js` da peça (pergunte o caminho se não estiver óbvio —
   não adivinhe qual arquivo entre vários).
2. Rode `npx editorhtml abrir <caminho>`.
3. Confirme a URL que abriu (`http://localhost:8811/...`) e que o navegador
   subiu. Se a porta 8811 já estiver ocupada, é outra sessão do editor — avise
   o usuário antes de encerrar qualquer processo.

Para instruções operacionais detalhadas (o que fazer se der erro, como
confirmar que subiu), use a skill `abrir-editor` — ela é o roteiro
passo-a-passo, este documento é só a visão geral.

---

## Convertendo um HTML existente para peça

Se o usuário tem um documento HTML pronto (feito por outro agente, outra
ferramenta) e quer editá-lo aqui, ele precisa virar uma declaração no formato
acima primeiro. Use a skill `converter-html` — ela é o roteiro de conversão,
incluindo o que **não** dá para converter e como declarar a perda em vez de
fingir que converteu tudo.

---

## Layout do repositório

```
EditorHtml/
├── CLAUDE.md              este arquivo
├── package.json           bin: "editorhtml"
├── .claude/skills/         abrir-editor · converter-html · nova-peca
├── bin/editorhtml.js       CLI
├── converter/              HTML → declaração + prova de fidelidade
├── editor/                 editar.html · editar.js · editar.css · escrita.js · servir.js
├── motor/montar.js         os 4 tipos núcleo + carregador de tema
├── temas/                  temas opcionais (nenhum é obrigatório)
├── pecas/                  onde o editor enxerga as peças por padrão
└── provas/                 suíte de testes do motor/editor
```

Um tema em `temas/` é sempre opcional — o editor abre e funciona só com os 4
tipos núcleo mesmo sem tema nenhum instalado.

---

## O que este projeto não é

- Não gera peças sozinho — você declara, ele deixa editar visualmente.
- Não interpreta CSS arbitrário nem framework de layout. O vocabulário é o
  da tabela acima; nada além disso.
- Não tem conta, nuvem, ou colaboração em tempo real — é local, um servidor,
  um navegador.
