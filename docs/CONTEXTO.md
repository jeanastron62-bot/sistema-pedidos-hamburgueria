# Sistema de Pedidos Trailer — Contexto Técnico e Regras de Conduta (v2)

**Este arquivo substitui integralmente `sistema-pedidos-arquitetura-v2.md`, `prompt-ai-studio-antigo.md` e `sistema-pedidos-contexto-regras.md`. Apague os três.**

O `prompt-ai-studio-antigo.md` em particular é perigoso: ele contém um schema Prisma diferente (sem `requiredChoice`, `selectedChoice`, `requiresStaffConfirmation`). Se for colado no Gemini, gera uma primeira migration incompatível com todo o resto do plano.

---

## 1. O que este sistema é

Aplicação web única, um domínio, um container. Serve duas coisas:

1. **Cardápio público** (`/`) — cliente final, sem login, no celular. É a tela principal.
2. **Painéis internos** (`/painel/*`) — cinco papéis (GARCOM, CHAPISTA, ENTREGADOR, ADM, TI), com login.

Sistema de produção usado durante o expediente ao vivo (18h às 05h). Pedido perdido, pedido duplicado ou queda no meio do turno = prejuízo real.

---

## 1.1 Estado da Implementação

**Backend: Fases 1–4 fechadas.** **Frontend: Fases 5–9 fechadas** — cardápio público, garçom, cozinha, entregador, ADM, TI. Todas testadas com dado real, não só compiladas. **Fase 10 (backup + deploy): pausada de propósito** (seção 2.5-A) até o cliente confirmar contrato — ver "Decisões de negócio pendentes" abaixo.

### Duas branches — cuidado ao abrir sessão nova

O repositório tem `master` (branch padrão do GitHub) e `audit/full-pass-1` (onde este projeto foi construído a partir da auditoria completa, é a branch ativa de trabalho). **Descobrimos numa sessão que o `master` recebeu commits paralelos** (feature de corte de horário do delivery às 18h, validação Zod em config/menu/bairros, concorrência otimista em `updateOrderStatus`, correção de fuso em filtro de data, hardening de CSV) que nunca passaram por revisão nesta conversa. Um merge entre as duas branches estava em andamento na última sessão — **confirmar o estado do merge antes de assumir que está tudo integrado.** Se uma sessão nova não souber disso, rode `git status` e `git log --oneline -5` nas duas branches antes de qualquer coisa.

### Reformulação visual — completa, mais uma rodada de polimento

5 passos executados e testados: (1) componentes base migrados pra escala de 9 tons, (2) elemento-assinatura "cartão-comanda" (Nº + separador tracejado + borda superior) em todos os cards de pedido, (3) cardápio público com textura de papel xadrez + identidade de marca, (4) vermelho-farol (`#E63946`) exclusivo do painel do entregador, (5) resto dos painéis internos migrados + composição inspirada em referência visual. Rodada extra de polimento: `SettingsPanel` agrupado, empty states padronizados, card "Pronto na Estufa" na linguagem de comanda. Direção completa documentada em `ESTILO.md`.

**Duas pastas de referência visual foram usadas e devem permanecer fora do repositório versionado** (`referencias-visuais-NAO-IMPORTAR-NADA/`) — nunca importar lógica delas, só composição/cor foi extraída, sempre manualmente revisada antes de aplicar.

### Funcionalidades adicionadas além das 10 fases originais

- **Categoria "Todos"** no cardápio público — primeira aba, itens agrupados por categoria real (Acréscimos nunca aparece).
- **Exportação de PDF** de vendas no dashboard do ADM (jsPDF, import dinâmico, `computeKpis()` compartilhado entre tela e PDF pra nunca divergir).
- **Corte de horário do delivery às 18h** (branch `master`, ver acima) — bloqueia pedido de delivery do cliente antes desse horário, com exceção pra pedido interno (`clientOnline`) e prorrogação manual pelo ADM/TI.
- **Fix: MESA/RETIRADA presos em `PRONTO`** — chapista e garçom agora podem marcar `ENTREGUE` nesses dois tipos; guard explícito impede o mesmo em pedido `DELIVERY` (só entregador/ADM/TI fecham delivery).

### Verificado com teste real

| Regra | Como foi provado |
|---|---|
| Pedido público → criação com snapshots | POST `/public/orders`, JSON de resposta conferido |
| Aceite atômico de entrega | `/accept` retornou `assignedToId` correto + `status: EM_ROTA` |
| Só o entregador dono finaliza | `/status → ENTREGUE` com o token do próprio entregador |
| Pedido MESA online nasce travado | `requiresStaffConfirmation: true` no JSON |
| Cozinha não vê pedido não confirmado | `GET /orders` como CHAPISTA, pedido ausente da fila |
| `/confirm` destrava | Mesmo GET, pedido presente depois |
| Cancelamento exige motivo | 400 sem `notes` |
| DINHEIRO < total rejeitado | 400 |
| `tecnico` protegido | 403 no DELETE, PATCH `/role` **e** PATCH `/approve` (bug de bypass achado e corrigido na auditoria) |
| Registro grava o papel correto | Confirmado no banco, não só na resposta da API |
| Socket `/staff` recebe evento | Cliente `socket.io-client` autenticado recebeu `order:created`, e os outros 4 eventos (`status_changed`, `confirmed`, `accepted`, `cancelled`) depois de achado que só `created` emitia |
| CSV com escaping | Usuário `Joao, o Chapista` ficou íntegro numa coluna só |
| `GET /orders` como ADM/TI sem `from`/`to` | Cai num fallback pro escopo do garçom (não 400) — permite TI/ADM navegar qualquer painel operacional sem forçar relatório |
| Namespace `/public` nunca recebe dado de pedido | Cliente sem token conectado em `/public`, pedido criado em paralelo, zero vazamento |
| Vazamento de PII (auditoria completa) | 6 eventos de pedido só emitem pra `/staff`; nenhum `io.emit()` genérico sem namespace |

### Não testado ainda

- Rejeição de `requiredChoice` ausente (Super Dog / Macarrão) — baixa prioridade, validação existe no código, só não foi exercitada manualmente.
- Rate limiting das rotas públicas sob carga real.
- Teste de restauração de backup — bloqueado até sair do trial do Railway (ver decisões de negócio).

### Dívida técnica conhecida

1. ~~`(req as any).user`~~ **RESOLVIDO** — confirmado pela auditoria, nenhum controller usa mais esse cast.
2. ~~CORS `origin: '*'`~~ **RESOLVIDO** — confirmado pela auditoria, não existe mais no `socket.ts`.
3. **`isProtectedUser` duplicado em 3 funções** de `users.service.ts` (`approveUser`, `updateRole`, `deleteUser`) — mesmo `if` repetido em vez de helper único. Baixo risco, mas foi exatamente esse padrão de duplicação que causou o bug do bypass em `approveUser` (item acima). Extrair função única é limpeza pendente, não bloqueador.
4. **Duas escalas de cor coexistindo** (3 tons da Fase 5-7 vs. 9 tons da Fase 8+) — decisão consciente de não unificar tudo de uma vez, ver `ESTILO.md` seção 1.

### Decisões de negócio pendentes (a confirmar com o cliente)

Contrato tem 10 itens; dois merecem atenção antes de considerar o projeto "pronto pra entregar":

