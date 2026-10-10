# MASTER DEVELOPMENT PROMPT (Corrected)
## Candidate Trust & Fraud Intelligence Platform
### KERNEL PRIME'26 — SW-03

You are a senior full-stack engineer, AI/ML engineer, cybersecurity engineer, and Chrome extension developer.

Build a complete, functional, production-inspired hackathon prototype called **Candidate Trust & Fraud Intelligence Platform**.

Do not create only static frontend screens. Build an integrated working application with frontend, backend, database, AI inference services, authentication, candidate portal, recruiter dashboard, admin dashboard, and Chrome extension.

Generate actual project files, implement APIs, connect components, run available tests, fix errors, and provide deployment instructions.

---

# 0. HOW TO WORK ON THIS PROJECT

1. Save this file in the repository as `docs/SPEC.md`. It is the single source of truth.
2. Build in the phases defined in Section 21. Complete one phase per session.
3. At the start of every session, read `docs/SPEC.md` and `docs/PROGRESS.md`.
4. At the end of every phase, update `docs/PROGRESS.md` with: what was built, how to run it, test results, what is mocked, what is untested, and known issues.
5. Do not claim anything works unless it has been implemented and tested.
6. If something in this spec cannot be built as written, implement the closest honest version, label it clearly, and record the gap in `docs/PROGRESS.md`.

---

# 1. PROBLEM STATEMENT

Modern hiring relies on digital applications, remote assessments, virtual interviews, and electronic onboarding.

AI-generated resumes, fraudulent credentials, proxy test-takers, identity substitution, and unauthorized assistance make it difficult for employers to establish candidate authenticity.

Build a Candidate Trust & Fraud Intelligence Platform that continuously verifies whether the same real person, with the claimed identity, experience, and demonstrated skills, progresses through the complete hiring journey.

The platform supports seven stages:

1. Apply
2. Identity
3. Resume
4. Assessment
5. Interview
6. Offer
7. Onboarding

The platform maintains a centralized, explainable Trust Score and updates recruiters in real time. Trust is updated throughout the process, not treated as a one-time background check.

---

# 2. CORE PLATFORM REQUIREMENTS

## 2.1 Candidate Portal
- Registration and login.
- Seven-stage hiring progress tracker (later stages unlock as earlier ones complete).
- Email and identity verification.
- Resume upload.
- Assessment page.
- Live one-on-one interview room.
- Offer acceptance.
- Onboarding verification.
- Consent management (view, grant, withdraw).
- Verification status and notifications.

## 2.2 Recruiter Dashboard
- Candidate directory.
- Current hiring stage.
- Trust Score (0–100) with band.
- Trust Score timeline graph.
- Verification status per stage.
- Resume discrepancy reports.
- Assessment integrity reports.
- Live interview monitoring.
- IP and geolocation session events.
- Fraud-risk alerts and human review queue.
- Verification evidence.
- Audit logs.
- Manual review and override controls (comment required, audit-logged).

## 2.3 Administrator Dashboard
Authorized administrators configure:
- Trust Score weights.
- Review thresholds and score bands.
- Required verification checks per hiring type (enterprise, staffing, contractor, remote, high-volume).
- User roles.
- Data retention periods per data type.
- Assessment website allowlist.
- Integration settings (mock vs real providers).
- Monitoring policies.

---

# 3. CENTRALIZED TRUST SCORE ENGINE

Every candidate begins with a Trust Score of **50/100**, representing an unverified state.

Every verification generates a trust signal event:

```json
{
  "candidate_id": "CAND001",
  "stage": "identity",
  "signal_name": "face_match",
  "result": "verified",
  "status": "verified",
  "score_delta": 10,
  "evidence": {},
  "source": "face_recognition_service",
  "timestamp": "ISO-8601"
}
```

## 3.1 Signal Status Lifecycle

Every signal has exactly one status:

| Status | Meaning | Effect on score |
|---|---|---|
| `verified` | A positive check passed | Positive delta applies immediately |
| `pending_review` | Automated detection of a possible problem | 0 until a reviewer acts |
| `confirmed` | A reviewer confirmed the problem | Negative delta applies |
| `dismissed` | A reviewer rejected the flag | No effect; kept for audit |
| `contextual` | Informational only (IP change, VPN, focus loss, GPS denied) | Never changes the score |

