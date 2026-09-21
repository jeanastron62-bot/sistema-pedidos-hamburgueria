# FASE 17 — Caixa de entrada de atendimento humano no painel

> Para o Claude Code, rodando dentro de `sistema-pedidos-rede/`. Depende das Fases 13
> e 14 aprovadas (webhook gravando, loop da OpenAI respondendo,
> `transferir_para_humano` pausando o bot).
>
> **Mudança de arquitetura aprovada pela cliente:** a coexistência do WhatsApp
> (app no celular + Cloud API no mesmo número) **não vai existir**. A Meta não
> libera o recurso para este app — investigação completa em
> `docs/LESSONS_LEARNED_WHATSAPP_COEXISTENCE.md`. O número do trailer passa a
> funcionar **só pela API**, e todo atendimento humano acontece nesta caixa de
> entrada. Não implemente nada de coexistência nesta fase, e não remova o que a
> Fase 15 já construiu — ela fica dormente, não apagada.

## Antes de tudo

Leia, nesta ordem:

1. `docs/CONTEXTO.md` — arquitetura, schema, proibições.
2. `docs/ESTILO.md` — escala de 9 tons, cartão-comanda, dark mode
   fixo, áreas de toque de 48px.
3. `docs/LESSONS_LEARNED_WHATSAPP_COEXISTENCE.md` — em especial as regras R6
   (não acusar código antes da evidência), R7 (critério de falso negativo em
   todo teste) e R15 (`git log --oneline` cru antes de afirmar commit).

## Restrição que vale para tudo nesta fase

**O painel roda em celular Android ruim — 2 a 4 GB de RAM, rede móvel.** Isso
não é preferência, é a condição de operação: o atendimento acontece no trailer,
à noite, num aparelho que já está com o painel da cozinha aberto.

Consequências obrigatórias, não negociáveis:

- **Nenhuma dependência nova.** Sem biblioteca de chat, sem virtualização, sem
  seletor de emoji, sem editor rico. O que existe no projeto basta.
- **Nada de carregar a conversa inteira.** Últimas 50 mensagens, com "carregar
  anteriores" sob demanda.
- **Lista de conversas paginada** (20 por vez), nunca `findMany` sem `take`.
- **Mensagem nova não re-renderiza a lista toda.** Atualize só a thread aberta e
  o contador da linha correspondente.
- **Sem polling.** O socket `/staff` já existe e já é autenticado.
- **Code-splitting mantido:** a caixa de entrada entra no chunk do painel, nunca
  no bundle da rota `/`.
- Sem `localStorage` para histórico de conversa — o dado vive no banco.

---

## FASE 17.0 — Reconhecimento (OBRIGATÓRIA, PARE AO FINAL)

Não altere nenhum arquivo nesta etapa.

```bash
cd backend
cat src/modules/whatsapp/whatsapp.routes.ts
cat src/modules/whatsapp/sendMessage.ts
cat src/modules/whatsapp/humanTakeover.ts
grep -rn "botPaused" src/
cat prisma/schema.prisma | awk '/^model WhatsappConversation /,/^}/'
cat prisma/schema.prisma | awk '/^model WhatsappMessage /,/^}/'
cd ../frontend
find src -iname "*atendimento*" -o -iname "*inbox*" -o -iname "*whatsapp*"
grep -rn "Atendimento" src/
grep -rni "audio\|Audio(\|\.mp3\|\.wav\|som\b" src/
cat src/stores/useSocketStore.ts
git log --oneline -15
```

Responda, citando o trecho exato:

1. **A aba "Atendimento" do painel já existe. O que ela faz hoje?** Cole o
   componente inteiro. Se já houver lista de conversas, campo de resposta ou
   aviso sonoro, diga exatamente o que está pronto e o que é placeholder — esta
   fase constrói em cima, não do zero.
2. `sendWhatsappText` — assinatura atual, e quem a chama hoje além do loop do
   bot. Existe alguma rota autenticada que já envie mensagem?
3. `WhatsappConversation` tem algum campo de não-lido, de responsável, ou de
   quando o handoff aconteceu? Se não tiver, liste o que falta.
4. `humanTakeover.ts` — o que ele faz além de setar `botPaused`? Ele registra
   motivo/resumo em algum lugar persistente, ou só em `console.log`?
5. O namespace `/staff` emite algum evento de WhatsApp hoje?
6. **Existe aviso sonoro no painel?** Um commit recente menciona isso. Se já
   existe, diga onde e como é disparado — não construa um segundo.