- **Item 05 (controle de estoque):** provisoriamente resolvido como "o toggle disponível/esgotado já existente é suficiente" — decisão do Rosario baseada em vivência própria no trailer, contagem de quantidade real não é praticável. **A confirmar com o cliente.**
- **Item 08 (hospedagem e monitoramento):** sistema roda só localmente até o cliente confirmar — decisão consciente de não gastar o trial do Railway (24 dias / ~$4 de crédito restantes na última checagem) antes de haver operação real. **Gatilho pra migrar pro plano Hobby e fazer o deploy real: o cliente confirmar, não o prazo do trial.**
- **Item 09 (bot WhatsApp): em escopo e destravado.** Histórico (foi descartado, voltou quando o contrato fechou) não interessa mais — o que interessa é o estado de hoje, 24/08/2026:
  - **App Review aprovado.** `whatsapp_business_messaging` e `whatsapp_business_management` concedidas em modo Live.
  - **Status de Tech Provider concedido** — requisito da Meta pra onboardar número que já tem o app WhatsApp Business instalado.
  - **Só existe UM portfólio Meta: o do Sistema de Pedidos Trailer.** Não há portfólio da Palora (CNPJ ainda em análise). Neste fluxo o Sistema de Pedidos Trailer é ao mesmo tempo o provedor (dono do app) e o cliente de negócio (dono do número) — é permitido, mas é o caminho menos percorrido: se o fluxo travar na seleção de portfólio, a causa provável está aí, não no código.
  - **O número real do trailer ainda NÃO está conectado.** Hoje é só um celular com o app WhatsApp Business, sem Phone Number ID; o que está no `.env` é o número de teste da Meta. Conectar é operação manual com o celular em mãos (`docs/FASE-15-coexistencia-numero-real-CLAUDE-CODE.md`, seção 9) — **não é tarefa de agente**: as chamadas envolvidas têm janela e são de uso único.
  - **Código da coexistência pronto e provado** (Fases 15.1 a 15.4): webhook roteando por `change.field`, `smb_message_echoes` pausando o bot quando a dona responde pelo celular, despausa automática em 30 min. Ver `docs/verificacoes/2026-08-24-fase-15-webhook-fields.txt`.
  - **`history` e `smb_app_state_sync` são descartados de propósito** — importar 6 meses de conversa e a agenda de contatos da dona é PII em volume, e a retenção de 40 dias do `PROMPT.md` foi escrita pra conversa do bot, não pra importação em massa. Decidir a retenção vem antes de importar; se um dia for preciso, é fase própria.
  - **A confirmar com a dona ANTES de conectar** (muda o dia a dia dela, e parte é irreversível sem desconectar): listas de transmissão viram somente-leitura; mensagens temporárias, visualização única e localização em tempo real são desligadas; grupos não sincronizam (nada de grupo chega ao bot); **saudação automática, mensagem de ausência e respostas rápidas do app precisam ser desligadas à mão antes de conectar**, senão o cliente recebe duas respostas (a do app e a do bot); mensagem mandada pelo celular não abre nem estende a janela de 24h da API; celular ~14 dias sem uso faz a Meta desconectar (o celular do trailer vira infraestrutura); desinstalar o app desconecta tudo.
  - **Documento de fase válido:** `docs/FASE-15-coexistencia-numero-real-CLAUDE-CODE.md`. O anterior está renomeado pra `.OBSOLETO.md` — assumia infraestrutura Meta da Palora que não existe.

---

## 2. Decisões de Arquitetura

### 2.1 — Um único container, um único deploy

Frontend e backend **no mesmo serviço**. O Express serve a build estática do Vite (`frontend/dist`) além da API e do Socket.io.

**Por quê:** você pediu "um domínio". Servir separado (ex.: Vercel + Cloud Run) obrigaria a configurar CORS, três variáveis de ambiente extras (`CORS_ORIGIN`, `VITE_API_URL`, `VITE_SOCKET_URL`), dois pipelines de deploy, e socket cross-origin. Nada disso agrega para um trailer com ~10 funcionários. Servindo junto, o frontend chama `/api/...` relativo e o socket conecta na mesma origem — CORS deixa de existir como problema.

Trade-off aceito: sem CDN para os assets estáticos. Irrelevante neste volume de tráfego.

### 2.2 — Autenticação: JWT próprio, sem depender do host de banco

O host do banco (Railway) é usado **apenas como PostgreSQL gerenciado**, acessado via Prisma. Nada de SDK de auth/realtime do provedor — o princípio vale independente de qual host de banco está por trás.

O sistema tem fluxo de aprovação (`approved: false` até o ADM liberar), que não existiria pronto em nenhum serviço de auth de terceiros com essa regra específica. E o Socket.io precisa verificar o token no handshake — trivial com JWT próprio. Depender de um sistema de auth externo duplicaria a superfície de erro sem resolver nada.

### 2.3 — Railway: um único deploy por serviço, sem réplica

**Backend e banco no mesmo projeto Railway** (decidido — ver seção 13, pergunta 7 resolvida). Isso elimina o TCP Proxy e o egress cobrado nele: o backend usa a `DATABASE_URL` privada (rede interna do projeto), não a `DATABASE_PUBLIC_URL`.

**Não adicionar réplicas.** Por padrão, o Railway mantém uma única instância por serviço — nada a configurar, isso já é o comportamento padrão. Mas se algum dia alguém aumentar o número de réplicas na aba Scale (achando que ajuda performance), o Socket.io quebra: o Railway **não suporta sticky sessions**, então `io.emit()` numa instância não chega a quem está conectado em outra — a cozinha para de ver pedido, sem erro, sem log. É o mesmo bug que existiria no Cloud Run com `max-instances > 1`. Solução correta se o tráfego um dia justificar mais de uma instância: adaptador Redis para o Socket.io. Para um trailer com ~10 usuários simultâneos, uma instância é suficiente e é também o padrão — não requer nenhuma configuração ativa.

**Variável de ambiente `TZ=America/Sao_Paulo` continua obrigatória.** Sem ela, o container roda em UTC e "hoje" no servidor vira 21h no horário de Betim — os painéis se comportariam como se o dia tivesse virado no meio do pico. Configurar em Settings → Variables do serviço no Railway.

### 2.4 — Persistência: um banco externo, uma única connection string

Nunca um banco local dentro do container — qualquer host sem disco persistente (Cloud Run, a maioria dos planos do Railway) apaga arquivos locais a cada redeploy. O PostgreSQL do Railway é a única fonte de persistência.

**Uma única connection string, sem pooler.** O Postgres nativo do Railway não coloca PgBouncer na frente por padrão — uma variável, `DATABASE_URL`, pronta pra uso. O Railway também oferece um add-on opcional de PgBouncer, mas esta arquitetura não precisa dele: o problema que ele resolve — exaustão de conexões porque muitas instâncias serverless abrem, cada uma, seu próprio pool — não existe aqui, já que o backend é deliberadamente um único processo Node de longa duração (seção 2.3), com um `PrismaClient` singleton abrindo um punhado fixo de conexões. Se o add-on estiver ativo no seu projeto, pode remover.

Isso simplifica o schema: **sem `directUrl`** no datasource. Migration e query de aplicação usam a mesma `DATABASE_URL`.

Onde pegar: serviço do Postgres no Railway → aba **Variables**. Railway expõe DUAS variáveis diferentes, não uma:
- **`DATABASE_URL`** — rede privada, só alcançável de dentro do mesmo projeto Railway. Use esta se o backend também rodar no Railway.
- **`DATABASE_PUBLIC_URL`** — via TCP Proxy, alcançável de fora. Obrigatória para rodar localmente (seu computador nunca está "dentro" da rede do Railway) e obrigatória se o backend ficar em outro host (ex.: Cloud Run). O Railway cobra egress de rede nesse proxy — em todo tráfego se o backend for externo, não só em comandos ocasionais.

**Decidido:** backend também no Railway (seção 13, pergunta 7). Em produção, use `DATABASE_URL` (privada) — sem TCP Proxy, sem egress adicional. `DATABASE_PUBLIC_URL` continua necessária só para rodar localmente, já que seu computador nunca está "dentro" da rede do projeto.

### 2.5 — Backup e recuperação: obrigatório, testado, redundante

Requisito original do projeto, não boa prática genérica adicionada por mim: "como será feito backup e recuperação" foi uma das seis exigências da primeira mensagem deste projeto. Não é opcional e não é um item de fase avançada — é bloqueador antes do primeiro pedido real em produção.

**Camada 1 — nativa do Railway.** Serviço Postgres → aba **Backups** → agendamento (mínimo Daily; combine com Weekly/Monthly se quiser retenção mais longa). Backups são incrementais (Copy-on-Write), cobrados só pelo espaço exclusivo de cada um.

Se o projeto estiver no plano **Pro**, habilite também **Point-in-Time Recovery (PITR)** na mesma aba: arquivamento contínuo de WAL via pgBackRest, restaura para qualquer segundo dentro de uma janela de ~4 semanas, e a restauração cria um **serviço novo** — a instância em produção nunca é tocada, então é seguro testar quantas vezes for preciso. PITR é opt-in e específico do plano Pro; no Hobby, só o backup por snapshot agendado está disponível.