Automated systems never apply negative points on their own. Negative points apply only after human confirmation.

## 3.2 Requirements
- Score range 0–100, clamped.
- Weights configurable by administrators (seed with values in this spec).
- Recompute after every event; store every value in score history.
- Real-time updates via WebSockets.
- Explainable: every score change links to its signal, stage, evidence, and reviewer.
- Human review workflow with mandatory reviewer comments.
- **No automatic candidate rejection anywhere in the system.**

## 3.3 Score Bands
- 80–100: High Trust
- 60–79: Moderate Trust
- 40–59: Needs Review
- 0–39: High Risk — Human Review Required

These bands and weights are illustrative prototype heuristics, not validated fraud probabilities. Display this note in the UI.

## 3.4 Never a Fraud Signal on Its Own
AI-generated resume wording, VPN use, location changes, IP changes, disability-related differences, career changes, or refusing optional permissions (such as GPS) must never reduce the score by themselves.

---

# 4. STAGE 1 — APPLY

## Goal
Verify registration information and detect duplicated identity records. One real person = one Aadhaar = one email.

## 4.1 Email Verification
- Candidate enters email.
- Send 6-digit OTP (10-minute expiry, rate-limited) via SMTP. Use Mailpit in development so OTPs actually arrive.
- Signal: `email_verified` +5.

## 4.2 Aadhaar Verification (Mock)
- Consent screen before collecting Aadhaar.
- Validate format and Verhoeff checksum.
- Simulate Aadhaar-linked OTP verification using a **Mock Aadhaar Provider** behind an `AadhaarProvider` interface for future authorized integration.
- Label in UI: "MOCK — not real UIDAI verification."
- Signal: `aadhaar_verified` +15.

## 4.3 One Aadhaar — One Email Policy
- Store only `HMAC-SHA256(aadhaar, secret_key)` (key from environment/secret manager) and a masked value (`XXXX-XXXX-1234`).
- Never store, log, or return the plaintext Aadhaar number.
- If the HMAC already belongs to another account: block the new registration, show "This identity is already registered — recover your account," and create a `pending_review` signal `duplicate_identity`.
- Legitimate email changes go through an account-recovery flow, not a fraud flag.

## 4.4 Session Signals
Collect proportionate, consented session metadata:
- Browser information and session ID.
- Public IP address (captured server-side with trusted-proxy configuration).
- Approximate IP-based location (MaxMind GeoLite2).
- Repeated applications from the same IP/session in a short window.
- Form timing anomalies.

Avoid invasive device fingerprinting.

## Trust Signals
- `email_verified`: +5
- `aadhaar_verified`: +15
- `duplicate_identity`: pending_review (−30 if confirmed)
- Suspicious session pattern: pending_review or contextual

---

# 5. STAGE 2 — IDENTITY

## Goal
Verify that the candidate is the person associated with the submitted identity and create a reusable identity anchor.

## 5.1 Application Data Verification
Compare registration data (name, date of birth) with mock identity records. Unexplained differences create a `pending_review` signal.

## 5.2 Live Webcam Capture
- Consent first, then request camera permission.
- Live webcam feed.
- Face presence, image quality, lighting check, multiple-face detection.

## 5.3 AI Facial Landmark Detection
**Mandatory pretrained model: Google MediaPipe Face Landmarker** (tasks-vision, in the browser).

Implement:
- Real-time detection of up to 478 landmarks (eyes, eyebrows, nose, lips, cheeks, chin, jawline, contours).
- Landmark dots and mesh drawn over the live camera feed.
- Face alignment and head pose estimation.
- Facial movement tracking and landmark consistency analysis.

Facial symmetry, face shape, Golden Ratio measurements, or aesthetic scores must never influence trust.

## 5.4 Liveness Verification
Guided challenges in random order, measured with MediaPipe landmarks:
- Blink (eye aspect ratio).
- Turn head left.
- Turn head right.
- Look at camera.

Label as "basic liveness — not certified presentation-attack detection."

## 5.5 Facial Identity Recognition
Use a pretrained face-embedding model (InsightFace or DeepFace) in an AI microservice.

