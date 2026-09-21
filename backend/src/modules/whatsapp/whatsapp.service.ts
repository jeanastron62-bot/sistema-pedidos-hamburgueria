import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ordersService } from '../orders/orders.service';
import { listItems } from '../menu/menu.service';
import { getConfig } from '../config/config.service';
import { listNeighborhoods } from '../neighborhoods/neighborhoods.service';
import { createLog } from '../../utils/logger';
import { getIO } from '../../socket/socket';
import { computeDeliveryGrace } from '../../utils/deliveryWindow';
// Fase 17 -- envio pelo painel reaproveita o ÚNICO caminho de envio
// (CONTEXTO 5.7: não criar um segundo). sendMessage.ts não importa deste
// arquivo, então não há ciclo.
import { sendWhatsappText } from './sendMessage';

export function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  // Sem segredo configurado não há como validar nada -- rejeita, nunca aceita.
  // (Aceitar seria pior que o webhook não funcionar: qualquer um poderia
  // injetar mensagem no sistema.)
  if (!env.META_APP_SECRET) {
    console.error('[WHATSAPP_CONFIG_MISSING] META_APP_SECRET não configurado -- webhook rejeitado.');
    return false;
  }
  const expected = 'sha256=' + crypto
    .createHmac('sha256', env.META_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Formato mínimo que esta fase precisa do payload do Meta -- o resto (tipo de
// mensagem, mídia, etc.) é gravado como veio em rawPayload, sem tipar aqui.
type InboundMessage = { from: string; id: string } & Record<string, unknown>;

// Fase 15.4 -- eco de mensagem que a PRÓPRIA equipe mandou pelo app WhatsApp
// Business (Coexistence). "to" é o cliente que recebeu; não tem "from" no
// sentido de cliente, o remetente é o número do negócio.
type MessageEcho = { to: string; id: string; type?: string } & Record<string, unknown>;

// Fase 15.1 -- quem diz do que trata um webhook é o `change.field`, não o
// formato do `value`. Enquanto o app só assinava `messages`, decidir por
// "tem value.messages?" funcionava por sorte; com a coexistência ligada
// chegam, no mesmo POST e no mesmo endpoint, payloads de estrutura
// completamente diferente (`history`, `smb_app_state_sync`) -- procurar
// `value.messages` neles dá undefined silencioso na melhor hipótese.
export const WEBHOOK_FIELD = {
  MESSAGES: 'messages',
  MESSAGE_ECHOES: 'smb_message_echoes',
  ACCOUNT_UPDATE: 'account_update',
  HISTORY: 'history',
  APP_STATE_SYNC: 'smb_app_state_sync',
} as const;

interface WebhookChangeValue {
  messages?: InboundMessage[];
  // Fase 15.4 -- mensagens que o negócio mandou pelo app WhatsApp Business,
  // espelhadas pro webhook (chegam sob o field smb_message_echoes).
  message_echoes?: MessageEcho[];
  // Fase 15.3 -- de qual número da WABA esta mensagem chegou. É por este
  // campo (não por "pega a conta ativa") que sendMessage.ts decide com qual
  // WhatsappBusinessAccount responder.
  metadata?: { phone_number_id?: string };
  // account_update: é aqui que o Meta avisa que a conexão morreu
  // (desconexão pelo celular, remoção do parceiro, offboarding).
  event?: string;
  disconnection_info?: unknown;
  // history / smb_app_state_sync: só a contagem é usada, o conteúdo é
  // descartado de propósito (ver routeWebhookChanges).
  history?: unknown[];
  state_sync?: unknown[];
  // statuses (recibos de entrega/leitura) chegam sob o field 'messages' e
  // continuam ignorados desde a Fase 13 -- não são mensagem recebida.
}

interface WhatsappWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: WebhookChangeValue;
    }>;
  }>;
}

// Só estes dois significam "acabou": os outros account_update (mudança de
// nome, de limite, de qualidade) não afetam o funcionamento do bot.
const DISCONNECTION_EVENTS = new Set(['PARTNER_REMOVED', 'ACCOUNT_OFFBOARDED']);

// Nunca tenta reconectar sozinho: reconexão passa pelo Embedded Signup com o
// Facebook da dona dentro do popup, coisa que handler de webhook nenhum
// consegue refazer. O que dá pra fazer é a desconexão não passar em
// silêncio -- fica em Log, que o painel já lista, com o disconnection_info
// inteiro pra quem for investigar depois.
async function handleAccountUpdate(value: WebhookChangeValue): Promise<void> {
  const event = typeof value.event === 'string' ? value.event : null;
  console.log('[WHATSAPP_ACCOUNT_UPDATE]', { event });
  if (!event || !DISCONNECTION_EVENTS.has(event)) return;

  await createLog(prisma, {
    username: 'Meta (webhook)',
    action: 'WHATSAPP_DISCONNECTED',
    details: { event, disconnectionInfo: value.disconnection_info ?? null },
  });
  console.error('[WHATSAPP_DISCONNECTED]', { event });
}

// Contagem defensiva: o payload de history é aninhado (history[] -> threads[]
// -> messages[]) e vem do Meta, não daqui -- qualquer nível pode não ser array.
function countHistory(value: WebhookChangeValue): { threads: number; messages: number } {
  let threads = 0;
  let messages = 0;
  for (const chunk of Array.isArray(value.history) ? value.history : []) {
    const threadList = (chunk as { threads?: unknown }).threads;
    for (const thread of Array.isArray(threadList) ? threadList : []) {
      threads += 1;
      const messageList = (thread as { messages?: unknown }).messages;
      messages += Array.isArray(messageList) ? messageList.length : 0;
    }
  }
  return { threads, messages };
}

