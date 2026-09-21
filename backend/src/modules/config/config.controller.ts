import { Request, Response, NextFunction } from 'express';
import * as configService from './config.service';
import { updateConfigSchema, rescheduleCloseSchema, dailyNoticeSchema } from './config.schema';
import { getShiftRange } from '../../utils/shift';
import { isEffectivelyOpen } from '../../utils/trailerSchedule';

// trailerOpen sozinho não diz se o trailer está aberto de verdade -- ele fica
// `true` até alguém fechar explicitamente, mesmo depois que scheduledCloseAt
// já venceu (isEffectivelyOpen é quem decide isso, sem cron -- ver
// trailerSchedule.ts). O painel mostrava só o campo cru e podia exibir
// "aberto" com o bot/site/createOrder já tratando como fechado; toda resposta
// que devolve o SystemConfig agora inclui o valor calculado, pro painel achar
// certo sem precisar recalcular a regra no frontend.
function withEffectivelyOpen(conf: Awaited<ReturnType<typeof configService.getConfig>>) {
  return { ...conf, effectivelyOpen: isEffectivelyOpen(conf) };
}

const broadcastConfig = configService.broadcastConfig;

export const get = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.getConfig();
    res.json(withEffectivelyOpen(conf));
  } catch (error) {
    next(error);
  }
};

export const shiftRange = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const range = getShiftRange();
    res.json({ from: range.from.toISOString(), to: range.to.toISOString() });
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateConfigSchema.parse(req.body);
    const conf = await configService.updateConfig(data, req.user!);
    broadcastConfig(conf);
    res.json(withEffectivelyOpen(conf));
  } catch (error) {
    next(error);
  }
};

export const extendDelivery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.extendDelivery(req.user!);
    broadcastConfig(conf);
    res.json(withEffectivelyOpen(conf));
  } catch (error) {
    next(error);
  }
};

// Fase 11 -- ações dedicadas de abrir/fechar/adiar, acessíveis a
// GARCOM/CHAPISTA/ADM/TI (ver requireRole em config.routes.ts).
export const openTrailer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.openTrailer(req.user!);
    broadcastConfig(conf);
    res.json(withEffectivelyOpen(conf));
  } catch (error) {
    next(error);
  }
};

export const closeTrailer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conf = await configService.closeTrailer(req.user!);
    broadcastConfig(conf);
    res.json(withEffectivelyOpen(conf));
  } catch (error) {
    next(error);
  }
};

export const rescheduleClose = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { closeAt } = rescheduleCloseSchema.parse(req.body);
    const conf = await configService.rescheduleClose(closeAt, req.user!);
    broadcastConfig(conf);
    res.json(withEffectivelyOpen(conf));
  } catch (error) {
    next(error);
  }
};

export const updateDailyNotice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dailyNotice } = dailyNoticeSchema.parse(req.body);
    const conf = await configService.updateDailyNotice(dailyNotice, req.user!);
    broadcastConfig(conf);
    res.json(withEffectivelyOpen(conf));
  } catch (error) {
    next(error);
  }
};
