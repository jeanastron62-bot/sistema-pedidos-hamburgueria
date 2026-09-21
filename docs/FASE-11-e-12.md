# FASE 11 e FASE 12 — Fechamento agendado do trailer e bairro personalizado

> Para o Claude Code, rodando dentro de `sistema-pedidos-rede/`. Duas fases
> independentes no mesmo arquivo — cada uma com seu próprio gate. Aprovar a
> Fase 11 não aprova a Fase 12, e vice-versa.
>
> **Fora de escopo, deliberadamente:** qualquer lógica de corte de horário para
> delivery. Isso já existe, em produção, em `backend/src/utils/deliveryWindow.ts`
> + `SystemConfig.deliveryExtendedUntil` + `PATCH /api/config/extend-delivery`
> (ver `docs/superpowers/specs/2026-07-15-delivery-auto-cutoff-design.md`). Não
> toque nesses arquivos nesta fase.

## Antes de tudo

Leia, nesta ordem, e não prossiga sem ter lido:

1. `docs/CONTEXTO.md` — arquitetura, schema, regras de negócio,
   dívida técnica conhecida. As regras abaixo são um resumo do que é relevante
   pra esta fase especificamente, não um substituto.
2. `docs/superpowers/specs/2026-07-15-delivery-auto-cutoff-design.md` — não pra
   implementar nada dele, mas porque ele é o exemplo mais recente do padrão
   arquitetural deste projeto (lazy, sem scheduler, `Log`/`createLog`
   genéricos, `verify-tmp.ts` descartável) e esta fase deve seguir o mesmo
   padrão, não inventar um novo.

## Regras deste projeto que mais importam aqui (resumo — fonte é o CONTEXTO)

- `prisma migrate dev` (local) / `migrate deploy` (produção). Nunca `db push`.
- `Decimal`/`Prisma.Decimal` pra dinheiro, nunca `Float`/`number`.
- `TZ=America/Sao_Paulo` já é variável de ambiente do servidor — `new Date()`
  já reflete horário local, sem conversão manual.
