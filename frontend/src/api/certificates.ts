import { Certificate } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface PublicCertificateVerification {
  certificateNumber: string;
  status: 'VALID' | 'CANCELLED' | 'INVALID';
  candidateName?: string;
  courseName?: string;
  trainingCentre?: string;
  completionDate?: string;
  issuedAt?: string;
  cancelledAt?: string | null;
}

export async function verifyCertificateApi(
  certificateNumber: string
): Promise<PublicCertificateVerification> {
  const response = await fetch(
    `${API_BASE}/api/certificates/verify/${encodeURIComponent(certificateNumber)}`
  );
  const data = await response.json();

  if (response.status === 404 && data.status === 'INVALID') {
    return { certificateNumber, status: 'INVALID' };
  }
  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Unable to verify this certificate right now');
  }

  return data.certificate;
}

export async function getCertificatesApi(): Promise<Certificate[]> {
  const response = await fetch(`${API_BASE}/api/certificates`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Failed to load issued certificates');
  }

  return data.certificates;
}

export async function retryCertificateDeliveryApi(certificateNumber: string, userId: string) {
  const response = await fetch(
    `${API_BASE}/api/certificates/${encodeURIComponent(certificateNumber)}/delivery/retry`,
    {
      method: 'POST',
      headers: { 'x-user-id': userId },
    }
  );
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Failed to retry certificate delivery');
  }

  return data.delivery as { status: Certificate['deliveryStatus']; attempts: number };
}

export async function revokeCertificateApi(
  certificateNumber: string,
  reason: string,
  userId: string
) {
  const response = await fetch(
    `${API_BASE}/api/certificates/${encodeURIComponent(certificateNumber)}/revoke`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ reason }),
    }
  );
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Failed to cancel certificate');
  }

  return data.certificate;
}
