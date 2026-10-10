import React, { useState } from 'react';
import { Button, Modal, Textarea, Callout, useToast, Pill } from '../../components/ui';
import { Evidence } from '../../components/trust';
import { api, STAGE_LABELS } from '../../lib/api';

/** Confirm / dismiss a pending review item. A written reason is mandatory and audit-logged. */
export function ReviewModal({ signal, onClose, onDone }: { signal: any; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const decide = async (decision: 'confirm' | 'dismiss') => {
    setBusy(decision);
    try { await api.post(`/api/recruiter/signals/${signal.id}/review`, { decision, comment }); toast(decision === 'confirm' ? 'Flag confirmed — score updated' : 'Flag dismissed'); onDone(); onClose(); }
    catch (e: any) { toast(e.message, 'risk'); } finally { setBusy(null); }
  };
  return (
    <Modal open={!!signal} onClose={onClose} title="Review item" width="max-w-xl"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="secondary" disabled={comment.trim().length < 5} loading={busy === 'dismiss'} onClick={() => decide('dismiss')}>Dismiss</Button><Button variant="danger" disabled={comment.trim().length < 5} loading={busy === 'confirm'} onClick={() => decide('confirm')}>Confirm issue ({signal?.weight})</Button></>}>
      {signal && (
        <div className="space-y-4">
          <div><div className="flex items-center gap-2"><Pill>{STAGE_LABELS[signal.stage]}</Pill><span className="text-xs text-muted">{signal.source}</span></div><p className="mt-2 font-medium text-ink">{signal.label}</p><Evidence evidence={signal.evidence} /></div>
          <Callout tone="info">Confirming applies <b>{signal.weight}</b> points to the {STAGE_LABELS[signal.stage]} stage. Dismissing keeps the record for audit with no score effect. Neither action rejects the candidate.</Callout>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-ink">Reason (required)</span><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What evidence did you consider?" /></label>
        </div>
      )}
    </Modal>
  );
}
