# Auto-corte de pedidos DELIVERY à meia-noite, com prorrogação por TI/ADM

Data: 2026-07-15
Status: aprovado para implementação

## Objetivo

Pedidos de **delivery feitos pelo cardápio público** devem parar de ser aceitos automaticamente às 00h, sem exigir ação manual do staff. TI/ADM podem prorrogar a janela em blocos de +1h, quantas vezes precisar. O expediente em si (cozinha, mesa, retirada, garçom, conclusão de deliveries já aceitos) **não é afetado** — só a aceitação de **novos pedidos de delivery vindos do cardápio público**.

## Contexto / motivação

Hoje `SystemConfig.deliveryActive` é um toggle manual único, sem noção de horário. Na prática isso significa que, se ninguém desligar manualmente à meia-noite, o cardápio público continua aceitando delivery de madrugada. O dono do negócio confirmou a regra: delivery público fecha sozinho às 00h; TI/ADM pode segurar aberto por mais 1h de cada vez quando o movimento justificar.

## Modelo de dados

Um campo novo, nullable, em `SystemConfig` (migration aditiva, sem quebra):

```prisma
model SystemConfig {
  ...
  deliveryExtendedUntil DateTime? @map("delivery_extended_until")
  ...
}
```

`deliveryActive` continua com o mesmo significado de hoje (toggle manual, editado via `PATCH /api/config`) — não é tocado por esta feature. As duas coisas são checadas de forma independente (ver "Lógica de negócio").

## Lógica de negócio

### Helper puro — `backend/src/utils/deliveryWindow.ts`

Mesmo espírito de `utils/shift.ts`: função pura, sem I/O, sem estado.

```ts
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

Sem job agendado, sem scheduler, sem dependência nova — computado na hora da requisição, igual a tudo mais no projeto. Às 18h do dia seguinte, `isPastCutoff` volta a `false` sozinho; não existe reset manual nem diário a fazer.

### Validação de pedido — `orders.service.ts`

**Exceção do garçom:** o corte de horário vale só para pedidos que chegam do cardápio público (`clientOnline === true`). Pedidos criados internamente pelo garçom/chapista/ADM/TI via `POST /api/orders` continuam podendo usar DELIVERY mesmo depois da meia-noite — só o toggle manual `deliveryActive` os afeta, igual hoje.

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

Mesma mensagem de erro nos dois casos — o cliente não precisa saber se foi corte manual ou automático.

### Prorrogação — acumula pelo maior valor

Cada chamada de prorrogação define o novo limite como `agora + 1h`, **mas nunca reduz** uma extensão já vigente que termine mais tarde — fica sempre o maior dos dois valores. Isso evita que um clique acidental encurte uma prorrogação já concedida por outro membro do staff.

```ts
// config.service.ts
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

A prorrogação pode ser usada a qualquer momento, inclusive antes da meia-noite (ex.: às 23:50, prevenindo o corte daquela virada).

### Auditoria

O log `CONFIG_DELIVERY_EXTENDED` grava, seguindo o padrão já usado em todo o resto do projeto (`Log.userId` + `Log.username` do executor) mais o dado extra pedido:
- `userId` e `username` — quem executou (campos padrão de `Log`, id e nome).
- `details.role` — o papel (`ADM` ou `TI`) de quem executou, já que `Log` não tem coluna própria para papel.
- `details.extendedUntil` — o novo limite gravado.

## API

- `PATCH /api/config/extend-delivery` — `requireRole(Role.ADM, Role.TI)`, sem corpo. Chama `extendDelivery`, emite socket (`/staff`: `system:config_changed` com a config completa; `/public`: `system:public_config` com o subconjunto público), responde com a config atualizada.
- `GET /api/config` e `GET /api/public/config` passam a incluir `deliveryExtendedUntil` (ISO string ou `null`) na resposta, além dos campos que já existem.
- Nenhuma rota de UI para o botão de prorrogar nesta etapa — ver "Fora de escopo".

## Frontend

- `types/index.ts`: `SystemConfig` ganha `deliveryExtendedUntil: string | null`.
- `frontend/src/utils/deliveryWindow.ts` (novo, pequeno): réplica da mesma função pura `isDeliveryTimeBlocked`, consumindo `config.deliveryExtendedUntil` do estado já carregado — sem round-trip extra ao servidor a cada tick.
- `PublicHeader.tsx`: banner novo `deliveryClosed`, exibido só quando o trailer está aberto mas o delivery está bloqueado por horário (`config.deliveryActive && isDeliveryTimeBlocked(config)`). Um `setInterval` de 60s força o recálculo local, mesmo padrão de `setInterval` já usado em `OrderTimer.tsx`.
- O banner é só um aviso de UX — a validação real e definitiva acontece sempre no servidor no momento do `POST /api/public/orders`, nunca confiando no relógio do cliente.

## Decisões e alternativas descartadas

- **Job agendado no servidor** (setInterval em `server.ts` empurrando socket proativamente): descartado — seria o primeiro job em background do projeto inteiro, contrariando o padrão 100% "lazy" já estabelecido (`shift.ts`, ausência de scheduler). O polling client-side de 60s resolve o mesmo requisito sem essa dependência.
- **Gravar `deliveryActive = false` no corte automático**: descartado — exigiria uma reativação automática simétrica às 18h (ou dependência de alguém lembrar de ligar manualmente todo dia), reintroduzindo exatamente o tipo de processo manual frágil que esta feature existe para eliminar.
- **Prorrogação sempre reseta para "agora + 1h"**: descartado a favor de "mantém o maior valor" — evita que uma prorrogação legítima seja encurtada por um clique posterior de outro usuário.
- **Corte de horário valendo também para pedidos internos do garçom**: descartado — o corte é especificamente sobre o cardápio público; pedidos internos continuam sob controle exclusivo do toggle manual `deliveryActive`.

## Testes

- Unitário: `isDeliveryTimeBlocked` cobrindo os 4 quadrantes (antes/depois das 18h × com/sem extensão ativa/expirada).
- Unitário: lógica de "maior valor" em `extendDelivery` (extensão nova vence quando não há extensão prévia ou ela já expirou; extensão prévia mais distante é preservada quando ainda vigente).
- Integração: `orders.service.createOrder` — 403 em delivery público após a meia-noite sem extensão; sucesso com extensão ativa; sucesso em delivery **interno** (`clientOnline: false`) mesmo após a meia-noite sem extensão, só respeitando `deliveryActive`.
- Frontend: sem framework de teste automatizado no projeto hoje; validação do banner fica como critério de aceite manual (rodar o app, simular horário/estado).

## Fora de escopo (deliberadamente, nesta etapa)

- **Botão de prorrogar na UI.** Não existe painel ADM/TI funcional ainda (Fase 9 é só stub — ver auditoria, Risco Crítico #3). O endpoint fica pronto e testável via API por um TI; o botão entra quando a Fase 9 for construída.
- Qualquer alteração ao painel do garçom, cozinha ou entregador.
- Qualquer mudança em `deliveryActive` em si ou no seu fluxo de edição manual existente.