Workflow: Live Face Capture → Alignment → Embedding → Reference Comparison → Similarity Result

Display match status, similarity score, and whether human review is needed.

Note: InsightFace pretrained models are licensed for non-commercial/research use; acceptable for a hackathon, document it.

## 5.6 Identity Anchor (Face Reference)
The Aadhaar OTP flow does **not** return a photograph. Therefore:
- The **identity anchor** is the embedding of the liveness-verified enrollment selfie.
- Cross-check the anchor against the ID photo returned by the Mock DigiLocker Provider.
- Store the anchor encrypted at rest (AES-GCM) with role-based access, consent ID, retention date, and a deletion workflow.
- Reuse the anchor in Assessment, Interview, Offer, and Onboarding.

## 5.7 Duplicate Face Detection
Use pgvector (or FAISS) to compare the new anchor with all existing anchors. Above threshold → `pending_review` signal `possible_duplicate_face`.

## 5.8 Public Image Verification
Do not build unrestricted face search or web scraping. Optional only where legally permitted, through an authorized provider, with explicit consent. Not required for the prototype.

## 5.9 DigiLocker Verification (Mock)
**Mock DigiLocker Provider** supporting: success, document mismatch, missing document, pending, provider unavailable. Triggered when there is a concern (low face match, duplicate suspicion) or on recruiter request.

## Trust Signals
- `liveness_passed`: +10
- `face_match`: +10
- `digilocker_verified`: +10
- `face_mismatch`: pending_review (−25 if confirmed)
- `possible_duplicate_face`: pending_review (−30 if confirmed)
- `liveness_failed`: pending_review (retry allowed)

---

# 6. STAGE 3 — RESUME

## Goal
AI-powered resume verification using pretrained NLP models, verified records, and explainable rules.

## 6.1 Resume Upload
Accept PDF and DOCX (max 5 MB). Store encrypted.

Extract: name, degree, college, graduation year, employers, job titles, employment dates, skills, projects, certifications.

## 6.2 AI Resume Parsing
- pdfplumber / PyMuPDF and python-docx for text.
- spaCy NER plus regex and date parsing for structured fields.
- LayoutLMv3 is optional; use only if extraction quality requires it.
- Use pretrained models; do not train a language model from scratch.

## 6.3 Verified Academic Records (Mock)
Provider abstraction for DigiLocker, APAAR-linked academic records, and API Setu services. For the prototype, implement a **Mock APAAR Academic Provider** with realistic synthetic records. Retrieve only after explicit consent.

## 6.4 AI Claim Comparison
Workflow: Resume → Extraction → Verified Record Retrieval → Normalization → Semantic Comparison + Rules → Verification Report

- Semantic (Sentence Transformers, e.g., `all-MiniLM-L6-v2`): degree names, institution names, job titles.
- Deterministic: graduation year, employment dates, credential IDs, grades.

## 6.5 Inconsistency Detection
Detect: graduation year mismatch, degree mismatch, institution mismatch, impossible date sequences (graduating before enrolling), employment timeline conflicts, conflicting resume versions, unverified certifications, unsupported employment claims, copied resume content.

Overlapping part-time jobs, career changes, unsupported skills, and AI-written wording are not fraud by themselves.

## 6.6 Explainable Results
Each claim receives one status: **MATCH**, **MISMATCH**, **MISSING**, or **HUMAN REVIEW**.

Show: resume claim, verified value, source document, comparison method, explanation, review status.

Example:
- Resume degree: B.Tech AI & DS
- Resume graduation year: 2024
- Verified graduation year: 2026
- Result: MISMATCH
- Reason: Graduation year differs from the verified academic record.

## 6.7 Employment Verification (Mock)
**Mock Employment Verification Provider**, employer confirmation, reference verification, evidence upload, reviewer notes.
Statuses: Verified, Pending, Unverifiable, Mismatch.

## 6.8 Duplicate Resume Detection
Sentence Transformers similarity against other candidates' resumes → `pending_review`.

## Trust Signals
- `academic_verified`: +10
- `employment_verified`: +5 each
- `credential_mismatch`: pending_review (−20 if confirmed)
- `date_conflict`: pending_review (−10 if confirmed)
- `duplicate_resume`: pending_review (−20 if confirmed)

