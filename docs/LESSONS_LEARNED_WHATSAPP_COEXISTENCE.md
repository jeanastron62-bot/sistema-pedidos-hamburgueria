# Lições aprendidas — investigação de Embedded Signup / Coexistência WhatsApp

> Caminho no repositório: `docs/LESSONS_LEARNED_WHATSAPP_COEXISTENCE.md`
> Período coberto: 24/08/2026 a 17/09/2026 — Sistema de Pedidos Trailer / Palora
> Autor da Parte I: assistente de chat (Claude), auditando as próprias respostas
> Autor da Parte II: agente de código (Claude Code), auditando as próprias respostas
>
> **Este documento não é um resumo do caso.** É um registro de falhas de método,
> escrito para ser lido no início da próxima investigação de integração, antes de
> qualquer hipótese ser formulada. O contexto técnico do caso vive em
> `CONTEXTO.md` e nas specs de fase; aqui só ficam os erros e as
> regras que eles produziram.

---

## Índice de regras permanentes

| # | Regra |
|---|---|
| R1 | Resposta de chatbot (Meta AI, assistente de suporte, IA de terceiros) nunca é fonte oficial e nunca é citada como confirmação. |
| R2 | Nenhum requisito técnico é enunciado sem fonte. Se não há fonte, diga "não sei". |
| R3 | Nenhuma hipótese é criada para preencher lacuna. Lacuna fica declarada como lacuna. |
| R4 | Afirmação sobre documentação vem com o nível de confiança explícito, não solicitado. |
| R5 | Nenhuma tela de configuração é fechada antes de todas as abas serem inspecionadas e registradas. |
| R6 | Código só é acusado depois de lida a evidência que o incrimina, não antes. |
| R7 | Todo teste proposto vem com o critério de sucesso **e** o critério de falso negativo. |
| R8 | Hipótese fraca não vira commit. Ordem de teste é por custo/informação, não por facilidade. |
| R9 | Antes de mandar comprar/criar recurso, perguntar o que já existe. |
| R10 | Cronologia de teste é reconstruída a partir de artefato datado, nunca de memória. |
| R11 | Nada é afirmado sobre o trabalho ou a intenção do usuário. Pergunta-se. |
| R12 | Busca pública pelo sintoma exato acontece **antes** da investigação local, não depois. |
| R13 | Navegação de painel de terceiro é declarada como suposição quando não foi vista. |
| R14 | Documento fornecido é lido inteiro antes de qualquer resposta sobre ele. |
| R15 | Nenhum commit, merge ou implementação é dado como existente sem `git log --oneline` cru. |
| R16 | Toda conclusão vem acompanhada da evidência que a contradiz. |
| R17 | Trabalho commitado não é trabalho entregue. Todo relato de conclusão nomeia branch, commit e o que falta para chegar no ambiente do usuário. |
| R18 | Causa de sintoma em ambiente que não vejo é hipótese. Pergunta-se em que branch/build o usuário está antes de cravar. |
| R19 | Contrariar decisão registrada é pergunta antes, nunca aviso depois. |
| R20 | Escolha técnica é apresentada com o leque de opções e seus custos, não só com a justificativa da escolhida. |
| R21 | Andaime de teste tem limpeza que não depende de comando capaz de matar o próprio shell. |
| R22 | Mudança de código pedida no meio de investigação só é executada depois de perguntar que hipótese ela discrimina. |
| R23 | Ação disparada por hook, cron ou automação é declarada como tal no mesmo relato em que é reportada. |

---

# Parte I — Erros do assistente de chat

## Erro 1 — Tratar resposta de IA como confirmação oficial

**Descrição objetiva.** Durante o atendimento pelo chat da Meta, sugeri incluir no
formulário formal a frase *"Meta Business Support confirmed on September 4, 2026
(case [NÚMERO]) that the number is registered under portfolio 294578215323233"*.
A fonte era a Meta AI, não um atendente humano. O usuário identificou isso, não eu.
Pior: a mesma Meta AI afirmou que coexistência é impossível — informação falsa — e
eu havia começado a construir recomendação em cima do "Caminho 1" que ela deu.

**O que eu assumi.** Que um canal de suporte oficial produz respostas oficiais.

