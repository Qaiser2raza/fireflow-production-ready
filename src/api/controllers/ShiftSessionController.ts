import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ShiftSessionService } from '../services/finance/ShiftSessionService';

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

function money(value: unknown, field: string): Decimal {
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`INVALID_${field}`);
  const result = new Decimal(value);
  if (!result.isFinite() || result.isNegative() || result.decimalPlaces() > 2) throw new Error(`INVALID_${field}`);
  return result;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max) throw new Error(`INVALID_${field}`);
  return value.trim() || undefined;
}

function businessDate(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_DATE');
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.valueOf())) throw new Error('INVALID_DATE');
  return result;
}

export class ShiftSessionController {
  private readonly shifts: ShiftSessionService;
  constructor(prisma: PrismaClient) {
    this.shifts = new ShiftSessionService(prisma);
    this.openShift = this.openShift.bind(this); this.closeShift = this.closeShift.bind(this);
    this.getActive = this.getActive.bind(this); this.list = this.list.bind(this);
    this.getById = this.getById.bind(this); this.getSettings = this.getSettings.bind(this); this.updateSettings = this.updateSettings.bind(this);
  }

  private requireTenant(req: Request): { restaurantId: string; staffId: string } {
    if (!req.restaurantId || !req.staffId) throw new Error('AUTH_REQUIRED');
    return { restaurantId: req.restaurantId, staffId: req.staffId };
  }
  private isManager(req: Request) { return MANAGER_ROLES.includes((req.role || '').toUpperCase()); }
  private sendError(res: Response, error: any) {
    const code = error?.message || 'SHIFT_ERROR';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'SHIFT_ALREADY_OPEN' ? 409 : code === 'ACTIVE_SHIFT_NOT_FOUND' ? 404 : code.startsWith('INVALID_') ? 422 : 500;
    res.status(status).json({ error: code });
  }

  async openShift(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isManager(req)) { res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS' }); return; }
      const { restaurantId, staffId } = this.requireTenant(req);
      const shift = await this.shifts.openShift({ restaurantId, openedBy: staffId, openingFloat: money(req.body.opening_float, 'OPENING_FLOAT'), terminalId: optionalText(req.body.terminal_id, 'TERMINAL_ID', 100) });
      res.status(201).json({ shift });
    } catch (error) { this.sendError(res, error); }
  }

  async closeShift(req: Request, res: Response): Promise<void> {
    try {
      const { restaurantId, staffId } = this.requireTenant(req);
      const shift = await this.shifts.getShift(restaurantId, req.body.shift_id);
      if (!shift || shift.status !== 'OPEN') { res.status(404).json({ error: 'ACTIVE_SHIFT_NOT_FOUND' }); return; }
      if (!this.isManager(req) && shift.opened_by !== staffId) { res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS' }); return; }
      const closed = await this.shifts.closeShift({ restaurantId, shiftId: shift.id, closedBy: staffId, actualCash: money(req.body.actual_cash, 'ACTUAL_CASH'), notes: optionalText(req.body.notes, 'NOTES', 4000), terminalId: optionalText(req.body.terminal_id, 'TERMINAL_ID', 100) });
      res.json({ shift: closed });
    } catch (error) { this.sendError(res, error); }
  }

  async getActive(req: Request, res: Response): Promise<void> {
    try { const { restaurantId } = this.requireTenant(req); res.json({ shift: await this.shifts.getActiveShift(restaurantId) }); } catch (error) { this.sendError(res, error); }
  }
  async list(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isManager(req)) { res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS' }); return; }
      const { restaurantId } = this.requireTenant(req); res.json({ shifts: await this.shifts.listShifts(restaurantId, businessDate(req.query.from), businessDate(req.query.to)) });
    } catch (error) { this.sendError(res, error); }
  }
  async getById(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isManager(req)) { res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS' }); return; }
      const { restaurantId } = this.requireTenant(req); const shift = await this.shifts.getShift(restaurantId, req.params.shiftId);
      if (!shift) { res.status(404).json({ error: 'SHIFT_NOT_FOUND' }); return; } res.json({ shift });
    } catch (error) { this.sendError(res, error); }
  }
  async getSettings(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isManager(req)) { res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS' }); return; }
      const { restaurantId } = this.requireTenant(req);
      const settings = await this.shifts.getSettings(restaurantId);
      if (!settings) { res.status(404).json({ error: 'RESTAURANT_NOT_FOUND' }); return; }
      res.json({ settings });
    } catch (error) { this.sendError(res, error); }
  }
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isManager(req)) { res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS' }); return; }
      const { restaurantId } = this.requireTenant(req); const settings = await this.shifts.updateBoundaries(restaurantId, req.body.day_start, req.body.day_end); res.json({ settings });
    } catch (error) { this.sendError(res, error); }
  }
}
