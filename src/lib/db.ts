import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: 'file:/home/z/my-project/db/data.db' } },
    log: [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db