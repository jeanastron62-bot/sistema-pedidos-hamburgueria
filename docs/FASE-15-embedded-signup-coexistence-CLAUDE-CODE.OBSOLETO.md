> ⚠️ **DOCUMENTO OBSOLETO — NÃO SIGA ESTE ARQUIVO.**
> Substituído por `docs/FASE-15-coexistencia-numero-real-CLAUDE-CODE.md`
> (24/08/2026). Este aqui foi escrito antes da aprovação do App Review e antes
> do status de Tech Provider, e assume uma infraestrutura Meta da Palora que não
> existe. Mantido só como registro do que foi implementado em 06/08/2026
> (ver `docs/relatorios/FASE-15_embedded-signup-coexistence_PARCIAL_2026-08-06_15h48.txt`).

# FASE 15 — Embedded Signup (Tech Provider) e Coexistence

> Para o Claude Code, rodando dentro de `sistema-pedidos-rede/`. Depende das Fases 13
> e 14 aprovadas. Escopo: (a) tela de conexão da WABA do cliente pelo Embedded
> Signup, (b) token do negócio persistido no banco em vez de variável de
> ambiente, (c) webhook `smb_message_echoes` pausando o bot quando um humano
> responde pelo app WhatsApp Business.
>
> **Fora de escopo, deliberadamente:** `criar_pedido` / `consultar_pedido_ativo`
> / `cancelar_pedido_ativo` tocando dado real. Isso continua sendo a fase
> seguinte. Esta fase existe porque o App Review da Meta bloqueia tudo o mais, e
> ele exige exatamente estes três itens.

## Antes de tudo

Leia, nesta ordem:

1. `docs/CONTEXTO.md`
2. `docs/FASE-13-webhook-whatsapp-CLAUDE-CODE.md` e `docs/FASE-14-loop-openai-CLAUDE-CODE.md`
3. `docs/superpowers/specs/2026-07-15-delivery-auto-cutoff-design.md` — só pelo
   padrão arquitetural (sem scheduler, `Log`/`createLog` genéricos,
   `verify-tmp.ts` descartável).

## Regra específica e inegociável desta fase

**A documentação do Embedded Signup mudou recentemente e continua mudando.** Há
uma migração obrigatória para a versão 4 com data-limite em 15/10/2026. Nomes de
parâmetro, versão do SDK e formato dos eventos de sessão que aparecem neste
documento são **referência, não verdade**.

Antes de escrever qualquer linha de código do passo 15.2, busque e leia as
páginas atuais:

- `https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/`
- `https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4/`
- `https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/`
- `https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes/`

**Cole no relatório o trecho real da documentação que você usou para cada
parâmetro.** Se algo neste documento divergir da doc atual, a doc vence — e
reporte a divergência em vez de seguir os dois.

---

## FASE 15.0 — Reconhecimento (OBRIGATÓRIA, PARE AO FINAL)

Não altere nenhum arquivo nesta etapa.

```bash
cd backend
cat src/config/env.ts
cat src/modules/whatsapp/sendMessage.ts
cat src/modules/whatsapp/whatsapp.service.ts
cat src/modules/whatsapp/whatsapp.controller.ts
cat src/modules/whatsapp/whatsapp.routes.ts
cat prisma/schema.prisma | awk '/^model WhatsappConversation /,/^}/'
grep -rn "META_ACCESS_TOKEN\|META_PHONE_NUMBER_ID" src/
find ../frontend/src/pages/panels -type f
grep -rn "requireRole" src/modules/whatsapp/
```

Responda, citando o trecho exato:

1. Quantos lugares no código leem `META_ACCESS_TOKEN` e `META_PHONE_NUMBER_ID`
   hoje? Liste arquivo e linha de cada um — todos vão precisar mudar de fonte.
2. `sendMessage.ts` recebe o `conversationId`, mas de onde ele tira o número de
   origem? Cole a função inteira.