---

# 7. STAGE 4 — SECURE ASSESSMENT

## Goal
A secure assessment enforced and monitored by a Chrome Manifest V3 extension.

## 7.1 Chrome Extension: SecureHire Assessment Monitor
Generate actual files: `manifest.json`, `background.js`, `content.js`, `popup.html`, `popup.js`, `popup.css`, `README.md`, a sample assessment page, backend integration modules, and tests where feasible.

All restrictions apply **only during an active, consented session** and are fully restored when the session ends.

## 7.2 Mandatory Installation
- The assessment page detects the extension (via `externally_connectable` messaging).
- The Start button stays disabled until the extension is installed and connected.

## 7.3 Website Lock
- Only allowlisted assessment domains may load.
- New tabs and windows are closed automatically (`chrome.tabs.onCreated`, `chrome.windows.onCreated`).
- Navigation to non-allowlisted URLs is blocked (`declarativeNetRequest` session rules).
- Every attempt is logged.

## 7.4 Other Extensions Disabled
- Using the `management` permission, list and disable all other user-installed extensions at session start.
- Re-enable exactly those extensions when the session ends (persist the list in case of crash).
- Extensions that cannot be disabled (e.g., installed by enterprise policy) are logged as contextual events.

## 7.5 Input Lockdown
On the assessment page, block: copy, cut, paste, right-click, text selection, print, and common developer-tools shortcuts. Log each attempt. Never read clipboard contents.

## 7.6 Fullscreen, Tab Visibility, and Focus
- Enforce fullscreen; log exits.
- Log tab hidden/visible and window focus loss/restore with timestamps.
- These are contextual events, not automatic cheating findings.

## 7.7 Pre-Test Environment Check
After consent, all must pass before starting:
- Camera ON (mandatory).
- Microphone ON (mandatory).
- Adequate lighting (average frame brightness above threshold).
- Exactly one face detected.
- Extension connected.
- Backend connected.

## 7.8 Continuous Facial Monitoring
- MediaPipe for face presence and multiple faces.
- Every ~10 seconds, compare the live embedding with the identity anchor.
- Landmark jitter and texture inconsistencies may be logged as experimental morphing indicators. Do not claim reliable deepfake detection.

## 7.9 Audio Monitoring
- Voice activity detection; possible additional speaker → review event.
- No raw audio stored unless separately consented.

## 7.10 Assessment Behavior Analysis
Rule-based: answer timing, completion duration, very fast correct answers, uniform timing, sudden accuracy jumps. High performance is never proof of cheating.

## 7.11 IP and Location
- Public IP from authenticated backend requests (trusted-proxy config; never trust client-supplied IP headers).
- Approximate location via MaxMind GeoLite2 or IPinfo (country, state, city). Never present it as precise.
- Optional browser GPS only with separate consent; denial is never suspicious.
- IP changes, location changes, VPN, mobile networks, and travel are contextual events.

## 7.12 Extension Popup
Monitoring status, session ID, counts of tab/focus/fullscreen/copy-paste/blocked-navigation events, backend connection status.

## 7.13 Backend Event Logging
Authenticated REST endpoint, timestamps, retry queue, idempotency keys, validation, session authorization. Request only the permissions this spec needs. No remotely hosted executable code.

## 7.14 Recruiter Assessment Dashboard
Candidate details, assessment status, Trust Score, event timeline, face monitoring status, snapshot evidence, network/location events, integrity alerts, review controls.

## 7.15 Honest Limitations (document in README and UI)
The extension cannot stop a second device (phone), a person off-camera, or another browser profile/application outside Chrome. It is a strong deterrent and monitoring layer, not a guarantee.

## Trust Signals
- `clean_session`: +10
- `assessment_face_mismatch`: pending_review (−30 if confirmed)
- `multiple_faces`: pending_review
- Tab/focus/fullscreen/blocked-navigation/copy-paste attempts: contextual
- IP/location changes: contextual
- Significant behavior anomaly: pending_review (−10 if confirmed)

---

# 8. STAGE 5 — LIVE ONE-ON-ONE INTERVIEW

