import prisma from '../config/db';

export class AuditService {
  async getHistory(limit = 500) {
    return prisma.auditLog.findMany({
      take: Math.min(Math.max(limit, 1), 1000),
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: { name: true, role: true },
        },
      },
    });
  }
}

export const auditService = new AuditService();
