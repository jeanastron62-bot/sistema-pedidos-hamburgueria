# FASE 15 — Coexistência: conectar o número real do trailer ao Cloud API

> Para o Claude Code, rodando dentro de `sistema-pedidos-rede/`. Depende das Fases 13
> e 14 aprovadas (webhook recebendo/validando/gravando, loop da OpenAI
> respondendo).
>
> **Este documento substitui qualquer `FASE-15-embedded-signup-coexistence-*.md`
> anterior que esteja no repositório.** O anterior foi escrito antes da aprovação
> do App Review e antes do status de Tech Provider existir, e assumia uma
> infraestrutura Meta da Palora que **não existe** (CNPJ ainda em análise).
> Se o arquivo antigo estiver em `docs/`, apague-o ou renomeie para
> `.OBSOLETO.md` antes de começar — senão uma sessão futura vai ler os dois e
> seguir o errado.

---

## 0. O que mudou desde a Fase 14

- **App Review aprovado.** `whatsapp_business_messaging` e
  `whatsapp_business_management` estão concedidas em modo Live.
- **Status de Tech Provider concedido.** É requisito obrigatório da Meta para
  onboarding de número que já tem o app WhatsApp Business instalado.
- **Só existe UM portfólio Meta: o do Sistema de Pedidos Trailer.** Não há portfólio da
  Palora. Consequência estrutural: neste fluxo, o Sistema de Pedidos Trailer é
  simultaneamente o *provedor* (dono do app) e o *cliente de negócio* (dono do
  número). Isso é permitido, mas é o caminho menos percorrido — se o fluxo
  travar na tela de seleção de portfólio, é aqui que está a causa provável, não
  no código.
- **O número do trailer nunca foi cadastrado em painel nenhum da Meta.** Hoje é
  só um celular com o app WhatsApp Business. Não existe Phone Number ID para
  ele ainda — o que existe hoje no `.env` é o número de teste da Meta.

---

## 1. O que esta fase entrega, em uma frase

Fazer o número real do trailer funcionar **ao mesmo tempo** no celular da dona
(app WhatsApp Business) e no bot (Cloud API), sem perder histórico e sem trocar
de número.

---

## 2. A distinção mais importante deste documento

Esta fase tem duas metades com tempos de vida completamente diferentes. **Não as
trate como um bloco único.**

| | 15A — Conexão | 15B — Convivência |
|---|---|---|
| Quantas vezes roda | **Uma vez, para um número** | Toda mensagem, para sempre |
| Vida útil do código | Descartável depois de usado | Permanente, produção |
| Onde mora | Uma tela no painel ADM/TI | `whatsapp.service.ts` |
| Custo de errar | Refaz o fluxo | Bot e dona respondendo juntos ao cliente |

**Não construa multi-tenant.** Nada de model `WhatsappBusinessAccount` com N
linhas, nada de onboarding de clientes futuros, nada de abstração para a Palora.
É **um** número, **um** WABA, **uma** vez. Quando a Palora tiver CNPJ e portfólio
próprio, isso vira uma fase nova com requisitos que hoje não são conhecidos —
generalizar agora é adivinhar.

O valor duradouro desta fase está em **15B**, não em 15A.

---

## 3. Antes de tudo

Leia, nesta ordem:

1. `docs/CONTEXTO.md`
2. `docs/BOT-WHATSAPP-PROMPT.md` (seção 6 — transferência para
   humano; esta fase adiciona um **segundo** gatilho de pausa)
3. O código real das Fases 13 e 14: `src/modules/whatsapp/*`

**Regra que vale para o documento inteiro:** a especificação do Embedded Signup
muda com frequência. Todo parâmetro, nome de campo de webhook, endpoint e
versão de Graph API citado aqui foi conferido na documentação da Meta em
**24/08/2026**. Antes de escrever qualquer linha de código, **abra a
documentação oficial e reconfirme**. Se algo divergir deste documento, a
documentação oficial vence e você reporta a divergência antes de prosseguir.
Fonte primária:
`developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/`

---

## 4. FASE 15.0 — Reconhecimento (OBRIGATÓRIA, PARE AO FINAL)

Não altere nenhum arquivo.

