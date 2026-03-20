import { Decimal } from '@prisma/client/runtime/library';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { authMiddleware } from '../middleware/authMiddleware';
import { AccountingService } from '../services/AccountingService';
import { journalEntryService } from '../services/JournalEntryService';

const router = Router();
router.use(authMiddleware);
const prisma = new PrismaClient();
const accounting = new AccountingService();

// Schema validation
const customerSchema = z.object({
    name: z.string().optional(),
    phone: z.string(),
    address: z.string().optional(),
    notes: z.string().optional(),
    restaurant_id: z.string()
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
                notes: validated.notes
            },
            create: {
                restaurant_id,
                phone: validated.phone,
                name: validated.name,
                address: validated.address,
                notes: validated.notes
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

        // Final sanity check: Verify customer belongs to restaurant
        const customerVerify = await prisma.customers.findFirst({
            where: { id, restaurant_id: req.restaurantId }
        });
        if (!customerVerify) throw new Error('Unauthorized');

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
 * Returns net Khata balance + bilingual interpretation
 */
router.get('/customers/:id/balance', async (req, res) => {
    try {
        const balance = await journalEntryService.getCustomerBalance(req.restaurantId!, req.params.id);
        const interpretation = journalEntryService.interpretCustomerBalance(balance);
        res.json({ success: true, balance: Number(balance), ...interpretation });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/customers/:id/payment
 * Processes a Khata payment (Cash/Bank)
 */
router.post('/customers/:id/payment', async (req, res) => {
    try {
        const { amount, method, notes } = req.body;
        if (!amount || amount <= 0) throw new Error('Invalid amount');

        await accounting.recordCustomerPayment({
            restaurantId: req.restaurantId!,
            customerId: req.params.id,
            amount: new Decimal(amount),
            method: method || 'CASH',
            processedBy: req.staffId || 'SYSTEM',
            referenceId: req.params.id, // Using customer ID as ref if no transaction provided
            notes: notes
        });

        res.json({ success: true, message: 'Payment recorded successfully' });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * PATCH /api/customers/:id/credit
 * Updates credit limit and status
 */
router.patch('/customers/:id/credit', async (req, res) => {
    try {
        const { credit_limit, credit_enabled } = req.body;
        const customer = await prisma.customers.update({
            where: { id: req.params.id },
            data: {
                credit_limit: credit_limit !== undefined ? new Decimal(credit_limit) : undefined,
                credit_enabled: credit_enabled !== undefined ? credit_enabled : undefined
            }
        });
        res.json({ success: true, customer });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/customers/:id/statement
 * Returns last 50 ledger entries for this customer
 */
router.get('/customers/:id/statement', async (req, res) => {
    try {
        const entries = await prisma.ledger_entries.findMany({
            where: {
                restaurant_id: req.restaurantId!,
                account_id: req.params.id
            },
            orderBy: { created_at: 'desc' },
            take: 50
        });
        res.json({ success: true, entries });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
