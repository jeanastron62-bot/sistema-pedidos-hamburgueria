import { Request, Response, NextFunction } from 'express';
import { ordersService } from '../orders/orders.service';
import { listItems } from '../menu/menu.service';
import { listNeighborhoods } from '../neighborhoods/neighborhoods.service';
import { getConfig } from '../config/config.service';
import { createOrderSchema } from '../orders/orders.schema';

export const publicController = {
  async getMenu(req: Request, res: Response, next: NextFunction) {
    try {
      const menu = await listItems(false); // apenas archived: false
      const filtered = menu.map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        description: item.description,
        ingredients: item.ingredients,
        requiredChoice: item.requiredChoice,
        available: item.available
      }));
      res.json(filtered);
    } catch (error) {
      next(error);
    }
  },

  async getNeighborhoods(req: Request, res: Response, next: NextFunction) {
    try {
      const neighborhoods = await listNeighborhoods();
      const active = neighborhoods.filter((n: any) => n.active).map((n: any) => ({
        id: n.id,
        name: n.name,
        deliveryFee: n.deliveryFee
      }));
      res.json(active);
    } catch (error) {
      next(error);
    }
  },

  async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await getConfig();
      res.json({
        trailerOpen: config.trailerOpen,
        scheduledCloseAt: config.scheduledCloseAt,
        deliveryActive: config.deliveryActive,
        deliveryExtendedUntil: config.deliveryExtendedUntil,
        maxTables: config.maxTables,
        contactPhone: config.contactPhone,
        contactInstagram: config.contactInstagram
      });
    } catch (error) {
      next(error);
    }
  },

  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const parsedData = createOrderSchema.parse(req.body);
      // clientOnline = true acionará a trava requiresStaffConfirmation para MESA
      const newOrder = await ordersService.createOrder(parsedData, undefined, undefined, true);
      res.status(201).json(newOrder);
    } catch (error) {
      next(error);
    }
  }
};
