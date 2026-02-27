import { Prisma } from '@prisma/client';
console.log('Registered Devices Unique Input:', Prisma.Registered_devicesScalarFieldEnum);
// Check the specific unique constraint names
const model = Prisma.dmmf.datamodel.models.find(m => m.name === 'registered_devices');
console.log('Unique constraints:', model?.uniqueFields);
process.exit(0);
