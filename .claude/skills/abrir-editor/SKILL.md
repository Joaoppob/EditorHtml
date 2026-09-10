---
name: abrir-editor
description: Sobe o EditorHtml e abre o navegador na peça certa. Use quando o usuário disser "abre o editor", "abre essa peça no editor", "edita esse cartaz/deck/post", ou equivalente, depois que o repositório EditorHtml já está instalado.
---

# Abrir o editor

## Quando usar

- Usuário pede para abrir ou editar uma peça específica ("abre a peça X",
  "edita esse cartaz").
- Usuário pede só para "abrir o editor", sem apontar peça — abre a lista de
  `pecas/`.
- Depois de converter um HTML para o formato de peça (skill `converter-html`)
  e o usuário quer ver o resultado no editor.

## Como funciona

O editor é um servidor local, porta fixa **8811**. Dois comandos, rodados na
raiz do repositório (onde está o `package.json` com `"bin": {"editorhtml": ...}`):

| Comando | Efeito |
|---|---|
| `npx editorhtml servir` | serve `pecas/` inteira, abre a lista no navegador |
| `npx editorhtml abrir <caminho>` | serve o diretório daquele arquivo, abre já naquela peça |

Zero dependência de produção — `npx` funciona mesmo sem `npm install` prévio.
Se reclamar de bin não resolvido, rode `npm install` uma vez na raiz.

O comando abre o navegador padrão sozinho. Se falhar (ambiente sem tela), ele
imprime a URL no terminal — repasse pro usuário.

## Passo a passo

1. **Confirme a raiz do repo.** Rode `ls package.json` — se não existir ou não
   tiver `"bin": {"editorhtml"`, você está no lugar errado. Peça o caminho do
   repositório ao usuário.

2. **Se o usuário apontou uma peça** — um arquivo `.js` (em `pecas/` ou em
   qualquer outro lugar, contanto que siga o formato `module.exports = { pecas: [...] }`
   descrito no `CLAUDE.md` da raiz):
   ```bash
   npx editorhtml abrir <caminho-do-arquivo>.js
   ```

3. **Se o usuário só disse "abre o editor"** sem apontar peça:
   ```bash
   npx editorhtml servir
   ```

4. **Confirme ao usuário** a URL que abriu (`http://localhost:8811/...`) e que
   o navegador subiu. Se o comando imprimiu a URL sem abrir navegador
   sozinho, repasse a URL — não invente que abriu se o log disse que não
   conseguiu.

5. **Porta ocupada não é erro seu.** Se a 8811 já estiver em uso, é outra
   sessão do editor rodando. Avise o usuário e pergunte se quer encerrar a
   sessão anterior antes de subir uma nova — nunca mate o processo sem
   confirmar, pode ser edição não salva de outra pessoa.

## Erros comuns

- **"editor/servir.js não existe"** — o pacote está incompleto (instalação
  parcial ou corrompida). Reinstale o repositório do zero; não tente
  contornar escrevendo um servidor alternativo.
- **"arquivo não encontrado"** — caminho errado, ou a peça não é `.js`. Rode
  `ls` na pasta esperada para confirmar o nome exato antes de tentar de novo.
- **Porta ocupada** — ver passo 5 acima.
- **Nada abre e não aparece erro** — confira se o comando realmente terminou
  (`echo $?` / código de saída); se travou, pode estar esperando input, não
  reinicie sem checar o terminal primeiro.