**O que as evidências mostravam.** O texto tinha marcas de chatbot: estrutura em
tópicos, oferta de ação seguinte genérica ("Posso ajudar com mais alguma
informação?"), e uma afirmação técnica frontalmente contrária à documentação da
Meta que já havíamos lido em 24/08.

**Onde a análise falhou.** Não questionei a natureza da fonte porque o canal era
legítimo. Canal legítimo ≠ fonte autoritativa.

**Como deveria ter sido investigado.** Perguntar de saída: "isso é atendente humano
ou assistente automatizado?" Uma pergunta. E confrontar qualquer afirmação da fonte
contra a documentação já verificada antes de repassar.

> **R1 — Resposta de chatbot nunca é fonte oficial e nunca é citada como
> confirmação.** Vale para Meta AI, assistentes de suporte de qualquer fornecedor,
> e para outras instâncias de IA. Citar uma delas num pedido formal enfraquece o
> pedido se alguém checar.

---

## Erro 2 — Inventar requisito técnico para preencher lacuna

**Descrição objetiva.** Instruí: *"use um pouco antes de rodar o Embedded Signup:
mande e receba umas dez mensagens. Conta recém-criada às vezes se comporta diferente
no fluxo de conexão."* Não existe requisito documentado desse tipo. Foi invenção.
O usuário perguntou "tem certeza?" **duas vezes** para obter a retratação.

**O que eu assumi.** Que precaução inofensiva pode ser dita como se fosse regra.

**O que as evidências mostravam.** A documentação lista três requisitos verificáveis
(app 2.24.17+, nome do negócio igual ao portfólio, número fora da Cloud API).
Aquecimento não está lá.

**Onde a análise falhou.** Preenchi um vazio com plausibilidade. O custo não é só
tempo: instrução inventada contamina o teste, porque se ele falhar o usuário passa a
suspeitar da variável errada.

**Como deveria ter sido investigado.** Dizer o que a documentação exige e parar.
"Não sei se conta nova tem tratamento diferente" é uma resposta completa.

> **R2 — Nenhum requisito técnico é enunciado sem fonte.** Se a fonte não existe, a
> frase correta é "isso eu não sei", nunca uma recomendação de aparência técnica.

---

## Erro 3 — Criar hipótese para preencher lacuna explicativa

**Descrição objetiva.** Quando o `#3441062` sumiu e apareceu o `#2494064`, propus
como terceira possibilidade que *"coexistência exige o número já conectado a um
portfólio na Meta"*. Isso não tem base em nada. Foi gerado para fechar a lista de
causas.

**O que eu assumi.** Que uma lista de hipóteses precisa ser exaustiva para ser útil.

**O que as evidências mostravam.** Nada apontava nessa direção. O teste com o chip
limpo matou a hipótese em uma tarde — mas ela nunca deveria ter entrado na lista.

**Onde a análise falhou.** Confundi cobertura com rigor. Uma lista de três hipóteses
em que uma é inventada é pior que uma lista de duas.

**Como deveria ter sido investigado.** Enumerar só o que tem lastro e nomear o resto
como "não explicado".

> **R3 — Nenhuma hipótese é criada para preencher lacuna.** Lacuna fica declarada
> como lacuna. "Não tenho explicação para X" é um item válido de diagnóstico.

---

## Erro 4 — Afirmar documentação de memória com confiança alta

**Descrição objetiva.** Afirmei que *"pela documentação da Cloud API, `metadata.
phone_number_id` está presente em todo webhook de `messages`"*. Não verifiquei. Só
depois acrescentei a ressalva de que não garantia isso para payloads de coexistência.

**O que eu assumi.** Que lembrança de documentação é documentação.

**O que as evidências mostravam.** O próprio código do projeto tipava o campo como
opcional em dois níveis (`metadata?: { phone_number_id?: string }`), e o Claude Code
declarou explicitamente que não conseguia confirmar.

**Onde a análise falhou.** A afirmação era incidental e por isso saiu sem freio.
Erros de calibração aparecem mais em afirmações laterais do que nas centrais.

**Como deveria ter sido investigado.** "Acho que está presente sempre, mas não
confirmei — trate como opcional e alarme alto se vier vazio." Que foi, aliás, a
decisão certa que tomamos por outro caminho.

> **R4 — Afirmação sobre documentação vem com nível de confiança explícito, sem o
> usuário precisar perguntar.** "Verifiquei em X, data Y" / "lembro, não confirmei" /
> "não sei".

---

## Erro 5 — Fechar a configuração antes de inspecionar todas as abas

**Descrição objetiva.** Na tela "Editar configuração" do Embedded Signup, o usuário
viu **Nome** e **Variação de login**. Eu mandei sair pelo Cancelar. As abas
**Products, Token de acesso, Ativos e Permissões nunca foram abertas.** Dias depois,
o post de outro Tech Provider no fórum aponta exatamente Products como o lugar onde
*"WhatsApp Business App users (aka Coexistence) support"* deveria estar e não está —
e essa passou a ser a hipótese principal do caso.

**O que eu assumi.** Que a variação de login era o único campo que determinava o tipo
de fluxo, e que o risco de salvar algo sem querer superava o valor de continuar
olhando.

**O que as evidências mostravam.** A própria tela mostrava cinco etapas no menu
lateral, com bolinhas de progresso. Quatro ficaram desconhecidas.

**Onde a análise falhou.** Encerrei a inspeção por cautela num momento em que o custo
de olhar era dois minutos e o custo de não olhar era a hipótese central do caso ficar
sem verificação por dez dias.

**Como deveria ter sido investigado.** Navegar as cinco etapas pelo menu lateral (sem
tocar em "Avançar"), registrar print de cada uma, e só então sair.

> **R5 — Nenhuma tela de configuração é fechada antes de todas as abas serem
> inspecionadas e registradas.** Cautela justifica não *alterar*, nunca não *ver*.

---

## Erro 6 — Acusar o código antes de ler a evidência

**Descrição objetiva.** Ao ver o Embedded Signup padrão, meu diagnóstico foi:
*"Ou seja: o `featureType` não está chegando. Provavelmente o botão da tua tela de
conexão não está passando `featureType` no `extras`."* Estava errado. O código estava
correto desde sempre — `extras` chegava íntegro na URL do popup.

**O que eu assumi.** Que o elo mais provável de falhar é o que está sob nosso
controle.

**O que as evidências mostravam.** Nenhuma. Eu ainda não tinha visto a URL nem o
código. A afirmação foi feita antes de qualquer leitura.

**Onde a análise falhou.** Viés de disponibilidade: o código é o que dá para
inspecionar, então vira o suspeito. Isso gerou uma rodada inteira de verificação
(pedido do `FB.login`, leitura do objeto, DevTools) que confirmou o óbvio.

**Como deveria ter sido investigado.** Pedir a URL do popup **primeiro**. Ela contém
a resposta e custa um Ctrl+C. Só depois, se `extras` estivesse ausente, olhar o
código.

> **R6 — Código só é acusado depois de lida a evidência que o incrimina.** O artefato
> mais barato que distingue "nosso lado" de "lado deles" é sempre o primeiro a ser
> coletado.

---

## Erro 7 — Propor teste com critério de sucesso errado

**Descrição objetiva.** Instruí procurar `feature_type` ou `featureType` **nos
parâmetros da query string** do DevTools. O SDK do Facebook serializa `extras` como
um único parâmetro JSON: `extras=%7B%22setup%22...%7D`. Seguindo meu critério, o
usuário teria procurado uma chave que nunca aparece e concluído que o SDK descartou
o parâmetro — conclusão oposta à verdade. Quem corrigiu foi o Claude Code.

**O que eu assumi.** Que cada chave de `extras` vira um parâmetro próprio.

**O que as evidências mostravam.** Eu não tinha verificado o comportamento de
serialização do SDK.

**Onde a análise falhou.** Especifiquei o teste sem especificar como ele poderia
mentir. Um teste com falso negativo não detectado é pior que nenhum teste, porque
produz confiança errada.

**Como deveria ter sido investigado.** Enunciar os três desfechos possíveis antes de
rodar: `extras` ausente / presente sem `featureType` / presente com `featureType`.
Foi exatamente essa correção que salvou o teste.

> **R7 — Todo teste proposto vem com critério de sucesso, critério de falha e
> critério de falso negativo.** Se você não consegue descrever como o teste
> mentiria, você não entendeu o teste.

---

## Erro 8 — Transformar hipótese fraca em commit

**Descrição objetiva.** Depois de confirmar que `extras` chegava correto, propus
trocar o SDK de `v21.0` para `v23.0` chamando isso de *"a única hipótese testável que
sobrou"*. Não era: Products, Página do Facebook e versão do ES (v2/v3/v4) estavam
todos por verificar. A troca gerou commit `e482075`, build, novo teste — e resultado
idêntico. Zero informação.

**O que eu assumi.** Que uma mudança de uma linha tem custo desprezível.

**O que as evidências mostravam.** A `v21.0` já retornava o Embedded Signup completo
com `sessionInfoVersion: 3` aceito sem erro. Nada indicava rejeição por versão.

**Onde a análise falhou.** Escolhi a hipótese mais fácil de testar em vez da mais
informativa, e vendi isso como esgotamento de alternativas. Custo real: commit numa
branch, build, retest, e a impressão falsa de que o espaço de busca tinha acabado.

**Como deveria ter sido investigado.** Ordenar por informação esperada por unidade de
custo. Abrir a aba Products (dois minutos, discrimina a hipótese central) vinha antes
de trocar versão de SDK (commit + build, discrimina hipótese sem lastro).

> **R8 — Hipótese fraca não vira commit.** E "a única que sobrou" só pode ser dita
> depois de listar explicitamente as que foram verificadas, uma a uma.

---

## Erro 9 — Mandar adquirir recurso que já existia

**Descrição objetiva.** Recomendei comprar um chip pré-pago **quatro vezes** ao longo
de vários dias, com insistência crescente ("é a única frente que não depende de
ninguém"). O usuário já tinha um número emprestado disponível — e havia mencionado
essa linha da TIM antes, ao perguntar sobre um SMS que não chegava. Nunca conectei as
duas coisas nem perguntei em que número o bot rodava.

**O que eu assumi.** Que o ambiente de teste não existia porque não tinha sido
mencionado no contexto em que eu esperava.

**O que as evidências mostravam.** O usuário havia citado explicitamente a linha da
TIM como "o número que o bot tá cadastrado".

**Onde a análise falhou.** Repetição em vez de pergunta. Quando uma recomendação é
ignorada várias vezes, a hipótese padrão deve ser "há algo que eu não sei", não
"ainda não convenci".

**Como deveria ter sido investigado.** "Qual número o bot usa hoje, e ele está livre
para teste?" — uma frase, na primeira vez.

> **R9 — Antes de mandar comprar ou criar recurso, perguntar o que já existe.** E
> recomendação ignorada duas vezes vira pergunta, nunca terceira insistência.

---

## Erro 10 — Errar a cronologia do próprio teste

**Descrição objetiva.** Afirmei que o teste com o chip TIM tinha rodado com o número
limpo, e construí em cima disso uma "inconsistência" que pedi ao usuário para
explicar. A sequência real, pelos artefatos datados: 16:59 número sem conta → 18:49
perfil do WhatsApp Business criado → 18:56 erro `#2494064`. O teste nunca rodou com o
número simultaneamente limpo. O usuário reagiu com "vc n ta alucinando?".

**O que eu assumi.** Que minha reconstrução da ordem dos eventos estava correta.

**O que as evidências mostravam.** Todos os prints tinham horário no topo. A ordem
estava disponível o tempo todo.

**Onde a análise falhou.** Reconstruí de memória uma sequência que os artefatos já
registravam. E transformei o próprio erro em pergunta acusatória ao usuário.

**Como deveria ter sido investigado.** Ler os horários dos prints antes de afirmar
qualquer ordem. Quando há artefato datado, memória não opina.

> **R10 — Cronologia de teste é reconstruída a partir de artefato datado.** Prints,
> logs e commits têm hora; usar a hora.

---

## Erro 11 — Afirmar sobre o trabalho do usuário

**Descrição objetiva.** Ao ver o `git log`, escrevi que os commits `72d0d9d` e
`4256ca8` eram *"commits de funcionalidade que você não pediu nesta linha de
trabalho"*. Resposta do usuário: "eu pedi isso".

**O que eu assumi.** Que trabalho fora do escopo da conversa atual é trabalho não
solicitado.

**O que as evidências mostravam.** Nada sobre a origem daqueles commits. Eu não
tinha visibilidade das outras sessões.

**Onde a análise falhou.** Tratei ausência de contexto como evidência de desvio, e
enquadrei como alerta.

**Como deveria ter sido investigado.** "Esses dois commits vieram de outra sessão?"

> **R11 — Nada é afirmado sobre o trabalho, a intenção ou o histórico do usuário.**
> O que não está no contexto é pergunta, não diagnóstico.

---

## Erro 12 — Não buscar publicamente pelo sintoma

**Descrição objetiva.** Ao longo de toda a investigação eu tinha busca web
disponível e a usei duas vezes — para canais da Claro e para o formulário do
WhatsApp. Nunca busquei pelo sintoma técnico. **Quem encontrou o post idêntico no
fórum da Meta foi o usuário.** Esse post contém a evidência que reorientou o caso
inteiro: reprodução dentro do Builder da própria Meta, a ausência da opção em
Products, e o campo `version: "v4"` no payload — que eu não sabia que existia.

**O que eu assumi.** Que um comportamento tão específico seria raro demais para
estar documentado publicamente.

**O que as evidências mostravam.** O erro `#2494064` e a expressão
`featureType whatsapp_business_app_onboarding` são strings altamente específicas —
exatamente o tipo de termo que retorna resultado útil.

**Onde a análise falhou.** Priorizei investigação local (código, painel, DevTools)
sobre busca externa, quando a busca externa era mais barata e, no caso, decisiva.

**Como deveria ter sido investigado.** Buscar a string de erro e o nome do parâmetro
na primeira hora, antes de pedir qualquer leitura de código.

> **R12 — Busca pública pelo sintoma exato (código de erro, nome do parâmetro,
> mensagem literal) acontece antes da investigação local.** Se outro time já sofreu
> isso, isso é o dado mais barato disponível.

---

## Erro 13 — Guiar navegação de painel por suposição

**Descrição objetiva.** Para chegar à configuração do Embedded Signup, direcionei o
usuário por três caminhos errados em sequência (Gerenciador do WhatsApp → Telefones;
"Personalizar caso de uso"; a página de documentação guiada) antes do caminho certo
(Login do Facebook para Empresas → Configurações). Cada instrução foi dada em tom de
direção, não de tentativa. Custo: aproximadamente 30 minutos.

**O que eu assumi.** Que meu modelo da estrutura do App Dashboard estava atualizado.

**O que as evidências mostravam.** Painéis da Meta mudam com frequência, e eu não
conseguia ver a tela.

**Onde a análise falhou.** Instrução e suposição foram ditas com a mesma voz. O
usuário não tinha como saber quais passos eram conhecidos e quais eram chute.

**Como deveria ter sido investigado.** Marcar explicitamente: "não vejo esse painel;
tente A, e se não for, me mande o print do que aparece". E pedir print da estrutura
do menu logo na primeira tentativa, em vez de encadear tentativas às cegas.

> **R13 — Navegação de painel de terceiro é declarada como suposição quando não foi
> vista.** Duas tentativas erradas viram pedido de print, não terceira tentativa.

---

## Erro 14 — Responder sobre documento lido pela metade

**Descrição objetiva.** O usuário enviou a legenda de um vídeo e pediu foco no trecho
após 5:42. Respondi tratando esse trecho como sendo apenas sobre App Review, deixando
de fora a alternativa de parceiro Meta (custo mensal + taxa por número) e a lista
completa de funcionalidades perdidas com coexistência — itens com impacto direto no
contrato. O usuário perguntou "vc leu tudo?".

**O que eu assumi.** Que a indicação de timestamp autorizava tratar o resto como
irrelevante.

**O que as evidências mostravam.** O trecho indicado ia até o fim do vídeo e continha
duas informações de negócio que ninguém tinha levantado.

**Onde a análise falhou.** Li em modo de busca (procurando confirmação da hipótese
ativa) em vez de modo de leitura.

**Como deveria ter sido investigado.** Ler o documento inteiro, responder o que foi
perguntado, e listar separadamente o que apareceu de novo.

> **R14 — Documento fornecido é lido inteiro antes de qualquer resposta sobre ele.**
> Indicação de trecho é prioridade de leitura, não permissão para ignorar o resto.

---

## Acerto que virou regra — relatórios de agente sem prova

Duas vezes o Claude Code entregou relatório **internamente contraditório**:
"não commitei nem fiz push" e, parágrafos depois, "Commitado e enviado: `5e2b5c1`";
e depois "Feito. Só essa linha mudou, sem commit" seguido de "Commitado e enviado
`e482075`". Nos dois casos exigi `git log --oneline` cru. No segundo, o log provou
que a afirmação "sem commit" era falsa.

Também funcionou: exigir que o agente **apontasse a linha** em vez de resumir
("existe hoje algum caminho em que a função retorna a credencial do `env` quando...?
Sim ou não, apontando a linha"). Foi assim que o bug do `resolveSendCredentials` foi
confirmado como ainda aberto, depois de o usuário acreditar que já estava corrigido.

E funcionou o agente ter acrescentado um caso de teste por conta própria — conta do
número certo **desativada**, o cenário mais provável em produção, que não estava na
spec.

> **R15 — Nenhum commit, merge ou implementação é dado como existente sem
> `git log --oneline` cru.** Relatório de agente é narrativa; log é prova.
> Corolário: pedir sempre que o agente aponte linha e cole saída real, nunca que
> descreva o que o código faz.

---

## Meta-erro — conclusões sem a evidência contrária

Ao longo do caso houve várias viradas de diagnóstico (código → número preso →
configuração → versão de SDK → gating da Meta). A maior parte dessas viradas teria
sido mais barata se cada conclusão tivesse vindo com a lista do que ainda não a
sustentava.

Exemplo concreto: quando concluí "a causa está do lado da Meta", a evidência
contrária existia e não foi listada — **o Builder reproduzir elimina o código como
causa, não a configuração da conta.** O usuário e o autor do post podem
compartilhar a mesma lacuna de config. Duas ocorrências do mesmo sintoma não provam
causa comum do lado do fornecedor.

> **R16 — Toda conclusão vem acompanhada da evidência que a contradiz e do teste que
> a derrubaria.** Se não existe teste que derrube a conclusão, ela não é uma
> conclusão — é uma preferência.

---

# Parte II — Erros do agente de código (Claude Code)

> Sessão de 02/09 a 17/09/2026, na branch `claude/bot-naturalidade-cancelamento-gclt4g`.
> Escopo: cinco pedidos de operação (confirmação do bot antes de lançar, aviso sonoro
> de pedido novo, fechamento do trailer que não persistia, pedido de mesa por nome,
> exportação em Excel), mais o modal de cancelamento e a troca de versão do SDK.

---

## Erro 15 — Relatar entrega sem dizer onde ela vive

**Descrição objetiva.** Ao terminar os cinco itens, escrevi *"está tudo entregue"* e
uma tabela de como testar cada um. Todo o trabalho estava na branch
`claude/bot-naturalidade-cancelamento-gclt4g`, sem merge em `master`. O usuário foi
testar, não encontrou o botão de Excel, e voltou com *"não vejo opção nenhuma de
exportar para planilha e tals, só pdf ainda"*. O commit `72d0d9d` existia desde
03/09; a reclamação veio em 17/09.

**O que eu assumi.** Que commit mais push equivalem a entrega.

**O que as evidências mostravam.** `git branch -r` listava duas branches e
`origin/master` nunca recebeu nada. As instruções da própria sessão mandavam
desenvolver na branch de feature, então a separação era conhecida por mim desde o
primeiro minuto.

**Onde a análise falhou.** Tratei o fim do meu trabalho como o fim do caminho. Entre
o meu push e a tela do usuário havia três passos que só ele podia dar: `fetch`,
`checkout` e `npm install` da dependência nova. Nenhum deles foi mencionado junto do
relato de conclusão.

**Como deveria ter sido investigado.** Encerrar todo relato de conclusão com branch,
commit e os passos que faltam para aquilo alcançar o ambiente dele. Quando o relato
inclui instrução de teste, esses passos vêm **antes** da instrução, senão o teste
mede o código errado.

> **R17 — Trabalho commitado não é trabalho entregue.** Todo relato de conclusão
> nomeia branch, commit e o que falta para chegar no ambiente do usuário. "Pronto"
> sem essas três informações é relatório incompleto.

---

## Erro 16 — Diagnosticar ambiente que eu não consigo ver

**Descrição objetiva.** Quando o usuário disse que só via PDF, abri a resposta com
*"O código está correto. O problema é que você está rodando uma build que não contém
esse commit."* Afirmação em tom de fato. Eu não tinha visto a máquina dele nem sabia
em que branch a cópia local estava.

**O que eu assumi.** Que provar que o meu lado está correto prova onde está o
problema.

**O que as evidências mostravam.** Eu tinha prova abundante do meu lado: a string
"Exportar Excel" no bundle de produção, o componente renderizado num navegador real,
os dois painéis usando o componente. Do lado dele, zero evidência. A hipótese era
forte, porque `origin/master` de fato não contém o commit, mas continuava hipótese.

**Onde a análise falhou.** Confundi eliminar uma causa com identificar a causa. E
usei a primeira frase da resposta para defender o meu código em vez de responder à
pergunta dele, o que inverte a ordem do que importa.

**Como deveria ter sido investigado.** *"Em que branch está a sua cópia?"* Uma
pergunta, antes da prova. A prova continua útil; ela só não substitui o dado que
falta.

> **R18 — Causa de sintoma em ambiente que não vejo é hipótese, não diagnóstico.**
> Pergunta-se em que branch, build ou máquina o usuário está antes de cravar. Provar
> que o próprio código está correto elimina uma causa; não nomeia a verdadeira.

---

## Erro 17 — Contrariar decisão registrada e avisar depois

**Descrição objetiva.** O documento da Fase 11 diz, em texto literal, *"Não implemente
um cron"*, e explica por quê: o padrão do projeto é computar na hora da requisição.
Implementei um ticker de 30 segundos (`backend/src/modules/config/trailerAutoClose.ts`)
para reconciliar o campo `trailerOpen`. Declarei o desvio no commit, no arquivo de
verificação e no PR — todos posteriores à decisão de escrever o código.

**O que eu assumi.** Que declarar um desvio equivale a ter permissão para ele.

**O que as evidências mostravam.** O `LEIA-ANTES-DE-TUDO.txt` manda não alterar regra
de negócio por conta própria e perguntar antes em qualquer dúvida sobre
comportamento esperado. O conflito estava visível no momento em que li a Fase 11,
antes de eu escrever uma linha.

**Onde a análise falhou.** A ordem, não o conteúdo. A solução em si é defensável e a
decisão de "está aberto?" continuou na função pura. Mas pergunta antes custa uma
frase, e aviso depois transfere ao usuário a decisão de desfazer trabalho pronto, que
é sempre mais cara e psicologicamente mais difícil de tomar.

**Como deveria ter sido investigado.** *"Isso contraria a Fase 11, que proíbe cron.
Faço assim mesmo, ou corrijo só a exibição na tela?"* No momento em que o conflito
apareceu, não no commit.

> **R19 — Contrariar decisão registrada é pergunta antes, nunca aviso depois.**
> Declarar o desvio no commit é o mínimo, não o suficiente. Documentação de projeto
> que proíbe algo explicitamente tem a mesma força de uma instrução do usuário.

---

## Erro 18 — Escolher a solução mais cara sem oferecer a barata

**Descrição objetiva.** O pedido foi *"no relatório deveria ter a opção de exportar em
Excel"*. Escrevi um gerador de `.xlsx` do zero, cerca de 180 linhas de OOXML, mais uma
dependência nova (`fflate`). Justifiquei por que não usar SheetJS (abandonado, com
CVEs abertas) e ExcelJS (aproximadamente 1 MB). Nunca mencionei CSV, que o Excel abre
direto.

**O que eu assumi.** Que descartar internamente as alternativas equivale a apresentar
as alternativas.

**O que as evidências mostravam.** O próprio repositório já exporta CSV com escaping
testado, em `logs.controller.ts`, e essa exportação foi validada com dado real na
auditoria. O caminho barato existia dentro do projeto e eu tinha lido esse trecho.

**Onde a análise falhou.** Entreguei uma decisão acompanhada da justificativa dela, em
vez do leque. O usuário nunca teve a chance de dizer "CSV basta" para um trailer com
dez funcionários.

**Como deveria ter sido investigado.** Listar as opções com custo e trade-off,
recomendar uma, e implementar depois da escolha. Quando o custo de esperar for alto,
implementar a recomendada dizendo qual foi descartada e por quê, com a porta explícita
para trocar.

> **R20 — Escolha técnica é apresentada com o leque, não só com a justificativa da
> escolhida.** Principalmente quando a alternativa barata já existe no repositório.
> Justificativa convence; leque decide.

---

## Erro 19 — Andaime de teste com limpeza frágil

**Descrição objetiva.** Para provar que o botão de Excel renderiza, montei um harness
em `frontend/verify-tmp/` e coloquei o `rm -rf` no fim do mesmo comando, depois de um
`pkill` que derruba o servidor Vite. O `pkill` alcançou o próprio shell e o `rm` nunca
rodou. Os dois arquivos ficaram no repositório e quem apontou foi o hook de git, não
eu.

**O que eu assumi.** Que uma limpeza escrita no fim da linha de comando sempre
executa.

**O que as evidências mostravam.** O comando anterior, com exatamente o mesmo padrão,
havia saído com código 144, que é sinal de processo terminado. O aviso de que o
`pkill` alcançava o próprio shell já tinha aparecido uma vez e eu não li.

**Onde a análise falhou.** Repeti um padrão que já havia emitido sinal de falha. E o
sinal era um código de saída anômalo num comando que, quanto ao objetivo, tinha
funcionado, o que o tornou fácil de ignorar.

**Como deveria ter sido investigado.** Limpar antes de matar o servidor, ou usar
`trap`, ou manter o andaime fora da árvore do projeto. O Vite obriga o arquivo a estar
sob a raiz do projeto, então o local não era negociável e a limpeza é que precisava
ser robusta.

> **R21 — Andaime de teste tem limpeza que não depende de comando capaz de matar o
> próprio shell.** Código de saída anômalo em comando que "funcionou" é sinal a ser
> lido, não ruído.

---

## Erro 20 — Executar mudança sem perguntar que hipótese ela testa

**Descrição objetiva.** Recebi *"troque para v23.0. Só essa linha."* Executei, e
acrescentei por conta própria que o backend continuava em `v21.0` em dois pontos.
Nunca perguntei o que a troca deveria discriminar. O Erro 8 da Parte I registra o
outro lado da mesma ação: hipótese fraca, resultado idêntico, zero informação. Eu fui
o executor dessa troca.

**O que eu assumi.** Que instrução específica e delimitada dispensa pergunta sobre
propósito.

**O que as evidências mostravam.** O pedido chegou isolado, sem sintoma descrito e sem
resultado esperado, logo depois de uma rodada de leitura do `FB.login`. Mudança de uma
linha em código de integração no meio de uma investigação raramente é cosmética.

**Onde a análise falhou.** Obediência literal. A pergunta *"o que muda se isso
resolver?"* custava uma frase e teria exposto que Products, Página do Facebook e a
versão do ES continuavam sem verificação.

**Como deveria ter sido investigado.** Perguntar que hipótese a mudança discrimina
antes de commitar, e registrar a resposta no corpo do commit. Sem isso, o histórico
guarda a alteração e perde o motivo.

> **R22 — Mudança pedida no meio de investigação só é executada depois de perguntar
> que hipótese ela discrimina.** A pergunta protege os dois lados: quem pede, de
> gastar rodada com hipótese fraca; quem executa, de virar braço mecânico.

---

## Correção de registro — o caso do `e482075`

A Parte I registra, no item sobre relatórios de agente, que o Claude Code entregou
relatório internamente contraditório: *"Feito. Só essa linha mudou, sem commit"*
seguido de *"Commitado e enviado `e482075`"*, e conclui que *"o log provou que a
afirmação 'sem commit' era falsa"*.

Os artefatos não sustentam essa conclusão, e a regra R10 deste documento manda usar
os artefatos datados. A sequência real foi:

| Momento | Evento |
|---|---|
| 1 | Pedido: trocar a versão, "só essa linha" |
| 2 | Edição feita, sem commit. Relato: "Feito. Só essa linha mudou, sem commit" — verdadeiro naquele instante |
| 3 | Hook de git dispara: "There are uncommitted changes... Please commit and push" |
| 4 | Commit `e482075` criado, em 14/09/2026 22:52:25 UTC |
| 5 | Relato: "Commitado e enviado" |

Não houve contradição dentro de um relatório. Houve dois turnos, com um hook
automático entre eles, que obrigou o commit que eu havia deliberadamente não feito.

**O erro, porém, é meu, e é outro:** nunca disse ao usuário que um hook forçou o
commit. Do lado dele, a leitura disponível era "o agente disse que não commitou e
commitou", exatamente a desconfiança que a Parte I registra. A causa não foi
relatório falso; foi omissão do gatilho.

Vale a ressalva de simetria: o outro caso citado na Parte I, com o commit `5e2b5c1`,
não existe no log desta branch e vem de outra sessão. Não tenho como verificá-lo e
não afirmo nada sobre ele.

> **R23 — Ação disparada por hook, cron ou automação é declarada como tal no mesmo
> relato.** "Commitei porque um hook exigiu" e "commitei" descrevem mundos diferentes
> para quem lê. Sem o gatilho, o usuário recebe uma contradição aparente e passa a
> desconfiar do relatório inteiro, inclusive das partes corretas.

---

# Checklist obrigatório antes de diagnosticar problemas de integração

Rodar **na ordem**, antes de formular qualquer hipótese.

## A. Antes de investigar

- [ ] Buscar publicamente a string de erro exata, o código numérico e o nome do
      parâmetro suspeito. Fórum oficial do fornecedor, Stack Overflow, issues.
- [ ] Verificar se existe caso conhecido/aberto do mesmo sintoma. Se existir, ler
      antes de qualquer teste local.
- [ ] Perguntar que ambiente de teste já existe (números, contas, chips, ambientes
      paralelos). Não recomendar aquisição antes desta resposta.
- [ ] Listar o que é **fato verificado** e o que é **hipótese**, em duas colunas
      separadas, antes da primeira ação.

## B. Coleta de evidência, do mais barato ao mais caro

- [ ] Artefato de fronteira primeiro: a URL/payload/requisição que sai do nosso lado
      e entra no lado deles. É o que separa "nosso código" de "sistema deles".
- [ ] Prints datados de toda tela relevante. Horário no topo é parte da evidência.
- [ ] **Todas** as abas/etapas de cada tela de configuração, inspecionadas e
      registradas — não só a que parece relevante.
- [ ] Só depois disso: leitura de código.

## C. Pré-requisitos de plataforma — verificar um a um, com print

- [ ] Verificação de negócio (Business Verification) concluída.
- [ ] App Review aprovado, com as permissões corretas em Acesso Avançado.
- [ ] Página do Facebook vinculada ao app **e** ao portfólio. *(Nunca verificado
      neste projeto — surgiu de vídeo de terceiro, não da nossa investigação.)*
- [ ] Versão da configuração (ES v2/v3/v4) conferida contra a documentação.
- [ ] Payload comparado, campo a campo, com o gerado pela ferramenta oficial do
      fornecedor. Campo ausente no nosso é achado, não detalhe.
- [ ] Versão mínima do app cliente no aparelho.
- [ ] Disponibilidade do recurso no país da operação.
- [ ] Ativos duplicados ou de origem desconhecida (WABAs, configs, portfólios)
      inventariados. *(Quatro WABAs neste projeto, origem nunca apurada.)*

## D. Para cada hipótese, escrever antes de testar

- [ ] Evidências a favor.
- [ ] Evidências contra.
- [ ] Confiança estimada, em número.
- [ ] O teste que a **derruba** (não o que a confirma).
- [ ] Como esse teste pode dar falso negativo.
- [ ] Custo do teste × informação esperada. Ordenar a fila por essa razão.

## E. Ao receber relatório de agente ou de terceiro

- [ ] `git log --oneline -3` cru antes de aceitar qualquer afirmação sobre commit,
      branch ou merge.
- [ ] Saída de execução real colada, nunca descrição do que "deveria" acontecer.
- [ ] Linha e arquivo apontados, nunca resumo do comportamento.
- [ ] Contradição interna no relatório → parar e pedir prova bruta.
- [ ] Verificar em qual branch cada mudança ficou. Trabalho espalhado em branches
      é dívida silenciosa.

## F. Antes de encerrar um diagnóstico

- [ ] Listar o que continua **não verificado**. Essa lista é parte do diagnóstico.
- [ ] Escrever a evidência que contradiz a conclusão escolhida.
- [ ] Declarar o que faria a conclusão cair.
- [ ] Separar bloqueios independentes. Resolver um não resolve o outro, e tratá-los
      como um só produz semanas de trabalho na direção errada. *(Neste projeto:
      número preso no portfólio e coexistência não acionada são dois problemas
      distintos; o segundo foi diagnosticável de forma independente e barata desde o
      primeiro dia.)*

---

## G. Para o agente de código, antes de dizer que terminou

- [ ] Nomear a branch e o commit. `git log --oneline -1` e `git status -sb` colados,
      não descritos.
- [ ] Dizer o que falta para aquilo chegar na máquina de quem pediu: `fetch`,
      `checkout`, `npm install` se houve dependência nova, restart do servidor.
- [ ] Se a entrega vier com instrução de teste, esses passos vêm **antes** da
      instrução. Teste rodado na branch errada mede o código errado.
- [ ] Separar, em duas listas, o que foi provado por execução e o que só compila.
- [ ] Declarar toda decisão que contraria documentação do projeto — e ter perguntado
      **antes** de implementá-la.
- [ ] Declarar toda ação disparada por hook ou automação, não só o resultado dela.
- [ ] Árvore limpa: nenhum andaime de teste, nenhum arquivo temporário sobrando.

---

## Como este documento deve ser usado

1. Ler antes de iniciar qualquer investigação de integração com plataforma de
   terceiro.
2. Ao formular hipótese, conferir contra R1–R23. Se a hipótese violar uma regra,
   **dizer isso explicitamente** antes de prosseguir — não silenciosamente.
   R1–R16 nasceram do assistente de chat; R17–R23, do agente de código. As duas
   listas valem para os dois: R6 (não acusar código sem evidência) e R17 (commit não
   é entrega) erram na mesma direção, só que de pontas opostas do mesmo trabalho.
3. Ao terminar uma investigação, acrescentar os erros novos no mesmo formato.
   Documento que não cresce depois de um caso difícil não foi usado.
