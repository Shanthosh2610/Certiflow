import { Router } from 'express';
import multer from 'multer';
import { batchController } from '../controllers/batch.controller';
import { approvalController } from '../controllers/approval.controller';
import { authenticateUser, requireRoles } from '../middleware/rbac';
import { Role } from '@prisma/client';

const router = Router();

// Configure Multer for in-memory upload processing (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Template download
router.get('/template/download', batchController.getSampleTemplate);

// Spreadsheet validation (dry run, returns row errors without writing to DB)
router.post('/validate-upload', upload.single('file'), batchController.validateSpreadsheet);

// Atomic commit (writes candidates and batch state inside transaction)
router.post(
  '/commit-upload',
  authenticateUser,
  requireRoles(Role.TRAINING_CENTRE),
  batchController.commitUpload
);

// Approval State Machine Routes (Secured with RBAC and Authentication)
router.post('/:id/submit', authenticateUser, approvalController.submitBatch);
router.post('/:id/resubmit', authenticateUser, approvalController.resubmitBatch);
router.post('/:id/review', authenticateUser, approvalController.reviewBatch);

// Standard Batch CRUD
router.get('/overdue', authenticateUser, requireRoles(Role.STATE_OFFICE), batchController.getOverdueBatches);
router.get('/', batchController.getBatches);
router.post(
  '/',
  authenticateUser,
  requireRoles(Role.TRAINING_CENTRE),
  batchController.createBatch
);
router.get('/:id', batchController.getBatchById);

export default router;
