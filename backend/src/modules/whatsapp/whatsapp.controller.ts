import { Request, Response } from 'express';
import { env } from '../../config/env';
import {
  isValidSignature,
  storeInboundMessages,
  routeWebhookChanges,
  extractMessageTimestamp,
  extractTextContent,
  findOrCreateConversation,
  dispatchToolCall,
  resumeConversation as resumeConversationService,
  getInboxConversations,
  getConversationMessages,
  markConversationRead,
  sendPanelMessage,
  snapshotBeforeInbound,
  WindowClosedError,
  NON_TEXT_REPLIES,
  NON_TEXT_REPLY_DEFAULT,
} from './whatsapp.service';
import { isRateLimited } from './whatsappRateLimit';
import { buildSystemPrompt } from './promptBuilder';
import { getRecentHistory, toChatFormat } from './conversationHistory';
import { callOpenAI } from './openaiClient';
import { runToolLoop, looksLikeJsonPayload } from './toolLoop';
import { sendWhatsappText } from './sendMessage';
import {
  handleMessageEcho,
  shouldAutoUnpause,
  pauseForHumanReview,
  HUMAN_TAKEOVER_UNPAUSE_MINUTES,
} from './humanTakeover';
import * as embeddedSignupService from './embeddedSignup.service';
import {
  connectWhatsappSchema,
  inboxQuerySchema,
  threadQuerySchema,
  panelReplySchema,
} from './whatsapp.schema';
import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { getIO } from '../../socket/socket';

export const verify = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Sem token configurado, nada a comparar -- nunca deixa passar (um
  // `undefined === undefined` acidental validaria qualquer requisição).
  if (!env.META_VERIFY_TOKEN) {
    console.error('[WHATSAPP_CONFIG_MISSING] META_VERIFY_TOKEN não configurado -- verificação recusada.');
    res.sendStatus(403);
    return;
  }
  if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
};

