# FASE 14 — Loop com a OpenAI e resposta pelo WhatsApp

> Para o Claude Code, rodando dentro de `sistema-pedidos-rede/`. Depende da Fase 13
> aprovada (webhook recebendo, validando, gravando). Escopo desta fase: o bot
> **responde de verdade** ao cliente, usando cardápio/bairros/config reais e
> os schemas de function calling reais — mas **nenhuma função ainda cria,
> consulta ou cancela pedido de verdade**, exceto `transferir_para_humano`, que
> já silencia o bot pra valer. Criar pedido real é Fase 15.

## Antes de tudo

Leia `docs/CONTEXTO.md` e
**`docs/BOT-WHATSAPP-PROMPT.md`** — este segundo arquivo precisa
ser colocado nesse caminho dentro do repositório antes de rodar esta fase; ele
não chega sozinho, precisa ser copiado pra lá manualmente (contém o system
prompt completo e os schemas de function calling em modo `strict`). **Copie o
conteúdo desse arquivo, não reescreva nem parafraseie** — ele já foi revisado e
corrigido nesta mesma conversa (schema em `strict` mode, `numero_pedido`
obrigatório em cancelamento, `transferir_para_humano` em vez de recusar bairro
fora da lista).

A partir desta fase, **cada mensagem processada custa dinheiro de verdade**
(chamada à API da OpenAI). Isso muda o que "erro silencioso" significa: antes
custava só um dado perdido, agora custa dado perdido *e* API cobrada à toa se
o fluxo ficar em loop ou for abusado.

---

## FASE 14.0 — Reconhecimento (OBRIGATÓRIA, PARE AO FINAL)

Não altere nenhum arquivo nesta etapa.

```bash
cd backend
cat src/modules/config/config.service.ts | grep -n -A15 "getConfig"
cat src/modules/menu/menu.service.ts | grep -n -A10 "listItems"
cat src/modules/neighborhoods/neighborhoods.service.ts | grep -n -A10 "listNeighborhoods"
cat src/utils/deliveryWindow.ts
cat src/utils/trailerSchedule.ts
cat package.json | grep -i "axios\|node-fetch\|\"node\""
node --version
cat src/modules/whatsapp/whatsapp.service.ts
cat src/modules/whatsapp/whatsapp.controller.ts
```

Responda, citando o trecho exato:

1. `getConfig()` retorna o objeto `SystemConfig` completo (incluindo
   `scheduledCloseAt`, `dailyNotice`, `deliveryExtendedUntil`) ou uma versão
   filtrada? Se filtrada, existe uma versão não-filtrada pra uso interno?
2. `listItems(false)` e `listNeighborhoods()` — confirme os campos exatos que
   cada um retorna (nome, preço, `requiredChoice`, categoria; nome, taxa,
   `active`).
3. Existe `axios` ou `node-fetch` nas dependências? Qual a versão do Node
   (confirmar que `fetch` nativo está disponível — precisa ser 18+)?
4. Cole o `whatsapp.service.ts` e `whatsapp.controller.ts` reais desta fase —
   preciso ver exatamente onde `storeInboundMessages` é chamada dentro de
   `receive()` pra saber onde encaixar o processamento novo.

**PARE AQUI.** Não avance sem aprovação.

---

## FASE 14.1 — Variáveis de ambiente

Adicionar ao `envSchema`:

```ts
OPENAI_API_KEY: z.string().min(10),
OPENAI_MODEL: z.string().default('gpt-5.1-mini'), // ver nota abaixo
META_ACCESS_TOKEN: z.string().min(10),
META_PHONE_NUMBER_ID: z.string().min(5),
```

**Nota sobre `OPENAI_MODEL`:** o valor default acima é só um placeholder pra
não deixar o campo vazio — **não é uma recomendação testada**. Antes de rodar
em produção, teste variantes `nano`/`mini` da geração atual com pelo menos 10
transcrições reais de pedido (gíria, erro de digitação, cliente mudando de
ideia no meio) e troque o valor no `.env`, não no código — é exatamente por
isso que é variável de ambiente e não constante.

---

## FASE 14.2 — Schema: só um campo novo

```prisma
model WhatsappMessage {
  // ... campos existentes da Fase 13, sem alteração ...
  content String? @map("content")
}
```

`content` guarda o texto legível (extraído da mensagem recebida, ou gerado
pelo bot na resposta) — é o que alimenta o histórico da conversa mandado pra
OpenAI. `rawPayload` continua guardando o payload bruto (do Meta pra mensagens
`IN`, da resposta da OpenAI pra mensagens `OUT`) — não duplique a mesma
informação em dois formatos diferentes além do necessário.

```bash
npx prisma migrate dev --name fase14_whatsapp_content
```

