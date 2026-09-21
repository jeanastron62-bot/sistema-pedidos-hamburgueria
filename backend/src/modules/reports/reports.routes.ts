import { Router } from 'express';
import { reportsController } from './reports.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

const router = Router();

router.use(requireAuth);

router.get('/summary', requireRole('ADM', 'TI'), reportsController.getSummary);

export default router;