3. Como os painéis de TI e ADM são montados no frontend (arquivo, rota,
   componente de aba)? Preciso saber onde encaixar uma aba nova sem inventar
   um padrão diferente do que já existe.
4. Existe algum lugar do projeto que já faça troca de código OAuth por token
   (qualquer provedor)? Se sim, cole — reaproveitar é melhor que criar um
   segundo padrão.

**PARE AQUI.** Não avance sem aprovação.

---

## FASE 15.1 — Schema: a conexão vira dado, não variável de ambiente

Hoje o token e o phone number ID são globais e colados na mão. Como Tech
Provider, cada cliente empresarial tem os seus. Mesmo com um cliente só hoje, o
modelo precisa refletir a realidade — senão o segundo cliente exige refatorar
tudo o que esta fase acabou de escrever.

```prisma
model WhatsappBusinessAccount {
  id                 Int      @id @default(autoincrement())
  wabaId             String   @unique @map("waba_id")
  phoneNumberId      String   @unique @map("phone_number_id")
  displayPhoneNumber String?  @map("display_phone_number")
  verifiedName       String?  @map("verified_name")
  accessToken        String   @map("access_token")
  isCoexistence      Boolean  @default(false) @map("is_coexistence")
  active             Boolean  @default(true)
  connectedByName    String   @map("connected_by_name")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@map("whatsapp_business_accounts")
}
```

Adicionar em `WhatsappConversation`:

```prisma
  humanRepliedAt DateTime? @map("human_replied_at")
```

`humanRepliedAt` é o que a 15.4 usa para despausar por inatividade. Sem ele, a
conversa fica presa em `botPaused` para sempre — a mesma lacuna que a Fase 14 já
registrou para `transferir_para_humano`.

**Sobre `accessToken` em texto plano:** é um segredo de longa duração gravado no
banco. Duas opções: (a) aceitar, porque a `DATABASE_URL` já é o segredo que
protege tudo o mais neste sistema, ou (b) cifrar em repouso com uma chave nova
no `.env`. **Decisão sua, com justificativa — não escolha em silêncio.** Se
escolher (a), registre isso como dívida técnica no `CONTEXTO.md`, seção
"Dívida técnica conhecida".

```bash
cd backend
npx prisma migrate dev --name fase15_embedded_signup
```

**Prova:** saída completa + conteúdo do `.sql`. Critério: um `CREATE TABLE` novo
e um `ALTER TABLE ... ADD COLUMN` nullable. Qualquer `DROP` ou `NOT NULL` sem
default = pare e reporte.

---

## FASE 15.2 — Frontend: a tela de conexão

**Criar:** uma aba nova nos painéis ADM e TI (seguir o padrão de abas que a 15.0
identificou — não inventar um novo).

Dois estados, só isso:

- **Desconectado:** botão primário "Conectar WhatsApp" (convenção de botão
  primário do `ESTILO.md`, seção 4). Abaixo, uma linha explicando que o dono do
  número precisa estar logado no Facebook dele.
- **Conectado:** cartão mostrando `displayPhoneNumber`, `verifiedName`, e um
  selo indicando se é Coexistence. Botão secundário "Desconectar" (marca
  `active: false`, não apaga a linha).

### O SDK

O `index.html` do Vite carrega o SDK do Facebook. `FB.init` roda uma vez, na
montagem do componente. A chamada de login usa `response_type: 'code'` — nunca
`token` — porque quem troca o código por token é o backend, que é onde o
`META_APP_SECRET` vive. **Se o app secret aparecer em qualquer arquivo do
`frontend/`, a fase está reprovada.**

Esqueleto (confirmar cada parâmetro contra a doc atual antes de usar):

```ts
FB.login(
  (response) => {
    const code = response?.authResponse?.code;
    if (!code) return; // usuário cancelou
    // POST pro backend com { code, sessionInfo } -- ver 15.3
  },
  {
    config_id: import.meta.env.VITE_META_ES_CONFIG_ID,
    response_type: 'code',
    override_default_response_type: true,
    extras: { /* conferir na doc: featureType para Coexistence, sessionInfoVersion */ },
  }
);
```

