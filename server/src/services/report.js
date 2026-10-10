import PDFDocument from 'pdfkit';
import { q, parse } from '../db.js';
import { computeScores, signalsFor, STAGES, STAGE_LABELS } from '../trust.js';

const C = { ink: '#0F172A', muted: '#64748B', line: '#E2E8F0', primary: '#4F46E5', green: '#16A34A', amber: '#D97706', orange: '#EA580C', red: '#DC2626' };
const bandColor = (s) => (s >= 80 ? C.green : s >= 60 ? C.amber : s >= 40 ? C.orange : C.red);

/** Final verification report (PDF) — stage history, outcomes, score history, evidence references, open items. */
export function buildReport(candidateId, res) {
  const c = q.get('SELECT c.*, u.name, u.email, u.created_at FROM candidates c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?', candidateId);
  const scores = computeScores(candidateId);
  const signals = signalsFor(candidateId);
  const history = q.all('SELECT overall, reason, created_at FROM score_history WHERE candidate_id = ? ORDER BY id', candidateId);
  const identity = q.get('SELECT aadhaar_masked, provider, verified_at FROM identities WHERE user_id = ?', candidateId);
  const offer = q.get('SELECT id, title, status, issued_at, accepted_at FROM offers WHERE candidate_id = ? ORDER BY issued_at DESC LIMIT 1', candidateId);
  const onboarding = q.get('SELECT status, joined_at, approved_by FROM onboarding WHERE candidate_id = ?', candidateId);
  const approver = onboarding?.approved_by ? q.get('SELECT name FROM users WHERE id = ?', onboarding.approved_by) : null;

  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `SecureHire verification report — ${c.name}` } });
  doc.pipe(res);
  const W = doc.page.width - 96;

  doc.fillColor(C.primary).fontSize(10).text('SECUREHIRE · CANDIDATE TRUST REPORT', { characterSpacing: 1 });
  doc.moveDown(0.3).fillColor(C.ink).fontSize(22).text(c.name);
  doc.fillColor(C.muted).fontSize(10).text(`Candidate ID ${candidateId} · ${c.email} · Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  doc.moveDown(1);

  // Overall
  const y0 = doc.y;
  doc.roundedRect(48, y0, W, 70, 8).strokeColor(C.line).stroke();
  doc.fillColor(bandColor(scores.overall)).fontSize(30).text(String(scores.overall), 64, y0 + 14);
  doc.fillColor(C.ink).fontSize(12).text(scores.band.label, 130, y0 + 18);
  doc.fillColor(C.muted).fontSize(9).text(`Evidence completeness ${scores.evidenceCompleteness}% · ${scores.pendingReview} item(s) awaiting review`, 130, y0 + 36);
  doc.fontSize(8).text('Illustrative, unvalidated indicator to support human review — not a probability of fraud.', 130, y0 + 50);
  doc.y = y0 + 86; doc.x = 48;

  // Stage table
  doc.fillColor(C.ink).fontSize(13).text('Stage results');
  doc.moveDown(0.4);
  for (const s of STAGES) {
    const st = scores.stages[s];
    const y = doc.y;
    doc.fillColor(C.ink).fontSize(10).text(STAGE_LABELS[s], 48, y, { width: 120 });
    doc.fillColor(st.score == null ? C.muted : bandColor(st.score)).text(st.score == null ? 'Pending' : String(st.score), 170, y, { width: 60 });
    doc.fillColor(C.muted).text(`${st.verified} verified · ${st.pending} pending · ${st.confirmed} confirmed · ${st.contextual} contextual`, 230, y, { width: W - 182 });
    doc.moveTo(48, doc.y + 4).lineTo(48 + W, doc.y + 4).strokeColor(C.line).stroke();
    doc.moveDown(0.6);
  }

  // Score history sparkline
  doc.moveDown(0.6).fillColor(C.ink).fontSize(13).text('Trust score history', 48);
  const hy = doc.y + 8, hh = 70;
  doc.rect(48, hy, W, hh).strokeColor(C.line).stroke();
  if (history.length > 1) {
    const pts = history.map((h, i) => [48 + (i / (history.length - 1)) * W, hy + hh - (h.overall / 100) * hh]);
    doc.moveTo(...pts[0]); for (const p of pts.slice(1)) doc.lineTo(...p);
    doc.strokeColor(C.primary).lineWidth(1.5).stroke().lineWidth(1);
  }
  doc.fillColor(C.muted).fontSize(8).text(`${history.length} recorded changes`, 48, hy + hh + 4);
  doc.y = hy + hh + 20; doc.x = 48;

  // Key facts
  doc.fillColor(C.ink).fontSize(13).text('Verification facts');
  doc.fontSize(9).fillColor(C.ink);
  const facts = [
    ['Identity', identity ? `Aadhaar ${identity.aadhaar_masked} verified ${identity.verified_at.slice(0, 10)} via ${identity.provider} (SIMULATED provider)` : 'Not verified'],
    ['Offer', offer ? `${offer.id} · ${offer.title} · ${offer.status}${offer.accepted_at ? ` (accepted ${offer.accepted_at.slice(0, 10)})` : ''}` : 'No offer'],
    ['Onboarding', onboarding ? `${onboarding.status}${onboarding.joined_at ? ` · joined ${onboarding.joined_at.slice(0, 10)}` : ''}${approver ? ` · approved by ${approver.name}` : ''}` : 'Not started'],
  ];
  for (const [k, v] of facts) doc.text(`${k}: `, { continued: true }).fillColor(C.muted).text(v).fillColor(C.ink);

  // Signals
  doc.addPage();
  doc.fillColor(C.ink).fontSize(13).text('Evidence-linked signals');
  doc.moveDown(0.3);
  for (const s of [...signals].reverse()) {
    if (doc.y > doc.page.height - 90) doc.addPage();
    const color = s.status === 'verified' ? C.green : s.status === 'confirmed' ? C.red : s.status === 'pending_review' ? C.orange : C.muted;
    doc.fillColor(color).fontSize(8).text(s.status.replace('_', ' ').toUpperCase(), 48, doc.y, { continued: true }).fillColor(C.muted).text(`  ${STAGE_LABELS[s.stage]} · ${s.createdAt.slice(0, 16).replace('T', ' ')} · ref #${s.id}${s.applied ? ` · ${s.applied > 0 ? '+' : ''}${s.applied}` : ''}`);
    doc.fillColor(C.ink).fontSize(10).text(s.label);
    if (s.reviewComment) doc.fillColor(C.muted).fontSize(8).text(`Reviewer: ${s.reviewComment}`);
    doc.moveDown(0.35);
  }

  const open = signals.filter(s => s.status === 'pending_review');
  doc.moveDown(0.5).fillColor(C.ink).fontSize(13).text('Unresolved review items');
  doc.fontSize(9).fillColor(open.length ? C.orange : C.green).text(open.length ? open.map(s => `• #${s.id} ${s.label}`).join('\n') : 'None.');
  doc.moveDown(1).fillColor(C.muted).fontSize(7.5).text(
    'Disclaimers: Aadhaar, DigiLocker, APAAR and employer confirmations in this prototype are SIMULATED providers using synthetic records and do not represent real government or employer verification. ' +
    'Face matching uses a pretrained face-embedding model and basic liveness; voice comparison is experimental. No automated decision was made — every risk flag requires human review.');
  doc.end();
}
