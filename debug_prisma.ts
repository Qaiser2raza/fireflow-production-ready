import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
console.log('Registered Devices fields:', Object.keys((prisma as any).registered_devices.fields || {}));
process.exit(0);
