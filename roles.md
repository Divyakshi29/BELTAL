# BELTAL — Roles & Demo Accounts

Who can do what, and which seeded demo account to sign in as to see it. Created by
`npm run seed:demo` (from `backend/`); the seed is idempotent, so re-running it is safe.

The **server is the only source of a user's role**. The role picker on the login modal is
cosmetic: after sign-in you are routed to the portal for your real role.

## Demo accounts

| Key | Role | Name | Employee ID | SBU | Clearance | Wallet |
|---|---|---|---|---|---|---|
| ADMIN | ADMIN | Rajesh Kumar Sharma | BEL-ADM-0001 | SBU_CYBER | 4 | `0x720B8842DC961FE80674bdCe474B19DFC737AED3` |
| MANAGER | MANAGER | Anita Deshpande | BEL-MGR-1001 | SBU_RADAR | 4 | `0x66356eD41DaaBF6fc73F0AaDe41889B89441b488` |
| MANAGER2 | MANAGER | Vikram Singh Rathore | BEL-MGR-2001 | SBU_EW | 3 | `0x73f7538B97CfA3e6c6EDC7F028e690a7dC6dDC47` |
| AUDITOR | AUDITOR | Meera Iyer | BEL-AUD-0001 | SBU_CYBER | 3 | `0x364924329fC63140a2c397fa68297cD70F9be0fd` |
| USER | USER | Suresh Nair | BEL-EMP-3001 | SBU_RADAR | 2 | `0x5a8173f05296D311cBB2c7d302827Ae557969CBB` |
| USER2 | USER | Priya Menon | BEL-EMP-3002 | SBU_EW | 3 | `0x42029c0Eb36FfcF175162Ea0335201A2bd6f2DAA` |
| APPLICANT | *(none yet)* | Karthik Subramanian | BEL-EMP-4001 | requests SBU_MILCOMM | — | `0x3E629c575606085e183c64856e68251DA1399EC1` |

These are Sepolia testnet wallets generated for this database. Their **private keys are in
`backend/.demo-wallets.json`** (gitignored — never commit it). Import a key into MetaMask
to sign in as that account. `npm run seed:demo -- --print-keys` prints them.

`SYSTEM_CONNECTOR` is not seeded: it is machine-only (PACS/HRMS ingest through the
backend-held custodial signer, `POST /api/auth/system-connector/verify`) and is rejected on
human wallet sign-in.

## What each role can do

| Capability | ADMIN | MANAGER | AUDITOR | USER | SYSTEM_CONNECTOR |
|---|:-:|:-:|:-:|:-:|:-:|
| Create identities, assign roles (`/api/admin/*`) | ✅ | — | — | — | — |
| Approve / reject self-registrations | ✅ | — | — | — | — |
| Create / configure facility zones | ✅ | — | — | — | — |
| Emergency lockdown of a zone | ✅ | — | — | — | — |
| Mint assets | ✅ any SBU | ✅ own SBU only | — | — | — |
| List all assets | ✅ | ✅ scoped | ✅ read-only | — | — |
| View own identity and assets | ✅ | ✅ | ✅ | ✅ | — |
| Request a custody transfer | ✅ any asset | ✅ own SBU or own custody | only assets they hold | only assets they hold | — |
| Approve a transfer | ✅ | ✅ own SBU only | — | — | — |
| Reject a transfer | ✅ | ✅ own SBU only | — | ✅ only if they are the current custodian | — |
| Issue Cross-SBU passes | ✅ | ✅ own SBU only | — | — | — |
| Read the audit trail (`/api/audit*`) | ✅ | — | ✅ | — | — |
| Anti-tamper verify (DB vs chain) | ✅ | — | ✅ | — | — |
| Verify a tx hash | ✅ | ✅ | ✅ | — | — |
| Verify an asset / identity against the chain | ✅ | — | ✅ | — | — |
| List PACS zones and events | ✅ | ✅ | ✅ | — | — |
| Simulate a badge tap (demo) | ✅ | ✅ | — | — | — |
| Post PACS badge events | — | — | — | — | ✅ |

Rules worth knowing when you test:

- **Separation of duties:** a requester can never approve or reject their own transfer
  (403 for every role, ADMIN included).
- **Managers read their own SBU**, plus SBUs opened by a Cross-SBU pass issued to them, plus
  assets held by people in their SBU. They may *act* only inside their own SBU — a pass
  gives visibility, not authority.
- **Users see only themselves.** The transfer-recipient picker is scoped to their SBU plus
  pass-linked users.
- **Auditors are read-only** but see everything, including the full audit trail.
- JWTs last 1h and are not re-checked against the DB, so a role change lags until the token
  expires or you sign in again.
- On-chain the roles map to `ROLE_SUPER_ADMIN`, `ROLE_SBU_MANAGER`, `ROLE_AUDITOR`,
  `ROLE_EMPLOYEE`, `ROLE_SYSTEM_CONNECTOR`. Clearance is 1–4.

## Seeded data to test against

| Item | Detail |
|---|---|
| Assets | AESA Radar Antenna Array Module (T4, Radar → Anita) · Portable Radar Signal Analyzer (T2, Radar → Suresh) · Radar Calibration Reference Kit (T1, Radar → Suresh) · ESM Wideband Receiver (T3, EW → Vikram) · Digital RF Memory Jammer Unit (T3, EW → Priya) · Tactical HF SDR (T2, MilComm → Rajesh) · HSM Cluster (T4, Cyber → Rajesh) |
| Pending transfer | Portable Radar Signal Analyzer: Suresh → Anita (approve as MANAGER; Suresh can't approve it himself) |
| Cross-SBU pass | Priya (EW) may access SBU_RADAR for 7 days, issued by Anita. Vikram has no pass, so a Radar transfer to him is denied |
| Pending registration | Karthik Subramanian (BEL-EMP-4001, SBU_MILCOMM) — approve or reject as ADMIN |
| Zones | `ZONE_ANECHOIC_CHAMBER` (Radar, clr 3) · `ZONE_RADAR_TEST` (Radar, clr 2) · `ZONE_CYBER_LAB` (Cyber, clr 4) · `ZONE_MAIN_GATE` (any SBU, clr 1) |

## Suggested walkthrough — see each role act

1. **APPLICANT** — sign in with the applicant wallet: limited session, 403 on everything but
   `/register` and `registration-status`. The request shows as PENDING.
2. **ADMIN** — open the registrations queue, approve Karthik (choose role + clearance). Mint
   an asset, then toggle lockdown on a zone.
3. **MANAGER (Anita)** — approve Suresh's pending transfer. Try to approve a transfer she
   requested herself (blocked). Issue a pass. Open `/pacs/simulator` and tap a badge.
4. **MANAGER2 (Vikram)** — confirm he can't see Radar assets or act on them (no pass).
5. **USER (Suresh / Priya)** — see only their own assets; request a transfer. Priya, thanks
   to her pass, can be a recipient for Radar assets.
6. **AUDITOR (Meera)** — browse `/api/audit`, then run `/audit/verify` and the Anti-Tamper Lab
   to diff the DB cache against the chain. Confirm there is no way to write anything.

After each step, sign in as the **AUDITOR** or **ADMIN** and check the audit trail: every
action above should appear as an on-chain event with the actor attributed.
