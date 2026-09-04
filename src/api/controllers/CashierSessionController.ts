import { Request, Response } from 'express';
import { FinanceStatus } from '@prisma/client';
import { CashierSessionService } from '../services/finance/CashierSessionService';

const FINANCE_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

function parseDate(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_DATE');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new Error('INVALID_DATE');
  return date;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value;
}

export class CashierSessionController {
  constructor(private readonly cashierService: typeof CashierSessionService = CashierSessionService) {
    this.createFinanceEntry = this.createFinanceEntry.bind(this);
    this.confirmFinanceEntry = this.confirmFinanceEntry.bind(this);
    this.rejectFinanceEntry = this.rejectFinanceEntry.bind(this);
    this.getFinanceReport = this.getFinanceReport.bind(this);
    this.getLatestFinanceEntry = this.getLatestFinanceEntry.bind(this);
  }

  private tenant(req: Request) {
    if (!req.restaurantId || !req.staffId) throw new Error('AUTH_REQUIRED');
    return { restaurantId: req.restaurantId, staffId: req.staffId };
  }
  private allowed(req: Request) { return FINANCE_ROLES.includes((req.role || '').toUpperCase()); }
  private error(res: Response, error: any) {
    const code = error?.message || 'FINANCE_ENTRY_ERROR';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'FINANCE_MANAGER_REQUIRED' ? 403 : code === 'CLOSED_SHIFT_NOT_FOUND' || code === 'FINANCE_ENTRY_NOT_FOUND' ? 404 : code === 'PENDING_FINANCE_ENTRY_EXISTS' || code === 'FINANCE_ENTRY_ALREADY_CONFIRMED' ? 409 : code.startsWith('INVALID_') || code === 'REJECTION_REASON_REQUIRED' || code === 'FINANCE_ENTRY_NOT_ACTIONABLE' ? 422 : 500;
    res.status(status).json({ error: code });
  }
  private requireFinanceRole(req: Request, res: Response) {
    if (this.allowed(req)) return true;
    res.status(403).json({ error: 'FINANCE_MANAGER_REQUIRED' });
    return false;
  }

  async createFinanceEntry(req: Request, res: Response): Promise<void> {
    try { if (!this.requireFinanceRole(req, res)) return; const { restaurantId } = this.tenant(req); res.status(201).json({ entry: await this.cashierService.createFinanceEntry(restaurantId, identifier(req.body.shift_id, 'INVALID_SHIFT_ID')) }); } catch (error) { this.error(res, error); }
  }
  async confirmFinanceEntry(req: Request, res: Response): Promise<void> {
    try { if (!this.requireFinanceRole(req, res)) return; const { restaurantId, staffId } = this.tenant(req); res.json({ entry: await this.cashierService.confirmFinanceEntry(restaurantId, identifier(req.body.finance_entry_id, 'INVALID_FINANCE_ENTRY_ID'), staffId) }); } catch (error) { this.error(res, error); }
  }
  async rejectFinanceEntry(req: Request, res: Response): Promise<void> {
    try { if (!this.requireFinanceRole(req, res)) return; const { restaurantId, staffId } = this.tenant(req); const reason = identifier(req.body.reason, 'REJECTION_REASON_REQUIRED'); res.json(await this.cashierService.rejectFinanceEntry(restaurantId, identifier(req.body.finance_entry_id, 'INVALID_FINANCE_ENTRY_ID'), staffId, reason)); } catch (error) { this.error(res, error); }
  }
  async getFinanceReport(req: Request, res: Response): Promise<void> {
    try {
      if (!this.requireFinanceRole(req, res)) return; const { restaurantId } = this.tenant(req);
      const requestedStatus = req.query.status;
      if (requestedStatus !== undefined && (typeof requestedStatus !== 'string' || !Object.values(FinanceStatus).includes(requestedStatus as FinanceStatus))) throw new Error('INVALID_FINANCE_STATUS');
      res.json({ entries: await this.cashierService.getFinanceReport(restaurantId, parseDate(req.query.from), parseDate(req.query.to), requestedStatus as FinanceStatus | undefined) });
    } catch (error) { this.error(res, error); }
  }
  async getLatestFinanceEntry(req: Request, res: Response): Promise<void> {
    try { if (!this.requireFinanceRole(req, res)) return; const { restaurantId } = this.tenant(req); res.json({ entry: await this.cashierService.getLatestFinanceEntry(restaurantId, identifier(req.params.shiftId, 'INVALID_SHIFT_ID')) }); } catch (error) { this.error(res, error); }
  }
}