**Camada 2 — cópia independente, fora do Railway.** A própria documentação do Railway descreve o recurso de Backups como "ainda em desenvolvimento". Depender de uma única camada, de um único provedor, para o único dado que este sistema não pode perder — histórico financeiro de pedidos — é o tipo de risco que o resto desta arquitetura foi desenhada para eliminar (snapshots de preço, transações atômicas, instância única do Socket.io). Não faz sentido relaxar exatamente aqui. Mantenha um `pg_dump` agendado (diário) exportado para object storage fora do Railway (Backblaze B2, Cloudflare R2, ou equivalente) — barato, simples, independente da infraestrutura de backup do provedor principal.

**Prova, não configuração.** Configurar backup e nunca restaurá-lo não é ter backup, é ter uma suposição não testada. Há relato documentado de um usuário do Railway cujo backup manual restaurou o banco vazio — só o backup agendado funcionou. Antes de considerar este requisito cumprido: restaure de fato um backup para uma instância Postgres nova (nunca sobrescrevendo a de produção) e confirme que a contagem de registros em `Order`, `User` e `MenuItem` bate com o que existia no momento do backup. Passo a passo na Fase 10.

### 2.6 — Ambiente e workflow: lições das Fases 1–4

Estas custaram horas de depuração. Não são trivialidades — são as causas reais que travaram o desenvolvimento, e todas se repetem se ninguém souber delas.

**Processo Node fantasma na porta 3000.** A causa mais cara de todas. Um processo antigo continua servindo código velho em memória mesmo depois de o arquivo ter sido corrigido no disco. O sintoma é traiçoeiro: você corrige o código, confirma o arquivo, roda o teste e recebe o **mesmo erro de antes** — e conclui que a correção não funcionou, quando na verdade nunca chegou a rodar. Isso também trava o `prisma generate` com `EPERM` (arquivo do motor bloqueado em memória) e derruba `npm run dev` com `EADDRINUSE`.

> **Regra:** sempre que um teste contradisser um arquivo que você confirmou estar correto, rode `netstat -ano | findstr :3000` e mate o PID (`taskkill /PID <n> /F`) antes de qualquer outra hipótese.

**`tsx watch` reinicia ao receber Enter.** Apertar Enter (ou até clicar e digitar) na janela onde o `npm run dev` está rodando dispara um restart. Isso deixou processos órfãos disputando a porta. Use **duas janelas**: uma só para o servidor (não tocar), outra para tudo o mais.

**Comandos rodados no diretório errado.** Não existe `package.json` na raiz do repositório — ele fica em `backend/`. Todo comando npm/prisma roda de dentro de `backend/`. Rodar da raiz produz `ENOENT` (npm) ou, pior, faz o `npx` **baixar o Prisma 7 do registro** (major errada, este projeto é v6) e sugerir migrações para `prisma.config.ts` que não devem ser seguidas.

**PowerShell 5.1 não tem `RandomNumberGenerator.GetBytes`.** Necessário PowerShell 7+ para gerar o `JWT_SECRET`. Além disso, o PowerShell interpola `$` dentro de aspas duplas — `prisma.$disconnect()` em comando inline vira erro de variável. Use heredoc com aspas simples (`@'...'@`) para escrever arquivos.

**`db push` não deve ser usado.** Foi usado uma vez neste projeto (incidente) e teve de ser revertido. Ele sincroniza o schema sem gravar nada em `prisma/migrations/` nem em `_prisma_migrations` — o banco "funciona", mas sem histórico de migration, e `prisma migrate deploy` não reconhece o estado no deploy. Reforça a proibição 3 (seção 12).

**Serviço de banco abandonado ≠ removido.** Ao trocar de instância Postgres, **delete** a antiga no Railway. Enquanto ela existir, a credencial antiga continua válida e alcançável.

**Nunca cole credenciais no chat.** Uma senha de Postgres e um `JWT_SECRET` inteiro foram colados durante o desenvolvimento e tiveram de ser rotacionados. Para confirmar que uma variável está preenchida, mostre só o hostname ou os últimos 4 caracteres.

**Aceitar apenas prova, nunca narrativa.** Padrão recorrente: relatórios afirmando "testado com sucesso" e exibindo JSONs de resposta **inventados**, para testes que nunca rodaram (por `.env` sobrescrito, banco inalcançável, ou simplesmente não executados). Cada rodada de auditoria sobre o código real — não sobre o resumo — encontrou bugs que o resumo não mencionava. **Todo teste roda no terminal do desenvolvedor, contra o servidor local, e a saída bruta é colada.** Descrição de resultado não é resultado.

**AI Studio não tinha acesso real ao disco — Antigravity tem.** As Fases 1-4 e a primeira tentativa da Fase 5 foram feitas via Google AI Studio, uma interface de chat sem nenhuma conexão com a máquina local: quando ele narrava "editei X, rodei Y", isso não podia ser real, não existe integração de sistema de arquivos. Isso explica por que a Fase 5 "concluída" não tinha nenhum arquivo real no disco (só o scaffold puro do Vite). A partir da Fase 6, o desenvolvimento passou para o **Google Antigravity** — um IDE agentic de verdade, com acesso real a arquivo, terminal e navegador. Isso muda a NATUREZA do risco (de "nunca aconteceu" para "aconteceu, mas pode estar errado, ou incompleto em modo de autonomia plena"), mas não elimina a exigência de prova acima — só muda de onde a prova pode vir: peça o artefato/log real da própria ferramenta, e ainda assim confirme por fora (inventário de arquivo, teste manual) nas transições de fase. Dado que o projeto mexe com dinheiro e autenticação, prefira o modo de autonomia com checkpoints ou aprovação passo a passo, não autonomia plena.

---

## 3. Stack

**Backend:** Node.js + TypeScript, Express (puro — não Next.js, não Nest), Prisma v6 (`new PrismaClient()` singleton, sem driver adapters), PostgreSQL via Railway, Socket.io v4, `jsonwebtoken` + `bcrypt`, `zod`, `express-rate-limit`.

**Frontend:** React 18 + TypeScript, Vite, React Router v6, Zustand, Tailwind CSS, `socket.io-client`, `axios`.

**Exclusivo do painel ADM (carregado sob demanda):** `recharts`.

---

## 4. Schema Prisma — fonte de verdade

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
}

enum Role {
  GARCOM
  CHAPISTA
  ENTREGADOR
  ADM
  TI
}

enum Category {
  HOT_DOGS
  HAMBURGUERES
  MACARRAO_NA_CHAPA
  BEBIDAS
  ACRESCIMOS
}

enum OrderType {
  MESA
  RETIRADA
  DELIVERY
}

enum OrderStatus {
  AGUARDANDO
  PREPARANDO
  PRONTO
  EM_ROTA
  ENTREGUE
  CANCELADO
}

enum PaymentMethod {
  DINHEIRO
  PIX
  CREDITO
  DEBITO
}

model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique
  password  String
  role      Role     @default(GARCOM)
  approved  Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  createdOrders  Order[] @relation("CreatedBy")
  assignedOrders Order[] @relation("AssignedTo")
  logs           Log[]

  @@map("users")
}

model MenuItem {
  id             Int      @id @default(autoincrement())
  name           String   @unique
  category       Category
  price          Decimal  @db.Decimal(10, 2)
  description    String?
  // available = esgotado hoje. Chapista alterna. Cliente vê o item riscado ("SEM ESTOQUE").
  available      Boolean  @default(true)
  // archived = saiu do cardápio. Só ADM/TI. Some de todas as telas, mas o registro
  // permanece no banco porque pedidos antigos apontam para ele via FK.
  archived       Boolean  @default(false)
  ingredients    Json     @default("[]")
  // requiredChoice: escolha obrigatória antes de adicionar ao carrinho. null = não exige.
  // Formato: { "label": "Escolha o molho", "options": ["Molho de Alho", "Molho Shoyu"] }
  requiredChoice Json?    @map("required_choice")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  orderItems  OrderItem[]
  orderExtras OrderItemExtra[]

  @@map("menu_items")
}

model Neighborhood {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  deliveryFee Decimal  @db.Decimal(10, 2) @map("delivery_fee")
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")

  orders Order[]

  @@map("neighborhoods")
}

