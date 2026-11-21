const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface ValidationApiResponse {
  success: boolean;
  validation: {
    isValid: boolean;
    totalRows: number;
    validRowsCount: number;
    errorRowsCount: number;
    errors: { row: number; field: string; message: string; value: any }[];
    preview: {
      row: number;
      fullName: string;
      phone: string;
      email?: string;
      nationalId: string;
      grade: string;
      completionDate: string;
      errors: string[];
    }[];
  };
  error?: { message: string };
}

export interface OverdueBatch {
  id: string;
  batchNumber: string;
  courseName: string;
  status: string;
  updatedAt: string;
  candidateCount: number;
  district: { name: string };
  hoursWaiting: number;
}

export async function createBatchApi(courseName: string, userId: string) {
  const response = await fetch(`${API_BASE}/api/batches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({ courseName }),
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Failed to create batch');
  }

  return data.batch;
}

export async function getOverdueBatchesApi(userId: string) {
  const response = await fetch(`${API_BASE}/api/batches/overdue`, {
    headers: { 'x-user-id': userId },
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Failed to load overdue batches');
  }

  return {
    thresholdHours: data.thresholdHours as number,
    batches: data.batches as OverdueBatch[],
  };
}

export async function validateSpreadsheetFile(file: File, batchId?: string): Promise<ValidationApiResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (batchId) {
    formData.append('batchId', batchId);
  }

  const response = await fetch(`${API_BASE}/api/batches/validate-upload`, {
    method: 'POST',
    body: formData,
  });

  return response.json();
}

export async function commitBatchUploadApi(batchId: string, candidates: any[], userId?: string) {
  const response = await fetch(`${API_BASE}/api/batches/commit-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
    },
    body: JSON.stringify({
      batchId,
      candidates,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to commit batch to database');
  }

  return data;
}

export async function reviewBatchApi(
  batchId: string,
  action: 'APPROVED' | 'REJECTED' | 'RETURNED',
  remarks: string,
  expectedVersion?: number,
  userId?: string
) {
  const response = await fetch(`${API_BASE}/api/batches/${batchId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
    },
    body: JSON.stringify({
      action,
      remarks,
      expectedVersion,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to record review decision');
  }

  return data;
}

export async function submitBatchApi(batchId: string, userId?: string) {
  const response = await fetch(`${API_BASE}/api/batches/${batchId}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to submit batch');
  }

  return data;
}

export async function resubmitBatchApi(batchId: string, userId?: string) {
  const response = await fetch(`${API_BASE}/api/batches/${batchId}/resubmit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to resubmit batch');
  }

  return data;
}

export function getTemplateDownloadUrl(): string {
  return `${API_BASE}/api/batches/template/download`;
}