## Goal
Verify that the person in the interview is the verified candidate, within a professional live video experience.

## 8.1 Interview Room
WebRTC (peer-to-peer) with FastAPI WebSocket signaling and public STUN; document TURN server needs for production.
Features: candidate and recruiter join, camera, microphone, **mandatory screen sharing**, timer, controls, connection status, verification side panel.

## 8.2 Extension Reuse
The interview requires the SecureHire extension in "interview mode": website lock, other-extension disabling, input lockdown, and focus logging from Stage 4.

## 8.3 Live Facial Verification
MediaPipe + identity anchor comparison every ~10 seconds; face presence and multiple-face events; live indicators.

## 8.4 Voice Verification (throughout the interview)
- Consented voice enrollment at the start (or reuse from assessment).
- SpeechBrain (ECAPA) or Resemblyzer speaker embeddings on rolling windows of the candidate's audio track.
- Voice-change and second-speaker alerts as `pending_review`.
- Voice differences are never conclusive by themselves.

## 8.5 Lip-Sync Consistency (Experimental)
Simple correlation between mouth openness (landmarks) and audio energy. Clearly labeled EXPERIMENTAL. Account for network latency. Never a score penalty on its own.

## 8.6 Screen Sharing
Request through browser APIs, display status, detect stop (track `ended`), log, and notify the recruiter.

## 8.7 IP and Geolocation
Record candidate ID, interview session ID, IP, timestamp, network changes. Approximate IP location plus optional consented device location with source, accuracy, and timestamp. Compare with assessment locations; differences are contextual.

## 8.8 GPS MAP CAMERA-STYLE LIVE VIDEO OVERLAY (Mandatory)
A semi-transparent dark bar at the bottom of the candidate's live video showing:
- Location-pin icon.
- City, State, Country.
- Consented address where available.
- Latitude, Longitude.
- Date, live-updating time, timezone.
- Location source and accuracy.
- Last location update time and permission status.

Example (illustrative values):
```
📍 Chennai, Tamil Nadu, India
Lat: 13.024497°  Long: 80.017567°
Thursday, 08/10/2026  09:30 PM IST
Source: Device Geolocation  •  Accuracy: ±25 m
```

Rules:
- Device GPS only with separate consent (`getCurrentPosition`, then `watchPosition` for continuous updates). Stop immediately when the session ends.
- Without GPS, show IP-based location labelled "Approximate (IP)."
- Never invent coordinates.
- Readable white text, responsive on desktop and mobile.

## 8.9 Assessment vs Interview Comparison
Compare face embeddings, voice samples, session metadata, approximate locations, and network changes. Show inconsistencies for review.

## 8.10 Live Recruiter Verification Panel
Live candidate video, current Trust Score (updating live), face status, voice status, screen-share status, IP location, device location, overlay, alert feed with timestamps.

## Trust Signals
- `interview_identity_consistent` (face + voice): +10
- `interview_identity_inconsistent`: pending_review (−25 if confirmed)
- `second_speaker`: pending_review
- `screen_share_stopped`: pending_review
- Location/IP change: contextual

---

# 9. STAGE 6 — OFFER

## Goal
Prevent identity substitution at offer acceptance.

## 9.1 Offer Release
Recruiter reviews Trust Score, verification history, unresolved flags, assessment and interview reports. The offer can be released only after unresolved high-risk flags are reviewed.

## 9.2 Fresh Identity Verification
Offer acceptance requires: fresh live face capture, liveness challenge, comparison with the anchor, and mock Aadhaar OTP re-verification.

## 9.3 Cross-Stage Comparison
Compare identity evidence from Apply, Identity, Assessment, and Interview.

## 9.4 Contact Consistency
Check email, phone, and session changes. Changes require a candidate explanation and create a review flag, not a rejection.

## 9.5 Offer Record
Generate an offer acceptance record with verification references.

## Trust Signals
- `offer_identity_consistent`: +10
- `identity_substitution`: pending_review (−40 if confirmed, mandatory review)
- Unexplained contact change: pending_review (−10 if confirmed)

---

# 10. STAGE 7 — ONBOARDING

## Goal
Confirm the person joining is the verified hired candidate, reusing existing features.