export const receive = async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!req.rawBody || !isValidSignature(req.rawBody, signature)) {
    res.sendStatus(401);
    return;
  }

  // Responde 200 imediatamente -- Meta reenvia com backoff se demorar, e
  // reenvio duplicado é exatamente o cenário que waMessageId único evita.
  res.sendStatus(200);

  try {
    // Fase 15.1 -- um percurso só do payload, decidindo por change.field. O
    // que não for mensagem nem eco (account_update, history,
    // smb_app_state_sync, campo desconhecido) é tratado e logado lá dentro,
    // nunca chega neste loop.
    const { messages, echoes } = await routeWebhookChanges(req.body);
    console.log('[WHATSAPP_WEBHOOK_RECEIVED]', { messages: messages.length, echoes: echoes.length });

    // Fase 17 -- ARMADILHA DE ORDEM DE EXECUÇÃO. storeInboundMessages grava o
    // IN novo e empurra lastInboundAt logo abaixo. Se a despausa automática
    // medisse o silêncio depois disso, mediria contra a mensagem que acabou
    // de chegar: intervalo zero, despausa nunca dispara, em silêncio. Por
    // isso o instante da última mensagem ANTERIOR é capturado aqui, antes da
    // escrita, e entregue ao shouldAutoUnpause por parâmetro.
    const anteriores = await snapshotBeforeInbound(messages.map((m) => m.from));

    await storeInboundMessages(messages);

    // Fase 15.4 -- eco de mensagem que o humano mandou pelo app WhatsApp
    // Business (Coexistence): pausa o bot pra valer antes de processar
    // qualquer coisa mais nesta requisição.
    for (const echo of echoes) {
      await handleMessageEcho(echo);
    }

    for (const message of messages) {
      let conversation = await findOrCreateConversation(message.from, extractMessageTimestamp(message));

      // Fase 17.3 -- a thread aberta no painel precisa receber a mensagem do
      // cliente em tempo real. Emitido DEPOIS da escrita (storeInboundMessages
      // já rodou acima), nunca antes -- proibição 9. Só no /staff: é conteúdo
      // de conversa de cliente, linha vermelha da seção 6 do CONTEXTO.
      getIO().of('/staff').emit('whatsapp:message_received', {
        conversationId: conversation.id,
        phone: message.from,
        content: extractTextContent(message),
        createdAt: extractMessageTimestamp(message),
      });

      if (conversation.botPaused) {
        if (shouldAutoUnpause(conversation, anteriores.get(message.from) ?? null)) {
          // Despausa preguiçosa, sem cron. Fase 17: vale para os dois casos
          // (ninguém respondeu, e alguém respondeu e parou) e NÃO vale para a
          // pausa de segurança do próprio bot -- despausar aquela recria o
          // loop do T25 a cada 30 min. O guard está em shouldAutoUnpause.
          //
          // resumeConversationService limpa handoffAt junto: os dois caminhos
          // de "bot volta a responder" precisam deixar o mesmo estado, senão
          // a conversa reaparece no topo da fila por um handoffAt velho.
          conversation = await resumeConversationService(conversation.id);
          await createLog(prisma, {
            username: 'Bot WhatsApp',
            action: 'WHATSAPP_BOT_AUTO_RESUMED',
            details: {
              conversationId: conversation.id,
              phone: message.from,
              afterMinutes: HUMAN_TAKEOVER_UNPAUSE_MINUTES,
            },
          });
          console.log('[WHATSAPP_BOT_AUTO_RESUME]', {
            conversationId: conversation.id,
            afterMinutes: HUMAN_TAKEOVER_UNPAUSE_MINUTES,
          });
        } else {
          console.log('[WHATSAPP_BOT_PAUSED_SKIP]', {
            phone: message.from,
            conversationId: conversation.id,
          });
          continue; // silenciado de verdade -- nem chama a OpenAI
        }
      }

      if (await isRateLimited(message.from)) {
        console.log('[WHATSAPP_RATE_LIMITED]', {
          phone: message.from,
          conversationId: conversation.id,
        });
        await sendWhatsappText(
          message.from,
          conversation.id,
          'Recebi muitas mensagens suas em pouco tempo, aguarda um instante e tenta de novo.',
          undefined,
          message.phoneNumberId
        );
        continue;
      }

      const messageType = typeof message.type === 'string' ? message.type : undefined;
      if (messageType !== 'text') {
        // Sem transcrição/visão, não tem o que mandar pro modelo -- resposta
        // fixa por tipo, sem gastar chamada de OpenAI (ver whatsapp.service.ts,
        // NON_TEXT_REPLIES). A mensagem em si já foi gravada com content:null
        // e rawPayload completo por storeInboundMessages, antes deste loop.
        console.log('[WHATSAPP_NON_TEXT_MESSAGE]', {
          phone: message.from,
          conversationId: conversation.id,
          type: messageType,
        });
        const replyText = (messageType && NON_TEXT_REPLIES[messageType]) || NON_TEXT_REPLY_DEFAULT;
        await sendWhatsappText(message.from, conversation.id, replyText, undefined, message.phoneNumberId);
        continue;
      }

      try {
        const systemPrompt = await buildSystemPrompt(new Date(), conversation.deliveryGraceUntil);
        const history = await getRecentHistory(conversation.id);
        const chatHistory = toChatFormat(history);

        // Fase 16 -- o loop de tool calling agora tem N rodadas (ver
        // toolLoop.ts). Antes tinha uma só, e quando o modelo respondia com
        // OUTRA tool call em vez de texto -- o que ele faz depois de uma
        // recusa, tentando outro caminho -- o content vinha null e o cliente
        // recebia "problema técnico" sem que nada tivesse falhado.
        const { replyText: modelText, calledTools, lastCompletion, exhausted } = await runToolLoop({
          systemPrompt,
          history: chatHistory,
          callModel: callOpenAI,
          dispatch: (name, args) => dispatchToolCall(name, args, conversation.id, message.from),
        });
        let replyText = modelText;

        // Handoff chamado -- resposta ao cliente fica determinística, não no
        // que o modelo decidir escrever depois do tool_call. O system prompt
        // já pede "pare de responder", mas isso é texto livre, não garantia;
        // aqui garante que o cliente sempre saiba que um atendente foi
        // acionado, mesmo se o modelo produzir algo estranho ou vazio.
        // calledTools cobre TODAS as rodadas: a transferência pode ter sido
        // decidida na segunda, não só na primeira.
        if (calledTools.includes('transferir_para_humano')) {
          replyText = 'Já chamei um atendente pra te ajudar, só um instante 👍';
        } else if (exhausted) {
          // Estourou o teto de rodadas e o modelo ainda queria chamar função.
          // Insistir mais é queimar chamada de API; mandar o cliente esperar
          // sem ninguém saber que ele existe é pior. Vai pra fila humana.
          console.error('[WHATSAPP_BOT_TOOL_LOOP_EXHAUSTED]', {
            conversationId: conversation.id,
            calledTools,
          });
          replyText = 'Só um instante, vou confirmar isso com a nossa equipe.';
          await pauseForHumanReview(conversation.id, 'TOOL_LOOP_EXHAUSTED', message.from, { calledTools });
        } else if (looksLikeJsonPayload(replyText)) {
          // O modelo escreveu os argumentos da função no content em vez de
          // chamar a função. O cliente NUNCA pode ver isso -- e, mais grave,
          // a ação que ele tentou fazer não aconteceu: se era
          // transferir_para_humano, ninguém foi avisado. Falha pro lado
          // seguro (mesmo princípio do fechamento automático do trailer):
          // pausa e joga pra fila humana em vez de tentar de novo.
          const vazado = replyText;
          console.error('[WHATSAPP_BOT_JSON_LEAK]', { conversationId: conversation.id, raw: vazado });
          replyText = 'Só um instante, vou confirmar isso com a nossa equipe.';
          await pauseForHumanReview(conversation.id, 'JSON_LEAK', message.from, { raw: vazado });
        }

        // Última rede: mandar string vazia pro Meta derruba o envio
        // ("text.body is required") e o cliente fica sem resposta nenhuma.
        // Depois da Fase 16 este caminho ficou raro -- o caso que o disparava
        // (segunda resposta do modelo vindo com tool_calls e content null)
        // agora é tratado pelo loop de rodadas e pelo ramo `exhausted`. Se
        // cair aqui, é modelo devolvendo texto vazio sem chamar função
        // nenhuma, que é outra coisa.
        if (!replyText.trim()) {
          console.error('[WHATSAPP_BOT_EMPTY_REPLY]', {
            conversationId: conversation.id,
            calledTools,
          });
          replyText = 'Tive um problema técnico agora, já te retorno.';
        }

        // Visibilidade do que o modelo decidiu mesmo se o envio real ao Meta
        // falhar depois (ex.: sem META_ACCESS_TOKEN de produção ainda) --
        // sem isso, uma falha no envio esconderia a resposta computada.
        console.log('[WHATSAPP_BOT_REPLY]', { conversationId: conversation.id, replyText });

        await sendWhatsappText(message.from, conversation.id, replyText, lastCompletion, message.phoneNumberId);
      } catch (innerErr) {
        // Fecha exatamente a lacuna apontada depois da Fase 13: falha aqui
        // não pode virar silêncio. O Meta já recebeu 200 e não reenvia --
        // se essa mensagem de fallback também falhar, não há mais o que
        // fazer localmente, e isso fica registrado no log, não escondido.
        console.error('[WHATSAPP_BOT_FAILURE]', { phone: message.from, error: innerErr });
        await sendWhatsappText(
          message.from,
          conversation.id,
          'Tive um problema técnico agora, já te retorno.',
          undefined,
          message.phoneNumberId
        ).catch((sendErr) => console.error('[WHATSAPP_BOT_FAILURE_DOUBLE]', { phone: message.from, sendErr }));
      }
    }
  } catch (err) {
    console.error('Erro ao processar webhook do WhatsApp:', err);
  }
};

