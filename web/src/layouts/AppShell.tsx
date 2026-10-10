import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { LayoutDashboard, Users, ShieldAlert, Radio, Settings, ScrollText, UserCog, LogOut, Bell, FileText, ScanFace, ClipboardCheck, Video, BadgeCheck, Briefcase, Lock, Menu, X, Search, Mail } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { useToast, cx } from '../components/ui';

type Item = { to: string; label: string; icon: any; end?: boolean };
const NAV: Record<string, { section?: string; items: Item[] }[]> = {
  candidate: [
    { items: [{ to: '/candidate', label: 'My journey', icon: LayoutDashboard, end: true }] },
    { section: 'Verification steps', items: [
      { to: '/candidate/apply', label: 'Apply', icon: Mail }, { to: '/candidate/identity', label: 'Identity', icon: ScanFace },
      { to: '/candidate/resume', label: 'Resume', icon: FileText }, { to: '/candidate/assessment', label: 'Assessment', icon: ClipboardCheck },
      { to: '/candidate/interview', label: 'Interview', icon: Video }, { to: '/candidate/offer', label: 'Offer', icon: BadgeCheck },
      { to: '/candidate/onboarding', label: 'Onboarding', icon: Briefcase }] },
    { section: 'Account', items: [{ to: '/candidate/privacy', label: 'Privacy & consent', icon: Lock }] },
  ],
  recruiter: [
    { items: [{ to: '/recruiter', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/recruiter/candidates', label: 'Candidates', icon: Users }, { to: '/recruiter/review', label: 'Review queue', icon: ShieldAlert }, { to: '/recruiter/live', label: 'Live monitoring', icon: Radio }] },
  ],
  admin: [
    { items: [{ to: '/recruiter', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/recruiter/candidates', label: 'Candidates', icon: Users }, { to: '/recruiter/review', label: 'Review queue', icon: ShieldAlert }, { to: '/recruiter/live', label: 'Live monitoring', icon: Radio }] },
    { section: 'Administration', items: [{ to: '/admin', label: 'Scoring & policies', icon: Settings, end: true }, { to: '/admin/users', label: 'Users & roles', icon: UserCog }, { to: '/admin/audit', label: 'Audit log', icon: ScrollText }] },
  ],
};

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('flex items-center gap-2.5', className)}>
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      <span className="text-[15px] font-semibold tracking-tight text-ink">SecureHire</span>
    </Link>
  );
}

export default function AppShell({ title }: { title?: string }) {
  const { user, logout } = useAuth();
  const nav = NAV[user?.role || 'candidate'];
  const navigate = useNavigate();
  const toast = useToast();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  useRealtime((m) => {
    if (m.type === 'alert' && user?.role !== 'candidate') {
      setAlerts((a) => [m.signal, ...a].slice(0, 20));
      toast(`Review needed: ${m.signal.label}`, 'review');
    }
  }, [user?.role]);

  const Sidebar = (
    <aside className="flex h-full w-60 flex-col border-r border-line bg-white">
      <div className="flex h-16 items-center px-5"><Logo /></div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {nav.map((g, i) => (
          <div key={i}>
            {g.section && <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">{g.section}</p>}
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} onClick={() => setMenu(false)}
                  className={({ isActive }) => cx('flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition', isActive ? 'bg-primary-soft font-medium text-primary' : 'text-body hover:bg-subtle hover:text-ink')}>
                  <it.icon className="h-4 w-4" />{it.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-divider p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{user?.name?.split(' ').map((x) => x[0]).slice(0, 2).join('')}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{user?.name}</p><p className="truncate text-xs capitalize text-muted">{user?.role}</p></div>
          <button onClick={async () => { await logout(); navigate('/'); }} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" title="Sign out" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 hidden h-screen lg:block">{Sidebar}</div>
      {menu && <div className="fixed inset-0 z-40 flex lg:hidden"><div className="h-full">{Sidebar}</div><div className="flex-1 bg-slate-900/30" onClick={() => setMenu(false)} /></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-8">
          <button className="rounded-md p-1.5 text-body lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="lg:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            {user?.role !== 'candidate' && (
              <button onClick={() => navigate('/recruiter/candidates')} className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-line px-3 text-sm text-muted hover:border-slate-300 md:flex"><Search className="h-4 w-4" />Search candidates…</button>
            )}
            {user?.role !== 'candidate' && (
              <div className="relative">
                <button onClick={() => setOpen(!open)} className="relative rounded-lg p-2 text-body hover:bg-subtle" aria-label="Notifications">
                  <Bell className="h-[18px] w-[18px]" />
                  {alerts.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-review px-1 text-[10px] font-semibold text-white">{alerts.length}</span>}
                </button>
                {open && (
                  <div className="absolute right-0 top-11 w-80 card shadow-pop">
                    <div className="flex items-center justify-between border-b border-divider px-4 py-3"><p className="text-sm font-semibold text-ink">Live alerts</p>{alerts.length > 0 && <button className="link text-xs" onClick={() => setAlerts([])}>Clear</button>}</div>
                    <div className="max-h-80 overflow-y-auto">
                      {alerts.length === 0 ? <p className="p-6 text-center text-xs text-muted">New review items appear here in real time.</p> : alerts.map((a, i) => (
                        <button key={i} onClick={() => { setOpen(false); navigate(`/recruiter/candidates/${a.candidateId}`); }} className="flex w-full gap-3 border-b border-divider px-4 py-3 text-left last:border-0 hover:bg-page">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-review" /><span><span className="block text-sm text-ink">{a.label}</span><span className="text-xs text-muted">Candidate #{a.candidateId} · {a.stage}</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 p-4 sm:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
