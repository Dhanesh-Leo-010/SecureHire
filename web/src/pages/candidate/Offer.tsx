import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Fingerprint, ScanFace, ArrowRight, Copy } from 'lucide-react';
import { Card, PageHeader, Button, Callout, Pill, useToast, Skeleton, Input, Field, OtpInput, MockTag, Textarea } from '../../components/ui';
import { FreshFaceCheck } from '../../components/camera';
import { useCandidate } from '../../lib/candidate';
import { api, fmtDate } from '../../lib/api';

export default function Offer() {
  const { data, reload } = useCandidate();
  const [o, setO] = useState<any>(null);
  const [aadhaar, setAadhaar] = useState('');
  const [otp, setOtp] = useState('');
  const [explain, setExplain] = useState('');
  const [face, setFace] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const nav = useNavigate();
  const load = () => api.get('/api/me/offer').then(setO);
  useEffect(() => { load(); }, []);
  if (!data || !o) return <Skeleton className="h-96" />;
  const offer = o.offer;
  if (!offer) return <div className="max-w-3xl"><PageHeader title="Offer" description="Stage 6 · Offer verification and acceptance." /><Card><p className="text-sm text-body">No offer yet. Offers are released by the recruiter after the interview and any open review items are resolved.</p></Card></div>;

  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post(`/api/me/offer/${offer.id}/accept`, { descriptor: face.descriptor, faces: face.faces, livenessPassed: face.liveness.passed, aadhaar: aadhaar.replace(/\s/g, ''), aadhaarOtp: otp, contactExplanation: explain || undefined });
      setOut(r); if (r.accepted) toast('Offer accepted — welcome aboard!'); load(); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Offer" description="Stage 6 · Confirm it's you with a fresh identity check, then accept." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="label">{offer.org}</p><h2 className="mt-1 text-xl font-semibold text-ink">{offer.title}</h2><p className="mt-1 text-sm text-body">{offer.salary} · Start {fmtDate(offer.startDate, false)}</p></div>
              <Pill tone={offer.status === 'accepted' ? 'ok' : offer.status === 'held_for_review' ? 'review' : offer.status === 'revoked' ? 'risk' : 'primary'} dot>{offer.status.replace(/_/g, ' ')}</Pill>
            </div>
            <div className="mt-6 flex items-center gap-5 border-t border-divider pt-5">
              <img src={offer.qr} alt="Offer verification QR code" className="h-28 w-28 rounded-lg border border-line" />
              <div className="min-w-0 text-xs text-body">
                <p className="font-medium text-ink">Verification ID {offer.id}</p>
                <p className="mt-1">Anyone can scan this code to confirm the offer is authentic and unaltered.</p>
                <p className="mt-2 truncate text-muted">SHA-256 {offer.contentHash.slice(0, 24)}…</p>
                <button className="link mt-2 inline-flex items-center gap-1" onClick={() => { navigator.clipboard?.writeText(offer.verifyUrl); toast('Verification link copied'); }}><Copy className="h-3 w-3" />Copy verification link</button>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted">Issued {fmtDate(offer.issuedAt)} · valid until {fmtDate(offer.expiresAt, false)}</p>
          </div>
          <Callout tone={o.verification.valid ? 'ok' : 'review'} title={<span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4" />Offer authenticity</span>}>{o.verification.message}</Callout>
        </div>

        {offer.status === 'issued' && !out?.heldForReview ? (
          <Card title="Accept your offer" description="We re-check your identity so nobody else can accept on your behalf.">
            <div className="space-y-6">
              <section>
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ink"><ScanFace className="h-4 w-4 text-primary" />1. Fresh face &amp; liveness check</p>
                {face ? <Callout tone="ok">Liveness passed — face embedding ready. It will be compared with your identity anchor when you accept.</Callout> : <FreshFaceCheck onResult={setFace} />}
              </section>
              <section>
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ink"><Fingerprint className="h-4 w-4 text-primary" />2. Aadhaar re-verification <MockTag /></p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Aadhaar number" hint="Must match the identity used when you applied."><Input inputMode="numeric" value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))} className="tnum" /></Field>
                  <Field label="OTP (mock: 123456)"><OtpInput value={otp} onChange={setOtp} /></Field>
                </div>
              </section>
              <Field label="Have your email or phone changed since you applied? (optional)" hint="A short explanation helps the recruiter — changes are never treated as fraud on their own."><Textarea rows={2} value={explain} onChange={(e) => setExplain(e.target.value)} /></Field>
              {err && <Callout tone="risk">{err}</Callout>}
              <Button onClick={accept} disabled={!face || aadhaar.length !== 12 || otp.length !== 6} loading={busy}>Verify &amp; accept offer</Button>
            </div>
          </Card>
        ) : (
          <Card title="Status">
            {offer.status === 'accepted' || out?.accepted ? (
              <div className="space-y-4"><Callout tone="ok" title="Offer accepted">Your identity was confirmed against your enrolled reference.</Callout><Button onClick={() => nav('/candidate/onboarding')} icon={<ArrowRight className="h-4 w-4" />}>Continue to onboarding</Button></div>
            ) : offer.status === 'held_for_review' || out?.heldForReview ? (
              <Callout tone="review" title="Held for a quick review">{out?.message || 'We could not confirm your identity automatically. A recruiter will review and contact you — nothing has been rejected.'}</Callout>
            ) : <Callout tone="risk">{o.verification.message}</Callout>}
          </Card>
        )}
      </div>
    </div>
  );
}
