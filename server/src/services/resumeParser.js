import mammoth from 'mammoth';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js'); // direct import avoids pdf-parse's debug self-test

export async function extractText(buffer, filename = '', mime = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf') || mime === 'application/pdf') return (await pdfParse(buffer)).text;
  if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) return (await mammoth.extractRawText({ buffer })).value;
  if (lower.endsWith('.txt') || mime.startsWith('text/')) return buffer.toString('utf8');
  throw Object.assign(new Error('Unsupported file type. Upload a PDF or DOCX resume.'), { status: 400 });
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const POINT = `(?:${MON}\\s*,?\\s*\\d{4}|\\d{1,2}[/-]\\d{4}|\\d{4})`;
const END = `(?:present|current|now|till date|ongoing|${POINT})`;
const RANGE_RE = new RegExp(`(${POINT})\\s*(?:–|—|-|to|until)\\s*(${END})`, 'i');

function parsePoint(s) {
  if (!s) return null;
  const t = s.toLowerCase().trim();
  if (/present|current|now|till|ongoing/.test(t)) return 'present';
  let m = t.match(new RegExp(`^(${MON})\\s*,?\\s*(\\d{4})$`));
  if (m) return `${m[2]}-${String(MONTHS[m[1].replace('.', '').slice(0, 4)] || MONTHS[m[1].slice(0, 3)]).padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{4})$/);
  if (m) return `${m[1]}`;
  return null;
}
export function toMonthIndex(p, isEnd = false) {
  if (!p) return null;
  if (p === 'present') { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); }
  const [y, m] = p.split('-').map(Number);
  return y * 12 + ((m || (isEnd ? 12 : 1)) - 1);
}

const SECTION_RE = {
  education: /^(education|academic(s| background| qualifications)?|qualifications?)\b/i,
  experience: /^(work experience|professional experience|experience|employment( history)?|work history|internships?)\b/i,
  skills: /^(technical skills|skills|core competencies|technologies|tech stack)\b/i,
  projects: /^(projects|academic projects|personal projects|key projects)\b/i,
  certifications: /^(certifications?|certificates|licenses( & certifications)?|courses)\b/i,
  summary: /^(summary|profile|objective|about me|professional summary)\b/i,
};
const DEGREE_RE = /\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|b\.?\s?sc|m\.?\s?sc|bca|mca|mba|b\.?\s?com|m\.?\s?com|ph\.?d|bachelor[^,\n]*|master[^,\n]*|diploma[^,\n]*)/i;
const INSTITUTION_RE = /(university|college|institute|school of|iit\b|nit\b|iiit|academy|polytechnic|vit\b|bits\b)/i;
const ROLE_RE = /(engineer|developer|intern|analyst|manager|consultant|scientist|designer|lead|architect|associate|specialist|administrator|tester|qa|programmer|trainee|researcher|director|officer|executive)/i;
const COMPANY_HINT = /(inc|ltd|llc|pvt|private|limited|technologies|technology|corp|corporation|solutions|labs|systems|software|services|consulting|infosys|tcs|wipro|zoho|freshworks|google|microsoft|amazon|accenture|cognizant|hcl|ibm)/i;
const KNOWN_SKILLS = ['javascript', 'typescript', 'react', 'node.js', 'node', 'python', 'java', 'c++', 'go', 'sql', 'postgresql', 'mongodb', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'tensorflow', 'pytorch', 'machine learning', 'deep learning', 'nlp', 'fastapi', 'django', 'flask', 'spring', 'html', 'css', 'tailwind', 'git', 'linux', 'redis', 'kafka', 'graphql', 'rest', 'figma', 'excel', 'power bi', 'tableau'];

const clean = (l) => l.replace(/^[\s•●▪\-*·◦–]+/, '').replace(/\s+/g, ' ').trim();

export function parseResume(text) {
  const raw = text.replace(/\r/g, '');
  const lines = raw.split('\n').map(clean).filter(Boolean);

  // Split into sections
  const sections = { header: [] };
  let current = 'header';
  for (const l of lines) {
    const key = Object.keys(SECTION_RE).find(k => SECTION_RE[k].test(l) && l.length < 40);
    if (key) { current = key; sections[key] = sections[key] || []; const rest = l.replace(SECTION_RE[key], '').replace(/^[:\s-]+/, ''); if (rest) sections[key].push(rest); continue; }
    (sections[current] = sections[current] || []).push(l);
  }

  const email = raw.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || null;
  const phone = raw.match(/(\+?\d[\d\s-]{8,14}\d)/)?.[0]?.replace(/\s|-/g, '') || null;
  const github = raw.match(/github\.com\/([A-Za-z0-9-]{1,39})/i)?.[1] || null;
  const linkedin = raw.match(/linkedin\.com\/in\/([A-Za-z0-9-_%]+)/i)?.[1] || null;
  const name = (sections.header || []).find(l => !/[@\d|:]/.test(l) && l.split(' ').length <= 5 && l.length <= 40 && !SECTION_RE.summary.test(l)) || null;

  // Education
  const eduLines = sections.education?.length ? sections.education : lines;
  const education = [];
  for (let i = 0; i < eduLines.length; i++) {
    const l = eduLines[i];
    const deg = l.match(DEGREE_RE);
    if (!deg) continue;
    const window = eduLines.slice(i, i + 4).join(' | ');
    const range = window.match(RANGE_RE);
    const gradExplicit = window.match(/(?:graduat\w*|class of|passing year|batch|year of completion)\s*[:\-]?\s*(\d{4})/i);
    const years = (window.match(/\b(19[89]\d|20[0-4]\d)\b/g) || []).map(Number);
    let institution = eduLines.slice(Math.max(0, i - 1), i + 3).find(x => INSTITUTION_RE.test(x)) || null;
    if (institution) institution = institution.replace(RANGE_RE, '').replace(/\b(19|20)\d{2}\b/g, '').replace(/\s*[|,–-]\s*$/, '').trim();
    const degreeText = l.replace(RANGE_RE, '').replace(/\b(19|20)\d{2}\b/g, '').replace(INSTITUTION_RE.test(l) && institution && l.includes(institution) ? institution : '§§', '').replace(/[|,–-]\s*$/, '').trim();
    const startYear = range ? Number((parsePoint(range[1]) || '').slice(0, 4)) || null : null;
    const endPoint = range ? parsePoint(range[2]) : null;
    const graduationYear = gradExplicit ? Number(gradExplicit[1]) : endPoint && endPoint !== 'present' ? Number(endPoint.slice(0, 4)) : years.length ? Math.max(...years) : null;
    education.push({ degree: degreeText || deg[0], institution, startYear, graduationYear, inProgress: endPoint === 'present' });
    if (education.length >= 4) break;
  }

  // Experience
  const expLines = sections.experience || [];
  const experience = [];
  for (let i = 0; i < expLines.length; i++) {
    const l = expLines[i];
    const m = l.match(RANGE_RE);
    if (!m) continue;
    let head = l.replace(RANGE_RE, '').replace(/[|,(–-]\s*$/, '').replace(/\(\s*\)/, '').trim();
    if (head.length < 3 && i > 0) head = expLines[i - 1];
    let title = null, company = null;
    const parts = head.split(/\s+at\s+|\s+@\s+|\s*\|\s*|\s+[–—-]\s+|,\s+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const ti = parts.findIndex(p => ROLE_RE.test(p) && !COMPANY_HINT.test(p));
      title = parts[ti >= 0 ? ti : 0];
      company = parts.find((p, idx) => idx !== (ti >= 0 ? ti : 0)) || null;
    } else if (parts.length === 1) {
      if (ROLE_RE.test(parts[0]) && i > 0 && !RANGE_RE.test(expLines[i - 1])) { title = parts[0]; company = expLines[i - 1]; }
      else if (i + 1 < expLines.length && ROLE_RE.test(expLines[i + 1])) { company = parts[0]; title = expLines[i + 1]; }
      else { title = parts[0]; }
    }
    const start = parsePoint(m[1]); const end = parsePoint(m[2]);
    const type = /intern|trainee/i.test(title || '') ? 'internship' : /part[- ]time|freelance|contract/i.test(head) ? 'part-time' : 'full-time';
    experience.push({ title, company, start, end, type });
  }

  // Skills
  const skillText = (sections.skills || []).join(', ');
  let skills = skillText.split(/[,|•;\/]|\s{2,}/).map(s => s.replace(/^[a-z ]+:\s*/i, '').trim()).filter(s => s && s.length <= 30);
  const lowerAll = raw.toLowerCase();
  for (const k of KNOWN_SKILLS) {
    const re = new RegExp(`(^|[^a-z0-9.+])${k.replace(/[.+]/g, '\\$&')}(?![a-z0-9+#]|\\.js|\\.com|hub)`, 'i');
    if (re.test(lowerAll) && !skills.some(s => s.toLowerCase().replace(/\.js$/, '') === k.replace(/\.js$/, ''))) skills.push(k);
  }
  skills = [...new Set(skills.map(s => s.trim()))].slice(0, 30);

  const projects = (sections.projects || []).filter(l => l.length > 3).slice(0, 8);
  const certifications = (sections.certifications || []).filter(l => l.length > 3).slice(0, 8);

  return { name, email, phone, github, linkedin, education, experience, skills, projects, certifications, wordCount: raw.split(/\s+/).length };
}

/** 5-word shingles for near-duplicate detection (stored as hashes, not text). */
export function shingles(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 5 <= words.length; i++) {
    const s = words.slice(i, i + 5).join(' ');
    let h = 0; for (let j = 0; j < s.length; j++) h = (h * 31 + s.charCodeAt(j)) | 0;
    out.add(h);
  }
  return [...out];
}
export function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a); let inter = 0;
  for (const x of b) if (A.has(x)) inter++;
  return inter / (A.size + b.length - inter);
}