// Fase 15.1 -- porta de entrada única do webhook: um percurso só do payload,
// com switch explícito no field, devolvendo o que o loop de resposta em
// receive() precisa. Substitui extractMessages/extractMessageEchoes, que
// percorriam o mesmo payload de novo cada uma e não olhavam o field.
export async function routeWebhookChanges(payload: WhatsappWebhookPayload): Promise<{
  messages: Array<InboundMessage & { phoneNumberId?: string }>;
  echoes: MessageEcho[];
}> {
  const messages: Array<InboundMessage & { phoneNumberId?: string }> = [];
  const echoes: MessageEcho[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      switch (change.field) {
        case WEBHOOK_FIELD.MESSAGES: {
          const phoneNumberId = value.metadata?.phone_number_id;
          for (const message of value.messages ?? []) {
            messages.push({ ...message, phoneNumberId });
          }
          break;
        }
        case WEBHOOK_FIELD.MESSAGE_ECHOES: {
          for (const echo of value.message_echoes ?? []) {
            echoes.push(echo);
          }
          break;
        }
        case WEBHOOK_FIELD.ACCOUNT_UPDATE:
          await handleAccountUpdate(value);
          break;
        case WEBHOOK_FIELD.HISTORY:
          // Descartado de propósito: um único webhook descreve meses de
          // conversa da dona com os clientes dela. Guardar isso é PII em
          // volume num banco cuja política de retenção (40 dias, ver
          // PROMPT.md) foi escrita pra conversa do bot, não pra importação
          // em massa. Importar antes de decidir a retenção é criar passivo;
          // se um dia for preciso, é fase própria.
          console.log('[WHATSAPP_HISTORY_DISCARDED]', countHistory(value));
          break;
        case WEBHOOK_FIELD.APP_STATE_SYNC:
          // Mesma decisão do history: a agenda de contatos da dona não entra
          // neste banco.
          console.log('[WHATSAPP_APP_STATE_SYNC_DISCARDED]', {
            entries: Array.isArray(value.state_sync) ? value.state_sync.length : 0,
          });
          break;
        default:
          // Nunca lança. Field desconhecido é campo novo do Meta ou campo
          // assinado no App Dashboard sem ninguém mexer aqui -- os dois têm
          // que virar log, não exceção: o Meta reentrega por até 36h quem
          // não devolve 200, e uma exceção aqui viraria fila de reentrega.
          console.warn('[WHATSAPP_WEBHOOK_UNKNOWN_FIELD]', { field: change.field ?? null });
      }
    }
  }

  return { messages, echoes };
}

// Texto legível pro histórico/OpenAI -- só mensagem de texto tem isso nesta
// fase. Áudio/imagem ficam com content null (transcrição é escopo futuro).
// Exportado: Fase 15.4 reaproveita pra extrair texto de message_echoes, mesmo
// formato { type: 'text', text: { body } } usado pelas mensagens recebidas.
export function extractTextContent(message: Record<string, unknown>): string | null {
  if (message.type === 'text') {
    const text = message.text as { body?: string } | undefined;
    return text?.body ?? null;
  }
  return null;
}

// Quando o Meta diz que o cliente mandou a mensagem (unix em segundos, como
// string no payload). Usado no lugar do relógio de processamento pra decidir
// a tolerância de delivery: o Meta reentrega com backoff quando não recebe
// 200 a tempo, e uma mensagem das 23:59 processada às 00:0x é justamente
// quem a tolerância existe pra proteger. Cai pro relógio local se vier
// ausente ou ilegível -- nunca deixa a decisão sem instante nenhum.
export function extractMessageTimestamp(message: Record<string, unknown>, fallback: Date = new Date()): Date {
  const raw = message.timestamp;
  const seconds = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return new Date(seconds * 1000);
}

// Fase 15.5 -- sem transcrição de áudio nem visão computacional, o bot não
// tem o que responder de verdade pra esses tipos. Resposta fixa por tipo,
// nunca gasta chamada de OpenAI com um turno de usuário sem texto nenhum --
// foi exatamente isso que vazou raciocínio interno do modelo (turno vazio,
// nada pra responder) e gerou o fallback de erro genérico na foto.
export const NON_TEXT_REPLIES: Record<string, string> = {
  audio: 'Não consigo ouvir áudio por aqui ainda 🙏 Manda por texto que te atendo na hora!',
  image: 'Recebi sua foto, mas ainda não consigo analisar imagem por aqui. Me conta em texto o que você precisa 🙏',
  document: 'Não consigo abrir arquivo por aqui ainda. Pode me contar em texto?',
  sticker: 'Adorei o sticker! 😄 Mas preciso que escreva em texto pra eu te ajudar com o pedido.',
  location: 'Recebi sua localização, mas pra fechar o pedido preciso do endereço em texto (rua, número e bairro).',
  contacts: 'Recebi o contato, mas não consigo processar isso por aqui. Me conta em texto o que você precisa.',
};
export const NON_TEXT_REPLY_DEFAULT =
  'Não consigo processar esse tipo de mensagem por aqui ainda. Pode me escrever em texto o que você precisa?';