- **Sem scheduler, sem job em background.** É uma decisão de arquitetura já
  tomada e documentada (ver spec de delivery-cutoff, seção "Decisões e
  alternativas descartadas"), não uma preferência desta fase. Tudo é computado
  na hora da requisição.
- Réplicas continuam proibidas no Railway (Socket.io sem sticky session).
- Toda mutação sensível grava em `Log` via `createLog` — não crie um model de
  log novo, o genérico já existe e já é usado por `config.service.ts`.
- `io.of('/public').emit(...)` nunca carrega dado de cliente/pedido — só o que
  já é público hoje (mesma linha vermelha da seção 6 do CONTEXTO).
- Sem framework de teste no projeto. Lógica pura se prova com um script
  `verify-tmp.ts` — criado, rodado, saída colada, **apagado antes do commit**.
  Nunca descreva o que um comando "deveria" retornar — cole a saída real.
- Processo fantasma na porta 3000 é causa recorrente de falso negativo. Se um
  teste contradisser algo que parecia certo, rode
  `netstat -ano | findstr :3000` (Windows) antes de qualquer outra hipótese.

---

# FASE 11 — Fechamento agendado do trailer (retirada)

**Objetivo:** hoje `SystemConfig.trailerOpen` é um toggle manual sem noção de
horário — se ninguém desligar, o cardápio público aceita pedido de madrugada
indefinidamente. Fechar isso do mesmo jeito que o delivery já resolveu: sem
scheduler, computado na hora da requisição.

## FASE 11.0 — Reconhecimento (OBRIGATÓRIA, PARE AO FINAL)

Não altere nenhum arquivo nesta etapa.

```bash
cd backend
cat prisma/schema.prisma | awk '/^model SystemConfig /,/^}/'
grep -n "trailerOpen" src/modules/orders/orders.service.ts
grep -n "requireRole\|Role\." src/modules/config/config.routes.ts
cat src/modules/config/config.service.ts
cat src/modules/config/config.controller.ts
find ../frontend/src/components/admin -iname "*settings*"
```

Responda, citando o trecho exato:

1. `SystemConfig` tem algum campo de horário/dia-da-semana hoje, além de
   `trailerOpen`/`deliveryActive`/`deliveryExtendedUntil`?
2. `orders.service.ts` já valida `trailerOpen` antes de criar pedido? Em que
   linha, com qual mensagem de erro?
3. `config.service.ts` segue o mesmo padrão de `extendDelivery` (transação +
   `createLog`)? Cole a função `updateConfig` inteira.

**PARE AQUI.** Não avance sem aprovação.

## FASE 11.1 — Schema

Adicionar ao model `SystemConfig` (nomes abaixo são proposta — se a 11.0
revelar convenção diferente, siga a convenção real):

| Campo | Tipo | Default | Para quê |
|---|---|---|---|
| `scheduledCloseAt` | `DateTime?` | `null` | Horário-alvo do fechamento. `null` = sem fechamento agendado |
| `dailyNotice` | `String?` | `null` | Aviso do dia (ex.: "hoje sem alface") |
| `dailyNoticeUpdatedAt` | `DateTime?` | `null` | Pra saber se o aviso é de hoje |
| `defaultCloseHour` | `Int` | `2` | Hora padrão do fechamento (0–23) |
| `closeCeilingHour` | `Int` | `6` | Teto de adiamento |
| `closedWeekday` | `Int?` | `1` | Dia da semana fechado (0=domingo…6=sábado). `null` = abre todo dia |

```bash
cd backend
npx prisma migrate dev --name fase11_fechamento_agendado
```

**Prova:** saída completa do comando + conteúdo de
`prisma/migrations/<timestamp>_fase11_fechamento_agendado/migration.sql`.
Critério: só `ALTER TABLE ... ADD COLUMN`, todas nullable ou com default. Se
aparecer `DROP`, `ALTER COLUMN ... TYPE`, ou `NOT NULL` sem default, pare e
reporte — não é essa a migration esperada.

## FASE 11.2 — Lógica: sem cron, tudo computado na hora da requisição

**Não implemente um cron.** O padrão deste projeto (ver spec de
delivery-cutoff) é uma função pura calculando o estado a partir de campos
salvos, chamada sempre que alguém precisa saber a resposta — nunca um processo
que fica checando sozinho.

### Passo 1 — Helper puro (mesmo espírito de `deliveryWindow.ts`)

**Criar:** `backend/src/utils/trailerSchedule.ts`

```ts
export function isEffectivelyOpen(
  config: { trailerOpen: boolean; scheduledCloseAt: Date | null },
  now: Date = new Date()
): boolean {
  if (!config.trailerOpen) return false;
  if (config.scheduledCloseAt === null) return false; // nunca "aberto sem fim"
  return now < config.scheduledCloseAt;
}

export function minutesUntilClose(
  scheduledCloseAt: Date | null,
  now: Date = new Date()
): number | null {
  if (scheduledCloseAt === null) return null;
  return Math.round((scheduledCloseAt.getTime() - now.getTime()) / 60000);
}
```

Nota deliberada: `scheduledCloseAt === null` retorna `false` (fechado), não
`true`. É isso que elimina o estado "aberto indefinidamente" — se não há
horário-alvo, não está efetivamente aberto, mesmo que `trailerOpen` diga que
sim. Isso muda o significado de `trailerOpen`: passa a ser "intenção de estar
aberto", não "está aberto" — `orders.service.ts` precisa trocar a checagem
atual (`if (!config.trailerOpen)`) por `if (!isEffectivelyOpen(config))`.

Prove com `verify-tmp.ts` (criar, rodar, colar saída, apagar) cobrindo pelo
menos: `trailerOpen=false` → fechado; `trailerOpen=true, scheduledCloseAt=null`
→ fechado; `trailerOpen=true, scheduledCloseAt=+1h` → aberto;
`trailerOpen=true, scheduledCloseAt=-1min` (já passou) → fechado.

### Passo 2 — Ao marcar o trailer como aberto, sempre (re)agendar

Onde hoje o código seta `trailerOpen: true` (dentro de `updateConfig`, ou uma
função dedicada — confirmar em 11.0), sempre que essa transição acontecer
(`false → true`), setar também:

```
scheduledCloseAt = próxima ocorrência de defaultCloseHour, em TZ local
```

Isso vale igual para "abrir pela primeira vez no dia" e para "reabrir depois de
um fechamento" — **é a mesma transição, não duas ações diferentes.** Se o
código atual tratar isso como dois caminhos separados (um endpoint genérico de
`update` e um botão de "reabrir"), os dois precisam passar por essa mesma
regra, ou o estado "aberto sem fim" volta a existir pela porta dos fundos.

### Passo 3 — Adiar (mesmo padrão de `extendDelivery`)

Endpoint que aceita um horário absoluto (`HH:MM`) e recalcula
`scheduledCloseAt` para esse horário, dentro da mesma janela 00:00–`closeCeilingHour`:00
do dia seguinte à abertura.

```ts
export const rescheduleClose = async (closeAtHHMM: string, user: JwtPayload) => {
  // valida 00:00 <= closeAtHHMM <= closeCeilingHour:00 -> 400 se fora
  // grava scheduledCloseAt, createLog com action 'CONFIG_CLOSE_RESCHEDULED'
  //   details: { previousScheduledCloseAt, newScheduledCloseAt, role: user.role }
};
```

O teto (00:00–06:00) é validado no backend, sempre — nunca confie em validação
de frontend pra isso. É o teto que impede o estado sem fim.

### Passo 4 — Permissões

| Ação | Quem |
|---|---|
| Abrir / fechar manualmente / adiar / reabrir | `GARCOM`, `CHAPISTA`, `ADM`, `TI` |
| Editar `dailyNotice` | `CHAPISTA`, `ADM`, `TI` |
| Editar `defaultCloseHour` / `closeCeilingHour` / `closedWeekday` | `ADM`, `TI` |

**Prova (com servidor `npm run dev` numa janela dedicada, sem tocar Enter nela):**

```bash
# abrir
curl -i -X PATCH http://localhost:3000/api/config -H "Authorization: Bearer $TOKEN_GARCOM" -H "Content-Type: application/json" -d '{"trailerOpen":true}'
# confirmar scheduledCloseAt = amanhã 02:00
curl -s http://localhost:3000/api/config -H "Authorization: Bearer $TOKEN_GARCOM"
# adiar pra horário válido
curl -i -X PATCH http://localhost:3000/api/config/reschedule-close -H "Authorization: Bearer $TOKEN_GARCOM" -H "Content-Type: application/json" -d '{"closeAt":"03:30"}'
# adiar pra horário inválido -- DEVE FALHAR com 400
curl -i -X PATCH http://localhost:3000/api/config/reschedule-close -H "Authorization: Bearer $TOKEN_GARCOM" -H "Content-Type: application/json" -d '{"closeAt":"07:00"}'
# como ENTREGADOR -- DEVE FALHAR com 403
curl -i -X PATCH http://localhost:3000/api/config/reschedule-close -H "Authorization: Bearer $TOKEN_ENTREGADOR" -H "Content-Type: application/json" -d '{"closeAt":"03:00"}'
```

Se o teste de horário inválido retornar `200`, a fase está reprovada — o teto
não existe e o estado "aberto sem fim" voltou.

## FASE 11.3 — Frontend: polling local, sem evento novo de servidor

Seguir exatamente o padrão de `PublicHeader.tsx` (`setInterval` de 60s
recalculando localmente) — não criar um evento de socket novo só pra isso.
`system:config_changed` já existe e já dispara quando `SystemConfig` muda; o
resto é derivado no cliente a partir de `scheduledCloseAt`.

Nos painéis `GARCOM`, `CHAPISTA`, `ADM`, `TI`:

- A cada tick de 60s, recalcular `minutesUntilClose(scheduledCloseAt)`.
- Se `<= 10` e `> 0`: banner fixo (não-toast) com contagem regressiva e botões
  "Adiar 1h" / "Escolher horário" / "Fechar agora".
- Se `isEffectivelyOpen` acabou de virar `false` (era `true` no tick anterior):
  banner "Trailer fechado — reabrir?", reabertura em um clique (chama o mesmo
  fluxo de "abrir" do Passo 2).

**Nota sobre auditoria:** como não há cron, não existe um momento de servidor
que grave "fechou automaticamente" no `Log` no instante exato em que acontece —
o fechamento é só a consequência de uma conta ter passado a dar `false`.
Aceitar essa lacuna (a config em si mostra `scheduledCloseAt` no passado, o que
já é auditável) ou registrar o evento como efeito colateral da primeira
requisição que perceber a transição são as duas opções — **decisão sua, não
suposição minha.**

**Prova:** caminho de cada arquivo alterado, conteúdo integral dos novos, e
confirmação (print ou console) de que o banner aparece/some nos cenários acima.

---

# FASE 12 — Bairro personalizado (somente equipe)

**Sem migration.** `Order.neighborhoodId` já é opcional, e `Order` já tem
`neighborhoodNameSnapshot` (String?) e `deliveryFeeSnapshot` (Decimal?) —
exatamente os dois campos que um bairro fora da lista precisa.

## FASE 12.0 — Reconhecimento

```bash
cd backend
grep -n -B2 -A10 "neighborhoodId" src/modules/orders/orders.service.ts
```

Confirme: a validação hoje é "se `type === DELIVERY`, `neighborhoodId` é
obrigatório e precisa existir/estar ativo" (linhas ~47–55 na versão que
inspecionei). Cole o trecho real antes de prosseguir.

