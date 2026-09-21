# FASE 13 — Webhook do WhatsApp: infraestrutura e persistência

> Para o Claude Code, rodando dentro de `sistema-pedidos-rede/`. Escopo estrito:
> receber, validar, desduplicar e guardar mensagens. **Nenhuma chamada à OpenAI
> nesta fase, nenhuma resposta enviada ao cliente ainda.** Isso vem na Fase 14.

## Antes de tudo

Leia `docs/CONTEXTO.md` e
`docs/superpowers/specs/2026-07-15-delivery-auto-cutoff-design.md` (só pelo
padrão arquitetural — sem scheduler, `Log`/`createLog` genéricos, `verify-tmp.ts`
descartável, `TZ=America/Sao_Paulo` já configurado no servidor).

**Atenção a uma linha específica do CONTEXTO:** ele registra "Item 09 (bot
WhatsApp): descartado pelo Rosario, fora do escopo atual." Isso está
desatualizado — a decisão mudou depois que o contrato com o cliente fechou —
mas **atualize essa linha no CONTEXTO.md antes de rodar esta fase**, ou
qualquer sessão futura (sua ou de outro agente) que leia o documento primeiro
vai encontrar uma instrução que contradiz o trabalho que está prestes a fazer.

## Por que esta fase existe separada da Fase 14

Provar que uma mensagem chega, é validada e fica salva no banco não depende de
nenhuma decisão sobre modelo de LLM, prompt ou custo. Misturar as duas coisas
significa que um bug na chamada da OpenAI (fora do seu controle — rede, rate
limit, chave) bloquearia a prova de que a parte de infraestrutura funciona.

---

## FASE 13.0 — Reconhecimento (OBRIGATÓRIA, PARE AO FINAL)

Não altere nenhum arquivo nesta etapa.

```bash
cd backend
cat src/server.ts
cat src/config/env.ts
find src/modules -maxdepth 1 -type d
cat .env.example
cat src/utils/logger.ts
```

Responda, citando o trecho exato:

1. `app.use(express.json())` em `server.ts` — confirme que não há nenhum
   `verify` callback hoje (ou seja, `req.rawBody` não existe em nenhuma rota
   ainda).
2. `env.ts` usa Zod com `safeParse` e `process.exit(1)` se inválido — confirme
   que novas variáveis de ambiente precisam entrar em `envSchema`, não ser
   lidas via `process.env.X` direto em outro lugar.
3. Existe alguma pasta ou arquivo com "whatsapp" no nome já? Se sim, pare e
   reporte antes de continuar — pode já existir trabalho parcial.

**PARE AQUI.** Não avance sem aprovação.

---

## FASE 13.1 — Variáveis de ambiente

Adicionar ao `envSchema` em `src/config/env.ts` (só o que esta fase usa —
`META_ACCESS_TOKEN` e `META_PHONE_NUMBER_ID` são pra enviar mensagem, entram na
Fase 14, não agora):

```ts
META_APP_SECRET: z.string().min(10),
META_VERIFY_TOKEN: z.string().min(6),
```

Adicionar ao `.env.example`:

```
META_APP_SECRET="do painel do App no Meta for Developers, aba Configurações Básicas"
META_VERIFY_TOKEN="qualquer string sua — é o que você digita no painel do Meta ao configurar o webhook"
```

**Prova:** rode `npm run dev` sem essas variáveis no `.env` local — o servidor
deve recusar subir com erro do Zod apontando os campos faltando (mesmo
comportamento de hoje quando `DATABASE_URL` falta). Cole a saída. Depois
adicione valores de teste e confirme que sobe normalmente.

---

## FASE 13.2 — Corrigir `express.json()` para preservar o corpo bruto

**Este é o passo que mais importa desta fase.** A verificação de assinatura do
Meta precisa do corpo exatamente como chegou, em bytes — não do objeto já
parseado. Uma vez que o Express lê o stream da requisição, não é possível
lê-lo de novo em outro middleware. A única forma de preservar isso sem mudar o
comportamento das 9 rotas existentes é capturar o buffer durante o mesmo parse:

Em `src/server.ts`, trocar:

```diff
-app.use(express.json());
+app.use(express.json({
+  verify: (req: any, _res, buf) => {
+    req.rawBody = buf;
+  }
+}));
```

Isso é aditivo — `req.body` continua idêntico ao de hoje em toda rota
existente. `req.rawBody` (um `Buffer`) passa a existir em toda requisição, mas
só a rota do webhook vai usá-lo.

**Prova:** `npm run build` sem erro, e um `curl` em qualquer rota já existente
(ex.: `GET /api/menu`) continuando a funcionar exatamente como antes.

---

## FASE 13.3 — Schema

