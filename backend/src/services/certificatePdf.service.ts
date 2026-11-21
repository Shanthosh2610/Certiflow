import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface CertificatePdfData {
  certificateNumber: string;
  candidateName: string;
  nationalId: string;
  courseName: string;
  grade: string;
  trainingCentre: string;
  district: string;
  completionDate: string;
  issuedDate: string;
  verificationHash: string;
  verificationUrl: string;
  status: 'ACTIVE' | 'REVOKED';
  revocationReason?: string;
}

export class CertificatePdfService {
  private storageDir: string;

  constructor() {
    this.storageDir = path.resolve(
      process.env.CERTIFICATE_STORAGE_DIR || path.join(__dirname, '..', '..', 'storage', 'certificates')
    );
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Generates an official, tamper-proof landscape A4 PDF certificate.
   */
  async generateCertificatePdf(data: CertificatePdfData): Promise<{ buffer: Buffer; filePath: string }> {
    const filename = `${data.certificateNumber}.pdf`;
    const filePath = path.join(this.storageDir, filename);

    // Generate QR Code PNG Buffer
    const qrBuffer = await QRCode.toBuffer(data.verificationUrl, {
      width: 110,
      margin: 1,
      color: {
        dark: '#14532d', // Dark Forest Green
        light: '#ffffff',
      },
    });

    return new Promise((resolve, reject) => {
      // Landscape A4: 841.89 x 595.28 pt
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 30, bottom: 30, left: 35, right: 35 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
        try {
          fs.writeFileSync(temporaryPath, buffer, { mode: 0o600 });
          fs.renameSync(temporaryPath, filePath);
          resolve({ buffer, filePath });
        } catch (error) {
          if (fs.existsSync(temporaryPath)) {
            fs.unlinkSync(temporaryPath);
          }
          reject(error);
        }
      });
      doc.on('error', (err) => reject(err));

      const pageWidth = 841.89;
      const pageHeight = 595.28;

      // 1. Decorative Outer Border (Emerald)
      doc.lineWidth(4);
      doc.strokeColor('#15803d'); // Emerald 700
      doc.rect(20, 20, pageWidth - 40, pageHeight - 40).stroke();

      // 2. Decorative Inner Border (Gold)
      doc.lineWidth(1.5);
      doc.strokeColor('#d97706'); // Amber/Gold 600
      doc.rect(26, 26, pageWidth - 52, pageHeight - 52).stroke();

      // 3. Subtle Corner Accents
      const drawCorner = (x: number, y: number) => {
        doc.lineWidth(2).strokeColor('#d97706');
        doc.rect(x, y, 16, 16).stroke();
      };
      drawCorner(32, 32);
      drawCorner(pageWidth - 48, 32);
      drawCorner(32, pageHeight - 48);
      drawCorner(pageWidth - 48, pageHeight - 48);

      // 4. Header Titles
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#14532d');
      doc.text('GOVERNMENT OF INDIA • STATE SKILL DEVELOPMENT MISSION', 0, 50, {
        align: 'center',
        width: pageWidth,
      });

      doc.font('Helvetica').fontSize(9).fillColor('#64748b');
      doc.text('NATIONAL SKILLS QUALIFICATION FRAMEWORK (NSQF) RECOGNIZED CREDENTIAL', 0, 66, {
        align: 'center',
        width: pageWidth,
      });

      // Horizontal separator rule
      doc.lineWidth(0.75).strokeColor('#cbd5e1').moveTo(180, 84).lineTo(pageWidth - 180, 84).stroke();

      // 5. Main Title
      doc.font('Helvetica-Bold').fontSize(26).fillColor('#0f172a');
      doc.text('CERTIFICATE OF VOCATIONAL COMPETENCE', 0, 102, {
        align: 'center',
        width: pageWidth,
      });

      // 6. Certificate Body
      doc.font('Helvetica').fontSize(12).fillColor('#475569');
      doc.text('This is to certify that', 0, 145, { align: 'center', width: pageWidth });

      // Candidate Name (Prominent & Large)
      doc.font('Helvetica-Bold').fontSize(24).fillColor('#15803d');
      doc.text(data.candidateName.toUpperCase(), 0, 166, { align: 'center', width: pageWidth });

      // National ID
      doc.font('Helvetica').fontSize(11).fillColor('#64748b');
      doc.text(`National Trainee ID / Aadhaar: ${data.nationalId}`, 0, 198, {
        align: 'center',
        width: pageWidth,
      });

      // Course text
      doc.font('Helvetica').fontSize(12).fillColor('#475569');
      doc.text('has successfully completed the prescribed training programme and state assessment for', 0, 222, {
        align: 'center',
        width: pageWidth,
      });

      // Course Name
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#1e293b');
      doc.text(data.courseName, 0, 242, { align: 'center', width: pageWidth });

      // Training Centre & Grade
      doc.font('Helvetica').fontSize(11).fillColor('#334155');
      doc.text(
        `Conducted at: ${data.trainingCentre} (${data.district} District)  •  Performance Grade: ${data.grade}`,
        0,
        272,
        { align: 'center', width: pageWidth }
      );

      // Date information
      doc.font('Helvetica').fontSize(10).fillColor('#64748b');
      doc.text(
        `Course Completion: ${data.completionDate}  |  Date of Issue: ${data.issuedDate}`,
        0,
        292,
        { align: 'center', width: pageWidth }
      );

      // 7. Revocation Watermark (If Status is REVOKED)
      if (data.status === 'REVOKED') {
        doc.save();
        doc.font('Helvetica-Bold').fontSize(55).fillColor('#ef4444', 0.25);
        doc.rotate(-22, { origin: [pageWidth / 2, pageHeight / 2] });
        doc.text('REVOKED - INVALID CREDENTIAL', 0, pageHeight / 2 - 30, {
          align: 'center',
          width: pageWidth,
        });
        doc.restore();
      }

      // 8. Signatures & QR Code Footer Section
      const footerY = 345;

      // Left Signature: Training Centre
      doc.lineWidth(1).strokeColor('#94a3b8').moveTo(90, footerY + 65).lineTo(260, footerY + 65).stroke();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b');
      doc.text('Training Centre Director', 90, footerY + 70, { width: 170, align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#64748b');
      doc.text(data.trainingCentre, 90, footerY + 84, { width: 170, align: 'center' });

      // Center: QR Code with Verification Instructions
      doc.image(qrBuffer, pageWidth / 2 - 45, footerY - 5, { width: 90, height: 90 });
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#15803d');
      doc.text('SCAN TO VERIFY', 0, footerY + 90, { width: pageWidth, align: 'center' });
      doc.font('Helvetica').fontSize(7).fillColor('#64748b');
      doc.text('Instant live authentication via state portal', 0, footerY + 101, {
        width: pageWidth,
        align: 'center',
      });

      // Right Signature: State Skill Authority
      doc.lineWidth(1).strokeColor('#94a3b8').moveTo(pageWidth - 260, footerY + 65).lineTo(pageWidth - 90, footerY + 65).stroke();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b');
      doc.text('Farah Siddiqui', pageWidth - 260, footerY + 70, { width: 170, align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#64748b');
      doc.text('Director, State Skill Mission', pageWidth - 260, footerY + 84, { width: 170, align: 'center' });

      // 9. Bottom Security & Cryptographic Integrity Strip
      const stripY = 510;
      doc.lineWidth(0.5).strokeColor('#e2e8f0').moveTo(40, stripY).lineTo(pageWidth - 40, stripY).stroke();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155');
      doc.text(`Official Certificate ID: ${data.certificateNumber}`, 45, stripY + 6);

      doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
      doc.text(`Verify URL: ${data.verificationUrl}`, 45, stripY + 18);

      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
      doc.text(`Cryptographic SHA-256 Fingerprint: ${data.verificationHash}`, 45, stripY + 30, {
        width: pageWidth - 90,
      });

      doc.end();
    });
  }

  getFilePath(certificateNumber: string): string {
    if (!/^[A-Za-z0-9-]+$/.test(certificateNumber)) {
      throw new Error('Invalid certificate number.');
    }
    return path.join(this.storageDir, `${certificateNumber}.pdf`);
  }
}

export const certificatePdfService = new CertificatePdfService();
