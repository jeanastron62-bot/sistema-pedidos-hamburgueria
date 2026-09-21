import { Router } from 'express';
import { Role } from '@prisma/client';
import * as whatsappController from './whatsapp.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

const router = Router();

router.get('/', whatsappController.verify);
router.post('/', whatsappController.receive);

// Fase 14.7 -- endpoint mínimo pra destravar uma conversa pausada por
// transferir_para_humano.
router.patch(
  '/conversations/:id/resume',
  requireAuth,
  requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI),
  whatsappController.resumeConversation
);

// Fase 17 -- caixa de entrada de atendimento humano.
//
// Estas rotas são AUTENTICADAS apesar do prefixo /webhook/. O prefixo é
// histórico: a Fase 13 montou o módulo inteiro sob ele porque na época só
// existia o webhook do Meta. Mesma observação já feita na rota /connect.
//
// ENTREGADOR não entra: ele está na rua, o atendimento acontece no trailer.
const ATENDIMENTO = [Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI] as const;

// Substitui GET /conversations/paused (findMany sem take, ordenado por
// updatedAt). Aceita limit=0, que devolve só { total, pending } sem itens --
// é o que os três painéis usam pro contador da aba Atendimento, em vez de
// carregar 20 conversas pra mostrar um selo.
router.get(
  '/conversations',
  requireAuth,
  requireRole(...ATENDIMENTO),
  whatsappController.listConversations
);

router.get(
  '/conversations/:id/messages',
  requireAuth,
  requireRole(...ATENDIMENTO),
  whatsappController.listMessages
);

router.post(
  '/conversations/:id/messages',
  requireAuth,
  requireRole(...ATENDIMENTO),
  whatsappController.replyToConversation
);

router.patch(
  '/conversations/:id/read',
  requireAuth,
  requireRole(...ATENDIMENTO),
  whatsappController.markRead
);

// Fase 15.2/15.3 -- conexão da WABA do cliente via Embedded Signup. ADM/TI,
// mesmo padrão de permissão de config/usuários (não é operação do dia a dia
// do garçom/chapista).
router.post(
  '/connect',
  requireAuth,
  requireRole(Role.ADM, Role.TI),
  whatsappController.connectBusinessAccount
);
router.get(
  '/business-account',
  requireAuth,
  requireRole(Role.ADM, Role.TI),
  whatsappController.getBusinessAccount
);
router.patch(
  '/business-account/:id/disconnect',
  requireAuth,
  requireRole(Role.ADM, Role.TI),
  whatsappController.disconnectBusinessAccount
);

export default router;
