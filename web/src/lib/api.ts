// Thin fetch wrapper. Auth is an httpOnly cookie set by the API; same-origin via the Vite proxy.
export class ApiError extends Error {
  status: number; data: any;
  constructor(status: number, message: string, data?: any) { super(message); this.status = status; this.data = data; }
}

async function request(method: string, url: string, body?: any): Promise<any> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
  return data;
}

export const api = {
  get: (u: string) => request('GET', u),
  post: (u: string, b?: any) => request('POST', u, b ?? {}),
  put: (u: string, b?: any) => request('PUT', u, b ?? {}),
  patch: (u: string, b?: any) => request('PATCH', u, b ?? {}),
  upload: (u: string, form: FormData) => request('POST', u, form),
};

export const STAGES = ['apply', 'identity', 'resume', 'assessment', 'interview', 'offer', 'onboarding'] as const;
export const STAGE_LABELS: Record<string, string> = {
  apply: 'Apply', identity: 'Identity', resume: 'Resume', assessment: 'Assessment', interview: 'Interview', offer: 'Offer', onboarding: 'Onboarding', hired: 'Hired',
};

export function fmtDate(s?: string | null, withTime = true) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-IN', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
export function timeAgo(s?: string | null) {
  if (!s) return '—';
  const sec = Math.round((Date.now() - Date.parse(s)) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return `${Math.floor(sec / 86400)} d ago`;
}
export const bandTone = (key?: string) => (key === 'high' ? 'ok' : key === 'moderate' ? 'warn' : key === 'review' ? 'review' : key === 'risk' ? 'risk' : 'neutral');
export const scoreTone = (s?: number | null) => (s == null ? 'neutral' : s >= 80 ? 'ok' : s >= 60 ? 'warn' : s >= 40 ? 'review' : 'risk');
export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/, (c) => c.toUpperCase());
