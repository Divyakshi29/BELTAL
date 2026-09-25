/**
 * BELTAL REST API reference content.
 *
 * Kept as data rather than markup so the docs page stays a renderer and this
 * file stays the single place to correct a field name. Everything here is
 * transcribed from the live route, validator and service code. If an endpoint
 * changes, change it here in the same PR.
 */

export const BASE_URL = 'https://<your-beltal-host>/api';

export const OVERVIEW = {
  intro:
    'BELTAL exposes a conventional JSON REST API over HTTPS. It is designed to sit underneath systems that already exist at BEL (HRMS, PACS badge controllers, SAP) rather than replace them. An integrating system authenticates once with a wallet signature, then calls ordinary JSON endpoints; BELTAL handles the blockchain writes, the IPFS encryption and the audit trail on its own.',
  points: [
    {
      icon: 'key',
      title: 'Wallet-signature authentication',
      body: 'No passwords and no shared API secrets. A caller proves control of a wallet by signing a one-time server-issued nonce, and receives a short-lived JWT. Machine integrations use a dedicated System Connector identity on its own endpoint.',
    },
    {
      icon: 'shield_person',
      title: 'The server decides the role',
      body: 'Roles, clearance levels and SBU boundaries come from the identity the server holds for that wallet. A client cannot request or assert a role. Anything it sends on that subject is ignored.',
    },
    {
      icon: 'link',
      title: 'Writes settle on-chain',
      body: 'Registering an identity, minting an asset, moving custody and locking a zone are all submitted to smart contracts. Responses carry a chain object with the transaction hash so the caller can verify the result independently on Etherscan.',
    },
    {
      icon: 'lock',
      title: 'Sensitive payloads never travel in clear',
      body: 'Personnel dossiers and asset specifications are AES-256-GCM encrypted before they are pinned to IPFS. Only the content address is recorded on-chain.',
    },
  ],
};

export const CONVENTIONS = [
  {
    heading: 'Base URL and versioning',
    body: 'Every route is mounted under /api. GET /api/health is public and returns { "status": "ok" }. Use it as a readiness probe.',
    code: null,
  },
  {
    heading: 'Success envelope',
    body: 'Almost every endpoint wraps its payload in a success envelope. Some responses add a sibling chain object describing the on-chain result, and list endpoints add pagination.',
    code: `{
  "success": true,
  "data": { }
}`,
  },
  {
    heading: 'Error envelope',
    body: 'Every error (validation, authorization, not-found, upstream chain failure) returns the same shape. In production the message on an unexpected 5xx is replaced with "Internal Server Error"; stack traces are never returned.',
    code: `{
  "error": {
    "message": "Asset not found",
    "status": 404
  }
}`,
  },
  {
    heading: 'Pagination',
    body: 'List endpoints accept page (default 1) and limit (default 20, maximum 100).',
    code: `{
  "success": true,
  "data": [ ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}`,
  },
  {
    heading: 'Headers',
    body: 'Send the JWT as a bearer token on every authenticated call. JSON bodies need a Content-Type; the CSV import additionally accepts multipart/form-data.',
    code: `Authorization: Bearer <jwt>
Content-Type: application/json`,
  },
  {
    heading: 'Rate limits',
    body: 'A general limit of 100 requests per 15 minutes per IP applies across /api. Tighter limits apply to self-registration (10 / 15 min) and the AI assistant (20 / 15 min); higher limits apply to machine badge ingest (120 / min) so a busy turnstile is never throttled.',
    code: null,
  },
  {
    heading: 'Two responses that are not wrapped',
    body: 'The independent verification endpoints under /api/verify return their report as a bare JSON object with no success/data envelope, because they are designed to be piped straight into an auditor\'s own tooling. Every other endpoint uses the envelope above.',
    code: null,
  },
];

