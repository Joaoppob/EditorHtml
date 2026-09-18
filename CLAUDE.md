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
| `cls` | classe CSS extra aplicada à raiz da peça (uso do tema); sem classe extra por padrão |
| `L` | lista de camadas, na ordem de leitura (não de pintura — pintura é `z`) |

Campos por camada:

| Campo | Significado |
|---|---|
| `t` | tipo da camada — ver os 4 tipos abaixo |
| `tx` | texto (para `tt`/`tx`) |
| `s` | tamanho de fonte em px (para `tt`/`tx`) |
| `al` | alinhamento de texto — `left`/`center`/`right`/`justify` (CSS `text-align`; padrão `left`) — para `tt`/`tx` |
| `lh` | entrelinha (CSS `line-height`); sem valor por padrão — para `tt`/`tx` |
| `src` | caminho da imagem (para `obj`) |
| `op` | opacidade da imagem (CSS `opacity`, 0–1); sem valor por padrão (opaca) — para `obj` |
| `alt` | texto alternativo da imagem (`alt` do `<img>`); vazio por padrão — para `obj` |
| `box` | `[x, y, largura, altura]` — tudo em **% do tamanho nativo** (`w`/`h` da peça). `altura: null` = altura automática, cresce com o conteúdo |
| `k` | chave da reserva — grava `data-k` no elemento, pra outro processo identificar o vão; sem atributo quando ausente — para `reserva` |
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
npx editorhtml abrir --projeto <pasta-ou-config>   # abre um PROJETO EXTERNO — ver seção abaixo
```

Porta: **8811 por padrão, e ela se desloca sozinha.** Se a 8811 estiver
ocupada — outra sessão do editor, um servidor esquecido — o comando sobe na
próxima livre e avisa em qual. **Você nunca precisa encerrar processo de
ninguém para usar o editor.** O comando abre o navegador sozinho; se não
conseguir (ambiente sem tela), imprime a URL — abra manualmente.

Leia a URL que o comando imprimiu, não a que você esperava: quando a porta
se desloca, a tela está na porta nova.

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
3. Confirme a URL que o comando IMPRIMIU e que o navegador subiu. Se a porta
   padrão estava ocupada, ele já subiu noutra e disse qual — não encerre
   processo de ninguém, e não pare para perguntar: siga com a URL impressa.

Para instruções operacionais detalhadas (o que fazer se der erro, como
confirmar que subiu), use a skill `abrir-editor` — ela é o roteiro
passo-a-passo, este documento é só a visão geral.

---

## Abrindo um projeto externo, sem converter peça nenhuma

Alguns projetos já têm as peças declaradas no FORMATO DELES — script-global
(`window.<G>.usos.push({...})`), não `module.exports = { pecas:[...] }`. Para
esses, não se converte nada: o projeto declara um arquivo de config (nome
livre, convenção `editorhtml.tema.js`, na raiz do projeto) e abre com:

```bash
npx editorhtml abrir --projeto <pasta-do-projeto>       # procura editorhtml.tema.js dentro
npx editorhtml abrir --projeto <arquivo-de-config.js>   # ou aponta pro arquivo direto
```

O arquivo de config é um módulo CommonJS/UMD (roda tanto por `require()` no
servidor quanto por `<script>` no navegador, como um tema) que exporta, além
dos sete ganchos de tema já documentados acima, um bloco `projeto`:

| Campo | Significado |
|---|---|
| `raiz` | diretório do projeto (tipicamente `__dirname`) |
| `raizEstatica` | opcional; um raiz mais LARGO (ex. o diretório-pai), para servir arquivo irmão de `raiz` (um censo de assets, por exemplo). Todo caminho abaixo é declarado relativo a `raiz`; o servidor resolve e serve de onde o arquivo realmente estiver — `raiz` primeiro, `raizEstatica` depois |
| `formato` | `'global'` (padrão — `window.<global>.usos.push`) ou `'commonjs'` (como `pecas/`, mas caminho explícito) |
| `global` | nome do objeto global, quando `formato:'global'` |
| `dadosScripts` | lista de arquivos que DECLARAM peças, na ordem de carga. A atribuição peça→arquivo é AUTOMÁTICA (medida pelo tamanho de `usos` antes/depois de cada script) — um arquivo por peça ou um arquivo por grupo, sem mapa escrito à mão. Pode ser sobreposta com `arquivoDe(peca)` |
| `clienteScripts` | scripts extras que o NAVEGADOR precisa (dados de apoio, tabelas) antes do montador — não declaram peça |
| `montar` | `{ arquivo, global, metodo }` — o montador PRÓPRIO do projeto. Ausente = usa `motor/montar.js` do núcleo |
| `cssExtra` | folhas extras (arquivo do projeto ou URL absoluta, ex. Google Fonts), carregadas depois da folha do núcleo |
| `build` | opcional — `{ comando, args(slugs), cwd }`. Habilita o botão "Gerar esta peça" e a rota `/_api/gerar`; sem isso, nem aparece |

Fora dos sete ganchos e fora do bloco `projeto`, o tema pode declarar mais uma
chave, opcional: `textoInPlace` — array com os tipos que abrem a caixa de
edição in-place ao duplo-clique (ex. `['tt', 'tx', 'kk', 'no']`). Sem ela, só
`tt`/`tx` abrem, como sempre foi — projetos que precisam de mais tipos
editáveis no palco declaram a lista inteira (um projeto real usa
`['tt', 'tx', 'kk', 'no']`); o núcleo não inventa tipo de texto por conta
própria.

Ver exemplos completos, com comentários explicando cada decisão, nos temas
reais de projetos que usam este editor (procure por `editorhtml.tema.js` na
raiz de um projeto).

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
├── editor/                 editar.html · editar.js · editar.css · escrita.js · servir.js ·
│                           texto-camada.js (vocabulário fechado do texto — `<br>`,`<b>`,`<i>`,`[[..]]`)
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
