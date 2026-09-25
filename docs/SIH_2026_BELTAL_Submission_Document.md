# SMART INDIA HACKATHON 2026 — IDEA SUBMISSION DOSSIER

---

## PROJECT METADATA
* **Idea / Solution Title**: BELTAL — Blockchain-Enabled Trusted Access & Digital Asset Ledger
* **Problem Statement ID**: SIH26125
* **Organization**: Bharat Electronics Limited (BEL), Ministry of Defence, Govt. of India
* **Category**: Software
* **Theme**: Blockchain & Cybersecurity
* **Target Units**: All 9 BEL Manufacturing Units (Bengaluru Complex, Ghaziabad, Hyderabad, Pune, Kotdwara, Panchkula, Chennai, Machilipatnam, Taloja)
* **Strategic Business Units (SBUs)**: Military Radars, Electronic Warfare & Avionics, Military Communications, Cyber Security Systems, Naval Systems

---

## 1. THE PROBLEM: BACKGROUND & OPERATIONAL CHALLENGES

Bharat Electronics Limited (BEL), a Navratna defence PSU under the Ministry of Defence, designs and manufactures critical electronic systems for the Indian Armed Forces. Operations span across **9 manufacturing complexes** and multiple high-security Strategic Business Units (SBUs) handling classified defence hardware and firmware.

Currently, personnel credentials, security clearances, physical door access permissions, and custody of high-value tactical assets are managed across siloed, centralized, and semi-manual systems (Active Directory/LDAP, SAP ERP, departmental gate-pass spreadsheets, and paper registers).

```
+---------------------------------------------------------------------------------------------------------+
|                                    EXISTING VULNERABILITY LANDSCAPE                                     |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  [ Centralized LDAP / DB ]  ----(Single Point of Breach)----> [ All Clearance Tiers Exposed at Once ]    |
|                                                                                                         |
|  [ Privileged DBA / Insider ] ---(Direct SQL Manipulation)--> [ Silent Escalation & No Audit Trail ]    |
|                                                                                                         |
|  [ Departmental Registers ]  ---(Fragmented Paper / Excel)--> [ Disconnected Cross-Unit Asset Custody ] |
|                                                                                                         |
|  [ Statutory Audit (DGQA) ]  ---(Trusts Mutable SQL Tables)-> [ Zero Cryptographic Non-Repudiation ]   |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

### Critical Operational Bottlenecks:
1. **Single Point of Failure (SPOF)**: Centralized identity and access management (IAM) databases present a high-value attack target. A breach at the database layer compromises all classification tiers (Restricted to Top Secret) simultaneously.
2. **Zero Tamper-Evident History (The Rogue Insider Threat)**: Privileged database administrators (DBAs) or compromised internal service accounts can modify access permissions or backdate equipment logs directly via SQL queries without leaving an immutable, non-repudiable audit trail.
3. **Fragmented Cross-Unit Asset Provenance**: Mission-critical hardware (Tactical Software-Defined Radios, Spectrum Analyzers, Crypto Modules, IFF Interrogators) moves across R&D labs, environmental testing chambers, and assembly bays. Custody is tracked via disconnected local spreadsheets, preventing real-time cross-SBU visibility and verifiable chains of custody.
4. **Compliance & Statutory Verification Gaps**: Defence auditors (DGQA, MoD Vigilance, CAG, CERT-In) are forced to trust mutable SQL database reports during audits, lacking mathematical proof of log integrity.

---

## 2. THE PROPOSED SOLUTION: BELTAL

**BELTAL** introduces a non-invasive, cryptographic trust and rule-enforcement layer underneath BEL's existing enterprise infrastructure. It preserves existing physical door badge readers, biometric scanners, and SAP ERP interfaces while anchoring all identities, physical clearances, and equipment custody to an immutable smart contract state.

```
+---------------------------------------------------------------------------------------------------------+
|                                       BELTAL SOLUTION PILLARS                                           |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  1. Decentralized Identifiers (DIDs)     --> Cryptographic identity anchors: `did:bel:<empId>`          |
|  2. Soulbound Custody NFTs (ERC-721)     --> Non-transferable digital twins for tactical hardware       |
|  3. Smart Contract Access Control        --> 4-tier clearance (Restricted -> Top Secret) on-chain       |
|  4. Triad Data Separation                --> 100% DPDP Act 2023 compliance (Zero PII on-chain)          |
|  5. Anti-Tamper Integrity Scanner        --> Mathematical instant detection of unauthorized SQL edits   |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

