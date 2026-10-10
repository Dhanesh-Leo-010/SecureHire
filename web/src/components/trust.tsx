import React from 'react';
import { motion } from 'framer-motion';
import { Check, Lock, AlertTriangle, Info } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea } from 'recharts';
import { Pill, StatusPill, cx } from './ui';
import { STAGES, STAGE_LABELS, scoreTone, bandTone, fmtDate, timeAgo, humanize } from '../lib/api';

const TONE_HEX: Record<string, string> = { ok: '#16A34A', warn: '#D97706', review: '#EA580C', risk: '#DC2626', neutral: '#94A3B8' };

export function Gauge({ score, size = 168, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 16) / 2, cx0 = size / 2, cy0 = size / 2;
  const len = Math.PI * r;
  const tone = scoreTone(score);
  return (
    <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`} role="img" aria-label={`Trust score ${score} of 100`}>
      <path d={`M 8 ${cy0} A ${r} ${r} 0 0 1 ${size - 8} ${cy0}`} fill="none" stroke="#EEF2F6" strokeWidth={10} strokeLinecap="round" />
      <motion.path d={`M 8 ${cy0} A ${r} ${r} 0 0 1 ${size - 8} ${cy0}`} fill="none" stroke={TONE_HEX[tone]} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={len} initial={{ strokeDashoffset: len }} animate={{ strokeDashoffset: len * (1 - score / 100) }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      <text x={cx0} y={cy0 - 6} textAnchor="middle" className="tnum" style={{ fontSize: size * 0.22, fontWeight: 600, fill: '#0F172A' }}>{score}</text>
      {label && <text x={cx0} y={cy0 + 12} textAnchor="middle" style={{ fontSize: 11, fill: '#94A3B8' }}>{label}</text>}
    </svg>
  );
}

export function TrustScoreCard({ scores, signals = [], compact }: { scores: any; signals?: any[]; compact?: boolean }) {
  if (!scores) return null;
  const recent = signals.filter((s) => s.applied !== 0).slice(0, 3);
  const review = scores.reviewStatus === 'review_required';
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <span className="label">Overall trust indicator</span>
        <span title="Illustrative, unvalidated indicator to support human review — not a probability of fraud."><Info className="h-3.5 w-3.5 text-muted" /></span>
      </div>
      <div className="mt-3 flex flex-col items-center">
        <Gauge score={scores.overall} />
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Pill tone={bandTone(scores.band?.key)}>{scores.band?.label}</Pill>
          {review && <Pill tone="review" dot>Review required</Pill>}
        </div>
        {scores.pendingReview > 0 && (
          <p className="mt-3 text-center text-xs text-body">
            {scores.pendingReview} open item{scores.pendingReview > 1 ? 's' : ''} · if confirmed: <span className="font-semibold text-ink tnum">{scores.ifConfirmed}</span>
          </p>
        )}
        <p className="mt-1 text-xs text-muted">Evidence completeness {scores.evidenceCompleteness}%</p>
      </div>
      {!compact && recent.length > 0 && (
        <div className="mt-5 space-y-2 border-t border-divider pt-4">
          {recent.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-body">{s.label}</span>
              <span className={cx('shrink-0 font-semibold tnum', s.applied > 0 ? 'text-ok' : 'text-risk')}>{s.applied > 0 ? '+' : ''}{s.applied}<span className="ml-2 font-normal text-muted">{timeAgo(s.createdAt)}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StageStepper({ stageIndex, stageScores, flagged = {}, onSelect }: { stageIndex: number; stageScores?: Record<string, number | null>; flagged?: Record<string, number>; onSelect?: (s: string) => void }) {
  return (
    <ol className="flex w-full items-start">
      {STAGES.map((s, i) => {
        const done = stageIndex > i, active = stageIndex === i, isFlag = (flagged[s] || 0) > 0;
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center">
            {i > 0 && <span className={cx('absolute right-1/2 top-[13px] h-px w-full', stageIndex >= i ? 'bg-primary/40' : 'bg-line')} />}
            <button type="button" onClick={() => onSelect?.(s)} className={cx('relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition',
              isFlag ? 'border-review bg-orange-50 text-review' : done ? 'border-ok bg-ok text-white' : active ? 'border-primary bg-white text-primary pulse' : 'border-line bg-white text-muted', onSelect ? 'cursor-pointer' : 'cursor-default')}
              aria-label={`${STAGE_LABELS[s]} ${done ? 'completed' : active ? 'in progress' : 'locked'}`}>
              {isFlag ? <AlertTriangle className="h-3.5 w-3.5" /> : done ? <Check className="h-3.5 w-3.5" /> : active ? i + 1 : <Lock className="h-3 w-3" />}
            </button>
            <span className={cx('mt-2 text-[12px]', active ? 'font-medium text-ink' : 'text-muted')}>{STAGE_LABELS[s]}</span>
            {stageScores && <span className={cx('text-[11px] tnum', stageScores[s] == null ? 'text-muted' : `text-${scoreTone(stageScores[s])}`)}>{stageScores[s] ?? '—'}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function StageScoreGrid({ scores }: { scores: any }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {STAGES.map((s) => {
        const st = scores.stages[s];
        return (
          <div key={s} className="rounded-lg border border-line bg-white p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{STAGE_LABELS[s]}</div>
            <div className={cx('mt-1 text-xl font-semibold tnum', st.score == null ? 'text-muted' : `text-${scoreTone(st.score)}`)}>{st.score ?? '—'}</div>
            <div className="mt-1 text-[11px] text-muted">{st.score == null ? 'Pending evidence' : `${st.verified} verified`}{st.pending ? ` · ${st.pending} open` : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ScoreHistoryChart({ history, height = 220 }: { history: any[]; height?: number }) {
  const data = history.map((h) => ({ t: fmtDate(h.created_at), overall: h.overall, reason: h.reason }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="#EEF2F6" vertical={false} />
          <ReferenceArea y1={80} y2={100} fill="#16A34A" fillOpacity={0.04} />
          <ReferenceArea y1={0} y2={40} fill="#DC2626" fillOpacity={0.04} />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} ticks={[0, 40, 60, 80, 100]} />
          <Tooltip content={({ active, payload }: any) => active && payload?.length ? (
            <div className="card max-w-xs p-3 shadow-pop"><p className="text-xs text-muted">{payload[0].payload.t}</p><p className="text-lg font-semibold text-ink tnum">{payload[0].value}</p><p className="text-xs text-body">{payload[0].payload.reason}</p></div>) : null} />
          <Line type="monotone" dataKey="overall" stroke="#4F46E5" strokeWidth={2} dot={{ r: 2.5, fill: '#4F46E5' }} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SignalTable({ signals, onReview, compact, emptyText = 'No signals yet.' }: { signals: any[]; onReview?: (s: any) => void; compact?: boolean; emptyText?: string }) {
  if (!signals.length) return <p className="px-4 py-8 text-center text-sm text-muted">{emptyText}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-divider"><tr><th className="th">Signal</th><th className="th">Status</th><th className="th text-right">Score effect</th><th className="th">When</th>{onReview && <th className="th" />}</tr></thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.id} className="border-b border-divider last:border-0 hover:bg-page">
              <td className="td">
                <p className="font-medium text-ink"><span className="mr-2 align-middle text-[11px] font-medium uppercase tracking-wide text-muted">{STAGE_LABELS[s.stage]}</span>{s.label}</p>
                {!compact && <Evidence evidence={s.evidence} />}
                {s.reviewComment && <p className="mt-1 text-xs text-muted">Reviewer: {s.reviewComment}</p>}
              </td>
              <td className="td"><StatusPill status={s.status} /></td>
              <td className="td whitespace-nowrap text-right tnum">
                {s.applied ? <span className={s.applied > 0 ? 'font-semibold text-ok' : 'font-semibold text-risk'}>{s.applied > 0 ? '+' : ''}{s.applied}</span>
                  : s.status === 'pending_review' ? <span className="text-xs text-muted">0 <span className="text-muted/80">({s.weight} if confirmed)</span></span> : <span className="text-muted">0</span>}
              </td>
              <td className="td whitespace-nowrap text-xs text-muted">{fmtDate(s.createdAt)}</td>
              {onReview && <td className="td text-right">{s.status === 'pending_review' && <button className="link text-xs" onClick={() => onReview(s)}>Review</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Evidence({ evidence }: { evidence: any }) {
  if (!evidence || typeof evidence !== 'object') return null;
  const entries = Object.entries(evidence).filter(([k, v]) => v != null && k !== 'note' && typeof v !== 'object').slice(0, 5);
  const nested = Object.entries(evidence).filter(([, v]) => v && typeof v === 'object').slice(0, 2);
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted">
      {entries.length > 0 && <p>{entries.map(([k, v]) => `${humanize(k)}: ${v}`).join(' · ')}</p>}
      {nested.map(([k, v]) => <p key={k} className="truncate">{humanize(k)}: {Array.isArray(v) ? v.map((x: any) => (typeof x === 'object' ? Object.values(x).join(' ') : x)).join(', ') : Object.entries(v as any).map(([a, b]) => `${a}=${typeof b === 'object' ? JSON.stringify(b) : b}`).join(', ')}</p>)}
      {evidence.note && <p className="italic">{evidence.note}</p>}
    </div>
  );
}

export const ScoreDisclaimer = () => (
  <p className="text-xs text-muted">Scores assist reviewers; people make the decisions. Indicators are illustrative prototype heuristics, not validated fraud probabilities.</p>
);
