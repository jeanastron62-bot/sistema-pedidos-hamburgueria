import { Router } from 'express';
import * as menuController from './menu.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.get('/', menuController.list);
router.post('/', requireRole(Role.ADM, Role.TI), menuController.create);
router.patch('/:id', requireRole(Role.ADM, Role.TI), menuController.update);
router.patch('/:id/availability', requireRole(Role.ADM, Role.TI, Role.CHAPISTA), menuController.updateAvailability);
router.patch('/:id/archive', requireRole(Role.ADM, Role.TI), menuController.archive);

export default router;