```bash
cd backend
cat src/config/env.ts
cat src/modules/whatsapp/whatsapp.service.ts
cat src/modules/whatsapp/whatsapp.controller.ts
cat src/modules/whatsapp/whatsapp.routes.ts
cat src/modules/whatsapp/sendMessage.ts
grep -rn "botPaused" src/
grep -rn "graph.facebook.com" src/
ls ../docs | grep -i "fase-15\|embedded\|coexist"
find ../frontend/src/pages/panels -type f
```

Responda, citando o trecho exato:

1. Em `receive()`, qual é hoje a navegação do payload? Existe `extractMessages`
   compartilhado (Fase 14.8) ou a navegação `entry → changes → messages`
   continua inline?
2. O handler atual faz alguma coisa com `change.field`? Ou assume que todo
   webhook é `messages`? **Isso importa:** esta fase adiciona três campos novos
   (`history`, `smb_app_state_sync`, `smb_message_echoes`) que vão chegar no
   mesmo endpoint e hoje seriam silenciosamente descartados.
3. Qual versão de Graph API está hardcoded em `sendMessage.ts`?
4. Existe algum arquivo de Fase 15 anterior em `docs/`? Cole o nome.
5. Quais páginas existem hoje em `frontend/src/pages/panels/`? Onde uma tela
   nova de ADM/TI se encaixaria seguindo o padrão existente?

**PARE AQUI.** Não avance sem aprovação.

---

## 5. FASE 15.1 — Tratar `change.field` antes de qualquer outra coisa

Esta é a mudança de maior risco da fase, e ela é **independente** de coexistência
— vale a pena fazer e provar sozinha.

Hoje o webhook provavelmente assume que todo `change` é de mensagem. A partir do
momento em que o app assina os campos novos, vão chegar payloads com estrutura
completamente diferente (`history`, `state_sync`, `message_echoes`) no mesmo
endpoint. Se o código tentar ler `change.value.messages` neles, o resultado é
`undefined` silencioso na melhor hipótese e exceção na pior.

Reestruture `storeInboundMessages` / `receive()` para fazer um **switch explícito
em `change.field`**, com um caso `default` que loga o campo desconhecido e
ignora — nunca lança. Campos a tratar nesta fase:

| `field` | O que fazer nesta fase |
|---|---|
| `messages` | Comportamento atual, inalterado |
| `smb_message_echoes` | **Ver 15.4** — é o núcleo desta fase |
| `account_update` | Logar. Se `event === 'PARTNER_REMOVED'` ou `ACCOUNT_OFFBOARDED`, gravar em `Log` com ação `WHATSAPP_DISCONNECTED` e o `disconnection_info` inteiro em `details`. **Não** tente reconectar automaticamente. |
| `history` | Aceitar e descartar, com log de contagem. Um único webhook pode descrever milhares de mensagens — não tente persistir agora. |
| `smb_app_state_sync` | Aceitar e descartar, com log de contagem. Não estamos importando contatos. |

Decisão deliberada: `history` e `smb_app_state_sync` são **descartados**. Importar
6 meses de conversa e a agenda de contatos da dona significa PII em volume num
banco que hoje não tem política de retenção para isso (o PROMPT.md fala em 40
dias de retenção de conversa). Importar sem decidir a retenção primeiro é criar
um passivo. Se um dia for necessário, é fase própria.

**Prova:** um `verify-tmp.ts` que monta payloads sintéticos assinados com HMAC
real para cada um dos cinco `field` acima e dispara contra o servidor local.
Esperado: `200` nos cinco, nenhuma exceção no log, e o log mostrando o caminho
certo para cada um. Saída bruta em
`docs/verificacoes/<data>-fase-15-webhook-fields.txt` via `tee`.
**Nunca `curl -v`. Nunca `echo` de variável sensível.**

---

## 6. FASE 15.2 — Variáveis de ambiente

Adicionar ao `envSchema` (Zod, como sempre — nunca `process.env.X` direto):

```ts
META_APP_ID: z.string().min(10),
META_ES_CONFIG_ID: z.string().min(10),   // ID da configuração do Embedded Signup
```

`META_APP_SECRET` e `META_VERIFY_TOKEN` já existem desde a Fase 13.
`META_ACCESS_TOKEN` e `META_PHONE_NUMBER_ID` já existem desde a Fase 14 — vão
**mudar de valor** no fim desta fase, não de nome.

`.env.example` com descrição, nunca com valor real.