```prisma
enum MessageDirection {
  IN
  OUT
}

model WhatsappConversation {
  id            Int       @id @default(autoincrement())
  phone         String    @unique
  botPaused     Boolean   @default(false) @map("bot_paused")
  lastInboundAt DateTime? @map("last_inbound_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  messages WhatsappMessage[]

  @@map("whatsapp_conversations")
}

model WhatsappMessage {
  id             Int              @id @default(autoincrement())
  conversationId Int              @map("conversation_id")
  waMessageId    String?          @unique @map("wa_message_id")
  direction      MessageDirection
  rawPayload     Json             @map("raw_payload")
  createdAt      DateTime         @default(now()) @map("created_at")

  conversation WhatsappConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("whatsapp_messages")
}
```

Nota deliberada: **sem campo de conteúdo/texto extraído ainda, sem
`toolCall`, sem contagem de tokens.** Isso é schema mínimo pra provar que a
mensagem chega e fica salva. A Fase 14 adiciona o que for realmente necessário
quando o loop de LLM existir — evita adivinhar formato agora e ter que
migrar de novo depois.

`waMessageId` é `@unique` e é **isso** que impede duplicata: o Meta reenvia
webhook que não recebeu 200 a tempo (com backoff, por até 36h). Se a segunda
tentativa tentar inserir o mesmo `waMessageId`, a constraint de unicidade
falha — trate esse erro específico como sucesso silencioso (mensagem já
processada), não como falha.

```bash
cd backend
npx prisma migrate dev --name fase13_whatsapp_webhook
```

**Prova:** saída completa do comando + conteúdo do `.sql` gerado. Critério:
só `CREATE TABLE`/`CREATE TYPE` novos — nada mexendo em tabela existente.

---

## FASE 13.4 — Módulo `whatsapp`

**Criar:** `backend/src/modules/whatsapp/whatsapp.service.ts`

```ts
import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';

export function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', env.META_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

async function findOrCreateConversation(phone: string) {
  return prisma.whatsappConversation.upsert({
    where: { phone },
    update: { lastInboundAt: new Date() },
    create: { phone, lastInboundAt: new Date() },
  });
}

export async function storeInboundMessages(payload: any) {
  const entries = payload.entry ?? [];
  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      const messages = change.value?.messages ?? [];
      for (const message of messages) {
        const phone: string = message.from;
        const waMessageId: string = message.id;
        const conversation = await findOrCreateConversation(phone);

        try {
          await prisma.whatsappMessage.create({
            data: {
              conversationId: conversation.id,
              waMessageId,
              direction: 'IN',
              rawPayload: message,
            },
          });
        } catch (err: any) {
          if (err.code === 'P2002') {
            // waMessageId duplicado -- reentrega do Meta, já processada. Não é erro.
            continue;
          }
          throw err;
        }
      }
      // change.value?.statuses (recibos de entrega/leitura) são ignorados
      // nesta fase -- não fazem parte do escopo de mensagem recebida.
    }
  }
}
```

**Criar:** `backend/src/modules/whatsapp/whatsapp.controller.ts`

```ts
import { Request, Response } from 'express';
import { env } from '../../config/env';
import { isValidSignature, storeInboundMessages } from './whatsapp.service';

export const verify = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
};

export const receive = async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!rawBody || !isValidSignature(rawBody, signature)) {
    res.sendStatus(401);
    return;
  }

  // Responde 200 imediatamente -- Meta reenvia com backoff se demorar,
  // e reenvio duplicado é exatamente o cenário que waMessageId único evita.
  res.sendStatus(200);

  try {
    await storeInboundMessages(req.body);
  } catch (err) {
    console.error('Erro ao processar webhook do WhatsApp:', err);
  }
};
```

**Criar:** `backend/src/modules/whatsapp/whatsapp.routes.ts`

```ts
import { Router } from 'express';
import * as whatsappController from './whatsapp.controller';

const router = Router();

router.get('/', whatsappController.verify);
router.post('/', whatsappController.receive);

export default router;
```

**Modificar:** `backend/src/server.ts` — adicionar ao lado das outras rotas:

```diff
 import reportsRoutes from './modules/reports/reports.routes';
+import whatsappRoutes from './modules/whatsapp/whatsapp.routes';
```
```diff
 app.use('/api/reports', reportsRoutes);
+app.use('/api/webhook/whatsapp', whatsappRoutes);
```

---

## FASE 13.5 — Prova end-to-end

**Todo comando de prova desta fase é redirecionado com `tee` pra um arquivo em
`docs/verificacoes/` — não descreva o que rodou, o arquivo é a prova bruta.**

```bash
mkdir -p docs/verificacoes
```

Cuidado obrigatório: **nunca use `curl -v`** neste arquivo — verbose mostra os
headers da requisição, incluindo qualquer token/segredo. Os comandos abaixo já
usam `-i` (só headers de resposta), que é seguro pra ficar num arquivo que vai
pro Git. Não faça `echo` de nenhuma variável de ambiente sensível
(`META_APP_SECRET`, tokens) em nenhum ponto deste arquivo.

Com `npm run dev` numa janela dedicada (sem tocar Enter nela):

### a) Verificação (GET)