### Session logging (obrigatório para Coexistence)

Não é opcional e não é log de debug — a Meta exige. Registrar um listener de
`message` na janela, filtrando por origem do Facebook, capturando os eventos da
sessão. O evento final do fluxo de Coexistence é
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (distinto do `FINISH` normal). Ele
carrega os IDs dos ativos, e é ele que diz se o cliente veio pelo caminho de
Coexistence ou criou WABA nova.

Enviar esse payload de sessão junto com o `code` para o backend. **Confirme na
doc o nome exato do campo, a versão de `sessionInfo` e a lista de eventos** —
não confie na memória, nem na minha.

`VITE_META_ES_CONFIG_ID` é público (aparece no bundle, é inofensivo — é um ID de
configuração, não segredo). Ainda assim entra no `.env.example`, com comentário
dizendo de onde sai (App Dashboard → WhatsApp → Embedded Signup Builder).

---

## FASE 15.3 — Backend: trocar o código por token e guardar

**Criar:** `backend/src/modules/whatsapp/embeddedSignup.service.ts`

Fluxo, em ordem:

1. Receber `{ code, sessionInfo }` do frontend.
2. Trocar o código por um token de negócio no endpoint de `oauth/access_token`
   do Graph, usando `META_APP_ID` + `META_APP_SECRET` (ambos entram no
   `envSchema`, `META_APP_ID` é novo).
3. Com esse token, buscar os números da WABA para obter `phoneNumberId`,
   `display_phone_number` e `verified_name`. **Não confie nos IDs que vieram do
   frontend** — o frontend é entrada de usuário, mesmo vindo de um popup da
   Meta. Confirme tudo contra a API.
4. Assinar o app aos webhooks da WABA (`POST /{waba-id}/subscribed_apps`).
5. **Pular o registro do número se for Coexistence** — ele já está registrado.
   Tentar registrar de novo dá erro e não é necessário. Detecte pelo evento de
   sessão do passo anterior.
6. `upsert` em `WhatsappBusinessAccount`.
7. `createLog` com `action: 'WHATSAPP_WABA_CONNECTED'`, details com
   `{ wabaId, phoneNumberId, isCoexistence }` — **nunca o token.**

Rota:

```ts
router.post(
  '/connect',
  requireAuth,
  requireRole(Role.ADM, Role.TI),
  whatsappController.connectBusinessAccount
);
```

### Mudança de fonte do token e do phone number ID

Todos os lugares que a 15.0 listou lendo `META_ACCESS_TOKEN` /
`META_PHONE_NUMBER_ID` passam a ler de `WhatsappBusinessAccount` (`active: true`).
As duas variáveis saem do `envSchema` e do `.env.example`.

**Ponto de atenção:** o webhook recebe `metadata.phone_number_id` em cada
mensagem. É por esse campo que se descobre qual `WhatsappBusinessAccount` usar
para responder — não por "pega a primeira ativa". Com um cliente só o atalho
funciona; com dois, ele responde pelo número errado, silenciosamente. Escreva
certo agora.

**Prova:** rodar o fluxo completo com uma WABA de teste do seu próprio
portfólio, colar (a) a resposta HTTP do `/connect` (sem o token), (b) uma query
mostrando a linha criada em `whatsapp_business_accounts` com o token **mascarado
para os 4 últimos caracteres**, (c) a linha de `Log`.

---

## FASE 15.4 — `smb_message_echoes`: o humano responde, o bot cala

Este é o passo que a Coexistence torna obrigatório e que nenhuma fase anterior
previu. Em Coexistence a mensagem do cliente chega nos dois lugares: no app
WhatsApp Business do garçom **e** no seu webhook. Se o garçom responde na mão, a
Fase 14 não fica sabendo — `botPaused` só é setado quando o *modelo* chama
`transferir_para_humano`. Resultado: bot e humano respondendo a mesma pessoa ao
mesmo tempo.

