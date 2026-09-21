import { Router } from 'express';
import { publicController } from './public.controller';
import { publicGetLimiter, publicOrdersLimiter } from '../../middleware/rateLimit';

const router = Router();

router.get('/menu', publicGetLimiter, publicController.getMenu);
router.get('/neighborhoods', publicGetLimiter, publicController.getNeighborhoods);
router.get('/config', publicGetLimiter, publicController.getConfig);

router.post('/orders', publicOrdersLimiter, publicController.createOrder);

export default router;
