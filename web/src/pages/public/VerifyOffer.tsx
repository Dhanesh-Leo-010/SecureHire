import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BadgeCheck, ShieldAlert, ShieldX, Search } from 'lucide-react';
import { Logo } from '../../layouts/AppShell';
import { Button, Input, Spinner } from '../../components/ui';
import { api, fmtDate } from '../../lib/api';

export default function VerifyOffer() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [lookup, setLookup] = useState(id || '');
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/api/public/offers/${encodeURIComponent(id)}${params.get('s') ? `?s=${params.get('s')}` : ''}`).then(setRes).finally(() => setLoading(false));
  }, [id, params]);
  const v = res?.verification;
  const Icon = v?.valid ? BadgeCheck : v?.status === 'unknown' ? ShieldAlert : ShieldX;
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-line bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center px-4"><Logo /></div></header>
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Verify an offer letter</h1>
        <p className="mt-1 text-sm text-body">Scan the QR code on the letter or enter its verification ID. Offers are signed records — edits to the letter break the signature.</p>
        <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (lookup.trim()) nav(`/verify/${lookup.trim().toUpperCase()}`); }}>
          <Input placeholder="e.g. OFR-PRIYA1" value={lookup} onChange={(e) => setLookup(e.target.value)} />
          <Button icon={<Search className="h-4 w-4" />}>Verify</Button>
        </form>
        {loading && <div className="mt-10 flex justify-center"><Spinner className="h-6 w-6" /></div>}
        {v && !loading && (
          <div className="card mt-8 p-6">
            <div className="flex items-start gap-4">
              <span className={`rounded-full p-2.5 ${v.valid ? 'bg-green-50 text-ok' : v.status === 'unknown' ? 'bg-orange-50 text-review' : 'bg-red-50 text-risk'}`}><Icon className="h-6 w-6" /></span>
              <div><p className="text-lg font-semibold capitalize text-ink">{v.valid ? 'Authentic offer' : v.status === 'unknown' ? 'Not found' : v.status}</p><p className="mt-1 text-sm text-body">{v.message}</p></div>
            </div>
            {res.offer && (
              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-divider pt-5 text-sm">
                <div><dt className="label">Organisation</dt><dd className="mt-1 text-ink">{res.offer.org}</dd></div>
                <div><dt className="label">Role</dt><dd className="mt-1 text-ink">{res.offer.title}</dd></div>
                <div><dt className="label">Candidate</dt><dd className="mt-1 text-ink">{res.offer.candidate}</dd></div>
                <div><dt className="label">Status</dt><dd className="mt-1 capitalize text-ink">{res.offer.status.replace(/_/g, ' ')}</dd></div>
                <div><dt className="label">Issued</dt><dd className="mt-1 text-ink">{fmtDate(res.offer.issuedAt, false)}</dd></div>
                <div><dt className="label">Valid until</dt><dd className="mt-1 text-ink">{fmtDate(res.offer.expiresAt, false)}</dd></div>
              </dl>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