**PARE AQUI.**

## FASE 12.1 — Relaxar a validação só para pedido criado pela equipe

Em `orders.service.ts`, o branch de DELIVERY passa a aceitar duas formas:

- **Cardápio público** (`clientOnline: true`): comportamento inalterado —
  `neighborhoodId` obrigatório, resolvido contra `Neighborhood` real e ativo.
- **Pedido interno** (`clientOnline: false`, ou seja, criado por
  GARCOM/CHAPISTA/ADM/TI): se vier `customNeighborhoodName` +
  `customDeliveryFee` no lugar de `neighborhoodId`, pular a busca em
  `Neighborhood` e gravar `neighborhoodId: null`,
  `neighborhoodNameSnapshot: customNeighborhoodName`,
  `deliveryFeeSnapshot: customDeliveryFee` diretamente.

O total continua somado pelo mesmo caminho de sempre a partir de
`deliveryFeeSnapshot` — nenhuma soma paralela.

## FASE 12.2 — Frontend (só painel interno)

No formulário de criação de pedido pelo painel, adicionar opção "Outro bairro"
com nome livre + taxa (`Decimal`, mesma validação de input monetário já usada
em outros campos de preço no projeto). **O cardápio público (`/`) não recebe
essa opção** — continua com a lista fixa de `Neighborhood`.

**Prova:** criar um pedido de teste pelo painel com bairro personalizado e taxa
`R$ 12,50`; colar (a) resposta da API e (b) uma query direta no banco mostrando
o `total`. Precisa bater com itens + 12,50 exatamente. Divergência em centavos
= `Float` vazou em algum lugar do caminho — reporte, não arredonde.

---

## Pendências que dependem de decisão, não de código

1. **A regra de corte de delivery do bot de WhatsApp deveria ser a mesma que já
   existe (`isDeliveryTimeBlocked`, corte seco à meia-noite, extensão manual de
   +1h), ou o canal de conversa realmente precisa de uma regra mais tolerante?**
   Isso decide se o trabalho de sessão/5-minutos já desenhado entra em produção
   ou é descartado.
2. Auditoria do fechamento automático (Fase 11.3, nota) — aceitar a lacuna ou
   implementar a transição lazy-com-log.
3. `LEIA-ANTES-DE-TUDO.txt` referencia um `docs/FASES.txt` que não existe neste
   snapshot, e subconta as fases prontas (diz 1–8, o CONTEXTO real diz 1–9).
   Vale atualizar ou remover esse arquivo antes que alguém — humano ou agente —
   confie nele por engano.
