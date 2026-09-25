import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
import os

def create_element(name):
    return OxmlElement(name)

def set_cell_background(cell, fill_hex):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_table_borders(table, color="CCCCCC", sz="4", val="single"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:left w:val="none"/>'
        f'  <w:right w:val="none"/>'
        f'  <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def build_docx():
    doc = docx.Document()

    # Page setup - 0.8 inch margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Palette
    NAVY = RGBColor(0x0A, 0x25, 0x40)      # #0A2540
    DEEP_BLUE = RGBColor(0x00, 0x4B, 0x87) # #004B87
    DARK_TEXT = RGBColor(0x1F, 0x29, 0x37) # #1F2937
    MUTED_TEXT = RGBColor(0x4B, 0x55, 0x63)# #4B5563
    ACCENT_GOLD = RGBColor(0xB4, 0x53, 0x09) # Amber/Gold
    BORDER_COLOR = "D1D5DB"

    # Base normal style
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Calibri'
    style_normal.font.size = Pt(11)
    style_normal.font.color.rgb = DARK_TEXT
    style_normal.paragraph_format.line_spacing = 1.15
    style_normal.paragraph_format.space_after = Pt(4)

    # -------------------------------------------------------------
    # HEADER / TITLE BANNER
    # -------------------------------------------------------------
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(2)
    run_sub = title_p.add_run("SMART INDIA HACKATHON 2026 — OFFICIAL IDEA SUBMISSION DOSSIER\n")
    run_sub.font.size = Pt(10)
    run_sub.font.bold = True
    run_sub.font.color.rgb = ACCENT_GOLD

    run_title = title_p.add_run("BELTAL: Blockchain-Enabled Trusted Access & Digital Asset Ledger")
    run_title.font.size = Pt(20)
    run_title.font.bold = True
    run_title.font.color.rgb = NAVY

    # Metadata Box (Table)
    meta_table = doc.add_table(rows=6, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_table.autofit = False

    meta_data = [
        ("Problem Statement ID", "SIH26125"),
        ("Ministry & Organization", "Bharat Electronics Limited (BEL), Ministry of Defence, Govt. of India"),
        ("Category & Theme", "Software | Blockchain & Cybersecurity"),
        ("Operational Scope", "All 9 BEL Manufacturing Units across India"),
        ("Strategic Business Units (SBUs)", "Military Radars, Electronic Warfare & Avionics, Military Comm, Cyber Systems, Naval Systems"),
        ("Core Architecture", "Triad Architecture: Solidity Smart Contracts + Encrypted IPFS + Sub-5ms PostgreSQL Cache")
    ]

    col_widths = [Inches(2.4), Inches(4.5)]
    for row_idx, (label, val) in enumerate(meta_data):
        row = meta_table.rows[row_idx]
        cell_lbl, cell_val = row.cells[0], row.cells[1]
        
        cell_lbl.width = col_widths[0]
        cell_val.width = col_widths[1]

        set_cell_background(cell_lbl, "F3F4F6")
        set_cell_background(cell_val, "FAFAFA")
        set_cell_margins(cell_lbl, top=80, bottom=80, left=120, right=120)
        set_cell_margins(cell_val, top=80, bottom=80, left=120, right=120)

        p_lbl = cell_lbl.paragraphs[0]
        p_lbl.paragraph_format.space_after = Pt(0)
        r_lbl = p_lbl.add_run(label)
        r_lbl.font.bold = True
        r_lbl.font.size = Pt(10)
        r_lbl.font.color.rgb = NAVY

        p_val = cell_val.paragraphs[0]
        p_val.paragraph_format.space_after = Pt(0)
        r_val = p_val.add_run(val)
        r_val.font.size = Pt(10)
        r_val.font.color.rgb = DARK_TEXT

    set_table_borders(meta_table, color="D1D5DB", sz="4")

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # HELPER FUNCTIONS FOR SECTIONS
    # -------------------------------------------------------------
    def add_heading_1(text):
        h = doc.add_paragraph()
        h.paragraph_format.space_before = Pt(14)
        h.paragraph_format.space_after = Pt(4)
        h.paragraph_format.keep_with_next = True
        r = h.add_run(text)
        r.font.size = Pt(14)
        r.font.bold = True
        r.font.color.rgb = NAVY
        return h

    def add_heading_2(text):
        h = doc.add_paragraph()
        h.paragraph_format.space_before = Pt(10)
        h.paragraph_format.space_after = Pt(3)
        h.paragraph_format.keep_with_next = True
        r = h.add_run(text)
        r.font.size = Pt(12)
        r.font.bold = True
        r.font.color.rgb = DEEP_BLUE
        return h

    def add_callout(text, title="KEY DEFENCE PRINCIPLE:"):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = tbl.rows[0].cells[0]
        cell.width = Inches(6.9)
        set_cell_background(cell, "EFF6FF") # Light blue
        set_cell_margins(cell, top=100, bottom=100, left=150, right=150)
        
        # Border left thick blue
        tcPr = cell._tc.get_or_add_tcPr()
        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:left w:val="single" w:sz="24" w:space="0" w:color="004B87"/>'
            f'  <w:top w:val="none"/>'
            f'  <w:right w:val="none"/>'
            f'  <w:bottom w:val="none"/>'
            f'</w:tcBorders>'
        )
        tcPr.append(borders)

        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r_t = p.add_run(title + " ")
        r_t.font.bold = True
        r_t.font.size = Pt(10)
        r_t.font.color.rgb = DEEP_BLUE
        
        r_body = p.add_run(text)
        r_body.font.size = Pt(10)
        r_body.font.color.rgb = DARK_TEXT
        
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    def add_code_block(code_text):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = tbl.rows[0].cells[0]
        cell.width = Inches(6.9)
        set_cell_background(cell, "1E293B") # Slate 800 dark
        set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
        
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(code_text)
        r.font.name = 'Consolas'
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(0x38, 0xBD, 0xF8) # Sky blue text
        
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # -------------------------------------------------------------
    # SECTION 1: THE PROBLEM
    # -------------------------------------------------------------
    add_heading_1("1. The Problem: Background & Operational Challenges")
    
    p = doc.add_paragraph()
    p.add_run("Bharat Electronics Limited (BEL), a Navratna defence PSU under the Ministry of Defence, Govt. of India, operates across ")
    r = p.add_run("9 manufacturing complexes")
    r.font.bold = True
    p.add_run(" (Bengaluru, Ghaziabad, Hyderabad, Pune, Kotdwara, Panchkula, Chennai, Machilipatnam, Taloja) with specialized Strategic Business Units (SBUs) such as ")
    p.add_run("Military Radars, Electronic Warfare & Avionics, Military Communication, and Cyber Systems").font.bold = True
    p.add_run(".\n\nCurrently, employee identities, facility access, and high-value classified equipment are managed across siloed, centralized, and semi-manual systems (Active Directory/LDAP, SAP ERP, departmental spreadsheets, and paper registers).")

    add_code_block(
        "EXISTING VULNERABILITY LANDSCAPE AT DEFENCE ESTABLISHMENTS:\n"
        "----------------------------------------------------------------------------------\n"
        "[ Centralized LDAP / DB ]  ──(Single Point of Breach)────> [ All Clearance Tiers Compromised ]\n"
        "[ Privileged DBA / Insider] ──(Direct SQL Manipulation)───> [ Silent Privilege Escalation ]\n"
        "[ Departmental Registers ]  ──(Fragmented Paper / Excel)──> [ Disconnected Hardware Custody ]\n"
        "[ Statutory Audit (DGQA) ]  ──(Trusts Mutable SQL Tables)─> [ Zero Mathematical Audit Proof ]"
    )

    doc.add_paragraph("Critical Operational Vulnerabilities:", style='Normal').runs[0].font.bold = True
    
    bullets = [
        ("Single Point of Failure (SPOF): ", "Centralized IAM databases expose all clearance levels and credentials simultaneously if compromised by external adversaries or insider threats."),
        ("No Tamper-Evident History: ", "Privileged database administrators (DBAs) or compromised service accounts can quietly alter access rights or gate pass records directly in SQL tables without leaving an immutable audit trail."),
        ("Disconnected Asset Custody: ", "High-value tactical hardware (Software-Defined Radios, Spectrum Analyzers, Crypto Modules) is tracked via disconnected registers, preventing unified cross-unit custody tracing across R&D labs and test chambers."),
        ("Statutory Compliance Gaps: ", "Defence and statutory auditors (DGQA, MoD Vigilance, CAG, CERT-In) must trust mutable database rows rather than cryptographically verifiable proof.")
    ]
    for b_title, b_desc in bullets:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(2)
        r1 = bp.add_run(b_title)
        r1.font.bold = True
        r1.font.color.rgb = DEEP_BLUE
        bp.add_run(b_desc)

    # -------------------------------------------------------------
    # SECTION 2: THE PROPOSED SOLUTION
    # -------------------------------------------------------------
    add_heading_1("2. The Proposed Solution: BELTAL")
    
    p = doc.add_paragraph()
    p.add_run("BELTAL introduces a ")
    p.add_run("cryptographic verification and rule enforcement layer").font.bold = True
    p.add_run(" directly beneath BEL's existing infrastructure without disrupting daily operations. Instead of replacing existing RFID badge readers, turnstiles, or HRMS interfaces, BELTAL acts as an immutable ledger, decentralized vault, and rule enforcement engine.")

    add_callout(
        "BELTAL operates on a 'Zero Rip-and-Replace' philosophy. Existing door badge readers, SAP ERP, and HRMS connect through standard RESTful Integration Adapters, while smart contracts enforce rules mathematically.",
        "NON-INVASIVE ENTERPRISE INTEGRATION:"
    )

    sol_points = [
        ("Decentralized Identifiers (DIDs): ", "Cryptographically verifiable identity anchors (did:bel:<id>) replace simple editable database rows."),
        ("Soulbound Asset NFTs: ", "Physical defence equipment and cryptographic keys are tokenized as non-transferable ERC-721 digital twins linked to an employee's DID, ensuring an unalterable custody chain."),
        ("Smart Contract Enforced Security: ", "Access rules, 4-tier clearances (Restricted to Top Secret), and SBU confinement are executed on-chain via smart contracts, preventing application-layer bypasses."),
        ("Triad Data Architecture: ", "Complete PII compliance (DPDP Act 2023) by storing only hashes and permissions on-chain, encrypted files on IPFS, and fast indexed records in an off-chain PostgreSQL cache."),
        ("Anti-Tamper Integrity Scanner: ", "Auditors can run a live mathematical integrity check that hashes the local database row and matches it against the on-chain anchor, instantly detecting unauthorized database tampering.")
    ]
    for st, sd in sol_points:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(2)
        r1 = bp.add_run(st)
        r1.font.bold = True
        r1.font.color.rgb = DEEP_BLUE
        bp.add_run(sd)

    # -------------------------------------------------------------
    # SECTION 3: ARCHITECTURE & SYSTEM WORKFLOW
    # -------------------------------------------------------------
    add_heading_1("3. Architecture & System Workflows")

    add_heading_2("3.1 Triad Data Separation Model")
    p = doc.add_paragraph()
    p.add_run("To balance defence-grade cryptographic immutability, sub-5ms UI responsiveness, and strict statutory privacy compliance (DPDP Act 2023), BELTAL implements a Triad Data Separation architecture:")

    # Triad Table
    triad_tbl = doc.add_table(rows=4, cols=3)
    triad_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    triad_headers = ["Layer", "Data Stored", "Rationale & Defence Advantage"]
    
    for i, h_text in enumerate(triad_headers):
        c = triad_tbl.rows[0].cells[i]
        set_cell_background(c, "0A2540")
        set_cell_margins(c, top=80, bottom=80, left=100, right=100)
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h_text)
        r.font.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    triad_rows = [
        ("On-Chain (Solidity ^0.8.20)", "bytes32 Identity Hashes, Clearance Tiers (1–4), ERC-721 Token IDs, Zone Rules, Event Hashes", "Zero PII on-chain; mathematical immutability; rules cannot be bypassed by DBAs."),
        ("Decentralized Vault (IPFS)", "AES-256-GCM Encrypted Employee Dossiers, Calibration Certificates (PDFs), Schematics", "Decentralized storage without file size limits; content addressed by immutable CIDs."),
        ("Query Engine (PostgreSQL + Prisma)", "Indexed Relational Cache, Employee Directory, Facility Room Lists, Cached PACS Scans", "Sub-5ms query and filtering for dashboards; asynchronously synced with on-chain events.")
    ]

    t_widths = [Inches(1.8), Inches(2.7), Inches(2.4)]
    for r_idx, (col1, col2, col3) in enumerate(triad_rows, start=1):
        row = triad_tbl.rows[r_idx]
        for c_idx, val in enumerate([col1, col2, col3]):
            cell = row.cells[c_idx]
            cell.width = t_widths[c_idx]
            set_cell_background(cell, "F9FAFB" if r_idx % 2 == 1 else "FFFFFF")
            set_cell_margins(cell, top=70, bottom=70, left=90, right=90)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(val)
            r.font.size = Pt(9.5)
            if c_idx == 0:
                r.font.bold = True
                r.font.color.rgb = NAVY

    set_table_borders(triad_tbl, color="D1D5DB", sz="4")

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    add_heading_2("3.2 Core Operational Workflows")

    add_code_block(
        "WORKFLOW ARCHITECTURE OVERVIEW:\n"
        "----------------------------------------------------------------------------------\n"
        "1. Bulk Onboarding:     HR CSV -> AES-256 IPFS -> Keccak256 -> batchRegisterIdentities() (<=250/tx)\n"
        "2. PACS Gate Access:    RFID Tap -> PACS Adapter -> canAccessZone() (Smart Contract) -> Unlock Gate\n"
        "3. Custody Handover:    Mint NFT -> Transfer Request -> Clearance Validation -> On-Chain Handshake\n"
        "4. Anti-Tamper Audit:   DB Tamper -> Auditor Scan -> Hash Comparison -> Instant RED ALERT on Mismatch"
    )

    wf_list = [
        ("Workflow A — Bulk Onboarding: ", "HR uploads employee batches via CSV; the backend generates DIDs, computes Keccak-256 hashes, encrypts dossiers to IPFS, and registers up to 250 identities per transaction on-chain via batchRegisterIdentities."),
        ("Workflow B — Physical Gate Access (PACS Simulation): ", "An RFID tap triggers an on-chain canAccessZone() call checking clearance tier, SBU confinement, and emergency lockdown status. Every granted or denied attempt is logged immutably via AuditLog.sol."),
        ("Workflow C — Dual-Handshake Custody Transfer: ", "Hardware handover requires SBU manager authorization and clearance validation before on-chain custody transfers, updating the token's historical chain of custody."),
        ("Workflow D — Anti-Tamper Integrity Scanner (Flagship Auditor Feature): ", "Auditors run a live check that hashes the local database row and matches it against the on-chain anchor; any direct, unauthorized database tampering immediately triggers a high-severity red alert.")
    ]
    for wt, wd in wf_list:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(2)
        r1 = bp.add_run(wt)
        r1.font.bold = True
        r1.font.color.rgb = DEEP_BLUE
        bp.add_run(wd)

    # -------------------------------------------------------------
    # SECTION 4: SMART CONTRACT SPECIFICATION & TECH STACK
    # -------------------------------------------------------------
    add_heading_1("4. Smart Contract Architecture & Technology Stack")

    add_heading_2("4.1 Smart Contract Suite (Solidity ^0.8.20 / OpenZeppelin v5)")
    
    contracts = [
        ("IdentityRegistry.sol", "Anchors employee DIDs (did:bel:<id>) and identity hashes (keccak256(empId, name, sbu, salt)) without exposing PII. Supports batch registration (up to 250 DIDs/tx), clearance updates, and cryptographic identity revocation."),
        ("AccessControl.sol", "Enforces 4-tier clearance levels (Restricted to Top Secret), SBU confinement rules, time-bound temporary passes (for visiting DRDO/Armed Forces officials), and facility-wide 1-click emergency lockdowns."),
        ("AssetNFT.sol", "Restricted Custody ERC-721 Soulbound digital twins for defence equipment. Transfers are gated by recipient clearance checks and dual-party cryptographic signatures."),
        ("AuditLog.sol", "Append-only, universal event logging stream providing tamper-proof non-repudiation for MoD/DGQA statutory audits.")
    ]
    for c_name, c_desc in contracts:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(2)
        r1 = bp.add_run(c_name + ": ")
        r1.font.bold = True
        r1.font.color.rgb = NAVY
        bp.add_run(c_desc)

    add_heading_2("4.2 Complete Technology Stack")

    stack_tbl = doc.add_table(rows=7, cols=2)
    stack_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    stack_data = [
        ("Smart Contracts", "Solidity (^0.8.20), OpenZeppelin Contracts v5, Hardhat, Ethers.js v6"),
        ("Blockchain Tier", "Polygon Amoy Testnet (Hackathon) -> Permissioned Hyperledger Besu (Pilot) -> National Blockchain Framework (NBF Vishvasya Stack for Production)"),
        ("Backend & Relayer", "Node.js, Express.js REST API, Ethers.js Relayer Adapter, Prisma ORM"),
        ("Cryptography", "Keccak-256 Hashing, AES-256-GCM Encryption, ECDSA Signatures"),
        ("Database & Caching", "PostgreSQL with pgaudit logging and indexed relational caching"),
        ("Decentralized Storage", "IPFS (via Pinata / Private IPFS Cluster node) with client-side AES-256 encryption"),
        ("Frontend & Auth", "React.js, Tailwind CSS v4 (Defence dark theme), Nonce + ECDSA Wallet Signature Verification")
    ]

    s_widths = [Inches(2.2), Inches(4.7)]
    for r_idx, (col1, col2) in enumerate(stack_data):
        row = stack_tbl.rows[r_idx]
        c1, c2 = row.cells[0], row.cells[1]
        c1.width, c2.width = s_widths[0], s_widths[1]
        set_cell_background(c1, "F3F4F6")
        set_cell_background(c2, "FFFFFF")
        set_cell_margins(c1, top=60, bottom=60, left=100, right=100)
        set_cell_margins(c2, top=60, bottom=60, left=100, right=100)
        
        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(col1)
        r1.font.bold = True
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = NAVY

        p2 = c2.paragraphs[0]
        p2.paragraph_format.space_after = Pt(0)
        r2 = p2.add_run(col2)
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = DARK_TEXT

    set_table_borders(stack_tbl, color="D1D5DB", sz="4")

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECTION 5: RBAC & CLEARANCE MATRIX
    # -------------------------------------------------------------
    add_heading_1("5. Role-Based Access Control (RBAC) & Clearance Matrix")

    rbac_tbl = doc.add_table(rows=5, cols=2)
    rbac_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    # Headers
    h_row = rbac_tbl.rows[0]
    for idx, ht in enumerate(["Role / Stakeholder", "Key Capabilities & Defence Responsibilities"]):
        c = h_row.cells[idx]
        set_cell_background(c, "0A2540")
        set_cell_margins(c, top=80, bottom=80, left=100, right=100)
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(ht)
        r.font.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    rbac_data = [
        ("CISO / Super Admin", "Bulk onboarding, DID assignment, clearance threshold setup, and 1-click facility emergency lockdown."),
        ("SBU Unit Manager", "Minting Asset NFTs, approving custody transfers, scheduling calibration, and issuing time-bound temporary visitor passes."),
        ("MoD / DGQA Auditor", "Read-only verifiable log stream, cryptographic report export, and interactive Anti-Tamper Verification testing."),
        ("Defence Employee", "Viewing digital clearance badge, tracking 'My Custody Locker' assets, and initiating asset handovers.")
    ]

    r_widths = [Inches(2.2), Inches(4.7)]
    for r_idx, (col1, col2) in enumerate(rbac_data, start=1):
        row = rbac_tbl.rows[r_idx]
        c1, c2 = row.cells[0], row.cells[1]
        c1.width, c2.width = r_widths[0], r_widths[1]
        set_cell_background(c1, "F9FAFB" if r_idx % 2 == 1 else "FFFFFF")
        set_cell_background(c2, "F9FAFB" if r_idx % 2 == 1 else "FFFFFF")
        set_cell_margins(c1, top=70, bottom=70, left=90, right=90)
        set_cell_margins(c2, top=70, bottom=70, left=90, right=90)
        
        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(col1)
        r1.font.bold = True
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = NAVY

        p2 = c2.paragraphs[0]
        p2.paragraph_format.space_after = Pt(0)
        r2 = p2.add_run(col2)
        r2.font.size = Pt(9.5)

    set_table_borders(rbac_tbl, color="D1D5DB", sz="4")

    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    add_heading_2("Security Clearance Tiers (Defence Standard):")
    add_code_block(
        "[LEVEL 4: TOP SECRET]   --> Crypto Key Lab, SCIF, Missile Guidance Firmware, KG Modules\n"
        "         ^\n"
        "[LEVEL 3: SECRET]       --> RF Anechoic Chamber, Radar Signal Labs, Tactical SDRs\n"
        "         ^\n"
        "[LEVEL 2: CONFIDENTIAL] --> Sub-system Test Benches, Calibration Labs, Spectrum Analyzers\n"
        "         ^\n"
        "[LEVEL 1: RESTRICTED]   --> General Assembly, Non-sensitive Test Bays, Standard Tooling"
    )

    # -------------------------------------------------------------
    # SECTION 6: VALUE PROPOSITION (USP MATRIX)
    # -------------------------------------------------------------
    add_heading_1("6. Value Proposition (USP vs. Current System)")

    usp_tbl = doc.add_table(rows=6, cols=3)
    usp_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER

    for idx, ht in enumerate(["Evaluation Parameter", "Current BEL System", "BELTAL (Proposed Solution)"]):
        c = usp_tbl.rows[0].cells[idx]
        set_cell_background(c, "0A2540")
        set_cell_margins(c, top=80, bottom=80, left=100, right=100)
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(ht)
        r.font.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    usp_rows = [
        ("Data Authority", "Central database controlled by IT admin; rows can be edited silently.", "Immutable blockchain ledger; past states cannot be rewritten or erased."),
        ("System Vulnerability", "Single central point of failure exposes all facility access and identities.", "Decentralized trust; database is a disposable cache rebuildable from chain events."),
        ("Hardware Custody", "Departmental spreadsheets and paper gate passes.", "Soulbound NFTs with non-repudiable custody and maintenance history."),
        ("Access Enforcement", "Middleware/application layer only (bypassable via DB update).", "Enforced directly inside smart contracts via mathematical logic."),
        ("Audit Verification", "External auditors must trust mutable SQL database reports.", "Mathematical verification: real-time hash comparison reveals any local cache manipulation.")
    ]

    u_widths = [Inches(1.8), Inches(2.5), Inches(2.6)]
    for r_idx, (col1, col2, col3) in enumerate(usp_rows, start=1):
        row = usp_tbl.rows[r_idx]
        for c_idx, val in enumerate([col1, col2, col3]):
            cell = row.cells[c_idx]
            cell.width = u_widths[c_idx]
            set_cell_background(cell, "F9FAFB" if r_idx % 2 == 1 else "FFFFFF")
            set_cell_margins(cell, top=70, bottom=70, left=90, right=90)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(val)
            r.font.size = Pt(9.5)
            if c_idx == 0:
                r.font.bold = True
                r.font.color.rgb = NAVY

    set_table_borders(usp_tbl, color="D1D5DB", sz="4")

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECTION 7: FEASIBILITY, SCALABILITY & ROADMAP
    # -------------------------------------------------------------
    add_heading_1("7. Feasibility, Scalability & Enterprise Roadmap")

    f_bullets = [
        ("Frictionless Integration: ", "Connects via REST APIs and CSV batch import routines mapped to BEL’s internal employee IDs, requiring no changes to underlying SAP ERP or physical door hardware."),
        ("DPDP Act 2023 Compliance & Cryptographic Shredding: ", "Zero PII on-chain ensures full compliance with India's Digital Personal Data Protection Act 2023. When an employee leaves, deleting the off-chain database and AES key renders the on-chain hash cryptographically un-linkable."),
        ("Zero Web3 Friction: ", "Employees authenticate via existing SSO/credentials while backend Relayers sign blockchain transactions, eliminating seed-phrase and gas token overhead.")
    ]
    for fb_title, fb_desc in f_bullets:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(2)
        r1 = bp.add_run(fb_title)
        r1.font.bold = True
        r1.font.color.rgb = DEEP_BLUE
        bp.add_run(fb_desc)

    add_heading_2("Three-Phase Enterprise Roadmap:")
    add_code_block(
        "+-----------------------------------------------------------------------------------------------+\n"
        "| PHASE 1: SIH PROTOTYPE (Now)     | PHASE 2: BEL PILOT (On-Prem)     | PHASE 3: NATIONAL (Prod)|\n"
        "+----------------------------------+----------------------------------+-------------------------+\n"
        "| - Network: Polygon Amoy / Testnet| - Network: Hyperledger Besu      | - Network: NBF Vishvasya|\n"
        "| - Cloud IPFS pinning (Pinata)    | - On-prem private IPFS cluster   |   Stack (NIC Data Ctrs) |\n"
        "| - Full role-based dashboards     | - Direct turnstile integration   | - Governed national node|\n"
        "| - Anti-tamper verification lab   | - Air-gapped defence SCIF setups | - Inter-agency defence  |\n"
        "+----------------------------------+----------------------------------+-------------------------+"
    )

    # -------------------------------------------------------------
    # SECTION 8: EXECUTIVE SUMMARY
    # -------------------------------------------------------------
    add_heading_1("8. Executive Summary & Conclusion")
    
    p = doc.add_paragraph()
    p.add_run("Maintaining secure, verifiable identity and asset tracking is critical for high-security defence establishments like Bharat Electronics Limited. Traditional setups that depend on centralized relational databases and siloed spreadsheets are vulnerable to single-point breaches, untraceable manual edits, and fragmented custody records.\n\n")
    p.add_run("BELTAL provides an enterprise-grade cryptographic verification layer running underneath BEL's existing IT infrastructure. By utilizing Decentralized Identifiers (DIDs) for personnel and non-transferable Soulbound NFTs for critical tactical hardware, BELTAL anchors identity and asset lifecycles directly to the blockchain. Access permissions are governed by smart contracts enforcing multi-tier defence security clearances (Restricted to Top Secret) and SBU boundaries, eliminating unauthorized application-level overrides.\n\n")
    p.add_run("The platform employs a Triad Data Separation model—anchoring only cryptographic hashes on-chain for strict DPDP Act compliance, securing documentation via client-side encrypted IPFS, and caching data in PostgreSQL for sub-5ms operational speed. Furthermore, statutory inspectors and vigilance bodies are equipped with an Anti-Tamper Integrity Scanner to independently verify historical records directly against the chain. Designed for a direct upgrade path from testnet prototypes to on-premise Hyperledger Besu and the National Blockchain Framework, BELTAL transforms sensitive defence management into an accountable, immutable, and mathematically tamper-proof ecosystem.")

    # Save to both target locations
    out_path_docs = os.path.join(os.path.dirname(__file__), "..", "docs", "SIH_2026_BELTAL_Submission_Document.docx")
    out_path_root = os.path.join(os.path.dirname(__file__), "..", "SIH_2026_BELTAL_Submission_Document.docx")
    
    doc.save(out_path_docs)
    doc.save(out_path_root)
    print(f"Document successfully created at: {out_path_docs}")
    print(f"Document successfully created at: {out_path_root}")

if __name__ == '__main__':
    build_docx()
