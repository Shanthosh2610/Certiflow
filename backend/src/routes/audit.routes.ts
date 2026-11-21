import { Router } from 'express';
import { Role } from '@prisma/client';
import { auditController } from '../controllers/audit.controller';
import { authenticateUser, requireRoles } from '../middleware/rbac';

const router = Router();

router.get('/', authenticateUser, requireRoles(Role.STATE_OFFICE), auditController.getHistory);

export default router;
