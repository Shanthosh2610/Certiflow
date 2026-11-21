export interface HealthResponse {
  status: 'OK' | 'DEGRADED';
  message: string;
  timestamp: string;
  uptimeSeconds: number;
  responseTimeMs: number;
  components: {
    api: {
      status: string;
      version: string;
      environment: string;
    };
    database: {
      status: 'UP' | 'DOWN';
      latencyMs?: number;
      error?: string;
    };
    redis: {
      status: 'UP' | 'DOWN';
      latencyMs?: number;
      error?: string;
    };
    bullmq: {
      status: 'READY' | 'WAITING';
      error?: string;
    };
  };
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