```bash
{
echo "=== a) GET verify, token correto ==="
curl -i "http://localhost:3000/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=<MESMO_VALOR_DO_.ENV>&hub.challenge=teste123"
echo ""
echo "=== a) GET verify, token errado ==="
curl -i "http://localhost:3000/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=teste123"
} 2>&1 | tee -a docs/verificacoes/2026-07-21-fase-13-whatsapp-webhook.txt
```

Esperado: primeiro `200` com corpo `teste123` exato; segundo `403`.

### b) Mensagem com assinatura válida — script descartável pra gerar a assinatura real

Crie `backend/verify-tmp.ts` (descartável, apagar depois):

```ts
import crypto from 'crypto';
import fs from 'fs';

const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID_TESTE',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '5531999999999', phone_number_id: 'TESTE' },
        contacts: [{ profile: { name: 'Cliente Teste' }, wa_id: '5531988887777' }],
        messages: [{
          from: '5531988887777',
          id: 'wamid.TESTE_' + Date.now(),
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'text',
          text: { body: 'oi' },
        }],
      },
      field: 'messages',
    }],
  }],
};

const rawBody = JSON.stringify(payload);
const APP_SECRET = process.env.META_APP_SECRET || '<cole o mesmo valor do .env aqui>';
const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');

fs.writeFileSync('payload-teste.json', rawBody);
console.log('Assinatura:', signature);
console.log('Payload salvo em payload-teste.json');
// NUNCA console.log(APP_SECRET) aqui -- só a assinatura resultante.
```

```bash
cd backend
npx tsx verify-tmp.ts
```

Copie a assinatura impressa (isso NÃO entra no arquivo de verificações — é só
um valor intermediário pra montar o próximo comando), então:

```bash
{
echo "=== b) POST com assinatura válida ==="
curl -i -X POST http://localhost:3000/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: <COLE_A_ASSINATURA_AQUI>" \
  --data-binary @payload-teste.json
} 2>&1 | tee -a ../docs/verificacoes/2026-07-21-fase-13-whatsapp-webhook.txt
```

Esperado: `200` imediato.

**Confirmar no banco:** existe uma linha em `whatsapp_conversations` com
`phone = '5531988887777'` e uma em `whatsapp_messages` com o `waMessageId`
gerado e `direction = 'IN'`. Rode a query e inclua o resultado no mesmo arquivo:

```bash
{
echo "=== b) confirmação no banco ==="
npx prisma studio --browser none &
sleep 2
# ou, mais direto, um verify-tmp.ts que faz:
#   prisma.whatsappMessage.findMany({ where: { conversation: { phone: '5531988887777' } } })
# e imprime o resultado -- cole a saída real aqui.
} 2>&1 | tee -a ../docs/verificacoes/2026-07-21-fase-13-whatsapp-webhook.txt
```

### c) Assinatura inválida — deve rejeitar

```bash
{
echo "=== c) POST com assinatura inválida (deve dar 401) ==="
curl -i -X POST http://localhost:3000/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=0000000000000000000000000000000000000000000000000000000000000000" \
  --data-binary @payload-teste.json
} 2>&1 | tee -a ../docs/verificacoes/2026-07-21-fase-13-whatsapp-webhook.txt
```

Esperado: `401`. **Se isso retornar 200, a Fase 13.2 não funcionou — o corpo
bruto não está sendo capturado corretamente, e é a coisa mais importante desta
fase pra acertar.**

### d) Reenvio do mesmo `waMessageId` — deve ser idempotente

Rode o mesmo `curl` do item (b) de novo, com a mesma assinatura e o mesmo
payload, redirecionando pro mesmo arquivo com `tee -a`. Esperado: `200`, mas
**nenhuma linha nova** em `whatsapp_messages` (confirme por contagem
antes/depois, e cole ambas as contagens no arquivo).

### e) Limpeza

```bash
rm backend/verify-tmp.ts backend/payload-teste.json
```

O arquivo `docs/verificacoes/2026-07-21-fase-13-whatsapp-webhook.txt` **não é
apagado** — é o registro permanente desta fase, com os comandos reais e as
saídas reais, no mesmo espírito dos planos/specs já versionados em
`docs/superpowers/`.

---

## Fora de escopo desta fase

- Chamada à OpenAI, prompt, function calling — Fase 14.
- Envio de qualquer resposta ao cliente via Graph API — Fase 14.
- `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID` — entram quando existir código
  que os use.
- Rate limit por telefone — necessário antes de produção real, mas não bloqueia
  a prova desta fase. Fica registrado como pendência pra Fase 15.
- Extração de texto/áudio da mensagem, sessão de conversa, qualquer lógica de
  negócio — esta fase só prova que o dado chega e fica salvo com segurança.

## Pendência que não é desta fase, mas fica registrada

Rate limit por telefone (a rota pública tem `publicOrdersLimiter`, 5/10min por
IP — o bot não passa por essa rota, então não tem proteção nenhuma hoje).
Decidir limite e mecanismo (contagem em `whatsapp_messages`/`Order` por
`customerPhone`, já que não há Redis no projeto) antes da Fase 15 criar pedidos
de verdade.