**Prova:** saída do comando + `.sql` gerado. Só `ALTER TABLE ... ADD COLUMN`,
nullable.

---

## FASE 14.3 — Rate limit por telefone (proteção de custo, versão mínima)

Não é o rate limit completo de produção — esse número certo só se decide com
uso real. Esta versão só evita que uma falha de loop ou um teste malfeito gere
uma fatura inesperada.

**Criar:** `backend/src/modules/whatsapp/whatsappRateLimit.ts`

```ts
import { prisma } from '../../config/prisma';

const WINDOW_MINUTES = 10;
const MAX_INBOUND_PER_WINDOW = 20;

export async function isRateLimited(phone: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const count = await prisma.whatsappMessage.count({
    where: {
      direction: 'IN',
      createdAt: { gte: since },
      conversation: { phone },
    },
  });
  return count > MAX_INBOUND_PER_WINDOW;
}
```

Se `isRateLimited` for `true`: **não chame a OpenAI**. Responda uma mensagem
fixa ("Recebi muitas mensagens suas em pouco tempo, aguarda um instante e
tenta de novo.") e pare — sem custo de API nesse caminho.

---

## FASE 14.4 — Montagem do prompt com dado vivo

**Criar:** `backend/src/modules/whatsapp/promptBuilder.ts`

```ts
import { getConfig } from '../config/config.service';
import { listItems } from '../menu/menu.service';
import { listNeighborhoods } from '../neighborhoods/neighborhoods.service';
import { isDeliveryTimeBlocked } from '../../utils/deliveryWindow';
import { isEffectivelyOpen } from '../../utils/trailerSchedule';
import { SYSTEM_PROMPT_TEMPLATE } from './systemPromptTemplate'; // conteúdo colado do .md anexo

export async function buildSystemPrompt(): Promise<string> {
  const config = await getConfig();
  const rawMenu = await listItems(false);
  const rawNeighborhoods = (await listNeighborhoods()).filter((n: any) => n.active);

  // listItems/listNeighborhoods retornam o model Prisma inteiro (confirmado
  // na 14.0) -- inclui archived/createdAt/updatedAt, que não servem pro
  // modelo e só custam token à toa. Mapeie só o que o system prompt precisa,
  // e converta Decimal pra number explicitamente (Prisma.Decimal não
  // serializa como número puro num JSON.stringify direto).
  const menu = rawMenu.map((item: any) => ({
    name: item.name,
    category: item.category,
    price: Number(item.price),
    description: item.description,
    ingredients: item.ingredients,
    requiredChoice: item.requiredChoice,
    available: item.available,
  }));

  const neighborhoods = rawNeighborhoods.map((n: any) => ({
    name: n.name,
    deliveryFee: Number(n.deliveryFee),
  }));

  const now = new Date();

  return SYSTEM_PROMPT_TEMPLATE
    .replace('{{TRAILER_ABERTO}}', isEffectivelyOpen(config, now) ? 'aberto' : 'fechado')
    .replace('{{HORA_ATUAL}}', now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
    .replace('{{DELIVERY_AINDA_PERMITIDO}}', isDeliveryTimeBlocked(config) ? 'não' : 'sim')
    .replace('{{CONTATO_TELEFONE}}', config.contactPhone ?? '')
    .replace('{{AVISO_DO_DIA}}', config.dailyNotice ?? '')
    .replace('{{CARDAPIO_JSON}}', JSON.stringify(menu))
    .replace('{{BAIRROS_JSON}}', JSON.stringify(neighborhoods));
}
```

**Criar:** `backend/src/modules/whatsapp/systemPromptTemplate.ts` — exporta uma
`const SYSTEM_PROMPT_TEMPLATE = \`...\`` com o texto **exato** do system prompt
de `BOT-WHATSAPP-PROMPT.md`, colado, não reescrito.

**Prova:** um `verify-tmp.ts` chamando `buildSystemPrompt()` e imprimindo o
resultado — confirme visualmente que `{{...}}` nenhum sobrou sem substituir, e
que o cardápio/bairros que aparecem batem com o que está no banco agora.

---

## FASE 14.5 — Histórico da conversa, respeitando o TTL de sessão

**Criar:** `backend/src/modules/whatsapp/conversationHistory.ts`

```ts
import { prisma } from '../../config/prisma';

const SESSION_TTL_MINUTES = 60;

export async function getRecentHistory(conversationId: number) {
  const conversation = await prisma.whatsappConversation.findUniqueOrThrow({
    where: { id: conversationId },
  });

  const sessionStart = conversation.lastInboundAt
    ? new Date(conversation.lastInboundAt.getTime() - SESSION_TTL_MINUTES * 60_000)
    : new Date(0);

  // Se a última mensagem anterior foi há mais de 1h, não existe "sessão
  // anterior" -- a busca abaixo já não vai encontrar nada além da mensagem
  // atual, o que é o comportamento certo (sessão nova, sem contexto velho).
  return prisma.whatsappMessage.findMany({
    where: { conversationId, createdAt: { gte: sessionStart } },
    orderBy: { createdAt: 'asc' },
  });
}
```

Nota: isso é avaliado de forma preguiçosa, sem cron — a "expiração" da sessão
é só a consequência de a busca não trazer mensagens antigas o suficiente,
exatamente como decidido antes nesta conversa pro TTL de 1h.

---

## FASE 14.6 — Chamada à OpenAI

**Criar:** `backend/src/modules/whatsapp/openaiClient.ts`

```ts
import { env } from '../../config/env';
import { TOOLS } from './tools'; // schemas -- ver nota abaixo

export async function callOpenAI(systemPrompt: string, history: Array<{ role: string; content: string }>) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      tools: TOOLS,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI respondeu ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
```

Sem dependência nova — `fetch` já é nativo no Node instalado (confirmar na
13.0 acima). Não adicione `axios`/`node-fetch` sem essa confirmação primeiro
ter dado negativo.

**Criar:** `backend/src/modules/whatsapp/tools.ts` — copie os 4 objetos JSON
(`criar_pedido`, `consultar_pedido_ativo`, `cancelar_pedido_ativo`,
`transferir_para_humano`) **exatamente** como estão em
`BOT-WHATSAPP-PROMPT.md`, seção 2 — não altere schema nenhum.

---

## FASE 14.7 — Execução das funções: só `transferir_para_humano` é real

```ts
async function dispatchToolCall(name: string, args: any, conversationId: number) {
  if (name === 'transferir_para_humano') {
    await prisma.whatsappConversation.update({
      where: { id: conversationId },
      data: { botPaused: true },
    });
    console.log('[WHATSAPP_BOT_HANDOFF]', { conversationId, motivo: args.motivo, resumo: args.resumo });
    return 'Só um instante, vou confirmar isso com a nossa equipe.';
  }

  // criar_pedido / consultar_pedido_ativo / cancelar_pedido_ativo -- ainda
  // não tocam dado real nesta fase. Loga pra inspeção manual, nunca finge
  // sucesso pro cliente.
  console.log('[WHATSAPP_BOT_STUB_CALL]', { conversationId, name, args });
  return 'Isso ainda está sendo configurado por aqui -- já te chamamos assim que possível.';
}
```

**Endpoint mínimo pra destravar uma conversa pausada** (a UI de caixa de
entrada é fase futura, mas sem isso um teste de `transferir_para_humano` deixa
a conversa presa pra sempre):

Em `whatsapp.routes.ts`:

```ts
router.patch(
  '/conversations/:id/resume',
  requireAuth,
  requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI),
  whatsappController.resumeConversation
);
```

---

## FASE 14.8 — Ligar tudo em `receive()`, com fallback de falha

Duas mudanças em `whatsapp.service.ts` antes de mexer em `receive()`:

- **Exportar `findOrCreateConversation`** (hoje é privada) — vai ser chamada
  também a partir do novo fluxo em `receive()`, não só de dentro de
  `storeInboundMessages`.
- **Extrair a navegação `entry → changes → messages` pra uma função
  compartilhada** (ex.: `extractMessages(payload)`), usada tanto por
  `storeInboundMessages` quanto pelo novo loop — hoje essa navegação está só
  inline dentro de `storeInboundMessages`; duplicá-la no loop novo seria a
  mesma lógica escrita duas vezes com chance de divergir.

Modificar `receive()` (depois de `storeInboundMessages`, que continua
gravando o `IN` bruto como já faz):

```ts
export const receive = async (req: Request, res: Response) => {
  // ... validação de assinatura igual à Fase 13 ...
  res.sendStatus(200);

  try {
    const messages = extractMessages(req.body); // função compartilhada, ver acima
    await storeInboundMessages(req.body);

    for (const message of messages) {
      const conversation = await findOrCreateConversation(message.from);

      if (conversation.botPaused) continue; // silenciado de verdade -- nem chama a OpenAI

      if (await isRateLimited(message.from)) {
        await sendWhatsappText(message.from, conversation.id, 'Recebi muitas mensagens suas em pouco tempo, aguarda um instante e tenta de novo.');
        continue;
      }

      try {
        const systemPrompt = await buildSystemPrompt();
        const history = await getRecentHistory(conversation.id);
        const completion = await callOpenAI(systemPrompt, toChatFormat(history));

        const choice = completion.choices[0].message;
        let replyText: string;

        if (choice.tool_calls?.length) {
          const call = choice.tool_calls[0];
          replyText = await dispatchToolCall(call.function.name, JSON.parse(call.function.arguments), conversation.id);
        } else {
          replyText = choice.content;
        }

        await sendWhatsappText(message.from, conversation.id, replyText, completion);
      } catch (innerErr) {
        // Fecha exatamente a lacuna apontada depois da Fase 13: falha aqui
        // não pode virar silêncio. O Meta já recebeu 200 e não reenvia --
        // se essa mensagem de fallback também falhar, não há mais o que
        // fazer localmente, e isso fica registrado no log, não escondido.
        console.error('[WHATSAPP_BOT_FAILURE]', { phone: message.from, error: innerErr });
        await sendWhatsappText(message.from, conversation.id, 'Tive um problema técnico agora, já te retorno.').catch((sendErr) =>
          console.error('[WHATSAPP_BOT_FAILURE_DOUBLE]', { phone: message.from, sendErr })
        );
      }
    }
  } catch (err) {
    console.error('Erro ao processar webhook do WhatsApp:', err);
  }
};
```

**Criar:** `backend/src/modules/whatsapp/sendMessage.ts`

```ts
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';

export async function sendWhatsappText(to: string, conversationId: number, text: string, sourcePayload?: any) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Falha ao enviar mensagem no WhatsApp: ${JSON.stringify(result)}`);
  }

  await prisma.whatsappMessage.create({
    data: {
      conversationId,
      waMessageId: result.messages?.[0]?.id ?? null,
      direction: 'OUT',
      content: text,
      rawPayload: sourcePayload ?? result,
    },
  });
}
```

Confirmar na 14.0 se `v21.0` é a versão de Graph API correta pra sua conta —
Meta versiona essa URL, e pode ter mudado desde que este documento foi escrito.

---

## FASE 14.9 — Prova end-to-end

Com `npm run dev` de pé, criar payloads de teste (mesmo padrão de
`verify-tmp.ts` da Fase 13, com assinatura HMAC real) simulando mensagens de
clientes diferentes, redirecionando tudo com `tee` pra
`docs/verificacoes/2026-07-22-fase-14-loop-openai.txt`:

1. **"oi"** — esperado: resposta de saudação, sem chamar função nenhuma.
2. **"vocês entregam em <bairro real e ativo>"** — esperado: resposta correta
   usando o bairro/taxa reais do banco (confirme comparando com uma query
   direta na tabela `Neighborhood`).
3. **"vocês entregam em <bairro inventado, fora da lista>"** — esperado: o
   modelo chama `transferir_para_humano`, a conversa correspondente fica com
   `botPaused: true` no banco (confirme por query), e o log mostra
   `[WHATSAPP_BOT_HANDOFF]`.
4. **Mensagem nova pro mesmo telefone do item 3, sem destravar** — esperado:
   nenhuma chamada à OpenAI acontece (confirme pela ausência de log novo de
   custo/chamada), a mensagem só fica gravada.
5. **Destravar via `PATCH /conversations/:id/resume`**, depois repetir uma
   mensagem — esperado: volta a responder normalmente.
6. **"quero pedir um X-Tudo"** — esperado: o modelo tenta chamar `criar_pedido`,
   a resposta ao cliente é a mensagem stub ("ainda está sendo configurado"), e
   o log mostra `[WHATSAPP_BOT_STUB_CALL]` com os argumentos que o modelo
   extraiu — cole esses argumentos no arquivo de prova, é o que mostra se o
   modelo está extraindo item/quantidade corretamente, mesmo sem executar.
7. **21 mensagens seguidas do mesmo número em poucos minutos** — a partir da
   22ª, esperado: resposta fixa de rate limit, sem chamada à OpenAI (confirme
   pela ausência de novo log de custo).

Pra cada item, cole no arquivo: o payload enviado, a resposta HTTP do webhook,
a linha relevante do banco (`WhatsappMessage`/`WhatsappConversation`), e
qualquer log `[WHATSAPP_BOT_*]` correspondente.

---

## Fora de escopo desta fase

- `criar_pedido`, `consultar_pedido_ativo`, `cancelar_pedido_ativo` tocando
  dado real — Fase 15.
- UI de caixa de entrada de conversas — fase futura, ainda sem número definido.
- Áudio — fica pra depois, precisa de download de mídia + transcrição, escopo
  próprio.
- Ajuste fino do rate limit (número certo) — só com dado de uso real.

## Pendência que fica registrada

O `OPENAI_MODEL` no `.env` de produção precisa ser decidido com teste real
antes do lançamento — o valor default deste documento é só placeholder, não
recomendação.