7. Existe alguma rotina de retenção/purga de `WhatsappMessage`? O documento do
   bot fala em 40 dias, mas o projeto proíbe scheduler. Só reporte o que
   encontrar; não implemente nada disso agora.

**PARE AQUI.** Não avance sem aprovação.

---

## FASE 17.1 — Schema

Só o que a 16.0 mostrar que falta. Proposta (ajuste à convenção real):

| Model | Campo | Tipo | Para quê |
|---|---|---|---|
| `WhatsappConversation` | `handoffAt` | `DateTime?` | Quando o bot passou pra humano — base do cronômetro de espera |
| `WhatsappConversation` | `handoffReason` | `String?` | `motivo` que o modelo mandou em `transferir_para_humano` |
| `WhatsappConversation` | `handoffSummary` | `String?` | `resumo` — pro atendente entender sem ler a conversa toda |
| `WhatsappConversation` | `lastReadAt` | `DateTime?` | Base do contador de não-lidas |
| `WhatsappMessage` | `sentByName` | `String?` | Quem da equipe enviou (snapshot, igual a `createdByName` em `Order`) |

```bash
cd backend
npx prisma migrate dev --name fase17_caixa_entrada
```

**Prova:** saída completa + conteúdo do `.sql`. Critério: só
`ALTER TABLE ... ADD COLUMN`, todas nullable. Qualquer `DROP` ou
`ALTER COLUMN ... TYPE` reprova a fase.

---

## FASE 17.2 — Backend: listar, ler, responder

**Modificar:** `whatsapp.routes.ts`. Todas autenticadas, todas
`requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI)`. `ENTREGADOR`
não entra.

```
GET   /api/webhook/whatsapp/conversations           ?cursor=&limit=20
GET   /api/webhook/whatsapp/conversations/:id/messages  ?before=&limit=50
POST  /api/webhook/whatsapp/conversations/:id/messages  body: { text }
PATCH /api/webhook/whatsapp/conversations/:id/read
PATCH /api/webhook/whatsapp/conversations/:id/resume     (já existe na 14.7)
```

Comente no arquivo, como já está feito na rota `/connect`, que essas rotas são
**autenticadas apesar do prefixo `/webhook/`** — o prefixo é histórico.

Regras de implementação:

- `GET /conversations` retorna, por conversa: `id`, `phone`, `botPaused`,
  `lastInboundAt`, `handoffAt`, `handoffReason`, `handoffSummary`, contagem de
  não-lidas (`createdAt > lastReadAt`, `direction: IN`) e o `content` da última
  mensagem, truncado em 80 caracteres.
- **Ordenação — cuidado duplo aqui.**

  Primeiro, `botPaused: true` no topo **não serve**: responder pelo painel também
  pausa o bot, então uma conversa já atendida ficaria pinada para sempre,
  empurrando pra baixo um handoff novo que ninguém viu.

  Segundo, **não-lida também não serve.** `lastReadAt` zera assim que qualquer
  um abre a conversa — então o atendente abre, é interrompido, não responde, e a
  conversa cai da prioridade. É a mesma armadilha do "responder e esquecer de
  devolver", só que do lado humano.

  O critério certo é **não-respondida**: existe mensagem `IN` sem nenhuma `OUT`
  depois dela. Abrir não muda isso; só responder muda. Ordene por
  não-respondida primeiro (`handoffAt asc` dentro do bucket — quem espera há
  mais tempo no topo), depois o resto por `lastInboundAt desc`.

  Não-lida continua existindo, mas só como badge visual. Prioridade é outra
  coisa.
- **`lastReadAt` é por conversa, não por usuário.** Se o GARCOM abrir, conta
  como lida para todo mundo. É decisão consciente: num trailer de ~10 pessoas
  um índice por usuário é complexidade sem retorno — e, com a prioridade
  baseada em não-respondida, ler não derruba mais nada importante. Registre isso
  como comentário no schema, para a próxima sessão não "corrigir" achando que é
  bug.
- `POST /messages` chama `sendWhatsappText` — não crie um segundo caminho de
  envio (seção 5.7 do CONTEXTO). Grave `sentByName` com `req.user.username`.
- **Janela de 24h:** antes de enviar, calcule
  `Date.now() - conversation.lastInboundAt > 24h`. Se estiver fora, **não
  tente enviar** — retorne `409` com mensagem explícita. Mandar e falhar na
  Graph API gasta chamada e confunde a equipe.
- `GET /conversations` devolve também `windowExpiresAt` (= `lastInboundAt + 24h`)
  pra UI mostrar sem recalcular errado.
