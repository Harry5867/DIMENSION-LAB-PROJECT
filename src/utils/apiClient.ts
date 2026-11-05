import { getErrorMessage } from './typeGuards';

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Token xác thực mặc định (môi trường dev cấp quyền admin để chạy mượt mà)
let activeAuthToken: string = 'admin_token';

export function setAuthToken(token: string): void {
  activeAuthToken = token;
}

export function getAuthToken(): string {
  return activeAuthToken;
}

/**
 * Standardized Fetch Client có gắn Header xác thực và tự động xử lý mã lỗi 401 / 403
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization') && activeAuthToken) {
    headers.set('Authorization', `Bearer ${activeAuthToken}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorCode = 'API_ERROR';
    let messageText = `Request failed with HTTP status ${response.status}`;

    try {
      const errJson: unknown = await response.json();
      if (typeof errJson === 'object' && errJson !== null) {
        const record = errJson as Record<string, unknown>;
        if ('error' in record && typeof record.error === 'object' && record.error !== null) {
          const errObj = record.error as ApiErrorPayload;
          errorCode = errObj.code || errorCode;
          messageText = errObj.message || messageText;
        } else if ('error' in record && typeof record.error === 'string') {
          messageText = record.error;
        } else if ('message' in record && typeof record.message === 'string') {
          messageText = record.message;
        }
      }
    } catch {
      // Fallback
    }

    if (response.status === 403) {
      messageText = `[403 Access denied]: ${messageText}`;
    } else if (response.status === 401) {
      messageText = `[401 Authentication required]: ${messageText}`;
    }

    throw new ApiError(response.status, errorCode, messageText);
  }

  const json: unknown = await response.json();
  if (typeof json === 'object' && json !== null && 'data' in json && 'success' in json) {
    const resObj = json as { success: boolean; data: T };
    if (resObj.success) return resObj.data;
  }
  return json as T;
}

