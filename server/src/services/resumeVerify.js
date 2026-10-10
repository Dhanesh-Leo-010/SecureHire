import { q, now, json, parse, tx } from '../db.js';
import { encrypt } from '../security.js';
import { providers } from '../providers/index.js';
import { parseResume, shingles, jaccard, toMonthIndex } from './resumeParser.js';
import { similarity } from './semantic.js';
import { addSignal } from '../trust.js';

const MATCH = 'MATCH', MISMATCH = 'MISMATCH', MISSING = 'MISSING', REVIEW = 'HUMAN REVIEW';
const normName = (s = '') => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

function semanticStatus(score) { return score >= 0.72 ? MATCH : score >= 0.5 ? REVIEW : MISMATCH; }

async function optionalGithubEvidence(username) {
  if (!username) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers: { 'User-Agent': 'SecureHire-demo', Accept: 'application/vnd.github+json' }, signal: ctl.signal });
    if (r.status === 404) return { exists: false };
    if (!r.ok) return null;
    const d = await r.json();
    return { exists: true, publicRepos: d.public_repos, createdAt: d.created_at, name: d.name };
  } catch { return null; } finally { clearTimeout(t); }
}

/** Optional LLM narrative (Claude API) when ANTHROPIC_API_KEY is set; otherwise a deterministic summary. */
async function narrative(claims, profileName) {
  const issues = claims.filter(c => c.status !== MATCH);
  const fallback = issues.length
    ? `${issues.length} item(s) need attention for ${profileName}: ` + issues.slice(0, 5).map(c => `${c.field} — ${c.explanation}`).join(' ') +
      ' These are review indicators, not conclusions; the candidate can explain or correct each item.'
    : `All extracted claims for ${profileName} agree with the available verified records.`;
  if (!process.env.ANTHROPIC_API_KEY) return { text: fallback, generatedBy: 'rules' };
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 400,
        messages: [{ role: 'user', content: `You help a recruiter review resume verification results. Write 3-5 neutral sentences summarising the findings below. Do not accuse the candidate, do not invent facts, note that AI-assisted writing is not a concern, and suggest what clarification to request.\n\n${JSON.stringify(claims.map(c => ({ field: c.field, resume: c.resume_value, verified: c.verified_value, status: c.status, why: c.explanation })))}` }],
      }),
    });
    clearTimeout(t);
    if (!r.ok) return { text: fallback, generatedBy: 'rules' };
    const d = await r.json();
    return { text: d.content?.[0]?.text || fallback, generatedBy: 'llm' };
  } catch { return { text: fallback, generatedBy: 'rules' }; }
}