- Enviar pelo painel **pausa o bot** (`botPaused: true`) se ainda não estiver.
  Ninguém quer atendente e bot respondendo junto.
- **Despausa automática por inatividade — obrigatória.** Sem isso a conversa
  fica presa em atendimento humano para sempre: o atendente responde uma vez,
  esquece de devolver, e a próxima mensagem daquele cliente não recebe resposta
  nenhuma — nem do bot, nem de ninguém. É o pior desfecho possível e o mais
  provável numa noite cheia. Requisito já levantado na seção 6 de
  `BOT-WHATSAPP-PROMPT.md` e nunca implementado.

  Avaliação **preguiçosa, sem cron** (padrão do projeto): na chegada de mensagem
  nova, se `botPaused === true` e a conversa estiver parada há mais de 2h,
  despausar, limpar `handoffAt` e deixar o bot responder. `createLog` com
  `WHATSAPP_BOT_AUTO_RESUMED`.

  **Armadilha de ordem de execução — leia antes de implementar.** Em
  `receive()`, `storeInboundMessages` grava o `IN` novo **antes** do loop de
  processamento. Se você calcular "última mensagem da conversa" depois disso, a
  última mensagem é a que acabou de chegar, o intervalo dá zero segundos, e o
  despause **nunca dispara — em silêncio**. A feature falharia exatamente no
  cenário que existe pra evitar, por causa da própria implementação.

  Portanto: capture o instante da **última mensagem anterior à que acabou de
  chegar** — lendo a conversa e a última mensagem *antes* de
  `storeInboundMessages`, ou consultando `WhatsappMessage` com `id` (ou
  `waMessageId`) diferente do recém-criado. Compare contra esse valor, nunca
  contra a mensagem nova.

  O prazo de 2h é chute meu — se você achar base melhor no projeto, use e diga
  qual.
- **`resume` limpa `handoffAt` — o manual e o automático.** Os dois caminhos de
  "bot volta a responder" precisam deixar o mesmo estado. Se só o manual limpar,
  uma conversa despausada automaticamente volta ao topo da lista numa mensagem
  futura por causa de um `handoffAt` velho, sem handoff ativo nenhum. E o
  cronômetro "esperando há X min" passa a mentir em conversa já resolvida.
- `createLog` em envio e em resume, com o `Log` genérico que já existe. Ações:
  `WHATSAPP_REPLY_SENT`, `WHATSAPP_BOT_RESUMED`.

**Prova:** `curl -i` de cada rota com token de cada papel, incluindo `403` como
`ENTREGADOR` e `409` fora da janela de 24h (force com um `lastInboundAt`
antigo direto no banco). Saída bruta colada, sem `-v`.

---

## FASE 17.3 — Socket `/staff`

Adicionar ao namespace que já existe. **Nunca em `/public`** — é conteúdo de
conversa de cliente, linha vermelha da seção 6 do CONTEXTO.

```
whatsapp:message_received  → { conversationId, phone, content, createdAt }
whatsapp:handoff           → { conversationId, phone, motivo, resumo }
whatsapp:message_sent      → { conversationId, content, sentByName, createdAt }
```

`await` da escrita no banco antes do `emit`, sempre (proibição 9).

---

## FASE 17.4 — Frontend

Na aba **Atendimento** que já existe. Layout de duas colunas no desktop, e no
celular **uma coluna por vez**: lista → toca → thread → botão voltar. Nunca
lista e thread juntas numa tela de 360px.

**Lista de conversas**
- Cartão-comanda, como os cards de pedido: `font-mono` no telefone, separador
  tracejado entre cabeçalho e prévia.
- Badge laranja-brasa em quem está com `botPaused: true`.
- Cronômetro "esperando há X min" a partir de `handoffAt`, recalculado por
  `setInterval` de 60s — mesmo padrão do `PublicHeader`, sem evento novo.
- Se passar de 5 min sem resposta, o card muda de destaque (escalonamento da
  seção 6 do doc do bot).

**Thread**
- Últimas 50, "carregar anteriores" no topo.
- Mensagem `IN` à esquerda, `OUT` à direita; `OUT` mostra `sentByName` ou
  "(vazio, mensagem do bot)".
