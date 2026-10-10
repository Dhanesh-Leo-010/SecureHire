# 6-minute judge walkthrough

**Before you start:** `npm run dev`, extension loaded, two Chrome windows — **A** recruiter (`recruiter@securehire.dev`), **B** incognito-free normal window for the live candidate. Good lighting.

### 0:00 — The problem (20 s)
Landing page. "AI makes polished applications cheap. SecureHire checks that the *same real person* moves through all seven stages — and a human makes every decision."

### 0:20 — Live candidate: Apply + Identity (90 s) — window B
1. **Apply as candidate** → register. Email OTP appears (demo mode) → verify (+5).
2. Aadhaar: click a synthetic number → consent modal → OTP `123456` (+15). Point at **MOCK** label and "only an HMAC is stored".
3. Identity → consent → camera: **478-point MediaPipe mesh** on your face, head yaw/pitch, lighting check.
4. Start liveness: blink, turn both ways, look straight → face embedding computed **in the browser** → identity anchor created.
   *Window A:* the recruiter bell/overview updates live.

### 1:50 — Duplicate identity (30 s)
Mention, or show: register another account and use the *first* synthetic number (Priya's) → blocked: "This identity is already registered — recover your account." Recruiter sees **Kiran Rao** with a pending *duplicate identity* flag — **0 points until reviewed**.

### 2:20 — Resume intelligence (40 s) — window A
Candidates → **Arjun Kumar** → Resume tab: "B.Tech AI & DS" vs "Bachelor of Technology in AI and Data Science" = **MATCH** (Sentence-Transformers), graduation **2024 vs 2026 = MISMATCH** with explanation; overlapping jobs flagged; Arjun's own appeal is in Audit & consent. "AI-written wording is never a signal — only factual differences."

### 3:00 — Secure assessment with the extension (70 s) — window B
Resume: upload `docs/sample-resumes/priya_raman.pdf` with APAAR `100000000011` (shows mismatches honestly) → Assessment → **Begin**: extension detected → consent → pre-test checks (camera, mic, lighting, one face, extension, server) → Start.
Switch tab, come back, try paste. Popup counts rise. *Window A:* **Live monitoring** shows events streaming; after 3 focus changes a *review item* appears. Corner widget: "Identity verified" every 10 s.
Then show seeded **Rahul Sharma**: different face mid-test (distance 0.71), IP change marked *contextual*, score **92 · Review required · if confirmed: 64**.

### 4:10 — Interview (50 s)
Recruiter schedules an interview for the live candidate → both join. Recruiter sees camera with the **GPS-camera overlay** (device location, accuracy, live clock), the mandatory **shared screen**, face continuity %, experimental voice check. Show **Meera Nair** for the voice anomaly + 2,070 km location change recorded as *context, not fraud*.

### 5:00 — Offer & onboarding (40 s)
**Vikram Iyer**: offer acceptance held — fresh face didn't match the anchor → *identity substitution* review; candidate told "nothing has been rejected". Open `/verify/OFR-PRIYA1` → authentic signed offer; change the `s=` value → **tampered**.
**Priya Raman** → Report → downloadable **PDF verification report**.

### 5:40 — Close (20 s)
Review queue: confirm one flag with a reason → score history moves and it's in the audit log. Admin → weights/retention are configurable. "Explainable, privacy-preserving, and humans decide."
