import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export const cx = (...c: any[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- Button
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean; icon?: React.ReactNode };
export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm' };
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
    secondary: 'bg-white text-ink border border-line hover:bg-page',
    ghost: 'text-body hover:bg-subtle hover:text-ink',
    danger: 'bg-white text-risk border border-line hover:bg-red-50',
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Card
export function Card({ className, children, title, description, action, pad = true }: { className?: string; children?: React.ReactNode; title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; pad?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className={cx('flex items-start justify-between gap-4', pad ? 'px-6 pt-5' : 'px-6 pt-5 pb-3')}>
          <div>
            {title && <h3 className="text-[15px] font-semibold text-ink">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'p-6 pt-4' : ''}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- Pill / tone
const TONES: Record<string, string> = {
  ok: 'bg-green-50 text-ok', warn: 'bg-amber-50 text-warn', review: 'bg-orange-50 text-review', risk: 'bg-red-50 text-risk',
  info: 'bg-blue-50 text-info', neutral: 'bg-slate-100 text-neutral', primary: 'bg-primary-soft text-primary',
};
export function Pill({ tone = 'neutral', children, className, dot }: { tone?: string; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone] || TONES.neutral, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
export const MockTag = ({ label = 'MOCK' }: { label?: string }) => <span title="Simulated provider using synthetic data" className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-neutral">{label}</span>;
export const ExpTag = () => <span title="Experimental — review hint only" className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-warn">EXPERIMENTAL</span>;

export const STATUS_META: Record<string, { label: string; tone: string }> = {
  verified: { label: 'Verified', tone: 'ok' }, pending_review: { label: 'Pending review', tone: 'review' }, confirmed: { label: 'Confirmed', tone: 'risk' },
  dismissed: { label: 'Dismissed', tone: 'neutral' }, contextual: { label: 'Contextual', tone: 'info' },
  MATCH: { label: 'Match', tone: 'ok' }, MISMATCH: { label: 'Mismatch', tone: 'risk' }, MISSING: { label: 'Missing', tone: 'neutral' }, 'HUMAN REVIEW': { label: 'Human review', tone: 'review' },
  Verified: { label: 'Verified', tone: 'ok' }, Mismatch: { label: 'Mismatch', tone: 'risk' }, Unverifiable: { label: 'Unverifiable', tone: 'neutral' }, Pending: { label: 'Pending', tone: 'warn' },
};
export const StatusPill = ({ status }: { status: string }) => { const m = STATUS_META[status] || { label: status, tone: 'neutral' }; return <Pill tone={m.tone} dot>{m.label}</Pill>; };

// ---------------------------------------------------------------- Inputs
export function Field({ label, hint, error, children }: { label?: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium text-ink">{label}</span>}
      {children}
      {error ? <span className="mt-1.5 block text-xs text-risk">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cx('input', className)} {...p} />);
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx('w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-4 focus:ring-primary/20', p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx('input pr-8', p.className)} />;

export function OtpInput({ value, onChange, length = 6, autoFocus }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean }) {
  const refs = Array.from({ length }, () => React.createRef<HTMLInputElement>());
  return (
    <div className="flex gap-2" onPaste={(e) => { const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length); if (t) { e.preventDefault(); onChange(t); } }}>
      {refs.map((r, i) => (
        <input key={i} ref={r} autoFocus={autoFocus && i === 0} inputMode="numeric" maxLength={1} aria-label={`Digit ${i + 1}`}
          className="h-12 w-11 rounded-lg border border-line bg-white text-center text-lg font-semibold text-ink tnum outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
          value={value[i] || ''}
          onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(-1); const arr = value.padEnd(length, ' ').split(''); arr[i] = d || ' '; onChange(arr.join('').trimEnd().replace(/ /g, '')); if (d && i < length - 1) refs[i + 1].current?.focus(); }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !value[i] && i > 0) refs[i - 1].current?.focus(); }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div role="dialog" aria-modal className={cx('w-full rounded-card bg-white shadow-pop', width)} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ duration: 0.18 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-divider px-6 py-4">
              <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
              <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-divider px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- Tabs (underline)
export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: React.ReactNode; badge?: number }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} className={cx('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 text-sm font-medium transition', value === t.key ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}
          {!!t.badge && <span className="rounded-full bg-orange-50 px-1.5 text-[10px] font-semibold text-review">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- misc
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('animate-pulse rounded-lg bg-subtle', className)} />;
export function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-full bg-subtle p-3 text-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-xs text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Stat({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; tone?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between"><span className="label">{label}</span>{icon && <span className={cx('rounded-lg p-1.5', tone ? TONES[tone] : 'bg-subtle text-muted')}>{icon}</span>}</div>
      <div className="mt-2 text-[28px] font-semibold leading-none text-ink tnum">{value}</div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </div>
  );
}
export function PageHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-body">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('h-4 w-4 animate-spin text-muted', className)} />;

export function Callout({ tone = 'info', title, children, icon }: { tone?: string; title?: React.ReactNode; children?: React.ReactNode; icon?: React.ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'risk' || tone === 'review' || tone === 'warn' ? AlertCircle : Info;
  return (
    <div className={cx('flex gap-3 rounded-lg px-4 py-3 text-sm', TONES[tone])}>
      <span className="mt-0.5 shrink-0">{icon || <Icon className="h-4 w-4" />}</span>
      <div className="text-ink/80">{title && <p className="font-medium text-ink">{title}</p>}{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; tone: string; text: string };
const ToastCtx = createContext<(text: string, tone?: string) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-auto card flex items-start gap-2.5 p-3 shadow-pop">
              {t.tone === 'risk' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk" /> : t.tone === 'review' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-review" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />}
              <p className="text-sm text-ink">{t.text}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try { const data = await fn(); setState({ data, error: null, loading: false }); }
    catch (e: any) { setState({ data: null, error: e.message, loading: false }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d: T) => setState((s) => ({ ...s, data: d })) };
}
