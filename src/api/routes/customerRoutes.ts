import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

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

export default router;
