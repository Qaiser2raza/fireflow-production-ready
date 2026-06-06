import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.tables.findMany({ take: 5, select: { id: true, name: true } })
    .then(tables => tables.forEach(t => console.log(t.id, t.name)))
    .finally(() => p.$disconnect());