import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Logo } from '../../layouts/AppShell';
import { Button, Field, Input, Callout, Select } from '../../components/ui';
import { useAuth, homeFor } from '../../lib/auth';
import { api } from '../../lib/api';
import { getPublicConfig } from '../../lib/candidate';

function Split({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-page p-12 lg:flex">
        <Logo />
        <div className="max-w-md">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-ink">Hire the real candidate, every step of the way</h2>
          <p className="mt-3 text-body">A continuous, explainable trust layer from application to onboarding — with a human making every decision.</p>
          <ul className="mt-8 space-y-3 text-sm text-body">
            {['Consent requested for each check', 'Only encrypted face embeddings are stored', 'Flags are reviewed by people, never auto-rejected'].map((t) => <li key={t} className="flex gap-2.5"><CheckCircle2 className="h-4 w-4 text-ok" />{t}</li>)}
          </ul>
        </div>
        <p className="text-xs text-muted">KERNEL PRIME'26 · SW-03 prototype</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-body">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState(params.get('email') ? 'Demo@1234' : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<any>(null);
  const { login, user } = useAuth();
  const nav = useNavigate();
  useEffect(() => { getPublicConfig().then(setCfg); }, []);
  useEffect(() => { if (user) nav(homeFor(user.role), { replace: true }); }, [user, nav]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const u = await login(email, password); nav(homeFor(u.role)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Split title="Sign in" subtitle="Candidates, recruiters and administrators use the same sign-in.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {err && <Callout tone="risk">{err}</Callout>}
        <Button className="w-full" loading={busy}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-body">New candidate? <Link to="/register" className="link">Create an account</Link></p>
      {cfg?.demo && (
        <div className="mt-8 rounded-lg border border-line p-4">
          <p className="text-xs font-medium text-muted">Demo accounts (synthetic data)</p>
          <div className="mt-2 space-y-1">
            {cfg.demo.logins.map((l: any) => <button key={l.email} type="button" onClick={() => { setEmail(l.email); setPassword(l.password); }} className="flex w-full justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-subtle"><span className="capitalize text-ink">{l.role}</span><span className="text-muted">{l.email}</span></button>)}
          </div>
        </div>
      )}
    </Split>
  );
}

export function Register() {
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', jobId: '' });
  const [jobs, setJobs] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const nav = useNavigate();
  useEffect(() => { api.get('/api/public/config').catch(() => {}); }, []);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await api.post('/api/auth/register', { ...f, jobId: f.jobId || undefined });
      setUser(r.user);
      nav('/candidate/apply', { state: { devOtp: r.devOtp } });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Split title="Apply as a candidate" subtitle="Software Engineer — Platform · Northwind Labs (demo)">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name (as on your ID)"><Input value={f.name} onChange={set('name')} autoComplete="name" required /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
        <Field label="Mobile number" hint="Used for contact consistency checks at the offer stage."><Input value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="+91 …" /></Field>
        <Field label="Password" hint="At least 8 characters."><Input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} required /></Field>
        {err && <Callout tone="risk">{err}</Callout>}
        <Button className="w-full" loading={busy}>Create account &amp; continue</Button>
        <p className="text-xs text-muted">Using AI tools to polish your resume or cover letter is fine — it never counts against you.</p>
      </form>
      <p className="mt-6 text-center text-sm text-body">Already registered? <Link to="/login" className="link">Sign in</Link></p>
    </Split>
  );
}