## 10.1 Day-One Verification
Fresh face capture, liveness, anchor comparison, mock Aadhaar re-verification, voice sample when consented.

## 10.2 Cross-Stage Verification
Compare with enrollment, assessment, interview, and offer evidence (face, voice, identity HMAC).

## 10.3 Joining Documents
Mock DigiLocker joining documents compared with previously verified documents.

## 10.4 Final Verification Report (PDF)
Candidate ID, stage history, all verification outcomes, Trust Score history chart, evidence references, unresolved items, final reviewer decision, and mock-provider disclaimers.

## 10.5 Retention and Deletion
Scheduled job applying admin-configured retention for identity records, face and voice embeddings, documents, IP/location events, and assessment events. Every deletion is logged.

## Trust Signals
- `onboarding_verified`: +10
- `onboarding_identity_inconsistent`: pending_review (−40 if confirmed); onboarding paused until review

---

# 11. RECRUITER DASHBOARD DESIGN

Stack: React, TypeScript, Tailwind CSS, Recharts, Lucide icons.

Visual direction: dark navy and charcoal theme, glass-style panels, subtle gradients, professional typography, clean spacing, smooth micro-interactions, responsive layouts.

Sections:
1. Overview
2. Candidates
3. Seven-Stage Pipeline
4. Identity Intelligence
5. Resume Intelligence
6. Assessment Integrity
7. Live Interview Monitoring
8. Offer Verification
9. Onboarding
10. Alerts and Human Review
11. Audit Logs
12. Admin Settings

Candidate detail page: profile, current stage, Trust Score with band, score history chart, verification status per stage, evidence-linked signal table, facial landmark verification status, resume comparison results, assessment events, interview results, network and location events, reviewer comments.

Live Trust Score via WebSockets without manual refresh. Every mocked feature visibly labelled "MOCK".

---

# 12. TECH STACK

| Area | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Recharts, Lucide React |
| Backend | FastAPI, REST, WebSockets, Pydantic, SQLAlchemy, Alembic |
| Database | PostgreSQL + pgvector (FAISS optional) |
| Face | MediaPipe Face Landmarker, InsightFace or DeepFace, OpenCV |
| NLP | spaCy, Sentence Transformers, LayoutLMv3 (optional) |
| Voice | SpeechBrain or Resemblyzer |
| Documents | pdfplumber / PyMuPDF, python-docx |
| Extension | Chrome Manifest V3, JavaScript |
| Video | WebRTC (STUN; TURN for production) |
| Geolocation | Browser Geolocation API, MaxMind GeoLite2 or IPinfo |
| Email (dev) | Mailpit |
| Security | JWT, RBAC, TLS, AES-GCM at rest, HMAC for identifiers, consent logs, audit trails, secret management |

---

# 13. MOCK INTEGRATIONS

Government and restricted services are implemented behind replaceable provider interfaces:
- Mock Aadhaar Provider
- Mock DigiLocker Provider
- Mock APAAR Academic Provider
- Mock Employment Verification Provider

Each supports: success, failure, mismatch, missing record, pending review, provider unavailable.

Use clearly labelled synthetic test records. Never claim mock verification is real government verification.

---

# 14. DEMO SCENARIOS

Seed realistic synthetic candidates for:

1. **Genuine Candidate** — completes all seven stages; Trust Score rises to ~90.
2. **Duplicate Identity** — same mock Aadhaar with another email; registration blocked and flagged.
3. **Fake Academic Claim** — resume graduation year conflicts with mock APAAR record; explainable MISMATCH.
4. **Proxy Assessment** — different face appears mid-assessment; real-time face mismatch alert.
5. **Interview Voice Anomaly** — voice mismatch during interview; recruiter alert.
6. **Location Anomaly** — assessment and interview locations differ; contextual event, no fraud declared.
7. **Offer Identity Substitution** — offer-stage face conflicts with anchor; held for human review.
8. **Genuine Onboarding** — passes checks; final PDF report generated.

---

# 15. PROJECT STRUCTURE