**Nota sobre o token, para o Rosario (não para o Claude Code):** o Embedded
Signup devolve um token de negócio de vida curta. Para produção, gere um
**System User token** no Business Settings do portfólio do negócio, com as duas
permissões aprovadas, e use esse. É o que encerra o ciclo de regeneração de token
que já apareceu antes neste projeto.

---

## 7. FASE 15.3 — A tela de conexão (15A, descartável)

Uma página no painel **ADM/TI**, atrás de `ProtectedRoute` como toda rota de
painel. **Não** crie uma página pública sem autenticação — ela dispararia um
fluxo de onboarding de conta Meta para qualquer visitante.

Ponto de atenção que o código não resolve: o login que acontece dentro do popup
é o **Facebook da dona**, e ela precisa ser administradora do portfólio do
negócio. Isso é independente do login do painel. Confirme quem é admin do
portfólio antes de marcar a tela como pronta.

Um botão, "Conectar WhatsApp do trailer", que carrega o JS SDK do Facebook e
chama `FB.login` com:

```js
{
  config_id: META_ES_CONFIG_ID,
  response_type: 'code',
  override_default_response_type: true,
  extras: {
    setup: {},
    featureType: 'whatsapp_business_app_onboarding',
    sessionInfoVersion: '3'
  }
}
```

`featureType: 'whatsapp_business_app_onboarding'` é **o parâmetro que liga a
coexistência**. Sem ele o fluxo é o normal, e um número que já tem app é
rejeitado.

O `config_id` precisa ter **session logging habilitado** — é requisito da Meta
para coexistência, e é configurado no App Dashboard, não no código.

**Como saber se está certo antes de envolver a dona:** abra a tela. Se, no lugar
da tela de seleção de WABA, aparecer a opção de conectar uma conta WhatsApp
Business existente, o `featureType` pegou. Se aparecer a seleção de WABA normal,
não pegou — pare e reporte, não tente contornar.

Capture a mensagem de retorno na `window`. O evento de sucesso desta variante é
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (não o `FINISH` padrão), com
`waba_id` no `data`.

**Backend:** um endpoint `POST /api/whatsapp/onboarding/exchange`, ADM/TI,
que recebe o `code` e faz a troca por token no Graph API. **Nunca** devolva o
token ao frontend nem o logue. Persista o `waba_id` e o `phone_number_id`
resultantes.

Persistência mínima — resista à tentação de modelar mais do que isso:

```prisma
model WhatsappBusinessAccount {
  id            Int      @id @default(1)   // linha única, mesmo padrão de SystemConfig
  wabaId        String   @map("waba_id")
  phoneNumberId String   @map("phone_number_id")
  displayPhone  String?  @map("display_phone")
  isOnBizApp    Boolean  @default(false) @map("is_on_biz_app")
  connectedAt   DateTime @default(now()) @map("connected_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@map("whatsapp_business_account")
}
```

Linha única com `id = 1`, acessada por `upsert`, exatamente como `SystemConfig`.
É um número só. Quando forem vários, migra-se — é migration aditiva, a mais
barata que existe.

`npx prisma migrate dev --name fase15_whatsapp_business_account`.
**Prova:** saída do comando + `.sql`. Só `CREATE TABLE`.

---

## 8. FASE 15.4 — `smb_message_echoes`: o núcleo permanente (15B)

**Este é o item que justifica a fase inteira.**

Depois da conexão, a dona continua respondendo pelo celular. Toda mensagem que
ela mandar pelo app dispara um webhook `smb_message_echoes` para o seu servidor.
Sem tratar isso, o bot **não sabe** que ela está atendendo — e os dois respondem
o mesmo cliente ao mesmo tempo.

Comportamento a implementar:

1. Chegou `smb_message_echoes` com `to = <telefone do cliente>`:
   `findOrCreateConversation(to)` e setar `botPaused = true`.
2. Gravar a mensagem como `direction: 'OUT'`, com `content` extraído e o
   `waMessageId` do echo. **Atenção à duplicata:** mensagens enviadas pelo
   próprio bot via `sendWhatsappText` também podem voltar como echo. O
   `@unique` em `waMessageId` já protege — trate `P2002` como sucesso
   silencioso, exatamente como na Fase 13.
3. Registrar em `Log` com ação `WHATSAPP_HUMAN_TAKEOVER`.

