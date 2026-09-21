import { Request, Response, NextFunction } from 'express';
import * as neighborhoodsService from './neighborhoods.service';
import { createNeighborhoodSchema, updateNeighborhoodSchema } from './neighborhoods.schema';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await neighborhoodsService.listNeighborhoods();
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createNeighborhoodSchema.parse(req.body);
    const item = await neighborhoodsService.createNeighborhood(data, req.user!);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const data = updateNeighborhoodSchema.parse(req.body);
    const item = await neighborhoodsService.updateNeighborhood(id, data, req.user!);
    res.json(item);
  } catch (error) {
    next(error);
  }
};