```text
candidate-trust-platform/
├── frontend/
│   ├── src/
│   │   ├── components/  pages/  layouts/  hooks/
│   │   ├── services/    contexts/
│   │   └── App.tsx
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── api/  models/  schemas/  services/
│   │   ├── providers/   (mock + interfaces)
│   │   ├── security/
│   │   └── main.py
│   ├── tests/
│   └── requirements.txt
├── ai-services/
│   ├── face_recognition/
│   ├── resume_parser/
│   ├── resume_verification/
│   └── voice_verification/
├── securehire-extension/
│   ├── manifest.json  background.js  content.js
│   ├── popup.html  popup.js  popup.css
│   └── README.md
├── database/
│   ├── migrations/
│   └── seed_data/
├── docs/
│   ├── SPEC.md  PROGRESS.md  DEMO_SCRIPT.md
├── docker-compose.yml
├── .env.example
└── README.md
```

(MediaPipe face landmarks run in the browser, inside `frontend/`.) Adjust where needed for working integration.

---

# 16. DATABASE REQUIREMENTS

Tables: users, candidates, recruiters, applications, hiring_stages, consent_records, identity_verifications, face_embeddings (encrypted), voice_embeddings (encrypted), resume_claims, verified_documents, resume_discrepancies, employment_verifications, assessment_sessions, assessment_events, interview_sessions, interview_verifications, network_events, location_events (consented), trust_signals, trust_score_history, signal_weights, human_reviews, offers, onboarding, retention_policies, audit_logs.

Use foreign keys, indexes, migrations, and access controls.

Do not store raw Aadhaar numbers, unnecessary raw biometric data, raw audio by default, or unrestricted precise location history.

---

# 17. FUNCTIONAL REQUIREMENTS

Must work for real (not hardcoded):
- Candidate, recruiter, admin authentication and role-based routing.
- Database persistence.
- Email OTP (via Mailpit in dev).
- Mock Aadhaar with HMAC uniqueness enforcement.
- MediaPipe facial landmark overlay and liveness.
- Face embedding comparison and duplicate search.
- Resume upload, parsing, and rule/semantic discrepancy detection.
- Chrome extension: install detection, tab/website lock, extension disabling and restoring, input lockdown, event reporting.
- Assessment event backend.
- Live one-on-one interview with screen sharing.
- Voice verification.
- GPS Map Camera-style overlay with IP fallback.
- IP-based approximate location lookup.
- Trust Score engine with review lifecycle and real-time alerts.
- Final PDF report.

Use mocks only where real integrations are unavailable or restricted, and label them in UI and docs. Do not replace functionality with decorative animations or hardcoded success messages.

---

# 18. SECURITY, PRIVACY AND FAIRNESS

1. Explicit consent before identity, biometric, camera, microphone, screen, document, or precise-location processing.
2. Data minimization.
3. Encrypt sensitive data at rest; TLS in transit.
4. Role-based access control on every endpoint.
5. Secrets only from environment/secret manager.
6. Audit-log all administrative overrides and data access.
7. Configurable retention and deletion.
8. No automatic rejection based on AI predictions or scores.
9. No penalty for AI-assisted writing.
10. Facial aesthetics never used as evidence.
11. An IP address does not identify a physical person.
12. GPS or other optional permission denial is never fraud.
13. Human review and correction process for every flag.
14. Clear disclosure of AI confidence limits and monitoring limits.
15. Development-only endpoints disabled in production.

---

# 19. TESTING REQUIREMENTS

Generate and run tests for: authentication, authorization, registration, email OTP, mock identity verification, HMAC uniqueness, Trust Score math and status lifecycle, signal persistence, resume extraction, field comparison, face matching integration, extension event ingestion and idempotency, location permission handling, interview session lifecycle, offer verification, onboarding verification, report generation, retention deletion.

Validate: frontend build, backend startup, migrations from scratch, API integration, extension manifest and file structure, WebSocket communication.

Fix identified errors. For webcam, microphone, screen share, and extension behavior that cannot be tested automatically, provide reproducible manual test steps and state clearly what remains untested.

---

# 20. DEPLOYMENT REQUIREMENTS

Provide: local setup, `.env.example`, database setup, AI model download instructions, backend and frontend startup commands, Chrome extension installation (Load unpacked), sample test credentials, synthetic data notice, and a deployment guide.

