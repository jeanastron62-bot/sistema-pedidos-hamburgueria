import { Router } from 'express';
import { ordersController } from './orders.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

const router = Router();

// Todas as rotas de pedido requerem autenticação
router.use(requireAuth);

router.get('/', ordersController.getOrders);

router.post('/', 
  requireRole('GARCOM', 'CHAPISTA', 'ADM', 'TI'),
  ordersController.createOrder
);

router.patch('/:id/status',
  requireRole('GARCOM', 'CHAPISTA', 'ENTREGADOR', 'ADM', 'TI'),
  ordersController.updateStatus
);

router.patch('/:id/confirm', 
  requireRole('GARCOM', 'CHAPISTA', 'ADM', 'TI'),
  ordersController.confirmOrder
);

router.patch('/:id/accept', 
  requireRole('ENTREGADOR'),
  ordersController.acceptDelivery
);

router.patch('/:id/problem', 
  requireRole('ENTREGADOR'),
  ordersController.reportProblem
);

export default router;
