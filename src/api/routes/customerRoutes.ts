import { Router } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { z } from 'zod';
import { journalEntryService, interpretCustomerBalance } from '../services/JournalEntryService';
import { AccountingService } from '../services/AccountingService';
import { Decimal } from '@prisma/client/runtime/library';

import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);
const accounting = new AccountingService();
// Schema validation
const customerSchema = z.object({
    name: z.string().optional(),
    phone: z.string(),
    address: z.string().optional(),
    notes: z.string().optional(),
    restaurant_id: z.string(),
    credit_enabled: z.boolean().optional(),
    credit_limit: z.number().optional()
});

const addressSchema = z.object({
    label: z.string(),
    full_address: z.string(),
    landmarks: z.string().optional(),
    is_default: z.boolean().optional()
});

// Search customers by phone or name
router.get('/customers', async (req, res) => {
    try {
        const { phone, query } = req.query;
        const rId = req.restaurantId; // SaaS Security

        if (!rId) {
            return res.status(401).json({ error: 'Unauthorized: Missing restaurant context' });
        }

        const customers = await prisma.customers.findMany({
            where: {
                restaurant_id: String(rId),
                OR: [
                    { phone: { contains: String(phone || query || ''), mode: 'insensitive' } },
                    { name: { contains: String(query || ''), mode: 'insensitive' } }
                ]
            },
            include: {
                addresses: {
                    orderBy: { created_at: 'desc' }
                }
            },
            take: 10
        });

        res.json(customers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create customer
router.post('/customers', async (req, res) => {
    try {
        const validated = customerSchema.omit({ restaurant_id: true }).parse(req.body);
        const restaurant_id = req.restaurantId!; // SaaS Security

        const customer = await prisma.customers.upsert({
            where: {
                restaurant_id_phone: {
                    restaurant_id,
                    phone: validated.phone
                }
            },
            update: {
                name: validated.name,
                address: validated.address,
                notes: validated.notes,
                credit_enabled: validated.credit_enabled,
                credit_limit: validated.credit_limit !== undefined ? new Decimal(String(validated.credit_limit)) : undefined
            },
            create: {
                restaurant_id,
                phone: validated.phone,
                name: validated.name,
                address: validated.address,
                notes: validated.notes,
                credit_enabled: validated.credit_enabled || false,
                credit_limit: new Decimal(String(validated.credit_limit || 0))
            }
        });

        // If initial address provided, create it as default
        if (validated.address) {
            const existingDefault = await prisma.customer_addresses.findFirst({
                where: { customer_id: customer.id, is_default: true }
            });

            if (!existingDefault) {
                await prisma.customer_addresses.create({
                    data: {
                        customer_id: customer.id,
                        label: 'Primary',
                        full_address: validated.address,
                        is_default: true
                    }
                });
            }
        }

        res.json(customer);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Get detailed customer info
router.get('/customers/:id', async (req, res) => {
    try {
        const customer = await prisma.customers.findFirst({
            where: {
                id: req.params.id,
                restaurant_id: req.restaurantId // SaaS Security
            },
            include: {
                addresses: true,
                orders: {
                    where: { is_deleted: false },
                    take: 5,
                    orderBy: { created_at: 'desc' }
                }
            }
        });

        if (!customer) return res.status(404).json({ error: 'Customer not found or unauthorized' });
        res.json(customer);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add customer address
router.post('/customers/:id/addresses', async (req, res) => {
    try {
        const { id } = req.params;
        const validated = addressSchema.parse(req.body);

        // Security check BEFORE writing: verify customer belongs to this restaurant
        const customerVerify = await prisma.customers.findFirst({
            where: { id, restaurant_id: req.restaurantId }
        });
        if (!customerVerify) return res.status(403).json({ error: 'Unauthorized' });

        if (validated.is_default) {
            await prisma.customer_addresses.updateMany({
                where: { customer_id: id },
                data: { is_default: false }
            });
        }

        const address = await prisma.customer_addresses.create({
            data: {
                customer_id: id,
                label: validated.label,
                full_address: validated.full_address,
                landmarks: validated.landmarks,
                is_default: validated.is_default || false
            }
        });

        res.json(address);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Set default address
router.patch('/customers/:id/addresses/:addressId/default', async (req, res) => {
    try {
        const { id, addressId } = req.params;

        await prisma.$transaction(async (tx) => {
            // Verify ownership first
            const owner = await tx.customers.findFirst({
                where: { id, restaurant_id: req.restaurantId }
            });
            if (!owner) throw new Error('Unauthorized');

            await tx.customer_addresses.updateMany({
                where: { customer_id: id },
                data: { is_default: false }
            });
            await tx.customer_addresses.update({
                where: { id: addressId },
                data: { is_default: true }
            });
        });

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete address
router.delete('/customers/:id/addresses/:addressId', async (req, res) => {
    try {
        const { id, addressId } = req.params;

        // Verify ownership
        const customer = await prisma.customers.findFirst({
            where: { id, restaurant_id: req.restaurantId }
        });
        if (!customer) return res.status(403).json({ error: 'Unauthorized' });

        await prisma.customer_addresses.delete({
            where: { id: addressId }
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete customer
router.delete('/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await prisma.customers.deleteMany({
            where: {
                id,
                restaurant_id: req.restaurantId // SaaS Security
            }
        });

        if (result.count === 0) return res.status(404).json({ error: 'Customer not found or unauthorized' });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/customers/:id/balance
 * Returns current account balance with bilingual interpretation
 */
router.get('/customers/:id/balance', async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { id: req.params.id, restaurant_id: req.restaurantId }
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const balance = await accounting.getCustomerBalance(
      req.restaurantId!,
      req.params.id
    );
    const interpretation = interpretCustomerBalance(balance);

    res.json({
      success: true,
      customer_id: req.params.id,
      balance: balance.toString(),
      credit_limit: customer.credit_limit?.toString() || '0',
      credit_enabled: customer.credit_enabled,
      interpretation,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/customers/:id/payment
 * Record a payment against customer account
 * Works for clearing debt AND creating advance deposit
 */
router.post('/customers/:id/payment', async (req, res) => {
  try {
    const { amount, paymentMethod, orderId } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }

    const customer = await prisma.customers.findFirst({
      where: { id: req.params.id, restaurant_id: req.restaurantId }
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const method = (paymentMethod || 'CASH') as 'CASH' | 'CARD';
    const referenceId = orderId
      ? `cust-pay-${orderId}`
      : `cust-${req.params.id}-${Date.now()}`;

    // Record in ledger_entries (simple ledger)
    await accounting.recordCustomerPayment({
      restaurantId: req.restaurantId!,
      customerId: req.params.id,
      amount: Number(amount),
      paymentMethod: method,
      processedBy: req.staffId!,
      orderId,
    });

    // Record in journal_entries (double-entry)
    await journalEntryService.recordCustomerPaymentJournal({
      restaurantId: req.restaurantId!,
      customerId: req.params.id,
      amount: Number(amount),
      paymentMethod: method,
      referenceId,
      processedBy: req.staffId,
    }, prisma);

    // Return updated balance
    const newBalance = await journalEntryService.getCustomerBalance(
      req.restaurantId!,
      req.params.id
    );

    res.json({
      success: true,
      new_balance: newBalance.toString(),
      interpretation: interpretCustomerBalance(newBalance),
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * PATCH /api/customers/:id/credit
 * Enable/disable credit or update credit limit for a customer
 */
router.patch('/customers/:id/credit', async (req, res) => {
  try {
    const { credit_enabled, credit_limit } = req.body;

    const updated = await prisma.customers.update({
      where: {
        id: req.params.id,
        restaurant_id: req.restaurantId!
      },
      data: {
        ...(credit_enabled !== undefined && { credit_enabled }),
        ...(credit_limit !== undefined && {
          credit_limit: new Decimal(String(credit_limit))
        }),
      }
    });

    res.json({ success: true, customer: updated });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * GET /api/customers/:id/statement
 * Full account statement with all orders and ledger entries
 */
router.get('/customers/:id/statement', async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { id: req.params.id, restaurant_id: req.restaurantId }
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const [orders, ledgerEntries, balance] = await Promise.all([
      prisma.orders.findMany({
        where: {
          is_deleted: false,
          customer_id: req.params.id,
          restaurant_id: req.restaurantId!,
        },
        select: {
          id: true, order_number: true, total: true,
          payment_status: true, status: true,
          created_at: true, type: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.customer_ledgers.findMany({
        where: {
          restaurant_id: req.restaurantId!,
          customer_id: req.params.id,
        },
        orderBy: { created_at: 'desc' },
      }),
      journalEntryService.getCustomerBalance(req.restaurantId!, req.params.id),
    ]);

    res.json({
      success: true,
      customer,
      orders,
      ledger_entries: ledgerEntries.map(l => ({
        ...l,
        amount: l.amount?.toString() || '0',
        balance_after: l.balance_after?.toString() || '0'
      })),
      current_balance: balance.toString(),
      interpretation: interpretCustomerBalance(balance),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/customers/:id/topup
 * Add advance credit/top-up to customer account
 */
router.post('/customers/:id/topup', async (req, res) => {
    try {
        const { amount, paymentMethod } = req.body;
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Valid amount required' });
        }

        const customer = await prisma.customers.findFirst({
            where: { id: req.params.id, restaurant_id: req.restaurantId }
        });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        await accounting.topUpAccount({
            restaurantId: req.restaurantId!,
            customerId: req.params.id,
            amount: Number(amount),
            paymentMethod: (paymentMethod || 'CASH') as 'CASH' | 'CARD',
            processedBy: req.staffId!
        });

        // Step 2: Record in journal_entries (double-entry)
        await journalEntryService.recordCustomerPaymentJournal({
            restaurantId: req.restaurantId!,
            customerId: req.params.id,
            amount: Number(amount),
            paymentMethod: (paymentMethod || 'CASH') as 'CASH' | 'CARD',
            referenceId: `topup-${req.params.id}-${Date.now()}`,
            processedBy: req.staffId!,
        }, prisma);

        // Return updated balance
        const newBalance = await accounting.getCustomerBalance(req.restaurantId!, req.params.id);
        
        res.json({ 
            success: true, 
            new_balance: newBalance.toString(),
            interpretation: interpretCustomerBalance(newBalance)
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/customers/:id/charge
 * Directly charge an amount to customer's account (e.g. from POS)
 */
router.post('/customers/:id/charge', async (req, res) => {
  try {
    const { amount, orderId, description } = req.body;
    
    if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Valid amount required' });
    }

    const customer = await prisma.customers.findFirst({
      where: { id: req.params.id, restaurant_id: req.restaurantId }
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    // Step 1: Credit Limit Guard (A2)
    const limit = new Decimal(customer.credit_limit || 0);
    if (limit.gt(0)) {
        const currentBalance = await accounting.getCustomerBalance(req.restaurantId!, req.params.id);
        const newTotal = currentBalance.plus(new Decimal(amount.toString()));
        if (newTotal.gt(limit)) {
            return res.status(400).json({ 
                error: `Credit limit exceeded. Remaining limit: ${limit.minus(currentBalance).toString()}, Requested: ${amount}` 
            });
        }
    }

    // Use AccountingService to post the charge
    if (orderId) {
        // Link customer to order
        await prisma.orders.update({
            where: { id: orderId },
            data: { customer_id: req.params.id }
        });
        
        // Explicitly create a CREDIT transaction for AccountingService to detect
        await prisma.transactions.create({
            data: {
                restaurant_id: req.restaurantId,
                order_id: orderId,
                amount: Number(amount),
                payment_method: 'CREDIT',
                status: 'PAID',
                transaction_ref: `KHATA-${Date.now()}`
            }
        });
        await accounting.recordOrderSale(orderId);
    } else {
        await accounting.recordManualCharge({
            restaurantId: req.restaurantId!,
            customerId: req.params.id,
            amount: Number(amount),
            description: description || `Manual POS Charge`,
            processedBy: req.staffId!
        });
    }

    // Return updated balance so frontend can confirm
    const newBalance = await accounting.getCustomerBalance(req.restaurantId!, req.params.id);
    res.json({ success: true, newBalance: newBalance.toString(), interpretation: `Outstanding: Rs. ${newBalance.toString()}` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
