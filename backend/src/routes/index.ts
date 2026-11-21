import { Router } from 'express';
import healthRoutes from './health.routes';
import batchRoutes from './batch.routes';
import certificateRoutes from './certificate.routes';
import auditRoutes from './audit.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/batches', batchRoutes);
router.use('/certificates', certificateRoutes);
router.use('/public/verify', certificateRoutes);
router.use('/audit-logs', auditRoutes);

export default router;
