# Auto-corte de Delivery à Meia-Noite — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pedidos de delivery feitos pelo cardápio público param de ser aceitos automaticamente às 00h, com TI/ADM podendo prorrogar por blocos de +1h; pedidos internos (garçom) não são afetados.

**Architecture:** Um campo nullable novo em `SystemConfig` (`deliveryExtendedUntil`) guarda o fim de uma prorrogação ativa. Uma função pura (backend e frontend, réplicas idênticas em espírito) decide "bloqueado por horário" na hora da requisição — sem job agendado, sem scheduler. O corte só se aplica a pedidos com `clientOnline: true` (cardápio público); pedidos internos (`POST /api/orders`) continuam livres, sujeitos só ao toggle manual `deliveryActive` que já existe.

**Tech Stack:** Node/Express/TypeScript/Prisma/PostgreSQL (backend), React/TypeScript/Zustand/Vite (frontend). Sem dependência nova.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-15-delivery-auto-cutoff-design.md` — qualquer dúvida de comportamento, essa é a fonte.
- Sem scheduler/job em background — tudo computado na hora da requisição (mesmo padrão de `backend/src/utils/shift.ts`).
- O servidor já roda com `TZ=America/Sao_Paulo` (variável de ambiente obrigatória do projeto) — `new Date().getHours()` já reflete o horário local, sem conversão manual.
- Toda mutação sensível grava `Log` via `createLog` (padrão já usado em todo o projeto).
- Todo `io.emit(...)` acontece depois do `await` da escrita no banco, nunca antes.
- `io.of('/public').emit(...)` nunca carrega dado de pedido — só o que já é público (linha vermelha do projeto, ver `CONTEXTO.md` seção 6). Esta feature não viola isso: só expõe um timestamp de configuração, não dado de cliente.
- **Sem framework de teste novo.** O projeto não tem jest/vitest/mocha em nenhum dos dois pacotes — verificação é sempre manual: `curl` contra o servidor local rodando de verdade, ou scripts `tsx` descartáveis (criados, rodados, deletados antes do commit) para lógica pura sem HTTP envolvido. Cole a saída real de cada comando antes de marcar um passo como concluído — nunca descreva o que o comando "deveria" retornar.
- **Cuidado com processo fantasma na porta 3000.** Se um teste contradizer um arquivo que você confirmou correto, rode `netstat -ano | findstr :3000` e mate o PID antes de qualquer outra hipótese (lição documentada em `CONTEXTO.md` seção 2.6). Rode `npm run dev` numa janela dedicada que você não vai tocar (não aperte Enter nela — isso reinicia o `tsx watch` e derruba a porta).
- Preços/dinheiro não são tocados nesta feature — irrelevante aqui, mas mantenha `Prisma.Decimal` se qualquer código futuro nesta área mexer em valores monetários.

---

### Task 1: Schema — campo `deliveryExtendedUntil`

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: coluna `delivery_extended_until` (nullable `TIMESTAMP`) na tabela `system_config`, campo Prisma `deliveryExtendedUntil: Date | null` no client gerado. Todas as tarefas seguintes dependem deste campo existir no client Prisma.

- [ ] **Step 1: Adicionar o campo ao model `SystemConfig`**

Abra `backend/prisma/schema.prisma` e localize o model `SystemConfig`. Adicione a linha marcada:

```diff
 model SystemConfig {
   id               Int      @id @default(1)
   trailerOpen      Boolean  @default(true)  @map("trailer_open")
   deliveryActive   Boolean  @default(true)  @map("delivery_active")
+  deliveryExtendedUntil DateTime? @map("delivery_extended_until")
   maxTables        Int      @default(10)    @map("max_tables")
   contactPhone     String   @map("contact_phone")
   contactInstagram String   @map("contact_instagram")
   updatedBy        String   @map("updated_by")
   updatedAt        DateTime @updatedAt @map("updated_at")

   @@map("system_config")
 }