Targets: Frontend on Vercel; Backend on Render or Railway; managed PostgreSQL with pgvector; extension loaded unpacked for the demo.

Explain WebRTC signaling, HTTPS requirement for camera/mic/geolocation, and TURN server needs for production.

---

# 21. DEVELOPMENT PHASES

Complete one phase per session. Each phase ends with tests run, errors fixed, and `docs/PROGRESS.md` updated.

### Phase 1 — Foundation
Monorepo, Docker Compose (Postgres+pgvector, backend, frontend, Mailpit), all database tables, JWT auth with three roles, role-based layouts, 7-stage tracker shell, recruiter and admin shells, audit middleware, seed data for all 8 scenarios.
**Done when:** `docker compose up` works; all roles log in; auth tests pass; frontend builds.

### Phase 2 — Trust Infrastructure
Signal model and status lifecycle, score engine with configurable weights, score history, explainability API, WebSocket recruiter channel, human review queue, consent service and reusable consent modal, candidate detail page with live chart.
**Done when:** injected signals update the recruiter page live; pending flags don't change the score until confirmed; score tests pass.

### Phase 3 — Apply and Identity
Email OTP, mock Aadhaar with HMAC uniqueness, session signals, MediaPipe landmark overlay, liveness, face embedding service, identity anchor, duplicate face search, mock DigiLocker, Identity Intelligence view.
**Done when:** scenario 2 is blocked and flagged; overlay and liveness run live.

### Phase 4 — Resume Intelligence
Upload, extraction, mock APAAR and employment providers, semantic + deterministic comparison, MATCH/MISMATCH/MISSING/HUMAN REVIEW report, duplicate resume detection, Resume Intelligence view.
**Done when:** scenario 3 shows an explainable mismatch.

### Phase 5 — Secure Assessment
SecureHire extension (install detection, website lock, tab closing, extension disabling/restoring, input lockdown, fullscreen/focus logging, popup), pre-test checks, sample assessment, face and audio monitoring, behavior rules, IP/location, Assessment Integrity view.
**Done when:** extension loads unpacked without errors; restrictions work and restore; scenario 4 alerts in real time.

### Phase 6 — Live Interview
WebRTC room with signaling, mandatory screen share, extension interview mode, live face and voice verification, experimental lip-sync, GPS Map Camera overlay with IP fallback, assessment-vs-interview comparison, recruiter side panel.
**Done when:** two browsers can interview with screen share; scenarios 5 and 6 produce correct alerts.

### Phase 7 — Offer and Onboarding
Offer release gate, fresh identity re-verification, cross-stage comparison, contact consistency, onboarding checks, joining documents, PDF report, retention job.
**Done when:** scenario 7 is held for review; scenario 8 produces the PDF report.

### Phase 8 — Integration and Demo
Full test suite, migrations from scratch, end-to-end run of all 8 scenarios, security and fairness pass, UI polish and MOCK labels, README, deployment guide, and `docs/DEMO_SCRIPT.md` (5–7 minute judge walkthrough).
**Done when:** fresh clone + `docker compose up` + seed → full demo works, and PROGRESS.md lists what is working, mocked, and untested.

---

# FINAL EXPECTED OUTPUT

A complete, integrated, working hackathon prototype demonstrating:

- A candidate progressing through seven hiring stages with continuous identity verification.
- One Aadhaar = one email enforcement (privacy-preserving).
- MediaPipe facial landmark mapping and liveness.
- AI-assisted resume verification against mock verified records.
- A functional SecureHire Chrome extension that locks the assessment environment and reports events.
- Assessment and interview face monitoring against a single identity anchor.
- Voice verification throughout the interview.
- IP and approximate geolocation logging.
- Live one-on-one video interviews with screen sharing.
- A GPS Map Camera-style live location overlay.
- Real-time, explainable Trust Score updates with human review.
- Offer and onboarding identity-substitution checks.
- Downloadable final verification reports.

Prioritize functional completeness, integration, privacy, clear evidence, and a convincing demo over decorative UI.

**Start by inspecting the existing repository if one exists. Otherwise initialize the project and begin Phase 1. Do not stop after generating a plan or frontend mockup.**
