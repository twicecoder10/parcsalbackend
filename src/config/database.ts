import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error'], // Only log errors - query logs are too verbose
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

export default prisma;

