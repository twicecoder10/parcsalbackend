import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error'], // Only log errors - query logs are too verbose
});

export default prisma;

