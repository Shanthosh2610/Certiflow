import { Role } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface AuditHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  timestamp: string;
  details: Record<string, unknown> | null;
  user: { name: string; role: Role } | null;
}

export async function getAuditHistoryApi(userId: string): Promise<AuditHistoryEntry[]> {
  const response = await fetch(`${API_BASE}/api/audit-logs`, {
    headers: { 'x-user-id': userId },
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Failed to load audit history');
  }

  return data.logs;
}