### Core Innovations:
* **W3C Decentralized Identifiers (DIDs)**: Cryptographically verifiable identity anchors (`did:bel:<id>`) replace mutable database rows.
* **Soulbound Asset NFTs**: Physical defence equipment and cryptographic key modules are tokenized as restricted, non-transferable ERC-721 digital twins linked directly to an employee's DID, enforcing dual-handshake custody transfers.
* **Smart Contract Gated Physical & Logical Access**: Facility access rules, SBU confinement, and 4-tier security clearances are evaluated deterministically on-chain, eliminating application-layer bypass vulnerabilities.
* **Triad Data Architecture (DPDP Act 2023 Compliant)**: Only cryptographic hashes, token IDs, and security event proofs reside on-chain. Sensitive employee dossiers and technical schematics are stored in an AES-256 encrypted IPFS vault, while PostgreSQL serves sub-5ms UI queries.
* **Anti-Tamper Integrity Scanner**: An independent verification engine that continuously computes local database state hashes against on-chain state anchors, instantly detecting any unauthorized local manipulation.

---

## 3. ARCHITECTURE & SYSTEM WORKFLOW

### 3.1 Triad Data Separation Model

To achieve enterprise performance, data privacy compliance, and cryptographic immutability, BELTAL strictly divides data across three tiers:

```
+---------------------------------------------------------------------------------------------------------+
|                                  THE TRIAD DATA SEPARATION ARCHITECTURE                                 |
+---------------------------------------------------------------------------------------------------------+

     [ ON-CHAIN (Solidity) ]                 [ IPFS (Encrypted) ]             [ POSTGRESQL (Cache) ]
    -------------------------               ----------------------           ------------------------
    - DID & Identity Hash (bytes32)         - AES-256 Encrypted Dossiers     - Fast UI Query & Filtering
    - Clearance Level (Tiers 1-4)           - Equipment Schematics & CAD     - Full Name, Email, Phone
    - SBU Confinement Rules                 - Calibration Certificates (PDF) - Facility Room Directory
    - Soulbound Token Custody & Trail       - Military Standard Docs (JSON)  - Real-Time Turnstile Logs
    - Append-Only Event Hash Index          - Verifiable Credentials         - Sub-5ms Dashboard Queries
```

* **On-Chain Layer (Solidity ^0.8.20)**: Retains zero personally identifiable information (PII). Holds only `keccak256(empId + fullName + sbuCode + salt)`, security clearance levels (1–4), ERC-721 token IDs, zone lockdown states, and security event hashes.
* **Decentralized Storage (IPFS via Private / Dedicated Cluster)**: Stores client-side AES-256-GCM encrypted dossiers, calibration PDFs, and MIL-STD equipment metadata referenced by immutable Content Identifiers (CIDs).
* **Off-Chain Relational Cache (PostgreSQL + Prisma ORM)**: Provides sub-5ms query response times for enterprise dashboards, synchronized in real time via an asynchronous WebSocket event listener reading smart contract events.

---

### 3.2 Core System Workflows

#### Workflow 1: Bulk Employee Onboarding & DID Synchronization
HR administrators upload employee batches via CSV/JSON. The system generates unique DIDs, encrypts personal dossiers to IPFS, computes cryptographic hashes, and anchors up to 250 identities per batch on-chain in a single transaction.

```
[HR Admin / CISO]
       |
       | 1. Uploads Employee Batch (CSV)
       v
[Backend API Engine]
       |
       +---> 2. Encrypts Dossiers (AES-256) ----> [IPFS Document Vault] (Returns CIDs)
       |
       +---> 3. Computes Keccak-256 Hashes
       |
       +---> 4. batchRegisterIdentities() -------> [IdentityRegistry.sol] (Tx Confirmed)
       |
       +---> 5. Updates Relational Index -------> [PostgreSQL Cache]
```

