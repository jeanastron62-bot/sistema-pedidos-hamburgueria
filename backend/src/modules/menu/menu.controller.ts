import { Request, Response, NextFunction } from 'express';
import * as menuService from './menu.service';
import { createMenuItemSchema, updateMenuItemSchema } from './menu.schema';
import { getIO } from '../../socket/socket';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const role = req.user!.role;
    // Só ADM/TI pode ver arquivados
    const canSeeArchived = includeArchived && (role === 'ADM' || role === 'TI');
    
    const items = await menuService.listItems(canSeeArchived);
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createMenuItemSchema.parse(req.body);
    const item = await menuService.createItem(data, req.user!);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const data = updateMenuItemSchema.parse(req.body);
    const item = await menuService.updateItem(id, data, req.user!);
    res.json(item);
  } catch (error) {
    next(error);
  }
};

export const updateAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { available } = req.body;
    const item = await menuService.updateAvailability(id, available, req.user!);
    
    const io = getIO();
    io.of('/staff').emit('menu:availability_changed', { menuItemId: id, available });
    io.of('/public').emit('menu:availability_changed', { menuItemId: id, available });

    res.json(item);
  } catch (error) {
    next(error);
  }
};

export const archive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { archived } = req.body;
    const item = await menuService.archiveItem(id, archived, req.user!);
    res.json(item);
  } catch (error) {
    next(error);
  }
};
