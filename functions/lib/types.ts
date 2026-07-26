export interface Env {
  DNS_PANEL_PASSWORD?: string;
  DNS_PANEL_SESSION_SECRET?: string;
  DNS_PANEL_SESSION_MAX_AGE_SECONDS?: string;
  DEBUG?: string;
  [key: string]: string | undefined;
}

export interface SessionPayload {
  iat: number;
  exp: number;
  csrf: string;
  nonce: string;
}

export interface ContextData {
  requestId?: string;
  session?: SessionPayload;
}

export interface FunctionContext {
  request: Request;
  env: Env;
  data: ContextData;
  next?: () => Promise<Response>;
}

export interface Pagination {
  page: number;
  per_page: number;
  total?: number;
  has_more?: boolean;
  byAccount?: Record<string, { page: number; per_page: number; total?: number; has_more?: boolean }>;
}