#### Workflow 2: Physical Turnstile Access (PACS Simulation)
An employee taps an RFID badge at a facility door reader (e.g., *RF Anechoic Chamber*). The reader queries the backend integration adapter, which invokes `canAccessZone()` on-chain. The smart contract validates clearance tier, SBU confinement, and emergency lockdown status before unlocking the turnstile and recording the event in `AuditLog.sol`.

```
[Employee Badge Tap] ---> [PACS Door Reader] ---> [BELTAL PACS Adapter]
                                                           |
                                                           | 1. canAccessZone(user, zoneId)
                                                           v
                                                  [AccessControl.sol]
                                                           |
                          +--------------------------------+--------------------------------+
                          | (Allowed: Clearance >= Required & SBU Valid)                     | (Denied)
                          v                                                                 v
              [Command: TURNSTILE_UNLOCK]                                       [Command: TURNSTILE_LOCKED]
              [AuditLog.sol: ACCESS_GRANTED]                                    [AuditLog.sol: ACCESS_DENIED]
```

#### Workflow 3: Tactical Hardware Minting & Dual-Handshake Custody Transfer
SBU Managers mint digital twin NFTs for high-value equipment. When transferring equipment between engineers:
1. Sender initiates handover request in the portal.
2. Smart contract verifies recipient’s security clearance level (`Recipient.clearance >= Asset.classification`).
3. Manager / Recipient signs the transfer approval.
4. Token moves on-chain, creating an unalterable chronological custody chain (`CustodyRecord[]`).

#### Workflow 4: Anti-Tamper Integrity Scanner (The Hackathon Showstopper)
MoD and DGQA auditors can execute real-time mathematical integrity checks on demand:
1. Auditor selects any employee or asset record from the dashboard.
2. The verification engine recomputes `keccak256(current_sql_row_state)`.
3. It fetches the authoritative cryptographic anchor from `IdentityRegistry.sol` / `AssetNFT.sol`.
4. If a rogue administrator directly modified the PostgreSQL database (e.g., altering a clearance level from Level 1 to Level 4), the scanner flags an immediate high-severity red alert with exact mismatch evidence.

---

## 4. SMART CONTRACT SPECIFICATION & ARCHITECTURE

The smart contract suite is written in Solidity (`^0.8.20`) using OpenZeppelin security standards:

```
                      +-----------------------------+
                      |      AccessControl.sol      |
                      |   (Admin, Manager, Auditor) |
                      +--------------+--------------+
                                     |
             +-----------------------+-----------------------+
             |                                               |
+------------v------------+                     +------------v------------+
|   IdentityRegistry.sol  |                     |       AssetNFT.sol      |
|  - DID: did:bel:<id>    |                     |  - Soulbound / ERC-721  |
|  - Hash-only on-chain   |                     |  - Classification Tiers |
|  - Clearance Tiers 1-4  |                     |  - Custody Provenance   |
+------------+------------+                     +------------+------------+
             |                                               |
             +-----------------------+-----------------------+
                                     |
                      +--------------v--------------+
                      |        AuditLog.sol         |
                      |  - Append-Only Event Index  |
                      |  - Cryptographic Verification|
                      +-----------------------------+
```

### 1. `IdentityRegistry.sol`
* **Purpose**: Manages decentralized identity anchors and defence security clearances without on-chain PII.
* **Core Functions**:
  * `batchRegisterIdentities(address[] users, string[] dids, bytes32[] identityHashes, uint8[] clearances, bytes32[] sbuCodes)`
  * `updateClearance(address user, uint8 newClearance)`
  * `revokeIdentity(address user, string reason)`
  * `verifyIdentity(address user, bytes32 testHash) external view returns (bool)`

### 2. `AccessControl.sol`
* **Purpose**: Evaluates multi-tier clearance rules, SBU boundaries, temporary passes, and emergency lockdowns.
* **Core Functions**:
  * `createZone(bytes32 zoneId, uint8 requiredClearance, bytes32 allowedSBU)`
  * `grantTemporaryPass(address user, bytes32 zoneId, uint256 durationInSeconds)`
  * `toggleEmergencyLockdown(bytes32 zoneId, bool status)`
  * `canAccessZone(address user, bytes32 zoneId) external view returns (bool allowed, string memory reason)`