```

- [ ] **Step 2: Confirmar qual banco a `DATABASE_URL` local aponta antes de migrar**

Rode (a partir de `backend/`):

```bash
cd backend
cat .env | grep DATABASE_URL
```

Confirme que é o banco de desenvolvimento, não produção, antes de prosseguir. Se não houver `.env` local configurado, pare aqui e configure conforme `CONTEXTO.md` seção 8.1 antes de continuar — esta tarefa não pode ser verificada sem um Postgres real acessível.

- [ ] **Step 3: Rodar a migration**

```bash
cd backend
npx prisma migrate dev --name add_delivery_extended_until
```

Expected: saída terminando em algo como `Your database is now in sync with your schema.` e um novo diretório em `backend/prisma/migrations/<timestamp>_add_delivery_extended_until/` contendo `migration.sql`.

- [ ] **Step 4: Conferir o SQL gerado**

```bash
cat backend/prisma/migrations/*_add_delivery_extended_until/migration.sql
```

Expected: uma única linha `ALTER TABLE "system_config" ADD COLUMN "delivery_extended_until" TIMESTAMP(3);` (ou equivalente — sem `NOT NULL`, sem `DEFAULT`, migration puramente aditiva).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add deliveryExtendedUntil field to SystemConfig"
```

---

### Task 2: Helper puro `isDeliveryTimeBlocked` (backend)

**Files:**
- Create: `backend/src/utils/deliveryWindow.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependência de outras tarefas além do tipo `Date`).
- Produces: `isDeliveryTimeBlocked(config: { deliveryExtendedUntil: Date | null }, now?: Date): boolean` — usado pela Task 6 (`orders.service.ts`).

- [ ] **Step 1: Criar o arquivo**

```ts
// backend/src/utils/deliveryWindow.ts
const CUTOFF_HOUR = 18; // antes das 18h (00:00–17:59) é a janela bloqueada, salvo extensão ativa

export function isDeliveryTimeBlocked(
  config: { deliveryExtendedUntil: Date | null },
  now: Date = new Date()
): boolean {
  const isPastCutoff = now.getHours() < CUTOFF_HOUR;
  const hasActiveExtension = config.deliveryExtendedUntil !== null && now < config.deliveryExtendedUntil;
  return isPastCutoff && !hasActiveExtension;
}
```

- [ ] **Step 2: Escrever um script descartável cobrindo os 4 quadrantes**

Crie `backend/verify-tmp.ts` (não será commitado):

```ts
import { isDeliveryTimeBlocked } from './src/utils/deliveryWindow';

const cases: Array<[string, Date, Date | null, boolean]> = [
  ['19h sem extensão -> não bloqueado', new Date(2026, 0, 1, 19, 0), null, false],
  ['23h59 sem extensão -> não bloqueado', new Date(2026, 0, 1, 23, 59), null, false],
  ['00h30 sem extensão -> bloqueado', new Date(2026, 0, 2, 0, 30), null, true],
  ['02h sem extensão -> bloqueado', new Date(2026, 0, 2, 2, 0), null, true],
  ['02h com extensão até 03h -> não bloqueado', new Date(2026, 0, 2, 2, 0), new Date(2026, 0, 2, 3, 0), false],
  ['02h com extensão já expirada (01h) -> bloqueado', new Date(2026, 0, 2, 2, 0), new Date(2026, 0, 2, 1, 0), true],
];

let failed = false;
for (const [label, now, deliveryExtendedUntil, expected] of cases) {
  const result = isDeliveryTimeBlocked({ deliveryExtendedUntil }, now);
  const ok = result === expected;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'} - ${label} (esperado ${expected}, obteve ${result})`);
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Rodar e colar a saída real**

```bash
cd backend
npx tsx verify-tmp.ts
echo "exit code: $?"
```

Expected: as 6 linhas todas começando com `OK`, e `exit code: 0`.

- [ ] **Step 4: Apagar o script descartável**

```bash
rm backend/verify-tmp.ts
```

- [ ] **Step 5: Confirmar que o build ainda passa**

```bash
cd backend
npm run build
```

Expected: só `> sistema-pedidos-backend@1.0.0 build` e `> tsc`, sem erro.

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/deliveryWindow.ts
git commit -m "feat: add isDeliveryTimeBlocked pure helper"
```

---

### Task 3: `config.service.ts` — `extendDelivery`

**Files:**
- Modify: `backend/src/modules/config/config.service.ts`

**Interfaces:**
- Consumes: `prisma.systemConfig` (já existente), `createLog` de `../../utils/logger` (já importado no arquivo), `JwtPayload` de `../../middleware/auth` (já importado no arquivo).
- Produces: `extendDelivery(user: JwtPayload): Promise<SystemConfig>` — usado pela Task 4 (`config.controller.ts`).

- [ ] **Step 1: Adicionar a função ao final do arquivo**

O arquivo atual termina assim:

```ts
export const updateConfig = async (data: any, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const conf = await tx.systemConfig.upsert({
      where: { id: 1 },
      update: {
        ...data,
        updatedBy: user.username
      },
      create: {
        ...data,
        updatedBy: user.username
      }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_UPDATED',
      details: data
    });

    return conf;
  });
};
```

Adicione logo depois:

```ts
export const extendDelivery = async (user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const current = await tx.systemConfig.findUnique({ where: { id: 1 } });
    const candidate = new Date(Date.now() + 60 * 60 * 1000);
    const currentUntil = current?.deliveryExtendedUntil ?? null;
    const newUntil = currentUntil && currentUntil > candidate ? currentUntil : candidate;

    const conf = await tx.systemConfig.upsert({
      where: { id: 1 },
      update: { deliveryExtendedUntil: newUntil, updatedBy: user.username },
      create: {
        deliveryExtendedUntil: newUntil,
        updatedBy: user.username,
        contactPhone: '',
        contactInstagram: ''
      }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_DELIVERY_EXTENDED',
      details: { extendedUntil: newUntil, role: user.role }
    });

    return conf;
  });
};
```

- [ ] **Step 2: Confirmar que o build passa**

```bash
cd backend
npm run build
```

Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/config/config.service.ts
git commit -m "feat: add extendDelivery service with accumulate-max semantics and audit log"
```

(A verificação funcional de verdade — incluindo a lógica de "mantém o maior valor" — acontece na Task 4, depois que o endpoint existir; uma função de service sozinha não é testável via curl.)

---

### Task 4: Endpoint `PATCH /api/config/extend-delivery`

**Files:**
- Modify: `backend/src/modules/config/config.controller.ts`
- Modify: `backend/src/modules/config/config.routes.ts`

**Interfaces:**
- Consumes: `configService.extendDelivery` (Task 3), `getIO` de `../../socket/socket` (já importado no controller).
- Produces: rota `PATCH /api/config/extend-delivery` (ADM, TI), payload de resposta `SystemConfig` completo incluindo `deliveryExtendedUntil`.

- [ ] **Step 1: Adicionar o handler em `config.controller.ts`**

O arquivo atual (`backend/src/modules/config/config.controller.ts`) tem `get` e `update`. Modifique o `update` existente para incluir `deliveryExtendedUntil` no payload público, e adicione `extendDelivery`:

```ts
import { Request, Response, NextFunction } from 'express';
import * as configService from './config.service';
import { getIO } from '../../socket/socket';

export const get = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.getConfig();
    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.updateConfig(req.body, req.user!);

    const io = getIO();
    io.of('/staff').emit('system:config_changed', conf);
    io.of('/public').emit('system:public_config', {
      trailerOpen: conf.trailerOpen,
      deliveryActive: conf.deliveryActive,
      deliveryExtendedUntil: conf.deliveryExtendedUntil,
      maxTables: conf.maxTables
    });

    res.json(conf);
  } catch (error) {
    next(error);
  }
};

export const extendDelivery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.extendDelivery(req.user!);

    const io = getIO();
    io.of('/staff').emit('system:config_changed', conf);
    io.of('/public').emit('system:public_config', {
      trailerOpen: conf.trailerOpen,
      deliveryActive: conf.deliveryActive,
      deliveryExtendedUntil: conf.deliveryExtendedUntil,
      maxTables: conf.maxTables
    });

    res.json(conf);
  } catch (error) {
    next(error);
  }
};
```

- [ ] **Step 2: Adicionar a rota em `config.routes.ts`**

```diff
 router.get('/', configController.get);
 router.patch('/', requireRole(Role.ADM, Role.TI), configController.update);
+router.patch('/extend-delivery', requireRole(Role.ADM, Role.TI), configController.extendDelivery);
```

- [ ] **Step 3: Build**

```bash
cd backend
npm run build
```

Expected: sem erro.

- [ ] **Step 4: Subir o servidor numa janela dedicada**

```bash
cd backend
npm run dev
```

Deixe essa janela rodando sem tocar (não aperte Enter nela). Use outra janela/terminal para os passos seguintes.

- [ ] **Step 5: Logar como `tecnico` (TI) e capturar o token**

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"tecnico","password":"admin123"}'
```

Expected: JSON com um campo de token JWT. Copie o valor.

```bash
TOKEN="<cole o token aqui>"
```

- [ ] **Step 6: Chamar o endpoint e conferir `deliveryExtendedUntil` ~1h no futuro**

```bash
curl -s -X PATCH http://localhost:3000/api/config/extend-delivery \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

(Se não tiver `python3`, tire o pipe e leia o JSON cru.) Expected: `deliveryExtendedUntil` é um timestamp aproximadamente 1 hora à frente do horário atual.

- [ ] **Step 7: Provar a semântica "mantém o maior valor"**

Crie `backend/verify-tmp.ts` (descartável):

```ts
import { prisma } from './src/config/prisma';

async function main() {
  const future = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3h no futuro
  await prisma.systemConfig.update({ where: { id: 1 }, data: { deliveryExtendedUntil: future } });
  console.log('deliveryExtendedUntil setado para', future.toISOString());
}

main().finally(() => prisma.$disconnect());
```

```bash
cd backend
npx tsx verify-tmp.ts
```

Copie o timestamp impresso. Agora chame o endpoint de novo:

```bash
curl -s -X PATCH http://localhost:3000/api/config/extend-delivery \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `deliveryExtendedUntil` na resposta é **exatamente igual** ao timestamp de 3h no futuro que você acabou de setar — não foi reduzido para "agora + 1h", porque o valor existente era maior.

Apague o script:

```bash
rm backend/verify-tmp.ts
```

- [ ] **Step 8: Conferir o log de auditoria**

```bash
curl -s http://localhost:3000/api/logs?action=CONFIG_DELIVERY_EXTENDED \
  -H "Authorization: Bearer $TOKEN"
```

Expected: pelo menos duas entradas (uma por chamada do Step 6 e do Step 7), cada uma com `username: "tecnico"`, `userId` preenchido (não null), e `details` contendo `extendedUntil` e `role: "TI"`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/config/config.controller.ts backend/src/modules/config/config.routes.ts
git commit -m "feat: add PATCH /api/config/extend-delivery endpoint"
```

---

### Task 5: Expor `deliveryExtendedUntil` no config público

**Files:**
- Modify: `backend/src/modules/public/public.controller.ts`

**Interfaces:**
- Consumes: `getConfig` de `../config/config.service` (já importado).
- Produces: campo `deliveryExtendedUntil` na resposta de `GET /api/public/config`, consumido pela Task 8 (frontend).

- [ ] **Step 1: Adicionar o campo à whitelist explícita**

```diff
   async getConfig(req: Request, res: Response, next: NextFunction) {
     try {
       const config = await getConfig();
       res.json({
         trailerOpen: config.trailerOpen,
         deliveryActive: config.deliveryActive,
+        deliveryExtendedUntil: config.deliveryExtendedUntil,
         maxTables: config.maxTables,
         contactPhone: config.contactPhone,
         contactInstagram: config.contactInstagram
       });
     } catch (error) {
       next(error);
     }
   },
```

- [ ] **Step 2: Build**

```bash
cd backend
npm run build
```

Expected: sem erro.

- [ ] **Step 3: Verificar via curl (servidor da Task 4 ainda rodando)**

```bash
curl -s http://localhost:3000/api/public/config
```

Expected: JSON incluindo `deliveryExtendedUntil` com o mesmo valor gravado na Task 4 (rota pública, sem header de auth).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/public/public.controller.ts
git commit -m "feat: expose deliveryExtendedUntil on public config endpoint"
```

---

### Task 6: Aplicar o corte em `orders.service.ts`, com exceção do garçom

**Files:**
- Modify: `backend/src/modules/orders/orders.service.ts`

**Interfaces:**
- Consumes: `isDeliveryTimeBlocked` de `../../utils/deliveryWindow` (Task 2).
- Produces: `POST /api/public/orders` (via `public.controller.ts`, que já chama `createOrder(..., clientOnline=true)`) passa a recusar DELIVERY fora da janela; `POST /api/orders` (via `orders.controller.ts`, que já chama `createOrder(..., false)`) não é afetado.

- [ ] **Step 1: Adicionar o import no topo do arquivo**

```diff
 import { Prisma, OrderStatus } from '@prisma/client';
 import { prisma } from '../../config/prisma';
 import { createLog } from '../../utils/logger';
 import { getShiftRange } from '../../utils/shift';
 import { getIO } from '../../socket/socket';
+import { isDeliveryTimeBlocked } from '../../utils/deliveryWindow';
```

- [ ] **Step 2: Alterar a validação de DELIVERY dentro de `createOrder`**

Localize (dentro de `async createOrder(data, userId, username, clientOnline = false)`):

```ts
    if (data.type === 'DELIVERY' && !config.deliveryActive) {
      throw { status: 403, message: 'Delivery indisponível no momento.' };
    }
```

Troque por:

```ts
    if (data.type === 'DELIVERY') {
      if (!config.deliveryActive) {
        throw { status: 403, message: 'Delivery indisponível no momento.' };
      }
      if (clientOnline && isDeliveryTimeBlocked(config)) {
        throw { status: 403, message: 'Delivery indisponível no momento.' };
      }
    }
```

- [ ] **Step 3: Build**

```bash
cd backend
npm run build
```

Expected: sem erro.

- [ ] **Step 4: Regressão — `deliveryActive=false` ainda bloqueia os dois caminhos**

Com o servidor da Task 4 ainda rodando, use `verify-tmp.ts` pra desligar manualmente:

```ts
// backend/verify-tmp.ts
import { prisma } from './src/config/prisma';

async function main() {
  await prisma.systemConfig.update({ where: { id: 1 }, data: { deliveryActive: false, deliveryExtendedUntil: null } });
  console.log('deliveryActive=false, deliveryExtendedUntil=null');
}

main().finally(() => prisma.$disconnect());
```

```bash
cd backend
npx tsx verify-tmp.ts
```

Teste público (ajuste `neighborhoodId`/itens conforme o seed real do seu banco):

```bash
curl -s -X POST http://localhost:3000/api/public/orders \
  -H "Content-Type: application/json" \
  -d '{"type":"DELIVERY","paymentMethod":"PIX","customerName":"Teste","customerPhone":"31999999999","customerAddress":"Rua Teste, 1","neighborhoodId":1,"items":[{"menuItemId":1,"quantity":1}]}'
```

Expected: `403` com `"Delivery indisponível no momento."`.

Teste interno (use o `$TOKEN` de `tecnico` da Task 4):

```bash
curl -s -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"type":"DELIVERY","paymentMethod":"PIX","customerName":"Teste","customerPhone":"31999999999","customerAddress":"Rua Teste, 1","neighborhoodId":1,"items":[{"menuItemId":1,"quantity":1}]}'
```

Expected: também `403` — o toggle manual bloqueia os dois caminhos igualmente, sem exceção.

- [ ] **Step 5: Ligar `deliveryActive` de novo e provar que a extensão libera os dois caminhos, em qualquer horário**

```ts
// backend/verify-tmp.ts (sobrescreva)
import { prisma } from './src/config/prisma';

async function main() {
  const future = new Date(Date.now() + 3 * 60 * 60 * 1000);
  await prisma.systemConfig.update({ where: { id: 1 }, data: { deliveryActive: true, deliveryExtendedUntil: future } });
  console.log('deliveryActive=true, deliveryExtendedUntil=', future.toISOString());
}

main().finally(() => prisma.$disconnect());
```

```bash
cd backend
npx tsx verify-tmp.ts
```

Repita os dois curls do Step 4 (público e interno). Expected: ambos retornam `201` com o pedido criado — a extensão futura faz `isDeliveryTimeBlocked` retornar `false` independente da hora real, então nada é bloqueado.

- [ ] **Step 6: Provar a exceção do garçom especificamente (exige rodar fora da janela 18h–00h, ou repetir depois)**

```ts
// backend/verify-tmp.ts (sobrescreva)
import { prisma } from './src/config/prisma';

async function main() {
  await prisma.systemConfig.update({ where: { id: 1 }, data: { deliveryActive: true, deliveryExtendedUntil: null } });
  console.log('deliveryActive=true, deliveryExtendedUntil=null');
}

main().finally(() => prisma.$disconnect());
```

```bash
cd backend
npx tsx verify-tmp.ts
date
```

**Se o horário local agora (`date`) estiver entre 00:00 e 17:59:** repita os dois curls do Step 4. Expected: o **público** retorna `403` (bloqueado por horário, sem extensão), e o **interno** retorna `201` (garçom não é afetado). Isso é a prova definitiva da exceção.

**Se o horário local agora estiver entre 18:00 e 23:59:** nada está bloqueado neste momento (comportamento correto — fora da janela de corte), então os dois curls vão retornar `201` e este passo não vai distinguir os dois caminhos. Nesse caso, confie na cobertura exaustiva da Task 2 (que já prova `isDeliveryTimeBlocked` retorna `true` para horas < 18 sem extensão) combinada com a leitura do `if (clientOnline && isDeliveryTimeBlocked(config))` do Step 2 — e opcionalmente repita este Step 6 mais tarde, depois da meia-noite, pra ter a prova ao vivo também.

- [ ] **Step 7: Apagar o script descartável**

```bash
rm backend/verify-tmp.ts
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/orders/orders.service.ts
git commit -m "feat: block public DELIVERY orders past cutoff, exempt internal orders"
```

---

### Task 7: Frontend — tipo e helper espelho

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/utils/deliveryWindow.ts`

**Interfaces:**
- Produces: `SystemConfig.deliveryExtendedUntil: string | null` (tipo), `isDeliveryTimeBlocked(deliveryExtendedUntil: string | null, now?: Date): boolean` — usado pela Task 8.

- [ ] **Step 1: Adicionar o campo ao tipo `SystemConfig`**

```diff
 export interface SystemConfig {
   trailerOpen: boolean;
   deliveryActive: boolean;
+  deliveryExtendedUntil: string | null;
   maxTables: number;
   contactPhone: string;
   contactInstagram: string;
 }
```

- [ ] **Step 2: Criar o helper**

```ts
// frontend/src/utils/deliveryWindow.ts
const CUTOFF_HOUR = 18; // antes das 18h (00:00–17:59) é a janela bloqueada, salvo extensão ativa

export function isDeliveryTimeBlocked(deliveryExtendedUntil: string | null, now: Date = new Date()): boolean {
  const isPastCutoff = now.getHours() < CUTOFF_HOUR;
  const hasActiveExtension = deliveryExtendedUntil !== null && now < new Date(deliveryExtendedUntil);
  return isPastCutoff && !hasActiveExtension;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend
npx tsc -b --force
```

Expected: sem erro (nenhuma saída).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/utils/deliveryWindow.ts
git commit -m "feat: add deliveryExtendedUntil type and frontend isDeliveryTimeBlocked helper"
```

---

### Task 8: `PublicHeader.tsx` — banner de delivery encerrado

**Files:**
- Modify: `frontend/src/components/layout/PublicHeader.tsx`

**Interfaces:**
- Consumes: `isDeliveryTimeBlocked` de `../../utils/deliveryWindow` (Task 7), `config.deliveryExtendedUntil` de `useCatalogStore` (já populado automaticamente pela Task 5 + Task 7, sem mudança necessária em `useCatalogStore.ts`).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
// frontend/src/components/layout/PublicHeader.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useCartStore } from '../../stores/useCartStore';
import { isDeliveryTimeBlocked } from '../../utils/deliveryWindow';

interface PublicHeaderProps {
  onCartClick: () => void;
}

export function PublicHeader({ onCartClick }: PublicHeaderProps) {
  const config = useCatalogStore((s) => s.config);
  const itemCount = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const trailerClosed = config !== null && config.trailerOpen === false;
  const deliveryClosed =
    config !== null &&
    !trailerClosed &&
    config.deliveryActive &&
    isDeliveryTimeBlocked(config.deliveryExtendedUntil);

  return (
    <>
      {trailerClosed && (
        <div className="bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white">
          ⚠️ Trailer fechado no momento. Não estamos recebendo pedidos.
        </div>
      )}
      {deliveryClosed && (
        <div className="bg-amber-700 px-4 py-2 text-center text-sm font-semibold text-white">
          ⚠️ Delivery encerrado por hoje. Retirada e mesa continuam disponíveis.
        </div>
      )}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-bg-surface px-4 py-3 shadow-md">
        <h1 className="text-xl font-bold text-white">Sistema de Pedidos Trailer</h1>

        <div className="flex items-center gap-3">
          <Link to="/login" className="text-xs text-white/40 hover:text-white/70">
            Acesso da equipe
          </Link>
          <button
            onClick={onCartClick}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white"
            aria-label="Carrinho"
          >
            <ShoppingCart size={22} />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-xs font-bold text-black">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </header>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend
npx tsc -b --force
```

Expected: sem erro.

- [ ] **Step 3: Build**

```bash
cd frontend
npm run build
```

Expected: build termina sem erro, chunks gerados normalmente (confirma que o code-splitting da Fase 5 continua intacto).

- [ ] **Step 4: Verificação manual no navegador**

Com o backend da Task 4 ainda rodando (`npm run dev` na janela dedicada), numa outra janela:

```bash
cd frontend
npm run dev
```

Abra o cardápio público no navegador (URL impressa pelo Vite, normalmente `http://localhost:5173`).

1. Use o script descartável do Task 6/Step 5 (`deliveryActive: true, deliveryExtendedUntil: <3h no futuro>`) e recarregue a página — **o banner âmbar não deve aparecer** (delivery liberado pela extensão).
2. Use o script descartável do Task 6/Step 6 (`deliveryExtendedUntil: null`) e recarregue a página:
   - Se agora (`date`) está entre 00:00–17:59: **o banner âmbar deve aparecer**, com o texto "Delivery encerrado por hoje...".
   - Se agora está entre 18:00–23:59: nenhum banner aparece (correto — fora da janela de corte).
3. Confirme visualmente que o banner de trailer fechado (`trailerOpen: false`) continua funcionando como antes e que os dois banners nunca aparecem ao mesmo tempo (o `!trailerClosed` no cálculo de `deliveryClosed` garante isso).

Descreva o que você observou (qual banner apareceu, em qual cenário) antes de marcar este passo como concluído — não presuma o resultado sem abrir o navegador de verdade.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/PublicHeader.tsx
git commit -m "feat: show delivery-closed banner on public menu header"
```

---

## Resumo de cobertura do spec

| Requisito do spec | Task |
|---|---|
| Campo `deliveryExtendedUntil`, migration aditiva | 1 |
| Corte às 18h, sem job agendado | 2, 6 |
| Prorrogação acumula (mantém o maior valor) | 3, 4 (Step 7) |
| Endpoint `PATCH /api/config/extend-delivery`, TI/ADM | 4 |
| Auditoria (id, nome, role, extendedUntil) | 3, 4 (Step 8) |
| Exceção do garçom (`clientOnline`) | 6 |
| Exposição pública do campo | 5 |
| Banner no cardápio público, sem polling no servidor | 7, 8 |
| Sem botão de UI para prorrogar (fora de escopo) | não há task — confirmado como omissão deliberada |
