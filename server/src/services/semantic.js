/**
 * Pretrained sentence-embedding model: sentence-transformers/all-MiniLM-L6-v2 (ONNX export by Xenova),
 * shipped via npm (@alvix/all-minilm-l6-v2) and executed locally with @huggingface/transformers (onnxruntime-node).
 * No network access is needed at runtime. Falls back to a lexical similarity if the model can't load.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { config } from '../config.js';

const require = createRequire(import.meta.url);
let extractorPromise = null;
let status = { loaded: false, model: 'all-MiniLM-L6-v2', error: null };

async function loadModel() {
  const { pipeline, env } = await import('@huggingface/transformers');
  const pkgJson = require.resolve('@alvix/all-minilm-l6-v2/package.json');
  env.allowRemoteModels = false;
  env.localModelPath = path.join(path.dirname(pkgJson), 'dist') + path.sep;
  const ex = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
  status = { loaded: true, model: 'sentence-transformers/all-MiniLM-L6-v2 (ONNX, local)', error: null };
  return ex;
}

export function semanticStatus() { return status; }

export async function warmUp() {
  if (!config.enableSemanticModel) { status = { loaded: false, model: 'disabled', error: 'ENABLE_SEMANTIC_MODEL=false' }; return; }
  if (!extractorPromise) extractorPromise = loadModel().catch((e) => { status = { loaded: false, model: 'all-MiniLM-L6-v2', error: e.message }; return null; });
  return extractorPromise;
}

const ABBREV = [
  [/\bb\.?\s?tech\b/gi, 'Bachelor of Technology'], [/\bm\.?\s?tech\b/gi, 'Master of Technology'],
  [/\bb\.?\s?e\b\.?(?=\s|,|$)/gi, 'Bachelor of Engineering'], [/\bm\.?\s?e\b\.?(?=\s|,|$)/gi, 'Master of Engineering'],
  [/\bb\.?\s?sc\b/gi, 'Bachelor of Science'], [/\bm\.?\s?sc\b/gi, 'Master of Science'],
  [/\bbca\b/gi, 'Bachelor of Computer Applications'], [/\bmca\b/gi, 'Master of Computer Applications'],
  [/\bmba\b/gi, 'Master of Business Administration'], [/\bb\.?\s?com\b/gi, 'Bachelor of Commerce'],
  [/\bai\s*(&|and)\s*ds\b/gi, 'Artificial Intelligence and Data Science'], [/\baids\b/gi, 'Artificial Intelligence and Data Science'],
  [/\bai\s*(&|and)\s*ml\b/gi, 'Artificial Intelligence and Machine Learning'],
  [/\bcse\b/gi, 'Computer Science and Engineering'], [/\bece\b/gi, 'Electronics and Communication Engineering'],
  [/\beee\b/gi, 'Electrical and Electronics Engineering'], [/\bIT\b/g, 'Information Technology'],
  [/\bceg\b/gi, 'College of Engineering Guindy'], [/\biit\b/gi, 'Indian Institute of Technology'], [/\bnit\b/gi, 'National Institute of Technology'],
  [/\bvit\b/gi, 'Vellore Institute of Technology'], [/\bpsg\s*tech\b/gi, 'PSG College of Technology'],
];
export function expandAbbreviations(s = '') {
  let out = ` ${s} `;
  for (const [re, rep] of ABBREV) out = out.replace(re, rep);
  return out.replace(/\s+/g, ' ').trim();
}

const tokens = (s) => new Set(expandAbbreviations(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !['of', 'in', 'and', 'the'].includes(w)));
function lexical(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size) * 0.6 + inter / new Set([...A, ...B]).size * 0.4;
}

/** Returns { score 0..1, method } */
export async function similarity(a, b) {
  if (!a || !b) return { score: 0, method: 'n/a' };
  const ea = expandAbbreviations(a), eb = expandAbbreviations(b);
  const ex = await warmUp();
  if (ex) {
    const out = await ex([ea, eb], { pooling: 'mean', normalize: true });
    const [va, vb] = out.tolist();
    const cos = va.reduce((s, x, i) => s + x * vb[i], 0);
    // Blend with lexical overlap so short institution names with shared proper nouns are robust.
    return { score: +(0.75 * cos + 0.25 * lexical(a, b)).toFixed(3), method: 'Semantic similarity (Sentence-Transformers all-MiniLM-L6-v2) + abbreviation normalisation' };
  }
  return { score: +lexical(a, b).toFixed(3), method: 'Lexical similarity with abbreviation normalisation (semantic model unavailable)' };
}
