import { Router } from 'express';
import * as usersController from './users.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole('ADM', 'TI'), usersController.list);
router.patch('/:id/approve', requireRole('ADM', 'TI'), usersController.approve);
router.patch('/:id/role', requireRole('TI'), usersController.updateRole);
router.delete('/:id', requireRole('TI'), usersController.remove);

export default router;
