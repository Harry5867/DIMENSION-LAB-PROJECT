/**
 * Standardized API Response Contract
 * Chuẩn hóa toàn bộ cấu trúc phản hồi HTTP RESTful
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

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