// ---------------------------------------------------------------------------
// FASE 17 -- CAIXA DE ENTRADA
// Estas rotas são AUTENTICADAS apesar do prefixo /webhook/ -- o prefixo é
// histórico (a Fase 13 montou o módulo inteiro sob ele). Mesma observação já
// feita na rota /connect.
// ---------------------------------------------------------------------------

export const listConversations = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const { limit, cursor, view } = inboxQuerySchema.parse(req.query);
    res.json(await getInboxConversations({ limit, cursor, view }));
  } catch (err) {
    next(err);
  }
};

export const listMessages = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const { limit, before } = threadQuerySchema.parse(req.query);
    res.json(await getConversationMessages(Number(req.params.id), { limit, before }));
  } catch (err) {
    next(err);
  }
};

export const replyToConversation = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const { text } = panelReplySchema.parse(req.body);
    const saved = await sendPanelMessage(Number(req.params.id), text, req.user!);
    res.status(201).json(saved);
  } catch (err) {
    // Janela de 24h fechada é 409 com mensagem explícita, não 500 genérico:
    // é a diferença entre a equipe entender o que houve e achar que o sistema
    // quebrou.
    if (err instanceof WindowClosedError) {
      res.status(err.status).json({ error: err.message, windowExpiresAt: err.windowExpiresAt });
      return;
    }
    next(err);
  }
};

export const markRead = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    res.json(await markConversationRead(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
};

export const resumeConversation = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const id = Number(req.params.id);
    const conversation = await resumeConversationService(id);
    await createLog(prisma, {
      userId: req.user?.userId,
      username: req.user?.username ?? 'desconhecido',
      action: 'WHATSAPP_BOT_RESUMED',
      details: { conversationId: id, phone: conversation.phone },
    });
    res.json(conversation);
  } catch (err) {
    next(err);
  }
};

// FASE 15.3 -- ver nota de "não testado ao vivo" em embeddedSignup.service.ts.
export const connectBusinessAccount = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    // Zod como em todo input deste projeto (<modulo>.schema.ts + .parse no
    // controller): ZodError já vira 400 no errorHandler.
    const input = connectWhatsappSchema.parse(req.body);
    const account = await embeddedSignupService.connectBusinessAccount(input, req.user!);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
};

export const getBusinessAccount = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const account = await embeddedSignupService.getActiveBusinessAccount();
    res.json(account);
  } catch (err) {
    next(err);
  }
};

export const disconnectBusinessAccount = async (req: Request, res: Response, next: (err: unknown) => void) => {
  try {
    const id = Number(req.params.id);
    const account = await embeddedSignupService.disconnectBusinessAccount(id, req.user!);
    res.json(account);
  } catch (err) {
    next(err);
  }
};