model Order {
  id     Int         @id @default(autoincrement())
  type   OrderType
  status OrderStatus @default(AGUARDANDO)

  // Número da mesa como INTEIRO. Preenchido só quando type = MESA.
  // O rótulo de exibição ("Mesa 3", "Delivery: Maria") é computado no frontend.
  tableNumber Int? @map("table_number")

  subtotal      Decimal       @db.Decimal(10, 2)
  total         Decimal       @db.Decimal(10, 2)
  paymentMethod PaymentMethod @map("payment_method")

  // Valor em espécie com que o cliente vai pagar (a nota que ele entrega).
  // O troco a devolver = cashPaidAmount - total. Nome explícito para evitar
  // a ambiguidade de "troco" (é a nota ou é o que volta?), que faz o entregador
  // sair com o valor errado.
  cashPaidAmount Decimal? @db.Decimal(10, 2) @map("cash_paid_amount")

  customerName    String? @map("customer_name")
  customerPhone   String? @map("customer_phone")
  customerAddress String? @map("customer_address")

  // FK + snapshots imutáveis. O total do pedido SEMPRE usa o snapshot,
  // nunca uma consulta ao valor atual do bairro.
  neighborhoodId           Int?     @map("neighborhood_id")
  neighborhoodNameSnapshot String?  @map("neighborhood_name_snapshot")
  deliveryFeeSnapshot      Decimal? @db.Decimal(10, 2) @map("delivery_fee_snapshot")

  createdById   Int?    @map("created_by_id")
  createdByName String? @map("created_by_name")

  // Entregador que aceitou a corrida. null = disponível para qualquer um.
  // Preenchido de forma atômica (ver PATCH /orders/:id/accept).
  assignedToId   Int?    @map("assigned_to_id")
  assignedToName String? @map("assigned_to_name")

  clientOnline              Boolean @default(false) @map("client_online")
  requiresStaffConfirmation Boolean @default(false) @map("requires_staff_confirmation")

  // Ocorrência atual reportada pelo entregador. Cada novo reporte sobrescreve
  // este campo, mas TODOS os reportes ficam registrados na tabela Log.
  problems String?

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  neighborhood  Neighborhood?        @relation(fields: [neighborhoodId], references: [id], onDelete: SetNull)
  createdBy     User?                @relation("CreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  assignedTo    User?                @relation("AssignedTo", fields: [assignedToId], references: [id], onDelete: SetNull)
  items         OrderItem[]
  statusHistory OrderStatusHistory[]

  @@index([status])
  @@index([createdAt])
  @@map("orders")
}

model OrderItem {
  id             Int     @id @default(autoincrement())
  orderId        Int     @map("order_id")
  menuItemId     Int     @map("menu_item_id")
  // Snapshots: se o preço do cardápio mudar amanhã, este pedido não muda.
  menuItemName   String  @map("menu_item_name")
  unitPrice      Decimal @db.Decimal(10, 2) @map("unit_price")
  quantity       Int
  observations   String?
  selectedChoice String? @map("selected_choice")

  order    Order            @relation(fields: [orderId], references: [id], onDelete: Cascade)
  menuItem MenuItem         @relation(fields: [menuItemId], references: [id], onDelete: Restrict)
  extras   OrderItemExtra[]

  @@map("order_items")
}

model OrderItemExtra {
  id           Int     @id @default(autoincrement())
  orderItemId  Int     @map("order_item_id")
  menuItemId   Int     @map("menu_item_id")
  menuItemName String  @map("menu_item_name")
  unitPrice    Decimal @db.Decimal(10, 2) @map("unit_price")
  // Permite "2x bacon". Sem este campo era impossível representar acréscimo dobrado.
  quantity     Int     @default(1)

  orderItem OrderItem @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  menuItem  MenuItem  @relation(fields: [menuItemId], references: [id], onDelete: Restrict)

  @@map("order_item_extras")
}

model OrderStatusHistory {
  id        Int         @id @default(autoincrement())
  orderId   Int         @map("order_id")
  oldStatus OrderStatus @map("old_status")
  newStatus OrderStatus @map("new_status")
  changedBy String      @map("changed_by")
  notes     String?     // motivo do cancelamento, etc.
  createdAt DateTime    @default(now()) @map("created_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@map("order_status_history")
}

model Log {
  id        Int      @id @default(autoincrement())
  userId    Int?     @map("user_id")
  username  String   // snapshot: sobrevive à exclusão do usuário
  action    String
  details   Json?    // estruturado, não texto livre — permite filtrar
  createdAt DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([action])
  @@index([createdAt])
  @@map("logs")
}

// Linha ÚNICA (id sempre = 1). Sempre acessada via upsert where { id: 1 }.
// Substitui o padrão key-value de string, que exigia parsing manual de
// "true"/"false" e "10" em toda leitura — fonte garantida de bug de conversão.
model SystemConfig {
  id               Int      @id @default(1)
  trailerOpen      Boolean  @default(true)  @map("trailer_open")
  deliveryActive   Boolean  @default(true)  @map("delivery_active")
  maxTables        Int      @default(10)    @map("max_tables")
  contactPhone     String   @map("contact_phone")
  contactInstagram String   @map("contact_instagram")
  updatedBy        String   @map("updated_by")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@map("system_config")
}
```

### Removido do schema anterior, e por quê

| Removido | Motivo |
|---|---|
| `StockItem` + `StockUnit` | Tabela órfã: nenhuma rota, nenhuma tela, nenhum seed a usava. Justifiquei antes como "evitar migration destrutiva depois" — mas adicionar tabela é migration **aditiva**, a mais barata que existe. Era código morto. |
| `Order.identification` (String) | Derivável de `type` + `tableNumber` + `customerName`. Pior: o número da mesa só existia *dentro* dessa string, então validar "mesa ≤ máximo" exigia parsear texto. Substituído por `tableNumber Int?`. O rótulo é computado no frontend. |
| `MenuItem.imageUrl` | Nada lê, nada escreve, não há fotos. Coluna nullable é migration aditiva trivial quando as fotos existirem. |
| `Order.changeAmount` | Nome ambíguo: era o troco a devolver ou a nota que o cliente entrega? Renomeado para `cashPaidAmount`, sem ambiguidade. |
| `paymentMethod` como `String` livre | Virou enum. Como String, "Pix"/"PIX"/"pix" quebrariam qualquer agrupamento de faturamento por forma de pagamento no painel ADM. |

---

## 5. Regras de Negócio Obrigatórias

### 5.1 — Cálculo de valores (dinheiro errado = prejuízo)

```
linha    = (item.unitPrice + Σ(extra.unitPrice × extra.quantity)) × item.quantity
subtotal = Σ linhas
total    = subtotal + (type === DELIVERY ? deliveryFeeSnapshot : 0)
```

Os extras **multiplicam pela quantidade do item**. A fórmula anterior somava os extras uma única vez, então "2× X-Burguer com bacon" cobrava um bacon só.

**Backend:** toda aritmética usa métodos do `Prisma.Decimal` (`.plus()`, `.times()`). Nunca `Number(price) * qty` — isso reintroduz float exatamente onde importa.

**Frontend:** toda aritmética em **centavos inteiros** (`Math.round(Number(price) * 100)`), dividindo por 100 só na exibição. Evita `R$ 37,000000000000004`.

**O servidor recalcula tudo.** Qualquer `total`, `subtotal` ou `price` que venha no payload do cliente é ignorado. O servidor busca os preços pelo `menuItemId` e recomputa.

### 5.2 — Validação de pedido (server-side, sempre)

Vale igual para `POST /api/orders` e `POST /api/public/orders` — **ambos chamam a mesma função de service**, com um parâmetro indicando a origem. Não existem duas implementações.

1. `trailerOpen === false` → 403.
2. `type === DELIVERY` e `deliveryActive === false` → 403.
3. `type === MESA` e `tableNumber > maxTables` (ou `< 1`) → 400.
4. `type === DELIVERY` sem `neighborhoodId` válido e `active: true` → 400. **Nunca existe fallback de taxa.**
5. Para cada item: se `MenuItem.requiredChoice != null`, o `selectedChoice` enviado precisa estar em `requiredChoice.options`. Ausente ou inválido → 400 dizendo qual item e qual escolha faltou.
6. Item com `archived: true` ou `available: false` → 400.
7. `paymentMethod === DINHEIRO` e `cashPaidAmount < total` → 400.
8. Criação de `Order` + `OrderItem[]` + `OrderItemExtra[]` dentro de **uma única** `prisma.$transaction()`.

### 5.3 — Confirmação de pedido online em mesa

Se `clientOnline === true` **e** `type === MESA` → `requiresStaffConfirmation: true` na criação. Protege contra pedido feito em mesa vazia ou por brincadeira.

**A cozinha nunca vê esses pedidos** até um garçom confirmar. Filtro obrigatório em toda query da cozinha: `requiresStaffConfirmation: false`.

Retirada e delivery online **não** exigem confirmação (o cliente deu nome e telefone, há rastro).

### 5.4 — Atribuição atômica de entregador

Sem isso, dois entregadores veem o mesmo pedido `PRONTO`, ambos tocam "Saí para entrega", ambos dirigem ao mesmo endereço.

```ts
const r = await tx.order.updateMany({
  where: { id, type: 'DELIVERY', status: 'PRONTO', assignedToId: null },
  data:  { status: 'EM_ROTA', assignedToId: userId, assignedToName: username },
});
if (r.count === 0) throw new ConflictError('Pedido já foi aceito por outro entregador');
```

`updateMany` com `where` condicional é um compare-and-set atômico. O `count === 0` significa que outro entregador chegou primeiro.

### 5.5 — Histórico e logs

Toda mudança de status grava um `OrderStatusHistory` **dentro da mesma transação** que atualiza `Order.status`. As duas escritas acontecem juntas ou nenhuma acontece.

Ações que obrigatoriamente geram `Log`: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `REGISTER`, `ORDER_CREATED`, `ORDER_CREATED_PUBLIC`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`, `ORDER_CONFIRMED_BY_STAFF`, `ORDER_ACCEPTED_BY_DRIVER`, `ORDER_PROBLEM_REPORTED`, `MENU_ITEM_CREATED`, `MENU_ITEM_UPDATED`, `MENU_AVAILABILITY_CHANGED`, `MENU_ITEM_ARCHIVED`, `NEIGHBORHOOD_CREATED`, `NEIGHBORHOOD_UPDATED`, `USER_APPROVED`, `USER_REVOKED`, `USER_ROLE_CHANGED`, `USER_DELETION_BLOCKED`, `CONFIG_UPDATED`.

### 5.6 — Escopo das listagens (mata o bug de meia-noite E o de paginação)

**Painéis operacionais filtram por STATUS, nunca por data.**

O expediente vai das 18h às 05h — atravessa a meia-noite. Se a cozinha filtrasse por "pedidos de hoje", às 00:00 **todos os pedidos em preparo sumiriam da tela**, no meio do turno. (E com o servidor em UTC, sumiriam às 21:00.)

- **Cozinha:** `status IN (AGUARDANDO, PREPARANDO, PRONTO)` **e** `requiresStaffConfirmation = false`. Sem filtro de data.
- **Entregador:** `type = DELIVERY` **e** ( `status = PRONTO` **e** `assignedToId IS NULL` ) **ou** ( `status = EM_ROTA` **e** `assignedToId = eu` ). Sem filtro de data.
- **Garçom:** ativos por status (sem data) + aba "Pedidos do Site" (`requiresStaffConfirmation = true`).
- **ADM/TI (histórico e relatórios):** `?from=&to=` obrigatório.

O conjunto de pedidos ativos é naturalmente pequeno — um trailer nunca tem 200 pedidos em aberto. Sem data no caminho quente, sem paginação necessária, sem bug de virada de dia.

**Expediente ≠ dia civil.** Para o KPI "faturamento de hoje" do ADM, defina o expediente como **12:00 até 11:59 do dia seguinte**, em `America/Sao_Paulo`. Um pedido feito à 01:30 pertence ao expediente que começou no dia anterior.

### 5.7 — Nada de hard delete em objeto de domínio

| Rota removida | Por quê | Substituto |
|---|---|---|
| `DELETE /api/menu/:id` | `OrderItem.menuItem` é relação obrigatória com `onDelete: Restrict`. A rota **falha com erro de FK** no primeiro item que já tenha sido pedido alguma vez. Ela nunca ia funcionar. | `PATCH /api/menu/:id/archive` |
| `DELETE /api/orders/:id` | Duplicava a transição para `CANCELADO`, e um hard delete destruiria registro financeiro e trilha de auditoria. Dois caminhos para a mesma ação = dois caminhos para errar. | `PATCH /api/orders/:id/status` → `CANCELADO`, com `notes` obrigatório |
| `DELETE /api/neighborhoods/:id` | Duplicava `active: false`. | `PATCH /api/neighborhoods/:id` com `active: false` |

`DELETE /api/users/:id` **fica** (TI apenas). É seguro: `Order.createdById` e `Log.userId` são `SetNull`, e os snapshots `createdByName`/`username` preservam quem fez o quê.

### 5.8 — Login nunca revela se o usuário existe

Usuário inexistente e senha errada retornam **exatamente a mesma resposta**: 401 "Usuário ou senha incorretos". Nunca um 404, nunca uma mensagem que diferencie os dois casos — isso deixaria alguém descobrir por tentativa e erro quais usernames têm conta. O 403 "Conta aguardando aprovação" só aparece **depois** de a senha já ter sido confirmada correta, então não vaza informação para quem não sabe a senha.

Esta regra não estava no prompt original da Fase 1 — é uma lacuna minha, não um erro de quem implementou.

---

## 6. Socket.io — dois namespaces (correção de vazamento de dados)

O plano anterior fazia `io.emit('order:created', pedidoCompleto)` — broadcast global — enquanto o cardápio público abria uma conexão anônima. Resultado: **o celular de qualquer cliente navegando no cardápio receberia nome, telefone e endereço residencial de todos os outros clientes.**

### `/staff` — JWT obrigatório

Middleware verifica `socket.handshake.auth.token`. Rejeita conexão sem token válido.

```
order:created            → pedido completo com itens
order:status_changed     → { orderId, oldStatus, newStatus, changedBy, updatedOrder }
order:confirmed          → { orderId, updatedOrder }
order:accepted           → { orderId, assignedToName, updatedOrder }
order:cancelled          → { orderId, notes, changedBy }
order:problem_reported   → { orderId, problems }
menu:availability_changed→ { menuItemId, available }
system:config_changed    → objeto de config completo
```

### `/public` — anônimo

Sem autenticação. Recebe **exclusivamente** informação que já é pública:

```
menu:availability_changed → { menuItemId, available }
system:public_config      → { trailerOpen, deliveryActive, maxTables }
```

**Nenhum payload de pedido cruza para o `/public`. Nunca.** Esta é uma linha vermelha: qualquer `io.of('/public').emit()` com dados de pedido é um vazamento de dados pessoais.

### Direção do fluxo

Cliente **nunca** emite mutação via socket. Toda mutação é uma chamada REST; o servidor faz o broadcast do resultado depois que a escrita no banco foi confirmada (`await` primeiro, `emit` depois — nunca o contrário).

---

## 7. Rotas da API

```
POST   /api/auth/register              público (rate limit)
POST   /api/auth/login                 público (rate limit)

GET    /api/users                      ADM, TI
PATCH  /api/users/:id/approve          ADM, TI   body: { approved: boolean }  (aprova E revoga)
PATCH  /api/users/:id/role             TI
DELETE /api/users/:id                  TI        (bloqueia o usuário protegido)

GET    /api/menu                       autenticado   (?includeArchived=true → só ADM/TI)
POST   /api/menu                       ADM, TI
PATCH  /api/menu/:id                   ADM, TI
PATCH  /api/menu/:id/availability      ADM, TI, CHAPISTA   body: { available: boolean }
PATCH  /api/menu/:id/archive           ADM, TI             body: { archived: boolean }

GET    /api/neighborhoods              autenticado
POST   /api/neighborhoods              ADM, TI
PATCH  /api/neighborhoods/:id          ADM, TI   (inclui active)

GET    /api/config                     autenticado
PATCH  /api/config                     ADM, TI

GET    /api/orders                     autenticado (escopo por papel — ver 5.6)
POST   /api/orders                     GARCOM, CHAPISTA, ADM, TI
PATCH  /api/orders/:id/status          transição validada por papel
PATCH  /api/orders/:id/confirm         GARCOM, CHAPISTA, ADM, TI
PATCH  /api/orders/:id/accept          ENTREGADOR   (atômico — ver 5.4)
PATCH  /api/orders/:id/problem         ENTREGADOR

GET    /api/logs                       TI   (?action=&username=&from=&to=&page=&limit=)
GET    /api/logs/export?format=csv|json TI  (teto de 500 registros por requisição)

GET    /api/public/menu                sem auth   (rate limit leve)
GET    /api/public/neighborhoods       sem auth   (rate limit leve)
GET    /api/public/config              sem auth   (rate limit leve)
POST   /api/public/orders              sem auth   (rate limit estrito)
```

### Transições de status permitidas

| Papel | Transições |
|---|---|
| CHAPISTA | `AGUARDANDO → PREPARANDO`, `PREPARANDO → PRONTO` |
| ENTREGADOR | `PRONTO → EM_ROTA` (via `/accept`), `EM_ROTA → ENTREGUE` (só se `assignedToId = ele`) |
| GARCOM, CHAPISTA, ADM, TI | qualquer status → `CANCELADO` (com `notes` obrigatório) |
| ADM, TI | qualquer transição |

Pedido com `requiresStaffConfirmation: true` **não pode sair de `AGUARDANDO`** até ser confirmado.

### Rate limiting

O limite anterior — 20 requisições / 15 min no namespace `/api/public/*` inteiro — bloquearia clientes legítimos: um load da página faz 3 requisições (menu + bairros + config), e uma família no mesmo Wi-Fi compartilha o IP.

| Escopo | Limite |
|---|---|
| `GET /api/public/*` | 100 / 15 min por IP |
| `POST /api/public/orders` | 5 / 10 min por IP |
| `POST /api/auth/register` e `/login` | 10 / 15 min por IP |

**`app.set('trust proxy', 1)` é obrigatório no `server.ts`.** Cloud Run coloca um proxy na frente. Sem isso, `req.ip` é o IP do proxy e o rate limiter trata todo o tráfego do mundo como um único cliente — ou bloqueia todo mundo, ou não protege ninguém. Use o número `1` (um hop de proxy), não `true` — o `express-rate-limit` v7 rejeita a configuração permissiva.

---

## 8. Variáveis de Ambiente

```env
DATABASE_URL="[cole aqui a DATABASE_URL ou DATABASE_PUBLIC_URL exibida no Railway]"
JWT_SECRET="gerar com: openssl rand -base64 64"
JWT_EXPIRES_IN="10h"
PORT=3000
NODE_ENV=production
TZ="America/Sao_Paulo"
```

Não existe mais `CORS_ORIGIN`, `VITE_API_URL` nem `VITE_SOCKET_URL` — são desnecessários servindo tudo do mesmo container.

`src/config/env.ts` valida tudo com zod na inicialização. Faltou variável → erro descritivo + `process.exit(1)`. O servidor nunca sobe quebrado.

Em produção, o `JWT_SECRET` vai nas variáveis de ambiente protegidas do serviço de deploy — nunca commitado.

### 8.1 — Quando preencher os valores reais (Railway)

O Gemini nunca gera nem vê valores reais — só o `.env.example` com placeholders. Você preenche manualmente, num `.env` local nunca versionado:

1. No projeto do Railway, adicione um serviço PostgreSQL (template nativo, "zero configuration").
2. Clique no serviço do Postgres → aba **Variables** → copie `DATABASE_URL` (rede privada, só funciona se o backend também estiver no Railway) ou `DATABASE_PUBLIC_URL` (via TCP Proxy — use esta rodando localmente, ou se o backend ficar em outro host).
3. Gere o `JWT_SECRET` com `openssl rand -base64 64`.
4. Cole os dois valores no `backend/.env` real.
5. Só então: `npx prisma migrate dev --name init`, depois o seed, depois `npm run dev`.

**Se o Railway mostrar 4 variáveis de conexão** (algo como `DATABASE_URL`, `DATABASE_PUBLIC_URL`, `DATABASE_UNPOOLED_URL`, `DATABASE_UNPOOLED_PUBLIC_URL`) em vez de 2, o add-on de PgBouncer foi ativado nesse projeto. Não é necessário aqui (seção 2.4) — use a variante sem "UNPOOLED" mesmo assim, ou remova o add-on.

Em produção, os mesmos valores vão para as variáveis de ambiente do serviço de deploy no momento do deploy (Fase 10) — nunca antes.

---

## 9. Estrutura de Pastas

```
sistema-pedidos/
├── Dockerfile                    ← multi-stage: build frontend → build backend → runtime
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── seedData/
│   │       ├── menuItems.ts
│   │       └── neighborhoods.ts
│   └── src/
│       ├── config/
│       │   ├── env.ts
│       │   └── prisma.ts
│       ├── middleware/
│       │   ├── auth.ts
│       │   ├── roles.ts
│       │   ├── rateLimit.ts
│       │   └── errorHandler.ts
│       ├── modules/
│       │   ├── auth/            (routes, controller, service)
│       │   ├── users/
│       │   ├── menu/
│       │   ├── orders/
│       │   ├── neighborhoods/
│       │   ├── config/
│       │   ├── logs/
│       │   └── public/          ← APENAS routes + controller. Sem service próprio.
│       ├── socket/
│       │   └── socket.ts        ← namespaces /staff e /public. Sem pasta handlers/.
│       ├── utils/
│       │   ├── logger.ts
│       │   ├── money.ts         ← helpers de Prisma.Decimal
│       │   └── shift.ts         ← janela do expediente (12:00→11:59, America/Sao_Paulo)
│       └── server.ts
└── frontend/
    └── src/
        ├── pages/
        │   ├── PublicMenu.tsx
        │   ├── Login.tsx
        │   └── panels/          (Garcom, Chapista, Entregador, ADM, TI)
        ├── components/
        │   ├── ui/              (Button, Input, Select, Modal, Tabs)
        │   ├── menu/            (CategoryTabs, MenuItemCard, ItemCustomizationModal)
        │   ├── cart/            (CartDrawer, CartItem, CheckoutForm)
        │   ├── order/           (OrderCard, OrderWizard)
        │   ├── admin/           (KpiCards, RevenueChart, MenuManagement, ...)
        │   ├── auth/            (ProtectedRoute)
        │   └── layout/          (PublicHeader, PublicFooter, PanelLayout)
        ├── stores/
        │   ├── useAuthStore.ts
        │   ├── useCatalogStore.ts   ← menu + bairros + config (dados de referência)
        │   ├── useCartStore.ts      ← persistido em localStorage
        │   ├── useOrdersStore.ts
        │   └── useSocketStore.ts
        ├── services/
        │   ├── api.ts               ← axios com interceptor de JWT, baseURL '/api'
        │   ├── publicApi.ts         ← axios SEM interceptor, baseURL '/api/public'
        │   └── socket.ts
        ├── utils/
        │   ├── money.ts             ← centavos inteiros + formatação BRL
        │   ├── orderLabel.ts        ← "Mesa 3" / "Delivery: Maria" (substitui identification)
        │   ├── whatsapp.ts
        │   └── phoneMask.ts
        └── types/index.ts
```

### Removido da estrutura anterior

| Removido | Motivo |
|---|---|
| `modules/public/public.service.ts` | O módulo público é uma camada de **exposição**, não um domínio. Ele chama `orders.service.createOrder({ clientOnline: true })`, `menu.service`, `config.service`. Um service próprio garantiria duplicação da regra de negócio. |
| `socket/handlers/orderHandlers.ts` | Abstração vazia. Eu tinha escrito "à sua escolha de organização" — **nunca deixe decisão arquitetural para a IA.** Decidido: os controllers emitem direto, importando o `io`. |
| `useMenuStore` + `useNeighborhoodsStore` | Fundidos em `useCatalogStore`. São dados de referência, buscados uma vez, quase nunca mudam. Três stores viraram um. |

---

## 10. Frontend — regras específicas

### Performance

- **Code-splitting por rota** com `React.lazy()` + `Suspense`. O bundle inicial (carregado por cliente em dados móveis) contém **só** o cardápio público. Nenhum painel, nenhum `recharts`.
- `recharts` só existe no chunk do `PanelADM`. Se aparecer no bundle da rota `/`, está errado.
- **Sem imagens.** Nenhum componente renderiza `<img>` de produto. O card precisa ficar visualmente correto sem espaço reservado para foto.
- **Sem polling.** O socket já cobre tudo em tempo real.

### Carrinho persistido

`useCartStore` usa o middleware `persist` do Zustand → `localStorage`. No celular, o navegador descarta abas em segundo plano constantemente; sem persistência, o cliente perde o carrinho e a venda. Não é dado sensível (só `menuItemId` e quantidades).

### Prevenção de pedido duplicado

O botão "Finalizar Pedido" **desabilita no submit** e mostra spinner até a resposta. Sem isso, o cliente com rede lenta toca duas vezes e a cozinha faz dois lanches.

Na resposta de sucesso, exibir o **número do pedido** (`Pedido #47`) — senão o cliente chega no balcão sem saber se identificar.

### ACRESCIMOS não é uma aba do cardápio

`GET /api/public/menu` retorna **todos** os itens não-arquivados, incluindo os de categoria `ACRESCIMOS` (o modal precisa deles).

Mas o **frontend não exibe `ACRESCIMOS` como aba navegável.** Sem essa regra, o cliente adiciona "Bacon — R$5" sozinho ao carrinho e a cozinha recebe uma comanda dizendo "Bacon x1" sem lanche nenhum. Acréscimos só aparecem *dentro* do modal de customização.

### `available` — a API devolve, o frontend risca

`GET /api/public/menu` retorna itens com `available: false` **inclusive**, com a flag. O frontend renderiza com opacidade reduzida e selo "SEM ESTOQUE", botão travado. (A versão anterior tinha uma contradição: a API filtrava os indisponíveis, o que tornava o componente `UnavailableBadge` código morto.)

Itens `archived: true` **nunca** aparecem no endpoint público.

### Quando o modal de customização abre

Abre se `requiredChoice != null` **ou** se a categoria é `HOT_DOGS`, `HAMBURGUERES` ou `MACARRAO_NA_CHAPA`.

`BEBIDAS` sem `requiredChoice` vão direto ao carrinho (só quantidade). `ACRESCIMOS` nunca são adicionados diretamente.

### `ItemCustomizationModal` é compartilhado

O **mesmo componente**, importado, serve o cardápio público (Fase 6) e o wizard interno do garçom/chapista (Fase 7). A regra de escolha obrigatória não pode ter duas implementações que divergem. Escreva-o desacoplado do `useCartStore` — props claras de entrada e saída.

### Estilo visual — dois padrões coexistindo, de propósito

**Componentes já existentes (Fase 5–7, exceto `Login.tsx`)** usam a escala semântica de 3 tons definida na Fase 5: `bg-bg`, `bg-bg-surface`, `bg-bg-elevated`. Já testados — não retrabalhar só por consistência de nome de classe.

**`Login.tsx` e todo componente novo a partir da Fase 8** usam a escala numérica de 9 tons (`neutral-950` a `neutral-400`), extraída e verificada linha a linha contra um projeto de referência real (não descrição — código conferido diretamente). Convenções concretas a reaproveitar:

- **Card:** `bg-neutral-900/50 border border-neutral-850 rounded-2xl p-5 hover:border-neutral-800 transition-all`
- **Botão primário:** `bg-primary border border-primary/40 hover:bg-primary-hover text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl px-4 py-2.5`
- **Botão secundário:** `bg-neutral-850 border border-neutral-750 text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-xl px-4 py-2.5`
- **Input:** `bg-neutral-950 border border-neutral-800 focus:border-primary focus:ring-1 focus:ring-primary rounded-2xl text-white placeholder-neutral-600 text-sm font-medium px-4 py-3`
- **Tabela:** wrapper `overflow-x-auto border border-neutral-850 rounded-2xl`; linhas `border-b border-neutral-850/60 bg-neutral-900/20 hover:bg-neutral-900/50 transition-colors`
- **Rótulos e badges de status:** `font-mono uppercase tracking-wider` — dá caráter de painel operacional, não é só decoração.

**Explicitamente evitar** (tell de "cara de site genérico gerado por IA", identificado e rejeitado de propósito): blobs decorativos com `blur-3xl`, overlays `bg-gradient-to-b from-primary/10 via-transparent`, sombras coloridas tipo `shadow-2xl shadow-primary/30`. Nada disso entra em nenhum componente novo.

Quando as duas escalas (3 tons e 9 tons) precisarem unificar — não é bloqueador agora — a decisão registrada foi adiar essa consolidação, não fazer os dois padrões coexistirem sem ninguém saber por quê.

---

## 11. Dados de Referência

### Bairros

| Bairro | Taxa |
|---|---|
| Alterosa 1 | 3,00 |
| Alterosa 2 | 4,00 |
| Dom Bosco | 5,00 |
| Duque de Caxias | 5,00 |
| Vila das Flores | 8,00 |
| Cruzeiro do Sul | 6,00 |
| Niteroi | 7,00 |
| Jardim Petrópolis | 10,00 |
| Monte Verde | 10,00 |
| São João | 10,00 |
| Itacolomi | 8,00 |
| Nossa Senhoras das Graças | 7,00 |
| Nossa Senhora de Fátima | 6,00 |
| Vila Cristina | 8,00 |
| Jardim Brasília | 8,00 |

Ortografia mantida exatamente como você enviou. Não "corrigi" nada — são dados de negócio, não erro de digitação para eu arbitrar.

**Bairro fora da lista:** o select tem uma opção final fixa `"outro"` → "Outro bairro (ligar para confirmar)". Ao selecioná-la, o botão de finalizar **desabilita** e aparece o telefone/WhatsApp. O valor `"outro"` existe **só na interface** — nunca é enviado à API. Nenhum pedido de delivery é criado sem taxa confirmada, e isso é validado no servidor.

### Cardápio

**BEBIDAS**

| Nome | Preço |
|---|---|
| Coca-Cola (Lata) | 6,00 |
| Guaraná (Lata) | 6,00 |
| Coca-Cola (600ml) | 9,00 |
| Coca-Cola (1L) | 12,00 |
| Mate Couro (1L) | 10,00 |
| Coca-Cola (2L) | 15,00 |
| Fanta Laranja (2L) | 14,00 |
| Mate Couro (2L) | 13,00 |
| Heineken (Latão) | 12,00 |
| Brahma (Latão) | 8,00 |
| Água Mineral (500ml) | 3,00 |
| Água com Gás (500ml) | 4,00 |

**Suco — modelado à parte, não entra nesta tabela.** Ver seção 13, pergunta 1 (resolvida): cada sabor é seu próprio `MenuItem` (ex.: "Suco de Manga", categoria BEBIDAS, 6,00), criado e desativado pelo staff com o CRUD e o toggle de disponibilidade que já existem. Nenhum sabor fabricado por mim aqui.

**HOT_DOGS**

| Nome | Preço | Ingredientes | requiredChoice |
|---|---|---|---|
| Cachorro Quente | 12,00 | Pão, Salsicha, Molho de Tomate, Milho, Batata Palha | — |
| Cachorro Quente Especial | 16,00 | Pão, 2 Salsichas, Mussarela, Bacon, Molho de Tomate, Milho, Batata Palha | — |
| Super Dog | 19,00 | Pão, 2 Salsichas, Mussarela, Bacon, Molho de Tomate, Milho, Batata Palha | **Queijo: Cheddar \| Catupiry** |

**HAMBURGUERES**

| Nome | Preço | Ingredientes | description |
|---|---|---|---|
| Hambúrguer | 14,00 | Pão, Carne, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | — |
| X-Salada | 14,00 | Pão, Ovo, Mussarela, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | "Não contém carne" |
| X-Burguer | 16,00 | Pão, Carne, Mussarela, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | — |
| X-Misto | 17,00 | Pão, Carne, Mussarela, Presunto, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | — |
| X-Bacon | 21,00 | Pão, Carne, Bacon, Mussarela, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | — |
| X-Egg-Bacon | 22,00 | Pão, Carne, Ovo, Bacon, Mussarela, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | — |
| X-Tudo | 24,00 | Pão, 2 Carnes, Ovo, Bacon, Mussarela, Presunto, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | — |
| X-Duplo | 28,00 | Pão, 2 Carnes, 2 Ovos, 2 Bacon, 2 Mussarela, 2 Presunto, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | — |
| X-Triplo | 33,00 | Pão, 3 Carnes, 3 Ovos, 3 Bacon, 3 Mussarela, 3 Presunto, Creme de Maionese, Milho, Batata Palha, Alface, Tomate | — |

**MACARRAO_NA_CHAPA**

| Nome | Preço | Ingredientes | requiredChoice |
|---|---|---|---|
| Macarrão na Chapa | 27,00 | Macarrão, Bacon, Presunto, Mussarela, Milho, Cebola, Pimentão, Tomate | **Molho: Molho de Alho \| Molho Shoyu \| Molho de Tomate** |

**ACRESCIMOS**

| Nome | Preço |
|---|---|
| Cheddar | 5,00 |
| Catupiry | 5,00 |
| Mussarela | 5,00 |
| Presunto | 5,00 |
| Bacon | 5,00 |
| Frango Desfiado | 5,00 |
| Banana | 3,00 |
| Uva Passas | 3,00 |
| Ovo | 3,00 |

**Preços no seed vão como STRING** (`price: "12.00"`), nunca como número JS (`12.00` é float). Prisma aceita string para `Decimal`.

### Contato

- Telefone: `31999990000` → WhatsApp `https://wa.me/5531999990000`
- Instagram: `trailer.pedidos.demo`

Ambos ficam em `SystemConfig`, editáveis pelo ADM. **Nunca hardcoded** em nenhum componente.

---

## 12. Proibições (valem em toda sessão de geração de código)

1. Nenhum padrão de Next.js — sem `middleware.ts` na raiz, sem App Router, sem `"use client"`, sem Server Actions, sem `@supabase/ssr`.
2. Nenhum segredo, URL de banco ou credencial hardcoded em lugar nenhum.
3. Nada de `prisma db push`. Só `migrate dev` (local) e `migrate deploy` (produção, rodado **antes** do deploy da imagem). Já foi violado uma vez neste projeto e teve de ser revertido — ver seção 2.6.
4. Nada de `Float` para dinheiro. `Decimal` no banco, `Prisma.Decimal` no backend, centavos inteiros no frontend.
5. Um único `new PrismaClient()`, em `src/config/prisma.ts`.
6. Nada de SDK de auth/realtime do provedor de banco. O Railway é PostgreSQL gerenciado, acessado só via Prisma.
7. Nenhum preço, produto, bairro ou telefone hardcoded no frontend. Tudo vem da API.
8. Nenhum `io.of('/public').emit()` com dado de pedido. Linha vermelha.
9. Nenhum evento de socket emitido antes do `await` da escrita no banco.
10. Nenhum valor calculado pelo cliente é confiado. O servidor recalcula tudo a partir do `menuItemId`.
11. Nenhuma rota de painel acessível sem passar por `ProtectedRoute`.
12. Nenhum `ADM` ou `TI` selecionável no formulário de auto-registro.
13. Nenhuma promise sem tratamento. Todo handler async com try/catch ou wrapper.
14. Nenhum `(req as any).user` nos controllers. O payload do JWT é `{ userId, username, role }` — o campo é **`userId`, não `id`**. O `as any` desliga a checagem de tipo exatamente onde ela pegaria esse erro: `user.id` (undefined) foi usado em 8 lugares e o Prisma **ignora silenciosamente** campos `undefined` num `update`, sem erro nenhum — o bug só apareceu num teste que conferia o campo específico. Use `req.user`, já tipado em `auth.ts`.

---

## 13. Perguntas que eu não posso responder por você

Estas afetam o seed e a regra de negócio. Precisam da sua resposta antes ou durante a implementação — **não invente dados no lugar delas.**

1. ~~**Sabores do suco.**~~ **RESOLVIDO.** Funcionários precisam poder adicionar e retirar sabores do estoque. A resposta não é `requiredChoice` — é mais simples que isso. Cada sabor é o seu próprio `MenuItem` (ex.: "Suco de Manga", categoria BEBIDAS, 6,00). "Adicionar sabor" = ADM/TI cria um `MenuItem` pelo CRUD que já existe. "Tirar do estoque" = ADM/TI/CHAPISTA marca `available: false` — o mesmo toggle que já existe para qualquer lanche esgotado. Nenhum endpoint novo, nenhuma tela nova, nenhuma mudança de schema. Por isso "Suco (Consultar Sabores)" saiu do seed (seção 11) — não preciso mais adivinhar os sabores, quem os cadastra é o próprio staff depois do deploy.

2. **Acréscimos por categoria.** Banana, uva-passas e ovo (R$3) valem para qualquer lanche, ou eram específicos do Macarrão na Chapa? No cardápio original eles aparecem logo depois do macarrão, o que sugere associação — mas não é conclusivo. **Deixei todos disponíveis para todos os itens customizáveis.** Restringir exigiria uma tabela de associação `MenuItem` ↔ acréscimos permitidos.

3. **Controle de estoque (item 05 do contrato).** **RESOLVIDO, provisoriamente — a confirmar com o cliente.** Baseado na vivência do Rosario como ex-funcionário do trailer: contagem de quantidade real (ex.: "restam 12 pães") não é praticável na operação, e o toggle `available`/`archived` que já existe (disponível/esgotado) é considerado suficiente para cumprir essa cláusula. Não há plano de construir controle de quantidade.

4. **Hospedagem e monitoramento (item 08 do contrato).** Continua rodando só localmente para testes — decisão consciente de não pagar hospedagem/domínio antes do cliente confirmar (ver seção 14, backlog, e a decisão já registrada sobre esperar o trial do Railway).

3. **Categoria como enum.** `Category` é um enum Prisma. Se o negócio quiser adicionar "Porções" ou "Sobremesas", isso é uma **migration + deploy**, não um botão no painel do ADM. Isso conflita parcialmente com o requisito "o administrador precisa conseguir gerenciar cardápio". Trade-off consciente: enum dá segurança de tipo, e adicionar categoria é uma migration de 5 minutos. Se você quiser categorias dinâmicas, vira uma tabela `Category` com CRUD — mais complexidade, e não recomendo para o MVP.

4. **Site institucional.** Assumi que **não** está no escopo (Sobre, Horários, mapa). Você não pediu essas telas, e "leve" pesa contra páginas que ninguém solicitou. O que existe é cardápio + rodapé com telefone/WhatsApp/Instagram. Se as páginas institucionais forem desejadas, precisa ser pedido explícito.

5. ~~**Pedidos online de retirada e delivery.**~~ **RESOLVIDO: não exigem confirmação.** Só pedidos de MESA feitos pelo cliente online (`clientOnline && type === MESA`) nascem com `requiresStaffConfirmation: true`. Retirada e delivery têm nome e telefone — há rastro. Implementado e testado.

6. ~~**Proteção do `tecnico` se estende à troca de papel?**~~ **RESOLVIDO: sim.** Nem exclusão nem alteração de papel, nem por TI. Implementado, testado (403 nos dois casos, com log `USER_DELETION_BLOCKED`).

7. ~~**Hospedagem do backend.**~~ **RESOLVIDO: Railway**, mesmo projeto do banco. Produção usa `DATABASE_URL` privada, sem TCP Proxy, sem egress adicional (seção 2.4). Não adicionar réplicas ao serviço — Railway não suporta sticky sessions, e o Socket.io quebra silenciosamente com mais de uma instância (seção 2.3). A Fase 10 usa deploy nativo do Railway, não `gcloud`.

---

## 14. Backlog — pós-fases, deliberadamente não agora

Itens levantados durante o desenvolvimento, adiados de propósito para não desviar do que está em andamento. Não perder de vista só porque não têm fase numerada.

1. **Feedback de carregamento nos botões de ação.** Hoje, qualquer botão que dispara chamada à API (avançar status, cancelar, aceitar entrega) não mostra nenhum estado de "processando" — a tela só atualiza quando o socket confirma, sem nada entre o clique e o resultado. Sensação de interface travada. Considerar um estado de loading local (disable + spinner) em cada botão de ação, não só no `CheckoutForm` (que já tem).

2. **Reformulação visual completa do frontend.** Adiada para depois de todas as 10 fases, por decisão explícita — não mexer em visual até lá, mesmo com o cardápio público avaliado como "feio"/"cara de site morto" no estado atual (só cor + fontes + Login foram atualizados até aqui, o resto ainda está no visual original da Fase 6/7).

3. **Cardápio público — categoria "Todos" com subcategorias.** **RESOLVIDO: sim, implementar.** Aba "Todos" mostra todos os itens agrupados por categoria real (com cabeçalho de seção), sem incluir `ACRESCIMOS` como seção (regra já existente, nunca vira navegável). "Todos" é a **primeira aba** exibida, categoria padrão ao carregar a página. Escopo só do `PublicMenu` — o wizard do garçom (Fase 7) não muda, a não ser que decidido depois.

   **Ainda em aberto, não decidido:** reordenar categorias/itens por popularidade (ex.: hambúrguer antes de hot-dog, se for o de maior saída). Precisa de dado real de vendas pra decidir a ordem — não fazer sem isso.