export const ENUMS = [
  { name: 'Role', values: ['ADMIN', 'MANAGER', 'AUDITOR', 'USER', 'SYSTEM_CONNECTOR'] },
  { name: 'Sbu', values: ['SBU_RADAR', 'SBU_EW', 'SBU_MILCOMM', 'SBU_CYBER'] },
  { name: 'TransferStatus', values: ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'] },
  { name: 'RegistrationStatus', values: ['PENDING', 'APPROVED', 'REJECTED'] },
  { name: 'RecoveryStatus', values: ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'] },
  { name: 'PacsDecision', values: ['GRANTED', 'DENIED'] },
  {
    name: 'AuditEventType',
    values: [
      'IDENTITY_CREATED', 'ROLE_ASSIGNED', 'ASSET_MINTED', 'TRANSFER_REQUESTED',
      'TRANSFER_REJECTED', 'OWNERSHIP_TRANSFERRED', 'PACS_ACCESS_GRANTED', 'PACS_ACCESS_DENIED',
    ],
  },
  { name: 'clearanceLevel', values: ['1: Restricted', '2: Confidential', '3: Secret', '4: Top Secret'] },
  { name: 'classificationTier', values: ['1', '2', '3', '4 (a custodian needs clearanceLevel ≥ this)'] },
];

/**
 * Endpoint groups. `auth` describes who may call it; `request`/`response` are
 * illustrative but every field NAME is the real one the API reads or returns.
 */
export const GROUPS = [
  {
    id: 'auth',
    title: 'Authentication',
    icon: 'key',
    blurb:
      'Sign-in is a two-step challenge. Request a nonce for a wallet address, sign the returned message with that wallet, then exchange the signature for a JWT. Tokens last one hour by default.',
    endpoints: [
      {
        method: 'POST', path: '/auth/nonce', auth: 'Public',
        summary: 'Request a one-time signing challenge for a wallet address.',
        request: `{
  "walletAddress": "0x1234567890123456789012345678901234567890"
}`,
        response: `{
  "success": true,
  "data": {
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "nonce": "a1b2c3d4e5f6",
    "message": "Sign this message to authenticate with BELTAL...\\nNonce: a1b2c3d4e5f6",
    "expiresAt": "2026-09-21T12:05:00.000Z"
  }
}`,
        errors: ['400: walletAddress is not a valid Ethereum address'],
      },
      {
        method: 'POST', path: '/auth/verify', auth: 'Public',
        summary:
          'Exchange a signature for a session. A wallet with a registered identity receives a full session; a wallet without one receives a limited session that can only submit a registration. Also available as POST /auth/login.',
        request: `{
  "walletAddress": "0x1234567890123456789012345678901234567890",
  "signature": "0xabc123...def"
}`,
        response: `{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "8f14e45f-ceea-467a-9a3c-1f2b7d4e9c11",
      "walletAddress": "0x1234567890123456789012345678901234567890",
      "displayName": "A. Sharma",
      "externalId": "BEL-EMP-1042",
      "did": "did:beltal:BEL-EMP-1042",
      "role": "MANAGER",
      "clearanceLevel": 3,
      "sbu": "SBU_RADAR",
      "isRegistered": true
    }
  }
}`,
        errors: [
          '401: no active challenge for this wallet, or it has expired',
          '401: the signature does not recover to the given address',
          '403: machine identities must use /auth/system-connector/verify',
        ],
        note:
          'JWT claims: sub, walletAddress, displayName, did, role, clearanceLevel, sbu, isRegistered. A limited session carries only walletAddress and isRegistered:false, deliberately no sub.',
      },
      {
        method: 'POST', path: '/auth/system-connector/verify', auth: 'Public',
        summary:
          'The machine sign-in path. Identical body to /auth/verify, but succeeds only for a wallet already provisioned with the SYSTEM_CONNECTOR role. This is the endpoint a PACS gateway or HRMS adapter uses.',
        request: `{
  "walletAddress": "0x9999888877776666555544443333222211110000",
  "signature": "0xfeed...beef"
}`,
        response: `{
  "success": true,
  "data": { "token": "eyJhbGciOi...", "user": { "role": "SYSTEM_CONNECTOR", "isRegistered": true } }
}`,
        errors: ['403: this wallet is not a system connector identity'],
      },
      {
        method: 'POST', path: '/auth/register', auth: 'Limited session',
        summary:
          'Submit a self-registration request. The request stays pending, with no access, until an administrator approves it. A role cannot be requested. An admin assigns it at approval.',
        request: `{
  "fullName": "Arjun Nair",
  "externalId": "BEL-EMP-1043",
  "requestedSbu": "SBU_EW",
  "note": "Joining the EW avionics team"
}`,
        response: `{
  "success": true,
  "data": {
    "status": "PENDING",
    "request": { "id": "3c9a...", "walletAddress": "0x...", "status": "PENDING" }
  }
}`,
        errors: [
          '409: an identity or a pending request already exists for this wallet or employee code',
          '429: more than 10 registration attempts in 15 minutes',
        ],
      },
      {
        method: 'GET', path: '/auth/registration-status', auth: 'Limited session',
        summary:
          'Poll the outcome of a submitted registration. Once approved, this returns the full session token directly so the waiting page can sign the user straight in.',
        request: null,
        response: `{
  "success": true,
  "data": { "status": "PENDING", "request": { }, "bootstrapAdmin": false }
}`,
        errors: [],
      },
    ],
  },

  {
    id: 'identities',
    title: 'Identities & onboarding',
    icon: 'badge',
    blurb:
      'Creating an identity mints a DID, encrypts the personnel dossier to IPFS, anchors the DID and a salted hash on-chain, and grants the role in the access-control contract. This is the primary HRMS integration surface.',
    endpoints: [
      {
        method: 'GET', path: '/admin/identities', auth: 'ADMIN',
        summary: 'List identities with optional search and filters. status narrows to ACTIVE or REVOKED (quarantined) identities.',
        request: `?search=Sharma&sbu=SBU_RADAR&clearance=3&status=ACTIVE&page=1&limit=20`,
        response: `{
  "success": true,
  "data": {
    "users": [{
      "id": "8f14e45f-...",
      "walletAddress": "0x1234...7890",
      "externalId": "BEL-EMP-1042",
      "did": "did:beltal:BEL-EMP-1042",
      "displayName": "A. Sharma",
      "role": "MANAGER",
      "clearanceLevel": 3,
      "sbu": "SBU_RADAR",
      "seniorityGrade": 5,
      "managerId": "b2c3...",
      "manager": { "id": "b2c3...", "displayName": "R. Iyer" },
      "revokedAt": null,
      "revocationReason": null,
      "revokeTxHash": null,
      "createdAt": "2026-09-01T09:00:00.000Z"
    }],
    "total": 42, "page": 1, "limit": 20, "totalPages": 3
  }
}`,
        errors: [],
      },
      {
        method: 'POST', path: '/admin/identities', auth: 'ADMIN',
        summary:
          'Register an identity directly. Anything in piiDossier is merged into the encrypted IPFS dossier and never stored in clear. This is also the only endpoint that can provision a SYSTEM_CONNECTOR machine identity.',
        request: `{
  "walletAddress": "0x1234567890123456789012345678901234567890",
  "externalId": "BEL-EMP-1042",
  "fullName": "Anjali Sharma",
  "displayName": "A. Sharma",
  "role": "MANAGER",
  "clearanceLevel": 3,
  "sbu": "SBU_RADAR",
  "piiDossier": { "designation": "Senior Engineer", "unit": "Bengaluru" }
}`,
        response: `{
  "success": true,
  "data": {
    "id": "8f14e45f-...",
    "did": "did:beltal:BEL-EMP-1042",
    "identityHash": "0x7d2c...",
    "dossierCid": "bafybeih...",
    "role": "MANAGER",
    "clearanceLevel": 3,
    "sbu": "SBU_RADAR",
    "chain": {
      "confirmed": true,
      "txHash": "0x9f8e...",
      "blockNumber": 7231045,
      "roleGranted": true
    }
  }
}`,
        errors: [
          '409: an identity already exists for this wallet or employee code',
          '502: the on-chain registration failed; nothing was written',
        ],
        status: '201 Created',
      },
      {
        method: 'PATCH', path: '/admin/identities/:id/role', auth: 'ADMIN',
        summary:
          'Change a role, a clearance level, or both. Re-submitting the current role is safe and is how you complete a grant that failed during registration.',
        request: `{
  "role": "AUDITOR",
  "clearanceLevel": 4
}`,
        response: `{
  "success": true,
  "data": { "id": "8f14e45f-...", "role": "AUDITOR", "clearanceLevel": 4, "chain": { "confirmed": true, "txHash": "0x..." } }
}`,
        errors: [
          '400: provide at least one of role or clearanceLevel',
          '404: identity not found',
          '409: the identity is revoked; reinstate it first',
        ],
      },
      {
        method: 'PATCH', path: '/admin/identities/:id/manager', auth: 'ADMIN',
        summary:
          'Set who this identity reports to and/or their organizational grade (1-9, an approximation of BEL\'s E1-E9 executive ladder). Independent of role/clearance and off-chain only — no chain call. managerId: null clears the assignment. A manager\'s grade must be at or above the report\'s, and the assignment is refused if it would create a reporting cycle.',
        request: `{
  "managerId": "b2c3...",
  "seniorityGrade": 3
}`,
        response: `{
  "success": true,
  "data": {
    "id": "8f14e45f-...",
    "managerId": "b2c3...",
    "manager": { "id": "b2c3...", "displayName": "R. Iyer", "seniorityGrade": 5 },
    "seniorityGrade": 3
  }
}`,
        errors: [
          '400: provide at least one of managerId or seniorityGrade',
          '400: a person cannot be their own manager, or the assignment would create a reporting cycle, or the manager\'s grade is below the report\'s',
          '404: identity or manager not found',
          '409: the identity or the proposed manager is revoked',
        ],
      },
      {
        method: 'POST', path: '/admin/identities/:id/revoke', auth: 'ADMIN',
        summary:
          'Quarantine an identity. The DID is deactivated in the IdentityRegistry and the wallet loses its role in AccessControl, both on-chain. The person is rejected on their next request and cannot sign in until reinstated. Assets they hold stay where they are and need a transfer.',
        request: `{
  "reason": "Left the unit; badge returned"
}`,
        response: `{
  "success": true,
  "data": {
    "id": "8f14e45f-...",
    "did": "did:beltal:BEL-EMP-1042",
    "role": "MANAGER",
    "revokedAt": "2026-09-22T09:30:00.000Z",
    "revocationReason": "Left the unit; badge returned",
    "revokeTxHash": "0x4b1a...",
    "chain": { "confirmed": true, "txHash": "0x4b1a...", "roleRevoked": true, "roleTxHash": "0x77c0..." }
  }
}`,
        errors: [
          '400: a reason of at least 3 characters is required',
          '403: you cannot revoke your own identity',
          '409: already revoked, or this is the last active administrator',
          '502: the on-chain revocation failed; nothing was written',
        ],
        note:
          'The reason is written on-chain and shown to auditors. If the identity is revoked but removing its role fails, the call still succeeds with chain.roleRevoked false and a chain.warning; retrying finishes the job.',
      },
      {
        method: 'POST', path: '/admin/identities/:id/reinstate', auth: 'ADMIN',
        summary:
          'Lift a quarantine, OR repair an identity that\'s active in the database but was never actually confirmed on-chain (IdentityRegistry has no active entry for it — this is the "Identity not active" revert that PATCH .../role can surface). Either way this is the same fix: the registry has no undo, so it registers the same wallet again with the same DID, identity hash, clearance and SBU, then grants the role back. Does not require the identity to be revoked first — re-registering one that\'s already active on-chain is a safe no-op.',
        request: null,
        response: `{
  "success": true,
  "data": {
    "id": "8f14e45f-...",
    "revokedAt": null,
    "chain": { "confirmed": true, "txHash": "0x2e90...", "roleGranted": true, "roleTxHash": "0x51d3..." }
  }
}`,
        errors: ['404: identity not found', '502: the on-chain reinstatement failed; nothing was changed'],
      },
      {
        method: 'POST', path: '/admin/identities/bulk-import/validate', auth: 'ADMIN',
        summary:
          'Dry run an HRMS CSV export. Validates every row, reports each failure with its line number, and previews the DIDs that would be generated. Writes nothing and sends no transaction. Call this before importing.',
        request: `Content-Type: multipart/form-data, field "file"
or, as JSON:
{ "csv": "walletAddress,externalId,fullName,sbu,clearanceLevel,role\\n0xabc...,BEL-1001,Meera Rao,SBU_RADAR,3,USER" }`,
        response: `{
  "success": true,
  "data": {
    "totalRows": 200,
    "validCount": 198,
    "invalidCount": 2,
    "batches": 1,
    "preview": [{ "line": 2, "did": "did:beltal:BEL-1001", "externalId": "BEL-1001", "fullName": "Meera Rao", "sbu": "SBU_RADAR", "clearanceLevel": 3, "role": "USER", "walletAddress": "0xabc..." }],
    "invalidRows": [{ "line": 57, "errors": ["clearanceLevel must be a whole number from 1 to 4"], "raw": "0xdef...,BEL-1056,..." }]
  }
}`,
        errors: ['400: missing a required column, or fewer than two rows'],
        note:
          'Required columns: walletAddress, externalId, fullName, sbu, clearanceLevel. Optional: role (defaults to USER). Header matching ignores case, spaces, hyphens and underscores.',
      },
      {
        method: 'POST', path: '/admin/identities/bulk-import', auth: 'ADMIN',
        summary:
          'Commit the import. Refuses outright if any row is invalid, so a malformed file is never half-applied. Valid rows are registered on-chain in batches of up to 250 per transaction.',
        request: `Same input as the validate endpoint.`,
        response: `{
  "success": true,
  "data": {
    "totalRows": 198,
    "imported": 198,
    "notImported": 0,
    "partialFailure": false,
    "batches": [{ "batch": 1, "size": 198, "confirmed": true, "txHash": "0x9f8e...", "blockNumber": 7231050, "rolesGranted": 198, "roleFailures": [] }]
  }
}`,
        errors: [
          '422: one or more rows failed validation. The body carries { invalidRows, validCount } and nothing was imported',
          '207: an earlier batch committed but a later one failed on-chain; inspect batches[]',
          '503: IPFS/Pinata is not configured',
        ],
        status: '201 Created',
      },
      {
        method: 'GET', path: '/admin/registrations', auth: 'ADMIN',
        summary: 'List self-registration requests. Defaults to pending.',
        request: `?status=PENDING`,
        response: `{ "success": true, "data": { "registrations": [ ], "total": 4 } }`,
        errors: [],
      },
      {
        method: 'POST', path: '/admin/registrations/:id/approve', auth: 'ADMIN',
        summary:
          'Approve a pending registration, assigning the role and clearance. This is the single place a user record is created. It runs the same identity registration as the direct endpoint.',
        request: `{
  "role": "USER",
  "clearanceLevel": 2,
  "sbu": "SBU_EW"
}`,
        response: `{ "success": true, "data": { "id": "8f14e45f-...", "did": "did:beltal:BEL-EMP-1043", "role": "USER", "chain": { "confirmed": true, "txHash": "0x..." } } }`,
        errors: ['409: this request has already been reviewed'],
      },
      {
        method: 'POST', path: '/admin/registrations/:id/reject', auth: 'ADMIN',
        summary: 'Reject a registration with a reason. The wallet may resubmit afterwards.',
        request: `{ "reason": "Employee code does not match the HR record" }`,
        response: `{ "success": true, "data": { "id": "3c9a...", "status": "REJECTED" } }`,
        errors: ['409: already reviewed'],
      },
      {
        method: 'GET', path: '/users/me', auth: 'Any authenticated role',
        summary: 'The caller\'s own identity.',
        request: null,
        response: `{
  "success": true,
  "data": {
    "id": "8f14e45f-...", "walletAddress": "0x1234...7890", "externalId": "BEL-EMP-1042",
    "did": "did:beltal:BEL-EMP-1042", "displayName": "A. Sharma",
    "role": "MANAGER", "clearanceLevel": 3, "sbu": "SBU_RADAR",
    "seniorityGrade": 5, "manager": { "id": "b2c3...", "displayName": "R. Iyer", "seniorityGrade": 7 },
    "createdAt": "2026-09-01T09:00:00.000Z"
  }
}`,
        errors: [],
      },
      {
        method: 'GET', path: '/users/transfer-recipients', auth: 'Any authenticated role',
        summary:
          'Candidate custody recipients, scoped to what the caller may see. Administrators and auditors see everyone; users and managers see their own SBU plus anyone holding an active cross-SBU pass. Wallet address, role, seniorityGrade, managerId and manager are returned only to oversight roles (ADMIN/MANAGER/AUDITOR) — this is also the manager team-roster directory. SYSTEM_CONNECTOR is always excluded; add custodyOnly=true (used by the asset-transfer recipient picker) to exclude AUDITOR too, since auditors are read-only and cannot hold asset custody.',
        request: `?limit=100&custodyOnly=true`,
        response: `{
  "success": true,
  "data": { "users": [{ "id": "b2c3...", "displayName": "R. Iyer", "did": "did:beltal:BEL-EMP-2210", "clearanceLevel": 2, "sbu": "SBU_RADAR", "seniorityGrade": 5, "managerId": "c4d5...", "manager": { "id": "c4d5...", "displayName": "K. Rao" } }] }
}`,
        errors: [],
      },
    ],
  },

  {
    id: 'assets',
    title: 'Assets & custody',
    icon: 'inventory_2',
    blurb:
      'Equipment is minted as a soulbound token bound to a custodian. Custody never moves by direct transfer. It moves only through the request, approve and execute flow, which requires two different people.',
    endpoints: [
      {
        method: 'POST', path: '/assets', auth: 'ADMIN, MANAGER',
        summary:
          'Mint an asset. The specification is encrypted and pinned to IPFS, then the token is minted on-chain. The custodian must hold clearance at or above the classification tier; a manager may only mint within their own SBU.',
        request: `{
  "name": "AESA Radar Module X7",
  "classificationTier": 3,
  "sbu": "SBU_RADAR",
  "ownerWalletAddress": "0xabcd...ef01",
  "metadata": { "assetTag": "RAD-X7-0012", "serialNumber": "SN-88213" }
}`,
        response: `{
  "success": true,
  "data": {
    "id": "0b3d1c2e-...", "tokenId": "142", "name": "AESA Radar Module X7",
    "cid": "bafybeih...", "classificationTier": 3, "sbu": "SBU_RADAR",
    "mintTxHash": "0x9f8e...", "owner": { "id": "8f14e45f-...", "displayName": "A. Sharma" }
  },
  "chain": { "confirmed": true, "txHash": "0x9f8e...", "tokenId": "142", "blockNumber": 7231045 }
}`,
        errors: [
          '400: custodian clearance is below the classification tier, or the SBU does not match',
          '403: a manager may only mint into their own SBU',
          '502: the on-chain mint failed; no database row was written',
        ],
        status: '201 Created',
      },
      {
        method: 'GET', path: '/assets', auth: 'ADMIN, MANAGER, AUDITOR',
        summary: 'List assets. Managers are scoped to their own SBU plus any SBU opened to them by a cross-SBU pass.',
        request: `?sbu=SBU_RADAR&classificationTier=3&search=radar&page=1&limit=20`,
        response: `{ "success": true, "data": [ ], "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 } }`,
        errors: [],
      },
      {
        method: 'GET', path: '/assets/me', auth: 'Any authenticated role',
        summary: 'Assets currently in the caller\'s custody. Also available as /assets/my. Each asset carries pendingTransfer (the one PENDING request against it, or null) so the UI can show real transfer status instead of guessing.',
        request: null,
        response: `{ "success": true, "data": [ { "id": "0b3d...", "name": "AESA Radar Module X7", "tokenId": "142", "pendingTransfer": { "id": "a1b2...", "toUser": { "id": "8f14...", "displayName": "R. Iyer" }, "createdAt": "2026-09-20T10:00:00.000Z" } } ] }`,
        errors: [],
      },
      {
        method: 'GET', path: '/assets/:id', auth: 'Any authenticated role (scoped)',
        summary:
          'One asset with its custody history and audit records. Accepts either the internal id or the on-chain tokenId. Administrators and auditors see any asset, managers see their SBU, and everyone else only assets they hold or have held.',
        request: null,
        response: `{
  "success": true,
  "data": {
    "id": "0b3d...", "tokenId": "142", "name": "AESA Radar Module X7",
    "owner": { "displayName": "A. Sharma" },
    "custodyHistory": [{ "event": "MINTED_AND_ASSIGNED", "timestamp": "2026-09-01T09:00:00.000Z" }],
    "auditLogs": [{ "type": "ASSET_MINTED", "txHash": "0x9f8e...", "blockNumber": "7231045" }]
  }
}`,
        errors: ['403: this asset is outside your scope', '404: not found'],
      },
      {
        method: 'POST', path: '/transfers/request', auth: 'Custodian, or ADMIN/MANAGER of the SBU',
        summary:
          'Raise a custody transfer. The recipient is checked for clearance and SBU eligibility at this point, and again at approval.',
        request: `{
  "assetId": "0b3d1c2e-...",
  "toUserId": "b2c3d4e5-...",
  "reason": "Reassigned for field calibration"
}`,
        response: `{ "success": true, "data": { "id": "7a1b...", "status": "PENDING", "asset": { }, "toUser": { } } }`,
        errors: [
          '400: recipient clearance is insufficient, or SBU does not match and no pass is active',
          '409: a pending request already exists for this asset',
        ],
        status: '201 Created',
        note: 'Supply exactly one of toUserId or toWalletAddress.',
      },
      {
        method: 'GET', path: '/transfers', auth: 'Any authenticated role (scoped)',
        summary:
          'List transfer requests. Administrators and auditors see all, managers see their SBU, and a user sees only requests they are a party to.',
        request: `?status=PENDING&type=incoming&page=1&limit=20`,
        response: `{ "success": true, "data": [ ], "pagination": { } }`,
        errors: [],
      },
      {
        method: 'POST', path: '/transfers/:id/approve', auth: 'ADMIN, MANAGER',
        summary:
          'Approve and execute a transfer. Custody moves on-chain first; if the chain call fails the request is released back to pending and no transfer is recorded. Separation of duties is enforced here.',
        request: null,
        response: `{
  "success": true,
  "data": { "id": "7a1b...", "status": "EXECUTED" },
  "chain": { "confirmed": true, "txHash": "0x4d5e...", "blockNumber": 7231099 }
}`,
        errors: [
          '403: you raised this request, so another approver must review it',
          '403: you are the recipient of this transfer',
          '409: custody changed since the request was raised',
          '502: the on-chain transfer failed; the request remains pending',
        ],
      },
      {
        method: 'POST', path: '/transfers/:id/reject', auth: 'ADMIN, SBU MANAGER, or current custodian',
        summary: 'Reject a pending transfer. The original requester may never reject their own request.',
        request: `{ "reason": "Equipment required on site" }`,
        response: `{ "success": true, "data": { "id": "7a1b...", "status": "REJECTED" } }`,
        errors: ['403: the requester cannot reject their own request'],
      },
      {
        method: 'POST', path: '/passes/cross-sbu', auth: 'ADMIN, MANAGER',
        summary:
          'Issue a time-boxed pass letting someone from another SBU take custody within yours. A manager may only open their own SBU.',
        request: `{
  "userId": "b2c3d4e5-...",
  "targetSbu": "SBU_RADAR",
  "durationHours": 72,
  "reason": "Joint calibration exercise"
}`,
        response: `{ "success": true, "data": { "id": "9e8d...", "targetSbu": "SBU_RADAR", "validUntil": "2026-09-24T09:00:00.000Z" } }`,
        errors: ['403: a manager may only issue passes into their own SBU'],
        status: '201 Created',
      },
      {
        method: 'GET', path: '/passes/cross-sbu/active/:userId', auth: 'Self, or ADMIN/MANAGER/AUDITOR',
        summary: 'Active passes held by a person.',
        request: null,
        response: `{ "success": true, "data": [ { "targetSbu": "SBU_RADAR", "validUntil": "2026-09-24T09:00:00.000Z" } ] }`,
        errors: ['403: you may only view your own passes'],
      },
    ],
  },

  {
    id: 'pacs',
    title: 'Physical access (PACS)',
    icon: 'contactless',
    blurb:
      'The badge-reader integration. A gateway posts a tap; the decision is computed on-chain from clearance, SBU, any active pass and the zone lockdown state, then written to the audit trail. This is the endpoint an existing turnstile controller calls.',
    endpoints: [
      {
        method: 'POST', path: '/pacs/badge-event', auth: 'SYSTEM_CONNECTOR',
        summary:
          'Submit a badge tap and receive the access decision. employeeId is the employee code carried on the badge, not an internal id. Rate limited at 120 requests per minute.',
        request: `{
  "readerId": "READER-GATE-04",
  "zoneId": "ZONE-CRYPTO-LAB",
  "employeeId": "BEL-EMP-1042"
}`,
        response: `{
  "success": true,
  "data": { "allowed": false, "reason": "CLEARANCE_TOO_LOW", "badgeEventId": "ab12cd34-..." }
}`,
        errors: ['404: unknown employee code or zone'],
      },
      {
        method: 'GET', path: '/pacs/zones', auth: 'ADMIN, MANAGER, AUDITOR',
        summary: 'Configured facility zones. Managers see their own SBU plus shared zones.',
        request: null,
        response: `{
  "success": true,
  "data": { "zones": [{ "zoneId": "ZONE-CRYPTO-LAB", "name": "Tactical Crypto Lab", "sbu": "SBU_CYBER", "requiredClearance": 4, "isEmergencyLocked": false }] }
}`,
        errors: [],
      },
      {
        method: 'GET', path: '/pacs/events', auth: 'ADMIN, MANAGER, AUDITOR',
        summary: 'Badge-tap history with decisions and the on-chain transaction for each.',
        request: `?zoneId=ZONE-CRYPTO-LAB&decision=DENIED&page=1&limit=20`,
        response: `{
  "success": true,
  "data": {
    "events": [{ "id": "ab12...", "readerId": "READER-GATE-04", "zoneId": "ZONE-CRYPTO-LAB", "decision": "DENIED", "denialReason": "CLEARANCE_TOO_LOW", "onChainTxHash": "0x...", "scannedAt": "2026-09-21T09:12:00.000Z", "employee": { "displayName": "A. Sharma", "externalId": "BEL-EMP-1042" } }],
    "pagination": { "total": 128, "page": 1, "limit": 20, "totalPages": 7 }
  }
}`,
        errors: [],
      },
      {
        method: 'POST', path: '/admin/zones', auth: 'ADMIN',
        summary:
          'Create or update a facility zone. The zone is configured on-chain first. Omit sbu (or send null) for a zone any SBU may enter.',
        request: `{
  "zoneId": "ZONE-CRYPTO-LAB",
  "name": "Tactical Crypto Lab",
  "sbu": "SBU_CYBER",
  "requiredClearance": 4
}`,
        response: `{ "success": true, "data": { "zoneId": "ZONE-CRYPTO-LAB", "created": true, "chain": { "confirmed": true } } }`,
        errors: ['502: the on-chain zone configuration failed'],
        status: '201 Created (200 on update)',
      },
      {
        method: 'PATCH', path: '/pacs/zones/:zoneId/lockdown', auth: 'ADMIN',
        summary: 'Emergency lockdown. A locked zone denies everyone, regardless of clearance, until it is lifted.',
        request: `{ "locked": true }`,
        response: `{ "success": true, "data": { "zoneId": "ZONE-CRYPTO-LAB", "isEmergencyLocked": true, "chain": { "confirmed": true, "txHash": "0x..." } } }`,
        errors: ['404: zone not found'],
      },
    ],
  },

  {
    id: 'audit',
    title: 'Audit & verification',
    icon: 'fact_check',
    blurb:
      'The audit trail is the indexed copy of what the contracts emitted. The verification endpoints go further: they re-read the chain and IPFS live and compare against the database, which is how a tampered record is detected.',
    endpoints: [
      {
        method: 'GET', path: '/audit', auth: 'ADMIN, AUDITOR',
        summary:
          'The unified audit feed: contract events and badge taps in one time-ordered stream. Not restricted by SBU: an auditor sees everything by design.',
        request: `?type=ASSET_MINTED,OWNERSHIP_TRANSFERRED&from=2026-09-01&to=2026-09-21&page=1&limit=20`,
        response: `{
  "success": true,
  "data": {
    "events": [{
      "id": "c1d2...", "source": "AUDIT_EVENT", "type": "ASSET_MINTED",
      "actor": { "id": "8f14e45f-...", "displayName": "A. Sharma", "role": "MANAGER" },
      "targetId": "0b3d1c2e-...", "txHash": "0x9f8e...", "blockNumber": "7231045",
      "payload": { }, "timestamp": "2026-09-01T09:00:00.000Z"
    }],
    "pagination": { "total": 512, "page": 1, "limit": 20, "totalPages": 26 }
  }
}`,
        errors: [],
        note: 'Friendly aliases are accepted on type: ROLE_CHANGED, TRANSFER_EXECUTED and BADGE_TAP map onto the stored event types.',
      },
      {
        method: 'GET', path: '/audit/stats', auth: 'ADMIN, AUDITOR',
        summary: 'Event counts by category over an optional date range.',
        request: `?from=2026-09-01&to=2026-09-21`,
        response: `{ "success": true, "data": { "identityCreated": 42, "roleChanged": 7, "assetMinted": 130, "transferExecuted": 58, "total": 237 } }`,
        errors: [],
      },
      {
        method: 'GET', path: '/audit/:id', auth: 'ADMIN, AUDITOR',
        summary:
          'Fetch a single audit event by its id — a fresh read, not dependent on any filter/page of the list. Used to build a shareable deep link to one event (the Audit Trail Explorer\'s event detail view supports "?event=<id>" in its URL).',
        request: null,
        response: `{
  "success": true,
  "data": {
    "id": "c1d2...", "source": "AUDIT_EVENT", "type": "ASSET_MINTED",
    "actor": { "id": "8f14e45f-...", "displayName": "A. Sharma", "role": "MANAGER" },
    "targetId": "0b3d1c2e-...", "txHash": "0x9f8e...", "blockNumber": "7231045",
    "payload": { }, "timestamp": "2026-09-01T09:00:00.000Z"
  }
}`,
        errors: ['404: audit event not found'],
      },
      {
        method: 'GET', path: '/audit/verify/:id', auth: 'ADMIN, AUDITOR',
        summary: 'Re-check one audit record\'s transaction against the live chain.',
        request: null,
        response: `{
  "success": true,
  "data": { "id": "c1d2...", "verified": true, "txHash": "0x9f8e...", "blockNumber": 7231045, "explorerUrl": "https://sepolia.etherscan.io/tx/0x9f8e...", "message": "Transaction confirmed on-chain" }
}`,
        errors: ['404: audit record not found'],
      },
      {
        method: 'POST', path: '/verify/anti-tamper', auth: 'ADMIN, AUDITOR',
        summary:
          'The integrity check. Re-derives the expected state from the chain and the encrypted IPFS dossier and compares it against the database. A mismatch means the database was altered outside the application. Supply an assetId, an employeeId, or both.',
        request: `{
  "assetId": "0b3d1c2e-...",
  "employeeId": "BEL-EMP-1042"
}`,
        response: `{
  "overallVerdict": "INTEGRITY_OK",
  "checkedAt": "2026-09-21T10:05:00.000Z",
  "results": {
    "asset": {
      "assetId": "0b3d1c2e-...", "tokenId": "142", "onChainAvailable": true,
      "verifications": [{ "check": "CID_INTEGRITY", "status": "CID_MATCH", "dbValue": "bafybeih...", "onChainValue": "bafybeih..." }],
      "verdict": "INTEGRITY_OK"
    }
  }
}`,
        errors: ['400: provide at least one of assetId or employeeId'],
        note:
          'This response is NOT wrapped in the success envelope. A verdict of INTEGRITY_COMPROMISED means the cached record no longer matches the chain.',
      },
      {
        method: 'GET', path: '/verify/tx/:txHash', auth: 'ADMIN, AUDITOR, MANAGER',
        summary: 'Look a transaction up directly on the chain, independent of anything BELTAL has stored.',
        request: null,
        response: `{
  "txHash": "0x9f8e...", "network": "Ethereum Sepolia (chainId: 11155111)",
  "found": true, "status": "SUCCESS", "from": "0x...", "to": "0x...",
  "blockNumber": "7231045", "blockTimestamp": "2026-09-01T09:00:12.000Z",
  "gasUsed": "184203", "logsCount": 3,
  "explorerUrl": "https://sepolia.etherscan.io/tx/0x9f8e...",
  "checkedAt": "2026-09-21T10:05:00.000Z"
}`,
        errors: ['400: malformed transaction hash', '404: not found on chain', '503: no chain provider configured'],
        note: 'Bare response, no envelope.',
      },
      {
        method: 'GET', path: '/verify/asset/:assetId', auth: 'ADMIN, AUDITOR',
        summary: 'The asset half of the anti-tamper check on its own.',
        request: null,
        response: `{ "assetId": "0b3d...", "verifications": [ ], "verdict": "INTEGRITY_OK" }`,
        errors: [],
        note: 'Bare response, no envelope.',
      },
      {
        method: 'GET', path: '/verify/identity/:employeeId', auth: 'ADMIN, AUDITOR',
        summary:
          'The identity half. Fetches the encrypted dossier from IPFS, decrypts it and recomputes the identity hash, then compares clearance, SBU and active or revoked status against the IdentityRegistry. The chain checks still run when IPFS is unreachable, so a forged clearance is caught either way.',
        request: null,
        response: `{ "employeeId": "BEL-EMP-1042", "ipfsAvailable": true, "verifications": [ ], "verdict": "INTEGRITY_OK" }`,
        errors: [],
        note: 'Bare response, no envelope.',
      },
      {
        method: 'POST', path: '/verify/simulate-tamper', auth: 'ADMIN, AUDITOR',
        summary:
          'Demo tool for the Anti-Tamper Lab. Plays the rogue insider by rewriting one value directly in the database cache (an identity clearanceLevel or an asset classificationTier) so the next anti-tamper check has a real mismatch to catch. The chain is never touched.',
        request: `{
  "kind": "identity",
  "id": "BEL-EMP-1042"
}`,
        response: `{
  "success": true,
  "data": { "kind": "identity", "id": "8f14e45f-...", "label": "A. Sharma", "field": "clearanceLevel", "before": 2, "after": 4 }
}`,
        errors: [
          '403: tamper simulation is disabled on this server',
          '404: identity or asset not found',
        ],
        note:
          'kind is identity or asset, and id is an internal id, an employee code or an on-chain token id. Enabled by default outside production (ENABLE_TAMPER_SIMULATION overrides). Unlike the other /verify routes this one uses the standard envelope.',
      },
      {
        method: 'POST', path: '/verify/restore', auth: 'ADMIN, AUDITOR',
        summary:
          'Undo a simulated tamper by copying the value the chain holds back into the database cache. Refuses when the chain cannot be read, so it never restores a guess.',
        request: `{
  "kind": "asset",
  "id": "0b3d1c2e-..."
}`,
        response: `{
  "success": true,
  "data": { "kind": "asset", "id": "0b3d1c2e-...", "label": "Tactical SDR", "field": "classificationTier", "before": 4, "after": 3 }
}`,
        errors: [
          '403: tamper simulation is disabled on this server',
          '409: the identity is not active on-chain, or the asset has no token',
          '502: the chain could not be read',
        ],
        note: 'Same request shape and envelope as simulate-tamper.',
      },
      {
        method: 'GET', path: '/ipfs/:cid', auth: 'ADMIN, AUDITOR',
        summary:
          'Fetch a pinned document and decrypt it with the server key. Anyone reaching the same CID on a public gateway sees only ciphertext.',
        request: null,
        response: `{ "success": true, "data": { "cid": "bafybeih...", "encrypted": true, "content": { "externalId": "BEL-EMP-1042", "fullName": "Anjali Sharma" } } }`,
        errors: ['400: not a valid CID', '422: could not be decrypted with this deployment key'],
      },
    ],
  },

  {
    id: 'recovery',
    title: 'Guardian recovery',
    icon: 'restore',
    blurb:
      'When someone loses the wallet their identity is anchored to, guardians vouch for a replacement. The re-link preserves the DID and identity hash, so the audit trail shows one person changing keys rather than a new identity appearing.',
    endpoints: [
      {
        method: 'POST', path: '/recovery/guardians/:userId', auth: 'ADMIN',
        summary: 'Assign a guardian to an identity. Nobody may guard themselves.',
        request: `{ "guardianId": "b2c3d4e5-..." }`,
        response: `{ "success": true, "data": { "id": "g1h2...", "guardian": { "displayName": "R. Iyer" } } }`,
        errors: ['400: an identity cannot be its own guardian', '409: already a guardian'],
        status: '201 Created',
      },
      {
        method: 'GET', path: '/recovery/guardians/:userId', auth: 'ADMIN',
        summary: 'The guardian roster and the approval threshold currently in force.',
        request: null,
        response: `{ "success": true, "data": { "guardians": [ ], "threshold": 2 } }`,
        errors: [],
      },
      {
        method: 'POST', path: '/recovery', auth: 'ADMIN, or an assigned guardian',
        summary:
          'Raise a recovery request naming the replacement wallet. The identity must already have guardians assigned.',
        request: `{
  "userId": "8f14e45f-...",
  "newWalletAddress": "0x5555444433332222111100009999888877776666",
  "reason": "Hardware wallet lost during site transfer; reported to security on 19 Sep"
}`,
        response: `{ "success": true, "data": { "id": "r1e2...", "status": "PENDING", "approvalCount": 0, "threshold": 2, "guardianCount": 3 } }`,
        errors: [
          '400: this identity has no guardians assigned',
          '403: only an admin or a guardian may request recovery',
          '409: the replacement wallet already belongs to another identity, or a request is already open',
        ],
        status: '201 Created',
      },
      {
        method: 'POST', path: '/recovery/:id/approve', auth: 'An assigned guardian',
        summary:
          'Vouch for a request. Whoever raised it cannot also approve it. Once the threshold is met the request becomes APPROVED.',
        request: null,
        response: `{ "success": true, "data": { "id": "r1e2...", "status": "APPROVED", "approvalCount": 2, "threshold": 2 } }`,
        errors: ['403: you raised this request, so another guardian must vouch for it'],
      },
      {
        method: 'POST', path: '/recovery/:id/execute', auth: 'ADMIN',
        summary:
          'Perform the re-link. Revokes the old wallet on-chain, re-registers the same DID and identity hash against the new one, and moves the role across.',
        request: null,
        response: `{
  "success": true,
  "data": {
    "user": { "id": "8f14e45f-...", "did": "did:beltal:BEL-EMP-1042", "walletAddress": "0x5555...6666" },
    "chain": { "revokeTxHash": "0xaaa...", "relinkTxHash": "0xbbb...", "roleGranted": true }
  }
}`,
        errors: [
          '400: the request has not reached its guardian threshold yet',
          '409: the replacement wallet has since been taken',
          '502: a chain call failed; the request stays approved for retry',
        ],
      },
      {
        method: 'POST', path: '/recovery/:id/reject', auth: 'ADMIN, or an assigned guardian',
        summary: 'Reject a recovery request with a reason.',
        request: `{ "rejectionReason": "Employee confirmed the wallet was recovered" }`,
        response: `{ "success": true, "data": { "id": "r1e2...", "status": "REJECTED" } }`,
        errors: ['400: already executed'],
      },
    ],
  },

  {
    id: 'assistant',
    title: 'AI query assistant',
    icon: 'forum',
    blurb:
      'A natural-language interface over the audit trail. It reaches records only through the same role-gated service the REST endpoints use, so it can never surface anything the caller could not already read, and it returns the records behind every answer.',
    endpoints: [
      {
        method: 'GET', path: '/assistant/status', auth: 'ADMIN, AUDITOR',
        summary: 'Whether the assistant is configured on this deployment. Clients should hide the feature when it is not.',
        request: null,
        response: `{ "success": true, "data": { "configured": true } }`,
        errors: [],
      },
      {
        method: 'POST', path: '/assistant/query', auth: 'ADMIN, AUDITOR',
        summary:
          'Ask a question about the audit trail. The response carries the answer plus every record it was grounded in, so it can be checked rather than trusted. Rate limited at 20 questions per 15 minutes.',
        request: `{ "question": "Which badge taps were denied at the crypto lab this week?" }`,
        response: `{
  "success": true,
  "data": {
    "answer": "Three taps were denied at ZONE-CRYPTO-LAB between 15 and 21 September, all for insufficient clearance.",
    "queries": [{ "actionType": "PACS_ACCESS_DENIED", "from": "2026-09-15T00:00:00Z" }],
    "matchedRecords": [{ "id": "ab12...", "type": "PACS_ACCESS_DENIED", "actor": { "displayName": "A. Sharma" }, "targetId": "ZONE-CRYPTO-LAB", "txHash": "0x...", "timestamp": "2026-09-18T14:02:00.000Z" }]
  }
}`,
        errors: [
          '429: too many questions; retry shortly',
          '503: the assistant is not configured on this server',
          '502: the upstream model API is unavailable',
        ],
      },
    ],
  },
];

export default { BASE_URL, OVERVIEW, CONVENTIONS, ENUMS, GROUPS };