Assinar o campo `smb_message_echoes` no webhook. Ele entrega as mensagens que o
negócio enviou pelo app. Ao receber uma:

1. `findOrCreateConversation` pelo telefone do destinatário.
2. `botPaused = true`, `humanRepliedAt = new Date()`.
3. Gravar a mensagem como `direction: 'OUT'` — o histórico mandado pra OpenAI
   precisa incluir o que o humano disse, senão, quando o bot voltar, ele
   contradiz o atendente.
4. `createLog` com `action: 'WHATSAPP_HUMAN_TAKEOVER'`.

**Despausa por inatividade, avaliada de forma preguiçosa** (mesmo padrão do TTL
de sessão da Fase 14.5 — sem cron): na chegada de uma mensagem `IN`, se
`botPaused` e `humanRepliedAt` for de mais de N minutos atrás, despausa e
processa normalmente.

**N é decisão de negócio, não sua.** Reporte a pergunta em vez de escolher: 30
minutos e o bot volta a falar por cima de um atendimento humano que só demorou;
4 horas e a conversa fica morta a noite toda. Se precisar de um valor pra rodar
o teste, use 60 e deixe explícito que é provisório.

Assinar também `smb_app_state_sync` **não** está no escopo desta fase —
sincronização de contatos e histórico é outro problema. Registre como pendência.

**Prova:** com o número em Coexistence,
1. cliente manda mensagem → bot responde (log normal da Fase 14);
2. você responde pelo app WhatsApp Business no celular → colar o payload do
   `smb_message_echoes` recebido, a query mostrando `botPaused: true` e
   `humanRepliedAt` preenchido, e a linha `OUT` em `whatsapp_messages`;
3. cliente manda outra mensagem → **nenhuma chamada à OpenAI** (confirmar pela
   ausência de log de custo);
4. simular passagem de tempo (alterar `humanRepliedAt` no banco para N+1
   minutos atrás) → próxima mensagem volta a ser respondida pelo bot.

Tudo com `tee -a docs/verificacoes/<data>-fase-15-embedded-signup.txt`. **Nunca
`curl -v`**, nunca `echo` de variável sensível, nunca token no arquivo — mesma
regra da Fase 13.5.

---

## FASE 15.5 — Material do App Review

Não é código, mas é o motivo desta fase existir. Ao final, confirme por escrito:

- [ ] Pelo menos uma chamada `POST /{phone-number-id}/messages` com 200,
      partindo deste app. A Meta valida isso — o checkbox "ligações de teste de
      API" do formulário não é declaratório.
- [ ] Pelo menos uma chamada de `whatsapp_business_management` com 200
      (`GET /{waba-id}/phone_numbers` serve).
- [ ] O fluxo do 15.2 funciona de ponta a ponta e é gravável em uma tomada.

Cole os `status` HTTP reais das duas chamadas. Sem elas, a submissão é rejeitada
antes de qualquer revisor humano olhar o vídeo.

---

## Fora de escopo desta fase

- `criar_pedido` / `consultar_pedido_ativo` / `cancelar_pedido_ativo` reais.
- UI de caixa de entrada de conversas.
- `smb_app_state_sync` (sincronização de contatos e histórico).
- Áudio.
- Multi-tenant de verdade (cardápio/bairros/config por cliente empresarial). O
  schema desta fase suporta várias WABAs, mas o resto do sistema ainda assume um
  único estabelecimento. Isso é consciente — não tente resolver aqui.

## Pendências que ficam registradas

1. Valor de N para a despausa por inatividade (15.4).
2. Cifrar ou não `accessToken` em repouso (15.1).
3. Throughput fixo de 20 mps em números com Coexistence — irrelevante para o
   volume atual, mas fecha a porta para crescimento sem sair da Coexistence.
4. Data-limite de 15/10/2026 para a migração ao Embedded Signup v4. Se esta fase
   for implementada na v3 por qualquer motivo, isso vira retrabalho com prazo.
