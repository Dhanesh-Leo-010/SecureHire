import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, ArrowRight, Sparkles } from 'lucide-react';
import { Card, PageHeader, Button, Field, Input, Callout, MockTag, useToast, Skeleton, StatusPill, Pill } from '../../components/ui';
import { useCandidate, getPublicConfig } from '../../lib/candidate';
import { api, fmtDate } from '../../lib/api';

export function ResumeReport({ report }: { report: any }) {
  if (!report) return null;
  const counts = report.claims.reduce((a: any, c: any) => ({ ...a, [c.status]: (a[c.status] || 0) + 1 }), {});
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['MATCH', 'MISMATCH', 'HUMAN REVIEW', 'MISSING'].map((s) => <div key={s} className="card p-4"><StatusPill status={s} /><p className="mt-2 text-2xl font-semibold text-ink tnum">{counts[s] || 0}</p></div>)}
      </div>
      {report.summary && <Callout tone="info" title={<span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" />Summary{report.summary.generatedBy === 'llm' ? ' (LLM-generated)' : ''}</span>}>{report.summary.text}</Callout>}
      <Card title="Claim-by-claim verification" description={`Version ${report.version} · analysed ${fmtDate(report.createdAt)}${report.apaarIdMasked ? ` · APAAR ${report.apaarIdMasked}` : ''}`} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-y border-divider"><tr><th className="th">Claim</th><th className="th">Resume says</th><th className="th">Verified value</th><th className="th">Result</th><th className="th">Why</th></tr></thead>
            <tbody>
              {report.claims.map((c: any) => (
                <tr key={c.id} className="border-b border-divider last:border-0 align-top">
                  <td className="td font-medium text-ink">{c.field}</td>
                  <td className="td text-body">{c.resume_value || <span className="text-muted">—</span>}</td>
                  <td className="td text-body">{c.verified_value || <span className="text-muted">—</span>}{c.source && <p className="mt-0.5 text-xs text-muted">{c.source}</p>}</td>
                  <td className="td"><StatusPill status={c.status} />{c.similarity != null && <p className="mt-1 text-xs text-muted tnum">similarity {c.similarity}</p>}</td>
                  <td className="td text-xs text-body">{c.explanation}<p className="mt-1 text-muted">{c.method}</p></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {report.employment?.length > 0 && (
        <Card title={<span className="flex items-center gap-2">Employment verification <MockTag /></span>} pad={false}>
          <table className="w-full"><thead className="border-y border-divider"><tr><th className="th">Employer</th><th className="th">Role</th><th className="th">Dates</th><th className="th">Status</th></tr></thead>
            <tbody>{report.employment.map((e: any) => <tr key={e.id} className="border-b border-divider last:border-0"><td className="td text-ink">{e.employer}</td><td className="td">{e.title}</td><td className="td tnum">{e.start_date} → {e.end_date || 'present'}</td><td className="td"><StatusPill status={e.status} /></td></tr>)}</tbody>
          </table>
        </Card>
      )}
      <Card title="Extracted profile">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div><p className="label">Education</p>{report.parsed.education?.map((e: any, i: number) => <p key={i} className="mt-1 text-ink">{e.degree} · {e.institution} · {e.startYear || '?'}–{e.graduationYear || '?'}</p>)}</div>
          <div><p className="label">Experience</p>{report.parsed.experience?.map((e: any, i: number) => <p key={i} className="mt-1 text-ink">{e.title} @ {e.company} <span className="text-muted">({e.start} → {e.end}, {e.type})</span></p>)}</div>
          <div className="sm:col-span-2"><p className="label">Skills</p><div className="mt-2 flex flex-wrap gap-1.5">{report.parsed.skills?.map((s: string) => <Pill key={s}>{s}</Pill>)}</div></div>
        </div>
      </Card>
    </div>
  );
}

export default function Resume() {
  const { data, reload } = useCandidate();
  const [report, setReport] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [apaar, setApaar] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<any>(null);
  const toast = useToast();
  const nav = useNavigate();
  useEffect(() => { api.get('/api/me/resume').then(setReport).catch(() => {}); getPublicConfig().then(setCfg); }, []);
  if (!data) return <Skeleton className="h-96" />;
  if (data.profile.stageIndex < 2) return <div className="max-w-3xl"><PageHeader title="Resume" /><Callout tone="info">Complete the identity step first.</Callout></div>;

  const submit = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    const form = new FormData();
    form.append('file', file); if (apaar) form.append('apaarId', apaar); form.append('consent', String(consent));
    try { const r = await api.upload('/api/me/resume', form); setReport(r); toast('Resume analysed'); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Resume" description="Stage 3 · We extract your claims and compare them with verified records. Polished or AI-assisted wording is never a concern — only factual differences are shown."
        actions={report && data.profile.stageIndex >= 3 && <Button onClick={() => nav('/candidate/assessment')} icon={<ArrowRight className="h-4 w-4" />}>Continue to assessment</Button>} />
      <Card title={report ? 'Upload a new version' : 'Upload your resume'} className="mb-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center hover:border-primary">
            {file ? <FileText className="h-6 w-6 text-primary" /> : <UploadCloud className="h-6 w-6 text-muted" />}
            <span className="text-sm font-medium text-ink">{file ? file.name : 'Choose a PDF or DOCX'}</span>
            <span className="text-xs text-muted">Max 5 MB · stored encrypted</span>
            <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div className="space-y-4">
            <Field label={<span className="flex items-center gap-2">APAAR ID (optional) <MockTag /></span> as any} hint="12-digit Academic Bank of Credits / APAAR ID used to fetch verified academic records (simulated registry).">
              <Input inputMode="numeric" value={apaar} onChange={(e) => setApaar(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="100000000002" className="tnum" />
            </Field>
            {cfg?.demo && <div className="flex flex-wrap gap-1.5">{cfg.demo.apaarIds.slice(0, 6).map((a: any) => <button key={a.id} type="button" title={a.label} onClick={() => setApaar(a.id)} className="rounded-md border border-line px-2 py-1 text-xs hover:border-primary"><span className="tnum">{a.id}</span> · {a.name}</button>)}</div>}
            <label className="flex items-start gap-2 text-xs text-body"><input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I consent to SecureHire fetching my academic record and asking listed employers to confirm my employment.</label>
            {err && <Callout tone="risk">{err}</Callout>}
            <Button onClick={submit} disabled={!file || (!!apaar && !consent)} loading={busy}>Analyse resume</Button>
            <p className="text-xs text-muted">Sample resumes are in <code>docs/sample-resumes/</code>.</p>
          </div>
        </div>
      </Card>
      {busy && <Skeleton className="h-64" />}
      {!busy && <ResumeReport report={report} />}
    </div>
  );
}