Isso cria um **segundo caminho de pausa**, além do `transferir_para_humano` da
Fase 14. Os dois setam a mesma flag. Isso é intencional — mas obriga uma
decisão que não é sua:

> **PERGUNTA ABERTA, PARA O ROSARIO DECIDIR — não implemente por conta própria:**
> como a conversa despausa quando a pausa veio do celular da dona? O
> `transferir_para_humano` tem despausa manual pelo painel e por inatividade.
> Mas a dona não vai abrir o painel para "devolver" a conversa ao bot. As opções
> são: (a) despausa por inatividade, igual ao caminho existente; (b) a pausa por
> echo é permanente até alguém despausar no painel; (c) a pausa por echo dura X
> horas. Cada uma tem um modo de falha diferente. **Pare e pergunte.**

---

## 9. FASE 15.5 — A operação de conexão (fora do escopo do agente)

**Claude Code: não execute nada desta seção.** Ela existe aqui para o documento
ficar completo e para você não achar que faltou passo. As chamadas abaixo têm
janela e são de uso único — rodá-las em teste queima a única tentativa.

Ordem, executada pelo Rosario com o celular do trailer em mãos:

1. Confirmar que o app WhatsApp Business no celular está em **2.24.17 ou
   superior**.
2. Confirmar que o **nome do negócio** no app e no portfólio Meta são iguais —
   depois do onboarding o nome trava.
3. Abrir a tela da 15.3, clicar em conectar, seguir o fluxo.
4. No celular: mensagem da Facebook Business Account → "Connect" → "Confirm"
   (aqui se decide o compartilhamento de histórico) → colar o código.
5. Verificar: `GET /<PHONE_NUMBER_ID>?fields=is_on_biz_app,platform_type` deve
   retornar `true` e `CLOUD_API`.
6. **Não** chamar os endpoints de sincronização (`POST /<PHONE_NUMBER_ID>/smb_app_data`).
   Cada um só pode ser chamado uma vez, e a decisão desta fase é descartar
   histórico e contatos (seção 15.1).
7. Trocar `META_PHONE_NUMBER_ID` e `META_ACCESS_TOKEN` no Railway pelos valores
   reais. Redeploy.
8. Teste real: mandar mensagem de um celular pessoal para o número do trailer.

**Caminho de volta, se der errado:** no celular, Configurações → Conta →
Plataforma de Negócios → Desconectar Conta. O endpoint `/deregister` **não
funciona** para número em coexistência.

---

## 10. Consequências operacionais que precisam ser ditas à dona ANTES

Não são detalhe técnico — mudam o dia a dia dela, e algumas são irreversíveis
sem desconectar:

- **Listas de transmissão viram somente-leitura.** Não dá para criar novas.
- **Mensagens temporárias, visualização única e localização em tempo real são
  desligadas** em todas as conversas individuais.
- **Chamadas de voz e vídeo** continuam no app, mas não existem na API.
- **Grupos não sincronizam.** Nada de grupo chega ao bot.
- **Saudação automática, mensagem de ausência e respostas rápidas continuam
  funcionando no app** — e vão disparar junto com o bot. O cliente recebe duas
  respostas. **Isso precisa ser desligado manualmente no app antes de conectar.**
- **Mensagem enviada pelo celular não abre nem estende a janela de 24h da API.**
  Se a dona responde pelo celular e depois o bot precisa falar fora da janela,
  só com template aprovado.
- **Se o celular ficar ~14 dias sem uso, a Meta desconecta** (`PRIMARY_INACTIVITY`).
  O celular do trailer passa a ser infraestrutura.
- **Desinstalar o WhatsApp Business desconecta tudo.**

---

## 11. Fora de escopo desta fase

- Multi-tenant, onboarding de clientes futuros, qualquer coisa da Palora.
- Importar histórico de 6 meses e agenda de contatos.
- UI de caixa de entrada de conversas.
- Templates de mensagem (necessários para falar fora da janela de 24h — fase
  própria, exige aprovação de template pela Meta).
- Áudio.

## 12. Antes de encerrar a fase

Atualize `docs/CONTEXTO.md`: a seção "Decisões de negócio
pendentes" ainda descreve o item 09 com histórico de idas e vindas, e não
registra App Review aprovado, Tech Provider concedido, nem o número real
conectado. Uma sessão futura que ler o CONTEXTO primeiro precisa encontrar o
estado atual, não o de duas fases atrás.
