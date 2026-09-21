import { Router } from 'express';
import * as configController from './config.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.get('/', configController.get);
router.get('/shift-range', configController.shiftRange);
router.patch('/', requireRole(Role.ADM, Role.TI), configController.update);
router.patch('/extend-delivery', requireRole(Role.ADM, Role.TI), configController.extendDelivery);

// Fase 11 -- abrir/fechar/adiar são acessíveis também a GARCOM/CHAPISTA, não só
// ADM/TI (ver tabela de permissões da fase). Editar o aviso do dia é
// CHAPISTA/ADM/TI. Editar defaultCloseHour/closeCeilingHour/closedWeekday
// continua só ADM/TI, por passar pela rota genérica PATCH / acima.
router.patch('/trailer/open', requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI), configController.openTrailer);
router.patch('/trailer/close', requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI), configController.closeTrailer);
router.patch('/trailer/reschedule-close', requireRole(Role.GARCOM, Role.CHAPISTA, Role.ADM, Role.TI), configController.rescheduleClose);
router.patch('/daily-notice', requireRole(Role.CHAPISTA, Role.ADM, Role.TI), configController.updateDailyNotice);

export default router;
