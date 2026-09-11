# EditorHtml

Editor de mouse para peças gráficas que vivem em código.

---

## Se você é humano, leia aqui

Toda peça gráfica que vive em código tem o mesmo problema: pra mudar uma vírgula de lugar, alguém precisa abrir o código. Mover um título dois centímetros pra baixo vira tarefa de programador, mesmo quando quem decide onde o título fica é a pessoa olhando a peça na tela, não quem escreveu a linha.

Este editor inverte essa ordem. A peça continua sendo um arquivo de código, mas agora dá pra editar ela arrastando, como um Canva: você move o título com o mouse, ajusta o tamanho do texto, reposiciona a foto, e o editor grava a mudança de volta no arquivo original, tocando só o valor que você mexeu. Os comentários, a lógica, o histórico de decisões que já estava escrito ali continuam intactos.

Pensa num cartaz de evento já entregue, aprovado, versionado. Uma semana depois o horário muda e o título fica grande demais pro espaço que sobrou. Sem isso, alguém abre o código, calcula a porcentagem certa na mão, testa, erra, testa de novo. Com isso, abre o navegador, arrasta a caixa do título até caber, fecha a aba. O arquivo sai exatamente do jeito que um programador aprovaria.

O código não percebe que quem editou não sabe programar. E não precisa perceber.

---

## Se você é um Agente, leia aqui

Contrato operacional. Leia `CLAUDE.md` na raiz deste repositório antes de qualquer operação nele — é a fonte completa e este bloco não a substitui, resume o essencial pra decidir sem abrir mais nada.

### O que é o quê

| Caminho | Função |
|---|---|
| `bin/editorhtml.js` | CLI. Comandos: `servir` e `abrir <caminho>`. |
| `editor/servir.js` | servidor HTTP local, rotas `/_api/*` e estáticos. |
| `editor/escrita.js` | a escrita de volta no arquivo de origem. Troca só o token do valor tocado por texto, nunca reserializa o objeto. |
| `editor/editar.html`, `editar.js`, `editar.css` | a interface do editor. |
| `motor/montar.js` | lê a declaração e monta o DOM. Conhece só os 4 tipos núcleo (abaixo); qualquer outro tipo é tema. |
| `temas/` | temas opcionais que pintam tipos fora do núcleo. Nenhum é obrigatório. |
| `converter/` | conversão de HTML pronto para declaração de peça, com prova de fidelidade (`converter/fidelidade.js`). |
| `pecas/` | acervo padrão de peças. `npx editorhtml servir` sempre aponta pra cá. |
| `provas/` | suíte de testes do motor e do editor. |
| `.claude/skills/` | roteiros operacionais: `abrir-editor`, `converter-html`, `nova-peca`. |
| `package.json` | bin `editorhtml`, zero dependências de produção. |

### Vocabulário do domínio

Uma **peça** é um objeto `{ slug, n, w, h, L }` dentro de `module.exports = { pecas: [...] }`, num arquivo `.js`. `w`/`h` são o tamanho nativo em pixels da peça; `L` é a lista de **camadas**, na ordem de leitura (a ordem de pintura é dada por `z`, maior pinta por cima).

Campos de camada:

| Campo | Significado |
|---|---|
| `t` | tipo da camada — ver os 4 tipos núcleo abaixo |
| `tx` | texto (para `tt`/`tx`) |
| `s` | tamanho de fonte em px (para `tt`/`tx`) |
| `src` | caminho da imagem (para `obj`) |
| `box` | `[x, y, largura, altura]`, tudo em % do tamanho nativo da peça; `altura: null` = altura automática |
| `z` | ordem de pintura |

Os **4 tipos núcleo**, e só eles, são conhecidos pelo motor sem nenhum tema instalado:

- `tt` — título
- `tx` — texto de apoio
- `obj` — imagem
- `reserva` — vão reservado: espaço marcado, sem conteúdo ainda

Qualquer `t` fora dessa lista é **tema**. O motor não esconde nem quebra por causa disso: desenha a caixa, deixa mover e redimensionar, e avisa no painel que aquele tipo não tem tema instalado para pintá-lo. É o funcionamento esperado sem tema, não um erro.

### O que fazer

Pré-condição para qualquer comando abaixo: estar na raiz deste repositório, onde está `package.json`. Node >=18. Zero dependências de produção: `npx` funciona sem `npm install` prévio.

- Quando o usuário pedir para **abrir o editor numa peça específica** ("abre a peça X", "edita esse cartaz/deck/post"): ache o arquivo `.js` da peça — pergunte o caminho se não estiver óbvio, não adivinhe entre vários candidatos — e rode:

  ```bash
  npx editorhtml abrir <caminho-da-peca.js>
  ```

  Confirme a URL que o comando IMPRIMIU. A porta pedida é 8811, mas o servidor anda para a próxima livre se ela estiver ocupada e anuncia onde subiu; não presuma a porta, leia a que saiu no terminal. Roteiro detalhado: skill `abrir-editor`.

- Quando o usuário pedir para **abrir a lista geral de peças** ("abre o editor", sem apontar peça): rode `npx editorhtml servir`. Serve o diretório `pecas/` inteiro.

- Quando o usuário trouxer um **HTML pronto e quiser editá-lo aqui**: use a skill `converter-html`. Não existe conversor automático — o agente é o parser, lê o HTML e escreve a declaração à mão, registrando o que não deu para converter em vez de fingir fidelidade total.

- Quando o usuário pedir uma **peça nova sem HTML de origem**: use a skill `nova-peca`.

- Se o comando reclamar de bin não resolvido: rode `npm install` uma vez na raiz (não adiciona dependência de produção, só resolve o link do bin) e repita o comando.

### O que NÃO fazer

- Não adivinhe porta nem URL. O endereço real só existe depois que o servidor anuncia que subiu; um endereço chutado pode abrir a tela de outro processo.
- Não encerre processo de servidor alheio para "liberar" a porta 8811. O editor sobe sozinho na próxima porta livre.
- Não grave uma peça reserializando o objeto — nada de `JSON.stringify`, nada de regenerar o arquivo do zero, nada de reescrever a partir de uma AST. Toda escrita passa por `editor/escrita.js`, que troca só o token do valor tocado e preserva o resto do arquivo byte a byte, comentários de doutrina inclusos.
- Não trate camada de tipo desconhecido (fora de `tt`/`tx`/`obj`/`reserva`) como erro ou como camada ausente. É tema não instalado, estado esperado; a camada continua existindo, com geometria e arrasto normais.
- Não escolha sozinho o arquivo de peça quando houver mais de um candidato plausível. Pergunte.

---

## Licença

MIT. © João Pedro Barros. Ver `LICENSE`.
