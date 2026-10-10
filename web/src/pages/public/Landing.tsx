import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Mail, ScanFace, FileText, ClipboardCheck, Video, BadgeCheck, Briefcase, Fingerprint, Radar, Scale, Eye, Lock, Sparkles, CheckCircle2, MapPin, Network } from 'lucide-react';
import { Logo } from '../../layouts/AppShell';
import { Button, Pill, MockTag } from '../../components/ui';
import { Gauge } from '../../components/trust';
import { getPublicConfig } from '../../lib/candidate';
import { useAuth, homeFor } from '../../lib/auth';

const STAGES = [
  { icon: Mail, name: 'Apply', text: 'Email OTP and Aadhaar OTP. One identity maps to one account — stored only as a keyed hash.' },
  { icon: ScanFace, name: 'Identity', text: '478-point face landmarks, guided liveness and a face embedding that becomes the identity anchor.' },
  { icon: FileText, name: 'Resume', text: 'Claims extracted and compared with verified academic and employer records — every result explained.' },
  { icon: ClipboardCheck, name: 'Assessment', text: 'SecureHire extension monitors tabs, focus and paste attempts while the face is matched every 10 s.' },
  { icon: Video, name: 'Interview', text: 'Live video with screen share, face continuity, voice consistency and a GPS-camera location overlay.' },
  { icon: BadgeCheck, name: 'Offer', text: 'Tamper-evident offers with QR verification. Acceptance needs a fresh face and identity check.' },
  { icon: Briefcase, name: 'Onboarding', text: 'Day-one identity check against the same anchor, joining documents and a final audit report.' },
];
const CAPS = [
  { icon: Fingerprint, title: 'Identity continuity', text: 'The same person, verified at every step — not just once at the start.' },
  { icon: Radar, title: 'Explainable trust score', text: 'Every point links to a signal, its evidence and the reviewer who acted on it.' },
  { icon: Scale, title: 'Humans decide', text: 'Automated checks only raise review items. Nothing rejects a candidate on its own.' },
  { icon: Network, title: 'IP & location intelligence', text: 'Network and location changes are recorded as context, never as proof of fraud.' },
  { icon: Eye, title: 'Assessment integrity', text: 'Browser monitoring plus face continuity, with honest limits clearly stated.' },
  { icon: Lock, title: 'Privacy by design', text: 'Consent per purpose, encrypted embeddings, HMAC identifiers and configurable retention.' },
];

