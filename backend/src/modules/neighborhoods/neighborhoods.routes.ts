import { Router } from 'express';
import * as neighborhoodsController from './neighborhoods.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.get('/', neighborhoodsController.list);
router.post('/', requireRole(Role.ADM, Role.TI), neighborhoodsController.create);
router.patch('/:id', requireRole(Role.ADM, Role.TI), neighborhoodsController.update);

export default router;
