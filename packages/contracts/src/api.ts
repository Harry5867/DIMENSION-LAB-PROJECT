/**
 * Standardized API Response Contract
 * Chuẩn hóa toàn bộ cấu trúc phản hồi HTTP RESTful
 */
export type ApiResponse<T = unknown> = { timestamp: string } & (
  { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } }
);

export interface AuthOptions {
  mode: 'demo' | 'atlas';
  google: boolean;
  registration: boolean;
}

export interface SystemHealth {
  uptime: string;
  memory: {
    rssMb: string;
    heapUsedMb: string;
    heapTotalMb: string;
  };
  database: {
    engine: string;
    connected: boolean;
    latency: string;
    totalDocuments: number;
  };
  cache: {
    memoryEntries: number;
    status: string;
  };
}
