import { Router } from 'express';
import * as logsController from './logs.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole('TI'), logsController.list);
router.get('/export', requireRole('TI'), logsController.exportLogs);

export default router;
