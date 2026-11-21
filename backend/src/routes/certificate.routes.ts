import { Router } from 'express';
import { certificateController } from '../controllers/certificate.controller';
import { authenticateUser } from '../middleware/rbac';

const router = Router();

// Public certificate lookup by number (No login required)
router.get('/verify/:certificateNumber', certificateController.getCertificateByNumber);

// Retry certificate issuance and repair missing PDFs after final approval
router.post('/batches/:batchId/issue', authenticateUser, certificateController.issueBatch);

// Download certificate PDF (Direct link accessible via QR code or download button)
router.get('/:certificateNumber/download', certificateController.downloadPdf);

// Retry a delivery after all automatic attempts have failed
router.post('/:certificateNumber/delivery/retry', authenticateUser, certificateController.retryDelivery);

// List certificates
router.get('/', certificateController.getCertificates);
router.get('/:certificateNumber', certificateController.getCertificateByNumber);

// Revoke certificate (State Office authority)
router.post('/:certificateNumber/revoke', authenticateUser, certificateController.revokeCertificate);

export default router;
