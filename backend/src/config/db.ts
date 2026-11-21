import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

try {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
} catch (error) {
  console.warn('[Database] Prisma Client initialization deferred or failed:', error);
  prisma = new PrismaClient();
}

export default prisma;
