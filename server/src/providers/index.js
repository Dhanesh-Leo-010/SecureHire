/**
 * Verification provider interfaces. Every provider returns:
 *   { outcome: 'success'|'failure'|'mismatch'|'missing'|'pending'|'unavailable', provider, simulated, data?, message? }
 * The MOCK implementations below use synthetic records only. To integrate a real, authorized service,
 * implement the same method signatures (e.g. an AUA/KUA Aadhaar e-KYC partner, DigiLocker Partner API,
 * APAAR via API Setu) and select it with the *_PROVIDER environment variables.
 */
import { randomId, isValidAadhaar } from '../security.js';
import { AADHAAR_REGISTRY, AADHAAR_TEST_TRIGGERS, MOCK_AADHAAR_OTP, APAAR_REGISTRY, EMPLOYMENT_REGISTRY } from './mockData.js';

const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const base = (provider) => ({ provider, simulated: true });

export const MockAadhaarProvider = {
  name: 'mock-aadhaar',
  /** Step 1: request OTP to the Aadhaar-linked mobile (simulated). */
  async requestOtp(aadhaar) {
    const n = String(aadhaar).replace(/\s|-/g, '');
    if (!isValidAadhaar(n)) return { ...base(this.name), outcome: 'failure', message: 'Aadhaar number failed format/checksum validation.' };
    if (n === AADHAAR_TEST_TRIGGERS.unavailable) return { ...base(this.name), outcome: 'unavailable', message: 'Provider temporarily unavailable (simulated). Try again later.' };
    if (n === AADHAAR_TEST_TRIGGERS.pending) return { ...base(this.name), outcome: 'pending', message: 'Verification queued for manual processing (simulated).' };
    return { ...base(this.name), outcome: 'success', data: { txnId: randomId('TXN', 8), mobileHint: 'XXXXXX' + String(n).slice(-4).split('').reverse().join('').slice(0, 4) } };
  },
  /** Step 2: verify OTP; returns demographic data only when the synthetic registry has it. */
  async verifyOtp(aadhaar, otp) {
    if (String(otp) !== MOCK_AADHAAR_OTP) return { ...base(this.name), outcome: 'failure', message: 'Incorrect OTP.' };
    const rec = AADHAAR_REGISTRY[String(aadhaar).replace(/\s|-/g, '')];
    return { ...base(this.name), outcome: 'success', data: rec ? { name: rec.name, dob: rec.dob } : null };
  },
};

export const MockDigiLockerProvider = {
  name: 'mock-digilocker',
  async fetchDocuments({ name, dob, recordName, recordDob, apaarId }) {
    if (!recordName && !name) return { ...base(this.name), outcome: 'missing', message: 'No linked DigiLocker account found (simulated).' };
    const docName = recordName || name;
    const docs = [
      { type: 'Aadhaar (e-Aadhaar XML)', issuer: 'UIDAI', nameOnDoc: docName, dob: recordDob || dob || null, docNo: 'XXXX-XXXX-' + Math.floor(1000 + Math.random() * 9000) },
      { type: 'PAN Card', issuer: 'Income Tax Department', nameOnDoc: docName, docNo: 'XXXXX' + Math.floor(1000 + Math.random() * 9000) + 'X' },
    ];
    const ap = apaarId && APAAR_REGISTRY[apaarId];
    if (ap) docs.push({ type: 'Degree Certificate', issuer: ap.institution, nameOnDoc: docName, docNo: ap.certificateId, year: ap.graduationYear });
    const nameMatches = norm(docName) === norm(name);
    return {
      ...base(this.name),
      outcome: nameMatches ? 'success' : 'mismatch',
      message: nameMatches ? 'Issued documents retrieved (simulated).' : `Name on issued documents ("${docName}") differs from profile name ("${name}").`,
      data: { documents: docs },
    };
  },
};

export const MockApaarProvider = {
  name: 'mock-apaar',
  async getAcademicRecord(apaarId) {
    if (!/^\d{12}$/.test(String(apaarId || ''))) return { ...base(this.name), outcome: 'failure', message: 'APAAR ID must be 12 digits.' };
    const rec = APAAR_REGISTRY[apaarId];
    if (!rec) return { ...base(this.name), outcome: 'missing', message: 'No academic record found for this APAAR ID (simulated registry).' };
    return { ...base(this.name), outcome: 'success', data: rec };
  },
};

export const MockEmploymentProvider = {
  name: 'mock-employment',
  async verify({ name, employer, title, start, end }) {
    const hit = EMPLOYMENT_REGISTRY.find(r => norm(r.name) === norm(name) && (norm(employer).includes(norm(r.employer).split(' ')[0]) || norm(r.employer).includes(norm(employer).split(' ')[0] || '~')));
    if (!hit) return { ...base(this.name), outcome: 'missing', message: 'Employer has not confirmed this record (simulated). Upload evidence or request confirmation.' };
    const issues = [];
    if (start && hit.start && start.slice(0, 7) !== hit.start) issues.push(`start ${start.slice(0, 7)} vs confirmed ${hit.start}`);
    const endNorm = end ? end.slice(0, 7) : null;
    if ((endNorm || null) !== (hit.end || null)) issues.push(`end ${endNorm || 'present'} vs confirmed ${hit.end || 'present'}`);
    return {
      ...base(this.name), outcome: issues.length ? 'mismatch' : 'success',
      data: { confirmed: hit }, message: issues.length ? `Employer confirmed employment with differences: ${issues.join('; ')}.` : 'Employer confirmed employment (simulated).',
    };
  },
};

export const providers = {
  aadhaar: MockAadhaarProvider,
  digilocker: MockDigiLockerProvider,
  apaar: MockApaarProvider,
  employment: MockEmploymentProvider,
};
