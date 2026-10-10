import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mail, Fingerprint, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card, PageHeader, Button, Input, Field, OtpInput, Callout, MockTag, Pill, useToast, Skeleton } from '../../components/ui';
import { ConsentModal } from '../../components/consent';
import { useCandidate, getPublicConfig } from '../../lib/candidate';
import { api } from '../../lib/api';

export default function Apply() {
  const { data, reload } = useCandidate();
  const loc = useLocation() as any;
  const nav = useNavigate();
  const toast = useToast();
  const [cfg, setCfg] = useState<any>(null);
  const [emailCode, setEmailCode] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(loc.state?.devOtp || null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string | null>>({});
  const [aadhaar, setAadhaar] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);
  const [txn, setTxn] = useState<any>(null);
  const [otp, setOtp] = useState('');
  useEffect(() => { getPublicConfig().then(setCfg); }, []);
  if (!data) return <Skeleton className="h-96" />;
  const emailDone = data.profile.emailVerified, idDone = !!data.identity;

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setErr((e) => ({ ...e, [key]: null }));
    try { await fn(); } catch (e: any) { setErr((x) => ({ ...x, [key]: e.message })); } finally { setBusy(null); }
  };
  const sendEmail = () => run('email', async () => { const r = await api.post('/api/me/apply/email/send'); if (r.devOtp) setDevOtp(r.devOtp); toast('Verification code sent.'); });
  const verifyEmail = () => run('email', async () => { await api.post('/api/me/apply/email/verify', { code: emailCode }); toast('Email verified · +5'); reload(); });
  const requestAadhaar = () => run('aadhaar', async () => {
    const r = await api.post('/api/me/apply/aadhaar/request', { aadhaar: aadhaar.replace(/\s/g, ''), consent: true });
    if (r.outcome !== 'success') throw new Error(r.message);
    setTxn(r); setConsentOpen(false);
  });
  const verifyAadhaar = () => run('aadhaar', async () => { await api.post('/api/me/apply/aadhaar/verify', { otp }); toast('Identity verified · +15'); setTxn(null); reload(); });
  const fmtAadhaar = (v: string) => v.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');

  return (
    <div className="max-w-3xl">
      <PageHeader title="Apply" description="Stage 1 · Confirm your email and identity. One identity can be linked to only one account." />
      <div className="space-y-6">
        <Card title={<span className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />Email verification</span>} action={emailDone && <Pill tone="ok" dot>Verified</Pill>}>
          {emailDone ? <p className="text-sm text-body">{data.profile.email} is verified.</p> : (
            <div className="space-y-4">
              <p className="text-sm text-body">Enter the 6-digit code sent to <span className="font-medium text-ink">{data.profile.email}</span>.</p>
              {devOtp && <Callout tone="info" title="Demo mode">No email server is configured, so the code is shown here (and printed in the server console): <span className="font-semibold tnum">{devOtp}</span></Callout>}
              <OtpInput value={emailCode} onChange={setEmailCode} autoFocus />
              {err.email && <Callout tone="risk">{err.email}</Callout>}
              <div className="flex gap-2"><Button onClick={verifyEmail} disabled={emailCode.length !== 6} loading={busy === 'email'}>Verify email</Button><Button variant="ghost" onClick={sendEmail}>Resend code</Button></div>
            </div>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-primary" />Aadhaar verification <MockTag /></span>} description="Simulated Aadhaar OTP provider — not real UIDAI verification." action={idDone && <Pill tone="ok" dot>Verified</Pill>}>
          {idDone ? (
            <div className="flex items-center gap-3 text-sm"><CheckCircle2 className="h-5 w-5 text-ok" /><span className="text-body">Aadhaar <span className="font-medium text-ink tnum">{data.identity.aadhaar_masked}</span> verified. Only a keyed hash and the last four digits are stored.</span></div>
          ) : !txn ? (
            <div className="space-y-4">
              <Field label="Aadhaar number" hint="12 digits. We validate the checksum and never store the full number.">
                <Input inputMode="numeric" value={fmtAadhaar(aadhaar)} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ''))} placeholder="XXXX XXXX XXXX" className="tnum tracking-wider" />
              </Field>
              {cfg?.demo && (
                <div className="rounded-lg bg-page p-3 text-xs text-body">
                  <p className="font-medium text-ink">Synthetic test numbers</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{cfg.demo.aadhaar.map((n: string, i: number) => <button key={n} type="button" onClick={() => setAadhaar(n)} className="rounded-md border border-line bg-white px-2 py-1 tnum hover:border-primary">{fmtAadhaar(n)}{i === 0 ? ' (already registered → duplicate demo)' : ''}</button>)}</div>
                  <p className="mt-2 text-muted">Any other checksum-valid number also works. OTP for the mock provider: 123456.</p>
                </div>
              )}
              {err.aadhaar && <Callout tone="review">{err.aadhaar}</Callout>}
              <Button onClick={() => setConsentOpen(true)} disabled={aadhaar.length !== 12 || !emailDone}>Send OTP</Button>
              {!emailDone && <p className="text-xs text-muted">Verify your email first.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-body">Enter the OTP sent to the mobile linked with this Aadhaar ({txn.mobileHint}).</p>
              {txn.devOtp && <Callout tone="info" title="Mock provider">Use OTP <span className="font-semibold tnum">{txn.devOtp}</span></Callout>}
              <OtpInput value={otp} onChange={setOtp} autoFocus />
              {err.aadhaar && <Callout tone="risk">{err.aadhaar}</Callout>}
              <div className="flex gap-2"><Button onClick={verifyAadhaar} disabled={otp.length !== 6} loading={busy === 'aadhaar'}>Verify</Button><Button variant="ghost" onClick={() => setTxn(null)}>Change number</Button></div>
            </div>
          )}
        </Card>

        {emailDone && idDone && <div className="flex justify-end"><Button onClick={() => nav('/candidate/identity')} icon={<ArrowRight className="h-4 w-4" />}>Continue to identity check</Button></div>}
      </div>

      <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} onAgree={requestAadhaar} loading={busy === 'aadhaar'} title="Consent for identity verification"
        what="Your Aadhaar number (used once to request an OTP), the verification result, and name/date of birth if the provider returns them."
        why="To confirm you are a real, unique person and to prevent duplicate accounts. Only a keyed cryptographic hash (HMAC) and the last four digits are kept."
        retention="For the duration of the hiring process plus the period set by the employer's retention policy (default 365 days)." />
    </div>
  );
}