### 3. `AssetNFT.sol` (Soulbound / Restricted Custody ERC-721)
* **Purpose**: Tokenizes classified defence hardware and tracks chronological custody trails.
* **Core Mechanics**: Overrides standard transfer methods (`transferFrom`, `safeTransferFrom`) to prohibit open trading; custody can only be transferred via multi-party authorized handshakes.
* **Core Functions**:
  * `mintAsset(address initialCustodian, string assetTag, string serialNumber, uint8 classificationTier, string ipfsURI)`
  * `transferCustody(uint256 tokenId, address newCustodian, string reason)`
  * `getCustodyHistory(uint256 tokenId) external view returns (CustodyRecord[] memory)`

### 4. `AuditLog.sol`
* **Purpose**: Append-only, tamper-proof audit event indexer accessible to DGQA / MoD auditors.
* **Core Functions**:
  * `logEvent(bytes32 eventType, address actor, address target, bytes32 entityId, string details)` (Callable only by authorized system contracts).

---

## 5. COMPLETE TECHNOLOGY STACK

```
+-------------------+-----------------------------------------------------------------------------------+
| LAYER             | TECHNOLOGIES & TOOLS                                                              |
+-------------------+-----------------------------------------------------------------------------------+
| Smart Contracts   | Solidity (^0.8.20), OpenZeppelin Contracts v5, Hardhat, Ethers.js v6              |
| Blockchain Tier   | Polygon Amoy / Sepolia (Demo) -> Hyperledger Besu (Pilot) -> NBF Vishvasya (Prod) |
| Backend Engine    | Node.js, Express.js REST API, Ethers.js Relayer Adapter, Prisma ORM               |
| Cryptography      | Keccak-256 Hashing, AES-256-GCM Encryption, ECDSA Signatures                      |
| Relational Cache  | PostgreSQL with pgaudit logging and indexed relational caching                     |
| Document Vault    | IPFS (via Pinata / Private IPFS Cluster node)                                     |
| Frontend UI       | React.js, Tailwind CSS v4, Lucide React (Defence-grade high-contrast dark theme)  |
| Authentication    | Wallet signature challenge (Nonce + ECDSA) & Enterprise Relayer Key abstraction   |
+-------------------+-----------------------------------------------------------------------------------+
```

---

## 6. ROLE-BASED ACCESS CONTROL (RBAC) & CLEARANCE MATRIX

### 6.1 System Roles
| Role | Target BEL Persona | Key Permissions & Capabilities |
| :--- | :--- | :--- |
| **CISO / Super Admin** | Chief Information Security Officer / Enterprise Command | Bulk employee onboarding, DID management, clearance tier configuration, and 1-click facility-wide emergency lockdown. |
| **SBU Unit Manager** | Project Director / Unit Head (Radar, EW, MilComm) | Minting Asset NFTs, approving custody transfers, scheduling calibration, and issuing temporary visitor passes. |
| **MoD / DGQA Auditor** | Statutory Auditor / Quality Assurance Inspector | Read-only access across all unit event logs, cryptographic report export, and interactive Anti-Tamper Verification testing. |
| **Defence Employee** | Scientist / Design Engineer / Field Technician | Viewing digital clearance badge, managing "My Custody Locker" assets, initiating equipment return/handover, and tapping PACS badge simulator. |
| **System Connector** | Automated PACS Turnstile / Machine Relayer | Submitting high-frequency automated badge tap events via backend custodial relayer wallet. |

### 6.2 Defence Security Clearance Hierarchy
```
[LEVEL 4: TOP SECRET]   --> Crypto Key Lab, SCIF, Missile Guidance Firmware, KG Modules
         ^
[LEVEL 3: SECRET]       --> RF Anechoic Chamber, Radar Signal Labs, Tactical SDRs
         ^
[LEVEL 2: CONFIDENTIAL] --> Sub-system Test Benches, Calibration Labs, Spectrum Analyzers
         ^
[LEVEL 1: RESTRICTED]   --> General Assembly, Non-sensitive Test Bays, Standard Tooling
```