export async function analyzeResume({ user, text, documentId, apaarId }) {
  const parsed = parseResume(text);
  const claims = [];
  const add = (c) => claims.push({ category: c.category, field: c.field, resume_value: c.resume ?? null, verified_value: c.verified ?? null, source: c.source ?? null, method: c.method, similarity: c.similarity ?? null, status: c.status, explanation: c.explanation });
  const signals = []; // collected then emitted after persisting

  // ---------------- 1. Profile consistency ----------------
  if (parsed.name) {
    const same = normName(parsed.name) === normName(user.name);
    add({ category: 'profile', field: 'Name', resume: parsed.name, verified: user.name, source: 'Candidate profile', method: 'Deterministic (normalised exact match)', status: same ? MATCH : REVIEW,
      explanation: same ? 'Name on resume matches the registered profile.' : 'Name on resume differs from the profile (could be a nickname or initials) — ask the candidate.' });
  }

  // ---------------- 2. Academic verification (APAAR, MOCK) ----------------
  const edu = parsed.education[0] || null;
  let academic = null;
  if (apaarId) academic = await providers.apaar.getAcademicRecord(apaarId);
  if (!edu) {
    add({ category: 'education', field: 'Education', resume: null, verified: null, method: 'Extraction', status: MISSING, explanation: 'No education entry could be extracted from the resume.' });
  } else if (!academic || academic.outcome !== 'success') {
    const why = !apaarId ? 'No APAAR ID provided, so academic claims could not be checked.' : academic.message;
    for (const f of [['Degree', edu.degree], ['Institution', edu.institution], ['Graduation year', edu.graduationYear]])
      add({ category: 'education', field: f[0], resume: f[1] != null ? String(f[1]) : null, source: 'Mock APAAR registry', method: 'Provider lookup', status: MISSING, explanation: why });
  } else {
    const rec = academic.data;
    const src = `Mock APAAR record (${rec.certificateId})`;
    const deg = await similarity(edu.degree, rec.degree);
    const degStatus = semanticStatus(deg.score);
    add({ category: 'education', field: 'Degree', resume: edu.degree, verified: rec.degree, source: src, method: deg.method, similarity: deg.score, status: degStatus,
      explanation: degStatus === MATCH ? `Degree agrees with the verified record (similarity ${deg.score}).` : degStatus === REVIEW ? `Degree wording partly matches (similarity ${deg.score}); a reviewer should confirm.` : `Degree differs from the verified record (similarity ${deg.score}).` });
    if (edu.institution) {
      const ins = await similarity(edu.institution, rec.institution);
      const insStatus = semanticStatus(ins.score);
      add({ category: 'education', field: 'Institution', resume: edu.institution, verified: rec.institution, source: src, method: ins.method, similarity: ins.score, status: insStatus,
        explanation: insStatus === MATCH ? `Institution agrees with the verified record (similarity ${ins.score}).` : insStatus === REVIEW ? `Institution name partly matches (similarity ${ins.score}); could be an abbreviation or affiliated college.` : `Institution differs from the verified record (similarity ${ins.score}).` });
    } else add({ category: 'education', field: 'Institution', resume: null, verified: rec.institution, source: src, method: 'Extraction', status: MISSING, explanation: 'Institution not found on the resume.' });
    const yr = edu.graduationYear;
    const yrStatus = yr == null ? MISSING : yr === rec.graduationYear ? MATCH : MISMATCH;
    add({ category: 'education', field: 'Graduation year', resume: yr != null ? String(yr) : null, verified: String(rec.graduationYear), source: src, method: 'Deterministic (exact year)', status: yrStatus,
      explanation: yrStatus === MATCH ? 'Graduation year agrees with the verified academic record.' : yrStatus === MISSING ? 'Graduation year not stated on the resume.' : `Graduation year differs from the verified academic record (${yr} vs ${rec.graduationYear}).` });
    const recNameOk = rec.name.startsWith('(') || normName(rec.name) === normName(user.name);
    if (!recNameOk) add({ category: 'education', field: 'Name on academic record', resume: user.name, verified: rec.name, source: src, method: 'Deterministic', status: REVIEW, explanation: 'The APAAR record belongs to a different name — confirm the APAAR ID.' });

    const mismatches = claims.filter(c => c.category === 'education' && c.status === MISMATCH);
    if (mismatches.length) signals.push(['credential_mismatch', { label: `Academic claim conflicts with verified record: ${mismatches.map(m => m.field).join(', ')}`, evidence: { mismatches: mismatches.map(m => ({ field: m.field, resume: m.resume_value, verified: m.verified_value })), source: src } }]);
    else if (degStatus === MATCH && yrStatus === MATCH && recNameOk) signals.push(['academic_verified', { evidence: { record: src, degree: rec.degree, graduationYear: rec.graduationYear } }]);

    // Enrollment sanity vs resume start year
    if (edu.startYear && rec.enrollmentYear && Math.abs(edu.startYear - rec.enrollmentYear) >= 1)
      add({ category: 'education', field: 'Enrollment year', resume: String(edu.startYear), verified: String(rec.enrollmentYear), source: src, method: 'Deterministic', status: REVIEW, explanation: 'Start year differs from the enrollment year on record.' });
  }

  // ---------------- 3. Timeline rules (deterministic) ----------------
  const conflicts = [];
  for (const e of parsed.education) if (e.startYear && e.graduationYear && e.graduationYear < e.startYear)
    conflicts.push(`Education ends (${e.graduationYear}) before it starts (${e.startYear}).`);
  const jobs = parsed.experience.map(j => ({ ...j, s: toMonthIndex(j.start), e: toMonthIndex(j.end, true) }));
  const nowIdx = toMonthIndex('present');
  for (const j of jobs) {
    if (j.s != null && j.e != null && j.e < j.s) conflicts.push(`${j.title || 'Role'} at ${j.company || '?'} ends before it starts.`);
    if (j.s != null && j.s > nowIdx + 1) conflicts.push(`${j.title || 'Role'} at ${j.company || '?'} starts in the future.`);
  }
  const ft = jobs.filter(j => j.type === 'full-time' && j.s != null && j.e != null);
  for (let a = 0; a < ft.length; a++) for (let b = a + 1; b < ft.length; b++) {
    const overlap = Math.min(ft[a].e, ft[b].e) - Math.max(ft[a].s, ft[b].s);
    if (overlap > 3) conflicts.push(`Full-time roles overlap for ${overlap} months: "${ft[a].title} @ ${ft[a].company}" and "${ft[b].title} @ ${ft[b].company}".`);
  }
  const verifiedGrad = academic?.outcome === 'success' ? academic.data.graduationYear : edu?.graduationYear;
  for (const j of ft) if (verifiedGrad && j.s != null && j.s < (verifiedGrad * 12) - 6 && !/intern/i.test(j.title || ''))
    add({ category: 'experience', field: `Timeline: ${j.title || 'role'} @ ${j.company || '?'}`, resume: `${j.start} → ${j.end}`, verified: `Graduation ${verifiedGrad}`, source: academic?.outcome === 'success' ? 'Mock APAAR record' : 'Resume', method: 'Deterministic (timeline rule)', status: REVIEW,
      explanation: 'Full-time role starts well before graduation. This can be legitimate (work-study, part-time) — ask for clarification.' });
  for (const c of conflicts) add({ category: 'timeline', field: 'Date consistency', resume: c, method: 'Deterministic (timeline rule)', status: MISMATCH, explanation: c });
  if (conflicts.length) signals.push(['date_conflict', { evidence: { conflicts } }]);

  // ---------------- 4. Employment verification (MOCK provider) ----------------
  const employment = [];
  for (const j of parsed.experience.slice(0, 6)) {
    if (!j.company) continue;
    const r = await providers.employment.verify({ name: user.name, employer: j.company, title: j.title, start: j.start, end: j.end === 'present' ? null : j.end });
    const status = r.outcome === 'success' ? 'Verified' : r.outcome === 'mismatch' ? 'Mismatch' : 'Unverifiable';
    employment.push({ employer: j.company, title: j.title, start: j.start, end: j.end, status, source: r.provider, evidence: r });
    add({ category: 'experience', field: `Employment: ${j.company}`, resume: `${j.title || ''} (${j.start || '?'} → ${j.end || '?'})`.trim(),
      verified: r.data?.confirmed ? `${r.data.confirmed.title} (${r.data.confirmed.start} → ${r.data.confirmed.end || 'present'})` : null,
      source: 'Mock employer confirmation', method: 'Provider confirmation + deterministic dates',
      status: status === 'Verified' ? MATCH : status === 'Mismatch' ? MISMATCH : MISSING, explanation: r.message });
    if (status === 'Verified') signals.push(['employment_verified', { label: `Employment confirmed: ${j.company} (MOCK)`, evidence: { employer: j.company, title: j.title } }]);
    if (status === 'Mismatch') signals.push(['date_conflict', { label: `Employment dates differ from employer confirmation: ${j.company}`, evidence: { employer: j.company, detail: r.message }, allowRepeat: true }]);
  }

  // ---------------- 5. Version consistency ----------------
  const prev = q.get('SELECT * FROM resumes WHERE user_id = ? ORDER BY version DESC LIMIT 1', user.id);
  if (prev) {
    const p = parse(prev.parsed, {});
    const diffs = [];
    if (p.education?.[0]?.graduationYear && edu?.graduationYear && p.education[0].graduationYear !== edu.graduationYear) diffs.push(`graduation year ${p.education[0].graduationYear} → ${edu.graduationYear}`);
    for (const pj of p.experience || []) {
      const cj = parsed.experience.find(x => x.company && pj.company && x.company.toLowerCase() === pj.company.toLowerCase());
      if (cj && (cj.start !== pj.start || cj.end !== pj.end)) diffs.push(`${pj.company} dates ${pj.start}–${pj.end} → ${cj.start}–${cj.end}`);
    }
    if (diffs.length) {
      add({ category: 'versions', field: 'Earlier resume version', resume: diffs.join('; '), verified: `Version ${prev.version}`, source: 'Previous submission', method: 'Deterministic (version diff)', status: REVIEW, explanation: 'Factual details changed between submissions. Updates are normal; confirm which is correct.' });
      signals.push(['date_conflict', { label: 'Facts changed between resume versions', evidence: { diffs }, allowRepeat: true }]);
    }
  }

  // ---------------- 6. Duplicate content across candidates ----------------
  const sh = shingles(text);
  let best = { sim: 0, userId: null };
  for (const r of q.all('SELECT user_id, shingles FROM resumes WHERE user_id != ? AND shingles IS NOT NULL', user.id)) {
    const sim = jaccard(parse(r.shingles, []), sh);
    if (sim > best.sim) best = { sim, userId: r.user_id };
  }
  if (best.sim >= 0.6) {
    add({ category: 'integrity', field: 'Content similarity', resume: `${Math.round(best.sim * 100)}% overlap`, verified: `Candidate #${best.userId}`, source: 'Other submitted resumes', method: '5-word shingle Jaccard similarity', status: REVIEW, explanation: 'Resume text is highly similar to another candidate\'s resume. Templates can cause this — review before drawing conclusions.' });
    signals.push(['duplicate_resume', { evidence: { similarity: +best.sim.toFixed(2), otherCandidateId: best.userId } }]);
  }

  // ---------------- 7. Optional public evidence (GitHub) ----------------
  if (parsed.github) {
    const gh = await optionalGithubEvidence(parsed.github);
    add({ category: 'evidence', field: 'GitHub profile', resume: `github.com/${parsed.github}`, verified: gh ? (gh.exists ? `${gh.publicRepos} public repos since ${gh.createdAt?.slice(0, 4)}` : 'Account not found') : 'Not checked (offline)', source: 'GitHub public API', method: 'Public API lookup', status: gh ? (gh.exists ? MATCH : REVIEW) : MISSING,
      explanation: 'Public activity is supporting evidence only — never proof of identity, authorship or employment.' });
  }

  const summary = await narrative(claims, user.name);

  // ---------------- Persist ----------------
  const resumeId = tx(() => {
    const version = (prev?.version || 0) + 1;
    const r = q.run('INSERT INTO resumes (user_id, document_id, version, text_enc, parsed, shingles, apaar_id_masked, summary, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      user.id, documentId ?? null, version, encrypt(text), json(parsed), json(sh), apaarId ? `XXXXXXXX${String(apaarId).slice(-4)}` : null, json(summary), now());
    const id = r.lastInsertRowid;
    for (const c of claims) q.run('INSERT INTO resume_claims (resume_id, user_id, category, field, resume_value, verified_value, source, method, similarity, status, explanation) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, user.id, c.category, c.field, c.resume_value, c.verified_value, c.source, c.method, c.similarity, c.status, c.explanation);
    q.run('DELETE FROM employment_verifications WHERE user_id = ?', user.id);
    for (const e of employment) q.run('INSERT INTO employment_verifications (user_id, employer, title, start_date, end_date, status, source, evidence, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      user.id, e.employer, e.title, e.start, e.end, e.status, e.source, json(e.evidence), now());
    return id;
  });

  for (const [name, opts] of signals) {
    const existingLabel = opts.label && q.get("SELECT id FROM trust_signals WHERE candidate_id = ? AND label = ? AND status IN ('verified','pending_review','confirmed')", user.id, opts.label);
    if (existingLabel) continue;
    addSignal(user.id, name, { source: 'resume_intelligence', evidence: opts.evidence, label: opts.label, allowRepeat: opts.allowRepeat || name === 'employment_verified', sessionRef: name === 'academic_verified' ? null : `resume:${resumeId}` });
  }
  return { resumeId, parsed, claims, employment, summary };
}

export function latestResumeReport(userId) {
  const r = q.get('SELECT * FROM resumes WHERE user_id = ? ORDER BY version DESC LIMIT 1', userId);
  if (!r) return null;
  return {
    resumeId: r.id, version: r.version, createdAt: r.created_at, apaarIdMasked: r.apaar_id_masked,
    parsed: parse(r.parsed, {}), summary: parse(r.summary, null),
    claims: q.all('SELECT * FROM resume_claims WHERE resume_id = ? ORDER BY id', r.id),
    employment: q.all('SELECT id, employer, title, start_date, end_date, status, source, reviewer_note, updated_at FROM employment_verifications WHERE user_id = ?', userId),
  };
}