- Campo de texto + botão enviar, altura de toque mínima 48px.
- Quando a janela de 24h estiver fechada: campo desabilitado com aviso claro
  ("passou de 24h desde a última mensagem do cliente — só ele pode reabrir a
  conversa"). Não esconda o campo, explique.
- Botão "devolver pro bot" chamando `resume`.

**Alerta (versão mínima desta fase)**
- Som curto + contador no título da aba quando chegar `whatsapp:handoff`.
- Banner fixo no topo de **todos** os painéis, não só na aba Atendimento —
  senão só vê quem já está olhando.
- **Notificação push de verdade (service worker) NÃO entra nesta fase.** Som e
  banner só funcionam com o painel aberto. Isso é uma limitação conhecida e
  precisa estar escrita no `CONTEXTO.md` como pendência, não descoberta em
  produção.

---

## Dependência de outra fase

A priorização inteira desta caixa de entrada depende de `handoffAt` ser
confiável — ou seja, de o bot só chamar `transferir_para_humano` quando
realmente precisa. A **Fase 16** (correções de bugs do teste manual) tem
exatamente isso em aberto: o escopo largo demais do `transferir_para_humano`
(T03/T04), com decisão ainda pendente de aprovação.

Se esta fase estrear antes daquela correção, a caixa de entrada nasce cheia de
handoffs falsos, e o bucket de prioridade — que é o valor principal da tela —
vira ruído. **Rode a Fase 16 primeiro**, ou aceite conscientemente que os
primeiros dias vão precisar de triagem manual.

Esta fase é a 17 justamente por causa disso. Verificações vão em
`docs/verificacoes/<data>-fase-17-*.txt`, commits em `fase17:`, e a tabela de
fases do `CONTEXTO.md` precisa refletir as duas separadamente.

---

## FASE 17.5 — Prova

Com `npm run dev`, redirecionando tudo com `tee` pra
`docs/verificacoes/<data>-fase-17-caixa-entrada.txt`:

1. Mensagem de cliente chega → aparece na lista, badge de não-lida.
2. Bot chama `transferir_para_humano` → conversa sobe pro topo, `botPaused: true`
   no banco (query colada), banner aparece.
3. Resposta pelo painel → chega no WhatsApp do cliente, `WhatsappMessage` com
   `direction: OUT` e `sentByName` correto (query colada).
4. `ENTREGADOR` tentando responder → `403`.
5. Conversa com `lastInboundAt` de 25h atrás → `409`, campo desabilitado na UI.
6. `resume` → `botPaused: false`, `handoffAt: null`, bot volta a responder.
7. **Despausa automática (o teste que pega o bug de ordem).** Conversa com
   `botPaused: true` e última mensagem de 3h atrás; chega mensagem nova →
   `botPaused: false`, `handoffAt: null`, bot responde. Cole o log
   `WHATSAPP_BOT_AUTO_RESUMED`. Se não disparar, você está comparando contra a
   mensagem recém-gravada — releia a 17.2.
8. **Prioridade sobrevive à leitura.** Abra uma conversa não-respondida sem
   responder, recarregue a lista: ela **continua** no topo. Se caiu, a
   ordenação está por não-lida em vez de não-respondida.
9. **Prova de peso:** `npm run build` e o tamanho do chunk do painel antes e
   depois desta fase, em gzip. O número que importa é o **delta**, não o
   absoluto. Não tenho um teto medido para este projeto — se o crescimento
   passar de ~30 KB, pare e me diga o que está pesando antes de eu aprovar.
   Esse 30 é arbitrário meu, não medição; se você tiver base melhor, proponha.

---

## Fora de escopo

- Áudio e imagem do cliente — precisa de download de mídia pela Graph API e, no
  caso de áudio, transcrição. Escopo próprio, Fase 18.
- Push notification com service worker — Fase 18.
- Templates de mensagem para reabrir conversa fora da janela de 24h.
- Qualquer coisa de coexistência.

## Pendências que ficam registradas

1. O número do trailer só registra na API se a Meta liberar o `#3441062`.
   **Nada desta fase deve assumir que isso já aconteceu.** Testar com o número
   de teste até lá.
2. Sem push, atendimento fora do painel aberto não é notificado.
3. Grupos, status e lista de transmissão deixam de funcionar no número quando
   ele for pra API. Confirmar com a cliente antes do registro definitivo.
4. **Retenção de `WhatsappMessage`.** O documento do bot fala em purga aos 40
   dias por cron; o projeto proíbe scheduler. Com a caixa de entrada virando a
   ferramenta principal de atendimento, a tabela passa a crescer com tudo que
   o cliente escreve. A contradição existe desde a Fase 13 e continua sem
   decisão — não resolva nesta fase, mas não deixe cair no esquecimento.