---

## 7. VALUE PROPOSITION & COMPARATIVE ANALYSIS

| Evaluation Parameter | Current Legacy BEL System | BELTAL (Proposed Solution) |
| :--- | :--- | :--- |
| **Data Authority & Trust** | Central database controlled by IT admin; rows can be edited silently without trace. | Immutable blockchain ledger; past states and access logs cannot be rewritten or erased. |
| **Vulnerability to Breach** | Single Point of Failure (SPOF) exposes all identities and clearance tiers. | Decentralized trust; database is a disposable cache rebuildable from smart contract events. |
| **Hardware Custody Chain** | Departmental spreadsheets, paper registers, and physical gate passes. | Soulbound NFTs with non-repudiable, timestamped custody and calibration history. |
| **Access Rule Enforcement** | Application/middleware layer only (bypassable via direct database queries). | Enforced directly inside smart contracts via mathematical logic and deterministic state. |
| **Audit & Compliance** | Statutory auditors must trust mutable SQL records and manually exported PDFs. | Independent Anti-Tamper Scanner: live hash comparison reveals any unauthorized DB edit. |
| **User Experience** | Fragmented credentials across multiple disparate internal portals. | Zero Web3 friction: seamless integration with standard BEL employee IDs and RFID badges. |

---

## 8. FEASIBILITY, PRIVACY COMPLIANCE & PRODUCTION ROADMAP

### 8.1 Frictionless Integration & Usability
* **Zero MetaMask / Web3 Overhead**: Defence scientists and security guards do not handle crypto wallets or gas tokens. The backend implements a secure **Master Relayer Key** pattern that deterministically signs and submits transactions on behalf of authenticated personnel.
* **Non-Disruptive Deployment**: BELTAL interfaces with existing SAP ERP, Active Directory, and physical turnstile readers via RESTful integration endpoints, requiring zero physical hardware replacements.

### 8.2 Compliance with India's DPDP Act 2023
* **Zero PII On-Chain**: No personal names, phone numbers, or biometric data are stored on the public or private blockchain state.
* **Cryptographic Shredding**: When an employee leaves or exercises the "Right to Erasure", the off-chain database record and AES-256 decryption key are deleted. The on-chain hash becomes mathematically un-linkable, ensuring 100% statutory privacy compliance.

### 8.3 Three-Phase Production Roadmap

```
+---------------------------------------------------------------------------------------------------------+
| PHASE 1: SIH PROTOTYPE (Current) | PHASE 2: BEL UNIT PILOT (On-Prem)  | PHASE 3: NATIONAL DEFENCE (Prod)|
+----------------------------------+------------------------------------+---------------------------------+
| - Polygon Amoy / Sepolia Testnet | - Permissioned Hyperledger Besu    | - National Blockchain Framework |
| - Cloud IPFS Pinning (Pinata)    | - On-Premise Private IPFS Cluster  |   (NBF Vishvasya Stack by MeitY)|
| - Full Role-Based Dashboard Suite| - Direct PACS Turnstile Integration| - Multi-Unit Interoperability   |
| - Anti-Tamper Verification Lab   | - Air-Gapped High-Security SCIFs   | - MoD, DRDO & Armed Forces Mesh |
+----------------------------------+------------------------------------+---------------------------------+
```

---

## 9. CONCLUSION & EXECUTIVE IMPACT

BELTAL delivers an enterprise-ready, defence-grade security paradigm for Bharat Electronics Limited. By bridging physical access control, digital identity governance, and high-value hardware custody under a unified cryptographic umbrella, BELTAL eliminates insider tamper risks and establishes mathematical certainty for defence operations.

With zero personal data exposure, sub-5ms operational speed, and a direct evolutionary roadmap to the National Blockchain Framework (NBF Vishvasya Stack), BELTAL equips BEL with a sovereign, tamper-proof digital infrastructure safeguarding India's strategic defence assets.