// Fase 14.8 -- exportada (antes era privada): o novo loop em receive() precisa
// dela pra saber em qual conversationId gravar/consultar, não só
// storeInboundMessages.
export async function findOrCreateConversation(phone: string, messageAt: Date = new Date()) {
  // Grace só é gravado quando computeDeliveryGrace devolve valor (mensagem
  // entre 18:00 e 23:59). Fora dessa faixa o campo fica de fora do update de
  // propósito -- sobrescrever com null às 00:05 apagaria exatamente a
  // tolerância que a mensagem das 23:5x concedeu.
  const deliveryGraceUntil = computeDeliveryGrace(messageAt);
  return prisma.whatsappConversation.upsert({
    where: { phone },
    update: { lastInboundAt: new Date(), ...(deliveryGraceUntil ? { deliveryGraceUntil } : {}) },
    create: { phone, lastInboundAt: new Date(), deliveryGraceUntil },
  });
}

// Recebe as mensagens já roteadas por routeWebhookChanges (Fase 15.1) em vez
// de navegar o payload de novo -- antes o mesmo payload era percorrido três
// vezes por requisição, e a navegação daqui não tinha como saber o field.
export async function storeInboundMessages(
  messages: Array<InboundMessage & { phoneNumberId?: string }>
): Promise<void> {
  for (const { phoneNumberId: _phoneNumberId, ...message } of messages) {
    // phoneNumberId é contexto adicionado por extractMessages (Fase 15.3),
    // não fazia parte do payload original do Meta -- não entra em
    // rawPayload, que precisa continuar sendo exatamente o que chegou.
    const conversation = await findOrCreateConversation(message.from, extractMessageTimestamp(message));

    try {
      await prisma.whatsappMessage.create({
        data: {
          conversationId: conversation.id,
          waMessageId: message.id,
          direction: 'IN',
          content: extractTextContent(message),
          rawPayload: message as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // waMessageId duplicado -- reentrega do Meta, já processada. Não é erro.
        continue;
      }
      throw err;
    }
  }
}

// Formato exato do schema `criar_pedido` em tools.ts -- o modelo só manda
// nome_item/nome_adicional/bairro (texto), nunca ID (ver nota de resolução
// nome -> ID em docs/BOT-WHATSAPP-PROMPT.md, seção 2).
interface CriarPedidoArgs {
  tipo: 'RETIRADA' | 'DELIVERY';
  nome_cliente: string;
  bairro: string | null;
  endereco: string | null;
  itens: Array<{
    nome_item: string;
    quantidade: number;
    escolha_obrigatoria: string | null;
    adicionais: Array<{ nome_adicional: string; quantidade: number }>;
    observacoes: string | null;
  }>;
  forma_pagamento: 'DINHEIRO' | 'PIX' | 'CREDITO' | 'DEBITO';
  valor_pago_dinheiro: number | null;
  // true só depois que o cliente confirmou o bairro de novo, já avisado da
  // divergência achada pelo ViaCEP -- sem essa válvula, insistir no mesmo
  // bairro reabre o mesmo erro pra sempre (checkBairroDivergente acha a
  // mesma divergência de novo a cada nova tentativa de criar_pedido).
  bairro_confirmado_pelo_cliente: boolean | null;
  // Trava de confirmação: o modelo só pode marcar true depois de mostrar o
  // resumo e receber o "sim" do cliente. Instrução de prompt sozinha era
  // probabilística -- o bot chegou a criar pedido na mesma mensagem em que
  // mostrava o resumo. Com o campo obrigatório no schema, o modelo é forçado
  // a decidir explicitamente, e handleCriarPedido recusa quando é false.
  cliente_confirmou_resumo: boolean;
}

const normalizeName = (s: string) => s.trim().toLowerCase();

const VIACEP_TIMEOUT_MS = 2500;

// Só pra comparar bairro do ViaCEP com o nosso cadastro -- normalizeName
// (trim + lowercase) não basta aqui: nosso cadastro tem sufixo tipo "1ª
// Seção"/"Setor Central" que o nome oficial dos Correios não tem, e teria
// acento/pontuação divergente mesmo quando é o mesmo bairro. NFKD decompõe
// tanto acento (é -> e + combining) quanto símbolo tipo ª/º (compatibility
// decomposition -> a/o) antes de remover o que sobrar; a continência nos
// dois sentidos casa "alterosa" com "alterosa 1a secao" e vice-versa.
function normalizeBairro(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bairroCorresponde(a: string, b: string): boolean {
  const normA = normalizeBairro(a);
  const normB = normalizeBairro(b);
  return normA.length > 0 && normB.length > 0 && (normA.includes(normB) || normB.includes(normA));
}

// Corta no primeiro número ou vírgula -- ViaCEP busca por logradouro, não
// aceita "Rua X, 326, apto 2", só "Rua X".
function extractLogradouro(endereco: string): string {
  const match = endereco.match(/^([^,\d]+)/);
  return (match ? match[1] : endereco).trim();
}

// Confere o bairro que o cliente informou contra o que o ViaCEP associa à
// rua digitada -- hoje a única validação de bairro é "esse nome existe na
// nossa lista", sem relação nenhuma com o endereço (foi assim que um pedido
// pra Rua Dirceu José Alvarenga, que fica em Betim Industrial, foi
// confirmado como "Alterosa 1ª Seção"). Devolve o bairro divergente
// encontrado, ou null se bateu / não achou a rua / a API falhou -- nunca
// bloqueia o pedido por causa disso, só evita, quando dá, um endereço
// errado passar sem pergunta nenhuma. Trailer só entrega em Betim/MG, não é
// validação de endereço genérica.
async function checkBairroDivergente(bairroInformado: string, endereco: string): Promise<string | null> {
  const logradouro = extractLogradouro(endereco);
  if (logradouro.length < 3) return null; // ViaCEP exige >= 3 caracteres de busca

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VIACEP_TIMEOUT_MS);
  try {
    const url = `https://viacep.com.br/ws/MG/Betim/${encodeURIComponent(logradouro)}/json/`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const bairrosEncontrados: string[] = results
      .map((r: { bairro?: string }) => r.bairro)
      .filter((b: string | undefined): b is string => Boolean(b));
    if (bairrosEncontrados.length === 0) return null;
    if (bairrosEncontrados.some((b) => bairroCorresponde(b, bairroInformado))) return null;

    return bairrosEncontrados[0];
  } catch {
    return null; // timeout, rede fora, resposta inesperada -- nunca bloqueia por isso
  } finally {
    clearTimeout(timeout);
  }
}

// Resolve nome_item/nome_adicional/bairro pro cardápio e pra lista de bairros
// vivos (buscados agora, não confia em nada que o modelo "lembrou" do início
// da conversa). Lança {status, message} no mesmo formato que
// orders.service.ts já usa -- cai no catch de criar_pedido em dispatchToolCall
// e vira resultado de erro da tool, nunca exceção que derruba a resposta.
async function resolveCriarPedidoData(args: CriarPedidoArgs, phone: string) {
  const menuItems = await listItems(false);
  const itemByName = new Map(menuItems.map((m) => [normalizeName(m.name), m]));

  const items = args.itens.map((it) => {
    const dbItem = itemByName.get(normalizeName(it.nome_item));
    if (!dbItem) {
      throw { status: 400, message: `Item '${it.nome_item}' não encontrado no cardápio atual.` };
    }
    const extras = it.adicionais.map((ad) => {
      const dbExtra = itemByName.get(normalizeName(ad.nome_adicional));
      if (!dbExtra) {
        throw { status: 400, message: `Adicional '${ad.nome_adicional}' não encontrado no cardápio atual.` };
      }
      return { menuItemId: dbExtra.id, quantity: ad.quantidade };
    });
    return {
      menuItemId: dbItem.id,
      quantity: it.quantidade,
      observations: it.observacoes,
      selectedChoice: it.escolha_obrigatoria,
      extras,
    };
  });

  let neighborhoodId: number | null = null;
  if (args.tipo === 'DELIVERY') {
    const neighborhoods = await listNeighborhoods();
    const neighborhood = neighborhoods.find((n) => normalizeName(n.name) === normalizeName(args.bairro ?? ''));
    if (!neighborhood) {
      throw { status: 400, message: `Bairro '${args.bairro}' não está na lista atendida.` };
    }
    neighborhoodId = neighborhood.id;

    // Só roda a checagem se o cliente ainda não confirmou o bairro depois de
    // avisado -- sem isso, insistir no mesmo bairro reabre o mesmo erro pra
    // sempre (checkBairroDivergente acha a mesma divergência de novo a cada
    // nova tentativa de criar_pedido com os mesmos args).
    if (args.endereco && !args.bairro_confirmado_pelo_cliente) {
      const bairroDivergente = await checkBairroDivergente(neighborhood.name, args.endereco);
      if (bairroDivergente) {
        throw {
          status: 400,
          message: `O endereço '${args.endereco}' geralmente fica no bairro '${bairroDivergente}', não em '${args.bairro}'. Confirme com o cliente qual é o bairro certo antes de continuar.`,
        };
      }
    }
  }

  return {
    type: args.tipo,
    paymentMethod: args.forma_pagamento,
    cashPaidAmount: args.forma_pagamento === 'DINHEIRO' ? args.valor_pago_dinheiro : null,
    customerName: args.nome_cliente,
    customerPhone: phone,
    customerAddress: args.tipo === 'DELIVERY' ? args.endereco : null,
    neighborhoodId,
    items,
  };
}

// Chama o createOrder de verdade (mesmo caminho do cardápio web, inclusive o
// emit de order:created pro painel) e devolve o resultado como conteúdo da
// tool -- nunca deixa uma falha de negócio (delivery bloqueado, item
// esgotado, bairro fora de área) virar exceção: o passo 9 do system prompt
// só funciona se o modelo receber esse motivo pra repassar ao cliente.
async function handleCriarPedido(args: CriarPedidoArgs, phone: string, conversationId: number): Promise<string> {
  // Nunca cria pedido sem confirmação explícita do cliente sobre o resumo.
  // Checado ANTES de qualquer resolução/validação: um pedido com item errado
  // mas confirmado é problema do cliente; um pedido certo sem confirmação é
  // problema nosso (a cozinha começa a fazer algo que ninguém fechou).
  if (args.cliente_confirmou_resumo !== true) {
    console.warn('[WHATSAPP_BOT_CRIAR_PEDIDO_SEM_CONFIRMACAO]', { phone, conversationId });
    return JSON.stringify({
      sucesso: false,
      erro: 'O cliente ainda não confirmou o resumo do pedido.',
      instrucao: 'Mostre o resumo completo (itens, acréscimos, taxa de entrega e total) e pergunte se pode fechar. Encerre a mensagem e espere a resposta. Só chame criar_pedido de novo, com cliente_confirmou_resumo=true, depois que o cliente responder confirmando.',
    });
  }

  try {
    const data = await resolveCriarPedidoData(args, phone);
    // Tolerância desta conversa (ver computeDeliveryGrace): sem repassar, o
    // prompt ofereceria delivery às 00:05 e o createOrder recusaria logo
    // depois -- o cliente montaria o pedido inteiro pra tomar erro no fim.
    const conversation = await prisma.whatsappConversation.findUnique({ where: { id: conversationId } });
    const order = await ordersService.createOrder(
      data,
      undefined,
      'Cliente (WhatsApp)',
      true,
      conversation?.deliveryGraceUntil ?? null
    );
    return JSON.stringify({ sucesso: true, numero_pedido: order.id, total: Number(order.total) });
  } catch (err: any) {
    const message = err?.message ?? 'Não foi possível criar o pedido agora.';
    console.error('[WHATSAPP_BOT_CRIAR_PEDIDO_FAILED]', { phone, args, error: err });
    return JSON.stringify({ sucesso: false, erro: message });
  }
}

interface CancelarPedidoAtivoArgs {
  numero_pedido: number;
  motivo: string;
}

// Nunca o "mais recente" -- ver nota de 2.1 do PROMPT.md: nada garante que o
// telefone tem só um pedido em aberto (ex.: um PRONTO do site + um
// AGUARDANDO do bot no mesmo telefone). O system prompt lista todos e
// pergunta qual, em vez de assumir.
async function handleConsultarPedidoAtivo(phone: string): Promise<string> {
  try {
    const orders = await ordersService.findActiveOrdersByPhone(phone);
    return JSON.stringify({
      pedidos: orders.map((o) => ({
        numero_pedido: o.id,
        status: o.status,
        tipo: o.type,
        total: Number(o.total),
      })),
    });
  } catch (err: any) {
    console.error('[WHATSAPP_BOT_CONSULTAR_PEDIDO_FAILED]', { phone, error: err });
    return JSON.stringify({ pedidos: [], erro: 'Não foi possível consultar seus pedidos agora.' });
  }
}

async function handleCancelarPedidoAtivo(args: CancelarPedidoAtivoArgs, phone: string): Promise<string> {
  const numeroPedido = Number(args.numero_pedido);
  const motivo = typeof args.motivo === 'string' && args.motivo.trim() ? args.motivo : 'Não informado';

  if (!Number.isInteger(numeroPedido)) {
    return JSON.stringify({ sucesso: false, erro: 'Número de pedido inválido.' });
  }

  try {
    const order = await ordersService.cancelActiveOrderByCustomer(numeroPedido, phone, motivo);
    return JSON.stringify({ sucesso: true, numero_pedido: order.id });
  } catch (err: any) {
    const message = err?.message ?? 'Não foi possível cancelar o pedido agora.';
    console.error('[WHATSAPP_BOT_CANCELAR_PEDIDO_FAILED]', { phone, numeroPedido, error: err });
    // Fase 16 -- o contato vai junto na resposta da FUNÇÃO, não fica só na
    // instrução do prompt ("passe o contato {{CONTATO_TELEFONE}}"). Recusa é
    // o único momento em que o cliente fica sem saída: se o modelo esquecer
    // de anexar o telefone, ele descobre que não dá pra cancelar e não tem
    // pra quem ligar. Instrução de prompt é probabilística; isto não é.
    const config = await getConfig().catch(() => null);
    return JSON.stringify({
      sucesso: false,
      erro: message,
      contato_do_trailer: config?.contactPhone || null,
      instrucao: 'Diga ao cliente exatamente este motivo e passe o contato do trailer. Não ofereça tentar de novo.',
    });
  }
}

export async function dispatchToolCall(
  name: string,
  args: Record<string, unknown>,
  conversationId: number,
  phone: string
): Promise<string> {
  if (name === 'criar_pedido') {
    return handleCriarPedido(args as unknown as CriarPedidoArgs, phone, conversationId);
  }

  if (name === 'consultar_pedido_ativo') {
    return handleConsultarPedidoAtivo(phone);
  }

  if (name === 'cancelar_pedido_ativo') {
    return handleCancelarPedidoAtivo(args as unknown as CancelarPedidoAtivoArgs, phone);
  }

  if (name === 'transferir_para_humano') {
    const motivo = typeof args.motivo === 'string' ? args.motivo : null;
    const resumo = typeof args.resumo === 'string' ? args.resumo : null;

    await prisma.whatsappConversation.update({
      where: { id: conversationId },
      // Fase 17 -- handoffAt é gravado nos DOIS caminhos que pausam por
      // handoff (aqui e em pauseForHumanReview). Se só um gravasse, a fila e
      // o cronômetro quebrariam em metade dos casos.
      data: { botPaused: true, handoffMotivo: motivo, handoffResumo: resumo, handoffAt: new Date() },
    });

    // Sem isso a pausa fica invisível: só existia console.log (stdout do
    // Railway, ninguém olha proativamente) e nada no painel. createLog dá
    // auditoria em /logs; o emit dá alerta em tempo real pra quem está com
    // o painel aberto (mesmo padrão de order:created em orders.service.ts).
    await createLog(prisma, {
      username: 'Bot WhatsApp',
      action: 'WHATSAPP_HANDOFF',
      details: { conversationId, phone, motivo, resumo },
    });
    getIO().of('/staff').emit('whatsapp:handoff', { conversationId, phone, motivo, resumo });

    console.log('[WHATSAPP_BOT_HANDOFF]', { conversationId, motivo, resumo });
    // Resultado da tool, não texto final -- o controller manda de volta pra
    // OpenAI, que já sabe (system prompt) o que dizer nesse caso.
    return JSON.stringify({ sucesso: true });
  }

  console.log('[WHATSAPP_BOT_STUB_CALL]', { conversationId, name, args });
  return 'Isso ainda está sendo configurado por aqui -- já te chamamos assim que possível.';
}

// Fase 14.7 -- destrava conversa pausada por transferir_para_humano.
// Fase 17 -- limpa handoffAt junto. Os DOIS caminhos de "bot volta a
// responder" (este, manual, e a despausa automática em receive()) precisam
// deixar o mesmo estado. Se só um limpasse, uma conversa despausada pelo
// outro caminho voltaria ao topo da fila numa mensagem futura por causa de um
// handoffAt velho, sem handoff ativo nenhum -- e o cronômetro "esperando há X
// min" passaria a mentir em conversa já resolvida.
export async function resumeConversation(conversationId: number) {
  return prisma.whatsappConversation.update({
    where: { id: conversationId },
    data: { botPaused: false, handoffMotivo: null, handoffResumo: null, handoffAt: null },
  });
}

// ---------------------------------------------------------------------------
// FASE 17 -- CAIXA DE ENTRADA
//
// Substitui getPausedConversations(), que era um findMany sem `take` ordenado
// por updatedAt. Dois problemas que esta implementação corrige:
//   - sem paginação, num Android de 2 GB;
//   - updatedAt não é instante de handoff (deliveryGraceUntil escreve na linha
//     a cada mensagem entre 18h e 23h59), então a ordem e o cronômetro
//     mentiam.
// ---------------------------------------------------------------------------

// Fase 17.4 -- quanto tempo uma conversa continua na aba. Antes desta fase o
// teto de 12h vivia só dentro do critério de prioridade (PENDING_SQL);
// virou filtro da CONSULTA, então passa a valer pras duas visões (pending e
// all) igualmente -- sem isso "todas" significaria "toda conversa que já
// existiu", o que não é o que a aba mostra nem o que o Android de 2 GB
// aguenta paginar.
//
// DECISÃO, não bug: conversa sem resposta some da aba depois de 12h. Como o
// expediente do trailer é 18h–5h (~11h corridas), 12h de teto cobre o
// expediente atual inteiro com uma folga pequena -- na prática a aba mostra
// o turno de hoje, não o histórico. Conversa de ontem não compete por
// atenção com a de agora; se precisar dela, é o histórico completo do
// cliente que se busca, não esta aba.
export const INBOX_VISIBLE_WINDOW_HOURS = 12;

// Janela de atendimento da Cloud API. Fora dela o negócio não pode iniciar
// mensagem -- só o cliente reabre a conversa.
export const WHATSAPP_WINDOW_HOURS = 24;

export interface InboxConversation {
  id: number;
  phone: string;
  botPaused: boolean;
  lastInboundAt: Date | null;
  handoffAt: Date | null;
  handoffMotivo: string | null;
  handoffResumo: string | null;
  lastReadAt: Date | null;
  unreadCount: number;
  lastMessage: string | null;
  windowExpiresAt: Date | null;
  pending: boolean;
}

// Critério de PRIORIDADE (decisão do usuário, Fase 17):
//
//   botPaused = true
//   AND (humanRepliedAt IS NULL OR lastInboundAt > humanRepliedAt)
//
// Dois campos indexáveis, sem subquery em WhatsappMessage -- importa no
// Android de 2 GB.
//
// Fase 17.4 -- o teto de 12h que vivia AQUI DENTRO saiu: agora é filtro da
// consulta (RECENCY_SQL, abaixo), aplicado às duas visões da aba, então
// mantê-lo também aqui seria redundante -- toda linha que chega neste
// critério já passou pelo filtro de recência antes.
//
// Por que NÃO é "não-lida": lastReadAt zera assim que qualquer um abre a
// conversa, então o atendente abre, é interrompido, não responde, e a conversa
// cai da prioridade. Abrir não muda nada aqui; só RESPONDER muda, porque só
// responder escreve humanRepliedAt.
//
// Por que NÃO é só botPaused: responder pelo painel também pausa o bot, então
// conversa já atendida ficaria pinada pra sempre, empurrando pra baixo um
// handoff novo que ninguém viu.
const PENDING_SQL = Prisma.sql`
  c.bot_paused = true
  AND (c.human_replied_at IS NULL OR c.last_inbound_at > c.human_replied_at)
`;

// Fase 17.4 -- corte de recência da aba inteira, as duas visões. Mede
// lastInboundAt (quando o CLIENTE falou por último), nunca a mensagem mais
// recente em qualquer direção: uma resposta do atendente não deveria
// "ressuscitar" pra aba uma conversa que o cliente já abandonou há 13h. A
// aba é sobre o cliente precisar de algo recentemente, não sobre atividade
// da equipe.
const RECENCY_SQL = Prisma.sql`
  c.last_inbound_at >= NOW() - (${INBOX_VISIBLE_WINDOW_HOURS} || ' hours')::interval
`;

interface InboxRow {
  id: number;
  phone: string;
  bot_paused: boolean;
  last_inbound_at: Date | null;
  handoff_at: Date | null;
  handoff_motivo: string | null;
  handoff_resumo: string | null;
  last_read_at: Date | null;
  unread_count: number;
  last_message: string | null;
  pending: boolean;
}

function toInboxConversation(row: InboxRow): InboxConversation {
  return {
    id: row.id,
    phone: row.phone,
    botPaused: row.bot_paused,
    lastInboundAt: row.last_inbound_at,
    handoffAt: row.handoff_at,
    handoffMotivo: row.handoff_motivo,
    handoffResumo: row.handoff_resumo,
    lastReadAt: row.last_read_at,
    unreadCount: Number(row.unread_count),
    lastMessage: row.last_message,
    // Devolvido pronto pra UI não recalcular errado a janela de 24h.
    windowExpiresAt: row.last_inbound_at
      ? new Date(row.last_inbound_at.getTime() + WHATSAPP_WINDOW_HOURS * 3_600_000)
      : null,
    pending: row.pending,
  };
}

// `limit: 0` devolve só os totais, sem tocar nas linhas. É o que os três
// painéis usam pro contador da aba Atendimento: carregar 20 conversas pra
// mostrar um selo é desperdício num aparelho fraco.
//
// Fase 17.4 -- `view` escolhe a visão, mas é a MESMA rota, paginada, sob o
// MESMO corte de recência (RECENCY_SQL): "todas" significa todas as
// conversas ativas nas últimas 12h, nunca o histórico inteiro. pending é o
// default -- é o que precisa de atendimento agora.
export async function getInboxConversations(params: {
  limit: number;
  cursor?: string | null;
  view?: 'pending' | 'all';
}) {
  const limit = Math.max(0, Math.min(params.limit, 50));
  const view = params.view === 'all' ? 'all' : 'pending';

  const [{ total }] = await prisma.$queryRaw<Array<{ total: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::bigint AS total FROM "whatsapp_conversations" c WHERE ${RECENCY_SQL}`
  );
  const [{ pending }] = await prisma.$queryRaw<Array<{ pending: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::bigint AS pending FROM "whatsapp_conversations" c WHERE ${RECENCY_SQL} AND ${PENDING_SQL}`
  );

  if (limit === 0) {
    return { items: [] as InboxConversation[], total: Number(total), pending: Number(pending), nextCursor: null };
  }

  const cursorDate = params.cursor ? new Date(params.cursor) : null;
  const cursorValido = cursorDate !== null && !Number.isNaN(cursorDate.getTime());

  // view=pending: é o próprio bucket prioritário, ordenado por handoffAt asc
  // -- não precisa excluir nada, o filtro já É o bucket. Cursor pagina por
  // handoff_at, que é a chave de ordenação desta visão.
  //
  // view=all: mesma ordenação de sempre (bucket prioritário pinado no topo,
  // resto por last_inbound_at desc). Cursor só percorre a cauda
  // não-prioritária -- por isso a partir da segunda página a consulta
  // exclui o bucket, exatamente como antes desta fase.
  const viewWhere =
    view === 'pending'
      ? Prisma.sql`${PENDING_SQL} AND (${cursorValido ? Prisma.sql`c.handoff_at < ${cursorDate}` : Prisma.sql`TRUE`})`
      : cursorValido
        ? Prisma.sql`NOT (${PENDING_SQL}) AND c.last_inbound_at < ${cursorDate}`
        : Prisma.sql`TRUE`;

  const rows = await prisma.$queryRaw<InboxRow[]>(Prisma.sql`
    SELECT
      c.id, c.phone, c.bot_paused, c.last_inbound_at, c.handoff_at,
      c.handoff_motivo, c.handoff_resumo, c.last_read_at,
      (${PENDING_SQL}) AS pending,
      (
        SELECT COUNT(*)::int FROM "whatsapp_messages" m
        WHERE m.conversation_id = c.id
          AND m.direction = 'IN'
          AND (c.last_read_at IS NULL OR m.created_at > c.last_read_at)
      ) AS unread_count,
      (
        SELECT LEFT(m.content, 80) FROM "whatsapp_messages" m
        WHERE m.conversation_id = c.id AND m.content IS NOT NULL
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_message
    FROM "whatsapp_conversations" c
    WHERE ${RECENCY_SQL} AND ${viewWhere}
    ORDER BY
      (${PENDING_SQL}) DESC,
      CASE WHEN (${PENDING_SQL}) THEN c.handoff_at END ASC NULLS LAST,
      c.last_inbound_at DESC NULLS LAST,
      c.id DESC
    LIMIT ${limit}
  `);

  const items = rows.map(toInboxConversation);
  const ultimo = items[items.length - 1];
  // Cursor casa com a chave de ordenação de cada visão: handoffAt em
  // pending, lastInboundAt em all. Cursor errado pula ou repete linha.
  const cursorField = view === 'pending' ? ultimo?.handoffAt : ultimo?.lastInboundAt;
  const nextCursor = items.length === limit && cursorField ? cursorField.toISOString() : null;

  return { items, total: Number(total), pending: Number(pending), nextCursor };
}

// Últimas N mensagens, mais antigas primeiro na resposta (ordem de leitura).
// `before` é o createdAt do topo da thread já carregada -- é o "carregar
// anteriores" da UI. Nunca carrega a conversa inteira.
export async function getConversationMessages(
  conversationId: number,
  params: { before?: string | null; limit: number }
) {
  const limit = Math.max(1, Math.min(params.limit, 50));
  const beforeDate = params.before ? new Date(params.before) : null;
  const beforeValido = beforeDate !== null && !Number.isNaN(beforeDate.getTime());

  const rows = await prisma.whatsappMessage.findMany({
    where: {
      conversationId,
      ...(beforeValido ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    // Fase 17.2 (correção) -- deliveryStatus e failureReason vão junto pra thread saber
    // renderizar o estado. Regra de exibição (17.4, não implementada ainda:
    // não existe UI de thread neste código): OUT com deliveryStatus PENDENTE
    // há mais de 5 minutos mostra "não sei se chegou" em vez de spinner
    // eterno -- é regra de tela sobre createdAt/deliveryStatus, não escreve
    // nada no banco. deliveryStatus nulo é registro anterior a esta correção,
    // trata-se como ENVIADA pra não acender alerta em histórico antigo.
    select: {
      id: true,
      direction: true,
      content: true,
      sentByName: true,
      createdAt: true,
      deliveryStatus: true,
      failureReason: true,
      waMessageId: true,
    },
  });

  return {
    // Volta à ordem cronológica: a query pega as N mais recentes, a tela
    // renderiza de cima pra baixo.
    items: rows.reverse(),
    hasMore: rows.length === limit,
  };
}

// lastReadAt é POR CONVERSA, não por usuário (ver comentário no schema).
export async function markConversationRead(conversationId: number) {
  return prisma.whatsappConversation.update({
    where: { id: conversationId },
    data: { lastReadAt: new Date() },
    select: { id: true, lastReadAt: true },
  });
}

export class WindowClosedError extends Error {
  status = 409;
  constructor(public windowExpiresAt: Date | null) {
    super(
      'Passou de 24h desde a última mensagem do cliente. Só ele pode reabrir a conversa -- ' +
        'não é possível enviar por aqui agora.'
    );
  }
}

// Envio pelo painel. Reaproveita sendWhatsappText (proibição de segundo
// caminho de envio, CONTEXTO 5.7) -- esta função cuida do que é específico do
// atendimento humano: janela de 24h, pausa do bot e autoria.
export async function sendPanelMessage(
  conversationId: number,
  text: string,
  user: { userId: number; username: string }
) {
  const conversation = await prisma.whatsappConversation.findUniqueOrThrow({
    where: { id: conversationId },
  });

  // Checagem ANTES de tentar enviar: mandar e falhar na Graph API gasta
  // chamada e devolve erro do fornecedor, que não diz nada pra equipe.
  const windowExpiresAt = conversation.lastInboundAt
    ? new Date(conversation.lastInboundAt.getTime() + WHATSAPP_WINDOW_HOURS * 3_600_000)
    : null;
  if (windowExpiresAt === null || windowExpiresAt.getTime() <= Date.now()) {
    throw new WindowClosedError(windowExpiresAt);
  }

  const now = new Date();

  // ORDEM IMPORTA, e a primeira versão desta função estava errada: ela
  // marcava a conversa como atendida ANTES de enviar. Se o envio falhasse
  // (token vencido, Graph fora), a conversa ficava com humanRepliedAt
  // preenchido, saía do bucket de prioridade e sumia da fila -- com o cliente
  // sem ter recebido nada. Falha silenciosa, que é o pior desfecho.
  //
  // Enviando primeiro, uma falha de envio deixa a conversa exatamente como
  // estava: ela continua no topo e o atendente vê que precisa tentar de novo.
  // O risco inverso (mensagem enviada e estado não gravado) é visível e
  // recuperável -- a conversa só aparece de novo na fila.
  await sendWhatsappText(conversation.phone, conversationId, text, undefined, undefined, user.username);

  // Responder pelo painel PAUSA o bot -- ninguém quer atendente e bot
  // respondendo junto -- e escreve humanRepliedAt, que é o que tira a
  // conversa do bucket de prioridade (só responder muda, abrir não) e o que
  // faz a despausa automática de 30 min passar a ser alcançada.
  await prisma.whatsappConversation.update({
    where: { id: conversationId },
    data: { botPaused: true, humanRepliedAt: now, lastReadAt: now },
  });

  await createLog(prisma, {
    userId: user.userId,
    username: user.username,
    action: 'WHATSAPP_REPLY_SENT',
    details: { conversationId, phone: conversation.phone },
  });

  const saved = await prisma.whatsappMessage.findFirst({
    where: { conversationId, direction: 'OUT' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      direction: true,
      content: true,
      sentByName: true,
      createdAt: true,
      deliveryStatus: true,
      failureReason: true,
      waMessageId: true,
    },
  });

  // await da escrita antes do emit, sempre (proibição 9).
  //
  // AVISO PRA QUEM CONSOME ESTE EVENTO: este emit roda ANTES desta função
  // retornar pro controller, que só então manda a resposta HTTP do POST
  // /conversations/:id/messages. Ou seja, quem está com socket conectado
  // recebe whatsapp:message_sent ANTES da resposta HTTP do próprio envio
  // chegar em quem enviou. Um bug real (mensagem duplicada na thread do
  // painel, achado rodando de verdade num navegador -- ver Fase 17.4 e
  // docs/LOG-ERROS-AGENTE.md) veio exatamente daqui: dois caminhos
  // (resposta HTTP e este socket) tentando inserir a mesma mensagem, cada
  // um sem saber que o outro ia chegar. Todo consumidor deste evento
  // (frontend/useWhatsappThreadStore.ts é o atual) PRECISA de guarda de
  // duplicata contra a própria resposta HTTP do envio -- não é bug do
  // consumidor, é a ordem de emissão daqui. Não mude essa ordem achando
  // que "conserta" alguma coisa sem entender isso primeiro.
  getIO().of('/staff').emit('whatsapp:message_sent', {
    conversationId,
    content: saved?.content ?? text,
    sentByName: user.username,
    createdAt: saved?.createdAt ?? now,
  });

  return saved;
}

// Instante da última mensagem de cada conversa ANTES de storeInboundMessages
// gravar as novas. Existe por causa da armadilha de ordem de execução descrita
// em shouldAutoUnpause: depois da gravação, "última mensagem" é a que acabou
// de chegar, o intervalo dá zero e a despausa nunca dispara, em silêncio.
export async function snapshotBeforeInbound(phones: string[]): Promise<Map<string, Date | null>> {
  const unicos = Array.from(new Set(phones));
  const snapshot = new Map<string, Date | null>();
  if (unicos.length === 0) return snapshot;

  const conversas = await prisma.whatsappConversation.findMany({
    where: { phone: { in: unicos } },
    select: {
      phone: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });

  for (const c of conversas) {
    snapshot.set(c.phone, c.messages[0]?.createdAt ?? null);
  }
  return snapshot;
}
