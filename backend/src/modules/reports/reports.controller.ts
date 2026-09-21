import { Request, Response, NextFunction } from 'express';
import { reportsService } from './reports.service';
import { summaryQuerySchema } from './reports.schema';

export const reportsController = {
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const query = summaryQuerySchema.parse(req.query);
      const summary = await reportsService.getSummary(query);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  },
};
