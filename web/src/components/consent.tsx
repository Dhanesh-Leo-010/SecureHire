import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Modal } from './ui';

export function ConsentModal({ open, onClose, onAgree, title, what, why, retention, extra, agreeLabel = 'I agree', loading }: {
  open: boolean; onClose: () => void; onAgree: () => void; title: string; what: React.ReactNode; why: React.ReactNode; retention: React.ReactNode; extra?: React.ReactNode; agreeLabel?: string; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />{title}</span>}
      footer={<><Button variant="ghost" onClick={onClose}>Decline</Button><Button onClick={onAgree} loading={loading}>{agreeLabel}</Button></>}>
      <div className="space-y-4 text-sm">
        <section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">What we collect</h4><div className="text-body">{what}</div></section>
        <section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Why</h4><div className="text-body">{why}</div></section>
        <section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">How long we keep it</h4><div className="text-body">{retention}</div></section>
        {extra}
        <p className="text-xs text-muted">You can withdraw consent anytime from Privacy &amp; consent. Declining an optional check never lowers your score, and no decision is made automatically — a person reviews every flag.</p>
      </div>
    </Modal>
  );
}