export default function Landing() {
  const [cfg, setCfg] = useState<any>(null);
  const { user } = useAuth();
  useEffect(() => { getPublicConfig().then(setCfg); }, []);
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-30 border-b border-divider bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-4 sm:px-8">
          <Logo />
          <nav className="hidden gap-6 text-sm text-body md:flex">
            <a href="#journey" className="hover:text-ink">How it works</a><a href="#capabilities" className="hover:text-ink">Capabilities</a><a href="#privacy" className="hover:text-ink">Privacy</a><a href="#demo" className="hover:text-ink">Demo</a><Link to="/verify" className="hover:text-ink">Verify an offer</Link>
          </nav>
          <div className="ml-auto flex gap-2">
            {user ? <Link to={homeFor(user.role)}><Button>Open dashboard</Button></Link> : <>
              <Link to="/login"><Button variant="ghost">Sign in</Button></Link>
              <Link to="/register"><Button>Apply as candidate</Button></Link></>}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <Pill tone="primary" className="mb-5"><Sparkles className="h-3 w-3" />Candidate Trust &amp; Fraud Intelligence</Pill>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">Hire the real candidate, <span className="text-primary">every step of the way.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-body">SecureHire is a continuous trust layer from application to onboarding. It checks that the same verified person — with the claimed identity, experience and skills — moves through every stage, and explains every signal to your reviewers.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register"><Button icon={<ArrowRight className="h-4 w-4" />}>Start as a candidate</Button></Link>
            <Link to="/login"><Button variant="secondary">Recruiter sign in</Button></Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            {['No automatic rejections', 'AI-assisted writing is never penalised', 'Consent for every check'].map((t) => <span key={t} className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-ok" />{t}</span>)}
          </div>
        </motion.div>

        {/* Product preview */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }} className="relative">
          <div className="card p-6 shadow-pop">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">PR</div><div><p className="font-semibold text-ink">Priya Raman</p><p className="text-xs text-muted">Software Engineer — Platform</p></div></div>
              <Pill tone="ok" dot>High Trust</Pill>
            </div>
            <div className="mt-4 flex items-center gap-6">
              <Gauge score={94} size={140} />
              <div className="flex-1 space-y-2.5">
                {[['+15', 'Aadhaar OTP verified', true], ['+10', 'Liveness passed · 478 landmarks', false], ['+10', 'Face matches identity anchor', false], ['+10', 'Clean assessment session', false]].map(([d, l, mock]: any) => (
                  <div key={l} className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-1.5 text-body">{l}{mock && <MockTag />}</span><span className="font-semibold text-ok tnum">{d}</span></div>
                ))}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-7 gap-1.5">
              {STAGES.map((s, i) => <div key={s.name} className="text-center"><div className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full ${i < 6 ? 'bg-ok text-white' : 'border border-primary text-primary'}`}><s.icon className="h-3.5 w-3.5" /></div><p className="mt-1 text-[10px] text-muted">{s.name}</p></div>)}
            </div>
          </div>
          <div className="absolute -bottom-6 -left-4 hidden w-64 card p-4 shadow-pop sm:block">
            <p className="text-xs font-medium text-review">Review needed · Assessment</p>
            <p className="mt-1 text-sm text-ink">Different face detected mid-test</p>
            <p className="mt-1 text-xs text-muted">2 consecutive checks · distance 0.71 · 0 points until a reviewer confirms</p>
          </div>
          <div className="absolute -right-3 -top-5 hidden card px-3 py-2 shadow-pop sm:flex sm:items-center sm:gap-2"><MapPin className="h-3.5 w-3.5 text-risk" /><span className="text-xs text-ink">Chennai · ±18 m · Device GPS</span></div>
        </motion.div>
      </section>

      {/* Problem / solution */}
      <section className="border-y border-divider bg-page">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 md:grid-cols-2">
          <div><p className="label uppercase tracking-wide">The problem</p><h2 className="mt-2 text-2xl font-semibold text-ink">Polished applications are easy to generate. Real people are harder to verify.</h2><p className="mt-3 leading-relaxed text-body">Remote hiring makes duplicated identities, inflated credentials, proxy test-takers and offer-stage substitution harder to spot — and a one-time background check misses what happens in between.</p></div>
          <div><p className="label uppercase tracking-wide">Our approach</p><h2 className="mt-2 text-2xl font-semibold text-ink">A trust layer that travels with the candidate.</h2><p className="mt-3 leading-relaxed text-body">One identity anchor, re-checked at assessment, interview, offer and onboarding. Every check produces an evidence-linked signal; risks stay at zero points until a reviewer confirms them.</p></div>
        </div>
      </section>

      {/* Journey */}
      <section id="journey" className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8">
        <div className="max-w-2xl"><p className="label uppercase tracking-wide">Seven connected stages</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Verification that updates throughout the journey</h2></div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((s, i) => (
            <div key={s.name} className="card p-5 transition hover:shadow-card">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><s.icon className="h-4 w-4" /></span><span className="text-xs font-medium text-muted">Stage {i + 1}</span></div>
              <h3 className="mt-4 font-semibold text-ink">{s.name}</h3><p className="mt-1.5 text-sm leading-relaxed text-body">{s.text}</p>
            </div>
          ))}
          <div className="card flex flex-col justify-center bg-primary p-5 text-white"><p className="text-sm text-white/80">Every stage feeds one</p><p className="mt-1 text-lg font-semibold">explainable trust indicator</p><p className="mt-2 text-sm text-white/80">Weighted by stage, normalised over completed stages — pending stages are never failures.</p></div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="bg-page">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8">
          <div className="max-w-2xl"><p className="label uppercase tracking-wide">Capabilities</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Built for reviewers, fair to candidates</h2></div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPS.map((c) => <div key={c.title} className="card p-6"><c.icon className="h-5 w-5 text-primary" /><h3 className="mt-4 font-semibold text-ink">{c.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-body">{c.text}</p></div>)}
          </div>
          <div className="mt-10 card p-6">
            <p className="label uppercase tracking-wide">Pretrained models running in this prototype</p>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[['Google MediaPipe Face Landmarker', '478 landmarks, blendshapes, head pose — in the browser'], ['face-api.js FaceRecognitionNet', '128-d face embeddings for 1:1 continuity checks'], ['Sentence-Transformers all-MiniLM-L6-v2', 'Semantic comparison of degrees, institutions and titles'], ['MFCC voiceprint (Meyda)', 'Experimental voice consistency hint during interviews']].map(([a, b]) => <div key={a}><p className="font-medium text-ink">{a}</p><p className="mt-1 text-xs text-muted">{b}</p></div>)}
            </div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8">
        <div className="grid gap-10 md:grid-cols-2">
          <div><p className="label uppercase tracking-wide">Privacy &amp; fairness</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Verification without overreach</h2><p className="mt-3 leading-relaxed text-body">Candidates see what is collected, why, and for how long — and can withdraw consent or appeal any flag. Images never leave the browser; only encrypted embeddings are stored.</p></div>
          <ul className="space-y-3 text-sm">
            {['Aadhaar stored only as a keyed HMAC plus a masked value', 'Face and voice embeddings encrypted with AES-256-GCM', 'IP and location changes are context, never automatic penalties', 'Declining optional location never affects the score', 'Configurable retention with audit-logged deletion', 'Simulated government providers are clearly labelled MOCK'].map((t) => <li key={t} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /><span className="text-body">{t}</span></li>)}
          </ul>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="border-t border-divider bg-page">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8">
          <div className="card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-lg"><p className="label uppercase tracking-wide">Hackathon demo mode</p><h2 className="mt-2 text-2xl font-semibold text-ink">Try it with synthetic data</h2><p className="mt-2 text-sm text-body">Register as a new candidate to run the live flow with your own camera, or sign in with a demo account to explore seeded scenarios: duplicate identity, fake graduation year, proxy test-taker, voice anomaly, location change and offer-stage substitution.</p></div>
              <div className="w-full max-w-sm space-y-2">
                {(cfg?.demo?.logins || [{ role: 'recruiter', email: 'recruiter@securehire.dev', password: 'Demo@1234' }]).map((l: any) => (
                  <Link key={l.email} to={`/login?email=${encodeURIComponent(l.email)}`} className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3 hover:border-primary">
                    <span><span className="block text-sm font-medium capitalize text-ink">{l.role}</span><span className="text-xs text-muted">{l.email} · {l.password}</span></span><ArrowRight className="h-4 w-4 text-muted" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <footer className="border-t border-divider"><div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-muted sm:px-8"><Logo /><span>KERNEL PRIME'26 · SW-03 · Prototype — scores are illustrative indicators, not validated fraud probabilities.</span></div></footer>
    </div>
  );
}
