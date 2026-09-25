// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Minimal ECDSA signature recovery helper (subset of OpenZeppelin's ECDSA).
 *      Recovers the signer address from an EIP-712 digest and a 65-byte {v,r,s} signature.
 */
library ECDSA {
    /**
     * @dev Returns the address that signed `digest` producing `signature`.
     *      Reverts on malformed input.
     */
    function recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "ECDSA: invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        require(v == 27 || v == 28, "ECDSA: invalid signature v value");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "ECDSA: invalid signature");
        return signer;
    }
}

interface IAuditLog {
    function logEvent(
        bytes32 eventType,
        address actor,
        address target,
        bytes32 entityId,
        string calldata details
    ) external returns (uint256);
}

interface IIdentityRegistry {
    struct IdentityRecord {
        bytes32 identityHash;
        bytes32 sbuCode;
        uint64 registeredAt;
        uint64 updatedAt;
        uint8 clearanceLevel;
        bool isActive;
    }
    function getIdentity(address user) external view returns (IdentityRecord memory);
}

interface IAccessControl {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function ROLE_SBU_MANAGER() external view returns (bytes32);
    function ROLE_SUPER_ADMIN() external view returns (bytes32);
}

/**
 * @title AssetNFT — Soulbound Defence Hardware Custody Provenance Token
 * @notice Represents physical military & defence hardware assets manufactured and tracked across
 *         Bharat Electronics Limited (BEL) units.
 * @dev Soulbound custody token: Standard ERC-721 transfers (transferFrom / safeTransferFrom) are disabled.
 *      Custody transfers are restricted to dual-authorized administrative reassignments.
 *
 * EIP-712 Signing Model (Issue #100)
 * ------------------------------------
 * `transferCustody` verifies an EIP-712 typed-data signature produced by the CURRENT CUSTODIAN
 * before executing a handover. This proves on-chain that the outgoing custodian consented to
 * the transfer — not merely that an authorized manager initiated it.
 *
 * Signed struct:
 *   CustodyTransfer(uint256 tokenId, address from, address to, uint256 nonce, uint256 deadline)
 *
 * - `from`     : current custodian at the time of signing
 * - `to`       : intended new custodian
 * - `nonce`    : per-token nonce (custodyNonces[tokenId]) — prevents signature replay
 * - `deadline` : unix timestamp after which the signature is no longer accepted
 *
 * Admin Bypass
 * ------------
 * `reassignCustody()` is an admin-only shorthand that calls `transferCustody` WITHOUT a
 * custodian signature (signature = "", deadline = 0, sigRequired = false). This path
 * is reserved for emergency administrative reassignments (e.g., employee departure,
 * device seizure) where the outgoing custodian cannot or will not sign. It is fully
 * protected by `onlyAuthorized` and is clearly distinguished in the audit trail.
 */
contract AssetNFT {
    using ECDSA for bytes32;

    string public name = "TrustChain BEL Defence Asset";
    string public symbol = "BEL-ASSET";

    address public admin;
    address public deployer;
    IAuditLog public auditLog;
    IIdentityRegistry public identityRegistry;
    IAccessControl public accessControl;

    uint256 private _nextTokenId = 1001;

    // -------------------------------------------------------------------------
    // EIP-712 Domain & Typehash (Issue #100)
    // -------------------------------------------------------------------------

    /// @notice EIP-712 domain separator — immutable, set once in the constructor.
    bytes32 public immutable DOMAIN_SEPARATOR;

    /**
     * @notice EIP-712 typehash for the CustodyTransfer struct.
     *         keccak256("CustodyTransfer(uint256 tokenId,address from,address to,uint256 nonce,uint256 deadline)")
     */
    bytes32 public constant CUSTODY_TRANSFER_TYPEHASH =
        keccak256("CustodyTransfer(uint256 tokenId,address from,address to,uint256 nonce,uint256 deadline)");

    /**
     * @notice Per-token nonce — incremented after each successful verified `transferCustody`.
     *         Used to prevent replay of a captured custodian signature.
     *         Read this before building the EIP-712 payload: `custodyNonces[tokenId]`.
     */
    mapping(uint256 => uint256) public custodyNonces;

    // -------------------------------------------------------------------------
    // Core storage
    // -------------------------------------------------------------------------

    struct AssetDetails {
        string assetTag;          // e.g., "BEL-SDR-TAC-042"
        string serialNumber;      // e.g., "SN-99412-A"
        uint8 classificationTier; // 1 (Restricted) to 4 (Top Secret)
        bytes32 sbu;              // e.g., "SBU_RADAR", "SBU_MILCOMM"
        string tokenURI;          // IPFS CID metadata
        uint256 mintedAt;
        bool isUnderMaintenance;
    }

    struct CustodyRecord {
        address custodian;
        uint256 timestamp;
        string transferReason;
        bytes signature; // EIP-712 custodian consent signature (or empty for admin bypasses / initial mint)
    }

    // tokenId => AssetDetails
    mapping(uint256 => AssetDetails) public assets;

    // tokenId => current custodian address
    mapping(uint256 => address) public custodians;

    // tokenId => list of historical custody handovers
    mapping(uint256 => CustodyRecord[]) public custodyHistory;

    // Authorized managers / CISOs permitted to mint and reassign custody
    mapping(address => bool) public isAuthorizedManager;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AssetMinted(
        uint256 indexed tokenId,
        address indexed initialCustodian,
        string assetTag,
        uint8 classificationTier,
        bytes32 indexed sbu,
        string tokenURI
    );

    event CustodyReassigned(
        uint256 indexed tokenId,
        address indexed previousCustodian,
        address indexed newCustodian,
        string reason,
        uint256 timestamp
    );

    event MaintenanceStatusUpdated(uint256 indexed tokenId, bool isUnderMaintenance);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin || msg.sender == deployer, "AssetNFT: Caller is not admin or deployer");
        _;
    }

    modifier onlyAuthorized() {
        bool authorized = msg.sender == admin || msg.sender == deployer || isAuthorizedManager[msg.sender];
        if (!authorized && address(accessControl) != address(0)) {
            authorized = accessControl.hasRole(accessControl.ROLE_SUPER_ADMIN(), msg.sender) ||
                         accessControl.hasRole(accessControl.ROLE_SBU_MANAGER(), msg.sender);
        }
        require(authorized, "AssetNFT: Caller is not authorized manager");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _initialAdmin,
        address _auditLog,
        address _identityRegistry,
        address _accessControl
    ) {
        deployer = msg.sender;
        admin = _initialAdmin != address(0) ? _initialAdmin : msg.sender;
        auditLog = IAuditLog(_auditLog);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        accessControl = IAccessControl(_accessControl);

        isAuthorizedManager[admin] = true;
        isAuthorizedManager[deployer] = true;

        // Build the EIP-712 domain separator once, binding it to this contract
        // address and the deployment chain — prevents cross-chain and cross-contract replay.
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("TrustChain BEL Defence Asset")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // -------------------------------------------------------------------------
    // Admin setters
    // -------------------------------------------------------------------------

    function setAuditLog(address _auditLog) external onlyAdmin {
        auditLog = IAuditLog(_auditLog);
    }

    function setIdentityRegistry(address _identityRegistry) external onlyAdmin {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function setAccessControl(address _accessControl) external onlyAdmin {
        accessControl = IAccessControl(_accessControl);
    }

    function setAuthorizedManager(address manager, bool status) external onlyAdmin {
        isAuthorizedManager[manager] = status;
    }

    // -------------------------------------------------------------------------
    // EIP-712 helpers (Issue #100)
    // -------------------------------------------------------------------------

    /**
     * @notice Build the EIP-712 digest for a CustodyTransfer.
     * @dev Call this off-chain (or in tests) to reproduce the digest the custodian must sign:
     *      digest = keccak256("\x19\x01" || DOMAIN_SEPARATOR || structHash)
     * @param tokenId   The asset token ID
     * @param from      Current custodian address (the signer)
     * @param to        Intended new custodian address
     * @param nonce     Current value of custodyNonces[tokenId]
     * @param deadline  Unix timestamp deadline
     */
    function buildCustodyTransferDigest(
        uint256 tokenId,
        address from,
        address to,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                CUSTODY_TRANSFER_TYPEHASH,
                tokenId,
                from,
                to,
                nonce,
                deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    // -------------------------------------------------------------------------
    // Minting
    // -------------------------------------------------------------------------

    /**
     * @notice Mint a new defence asset NFT with metadata pinned to IPFS
     */
    function mintAsset(
        address initialCustodian,
        string calldata assetTag,
        uint8 classificationTier,
        bytes32 sbu,
        string calldata tokenURI
    ) external onlyAuthorized returns (uint256) {
        return mintAssetDetailed(initialCustodian, assetTag, "", classificationTier, sbu, tokenURI);
    }

    /**
     * @notice Mint a new defence asset NFT with full serial number details
     * @dev Clearance gate: the initial custodian MUST have an active identity in IdentityRegistry
     *      with clearanceLevel >= classificationTier. Unregistered wallets (getIdentity returns a
     *      zero-struct with isActive == false) and revoked identities are both rejected — this
     *      closes the bypass reported in issue #98 where the gate was wrapped in `if (id.isActive)`
     *      and therefore silently skipped for unregistered/revoked recipients.
     *
     *      Design decision — SBU enforcement: SBU confinement is a cross-department access policy
     *      enforced by AccessControl.canAccessZone (with tempPassExpiry). Baking sbuCode == asset.sbu
     *      into AssetNFT would block legitimate cross-SBU reassignments without a pass mechanism
     *      inside this contract, so SBU gating remains at the AccessControl layer.
     *
     *      Design decision — Initial-mint signature (Issue #100): the CustodyRecord written at
     *      mint time carries `signature: ""` (intentionally unsigned). There is no outgoing
     *      custodian whose consent needs to be proven; the authorised minter is the sole actor.
     *      This is explicitly documented here and replaces the former "EIP-712 verification is
     *      deferred" note which referred to transferCustody (now fully verified).
     */
    function mintAssetDetailed(
        address initialCustodian,
        string calldata assetTag,
        string memory serialNumber,
        uint8 classificationTier,
        bytes32 sbu,
        string calldata tokenURI
    ) public onlyAuthorized returns (uint256) {
        require(initialCustodian != address(0), "AssetNFT: Invalid custodian address");
        require(classificationTier >= 1 && classificationTier <= 4, "AssetNFT: Invalid classification tier");

        // On-chain clearance gate: recipient must have an active registered identity with
        // sufficient clearance. Unregistered wallets return isActive=false (zero-struct) and
        // are rejected by the first require, closing the bypass from issue #98.
        if (address(identityRegistry) != address(0)) {
            IIdentityRegistry.IdentityRecord memory id = identityRegistry.getIdentity(initialCustodian);
            require(id.isActive, "AssetNFT: Recipient has no active identity");
            require(
                id.clearanceLevel >= classificationTier,
                "AssetNFT: Recipient clearance insufficient for asset classification"
            );
        }

        uint256 tokenId = _nextTokenId++;

        assets[tokenId] = AssetDetails({
            assetTag: assetTag,
            serialNumber: serialNumber,
            classificationTier: classificationTier,
            sbu: sbu,
            tokenURI: tokenURI,
            mintedAt: block.timestamp,
            isUnderMaintenance: false
        });

        custodians[tokenId] = initialCustodian;

        // Initial-mint record: no outgoing custodian to sign — signature is intentionally empty.
        custodyHistory[tokenId].push(CustodyRecord({
            custodian: initialCustodian,
            timestamp: block.timestamp,
            transferReason: "INITIAL_MINT_AND_CUSTODY_ASSIGNMENT",
            signature: ""
        }));

        emit AssetMinted(tokenId, initialCustodian, assetTag, classificationTier, sbu, tokenURI);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("ASSET_MINT", msg.sender, initialCustodian, bytes32(tokenId), assetTag) {} catch {}
        }

        return tokenId;
    }

    // -------------------------------------------------------------------------
    // Custody Transfer
    // -------------------------------------------------------------------------

    /**
     * @notice Admin-only custody reassignment WITHOUT a custodian signature.
     * @dev This shorthand is reserved for emergency administrative reassignments — e.g.,
     *      employee departure, device seizure, or disaster-recovery scenarios — where the
     *      outgoing custodian cannot or will not provide an EIP-712 consent signature.
     *
     *      Security posture: the `onlyAuthorized` gate (admin / deployer / ROLE_SBU_MANAGER /
     *      ROLE_SUPER_ADMIN) is the sole on-chain protection for this path. The stored
     *      CustodyRecord will contain an empty signature, which is a deliberate signal to
     *      auditors that this handover was an admin-initiated bypass rather than a
     *      custodian-consented transfer.
     *
     *      The per-token nonce is NOT incremented by this path (there is no signature to
     *      replay), so existing pending signed transfers remain valid.
     */
    function reassignCustody(
        uint256 tokenId,
        address newCustodian,
        string calldata reason
    ) external onlyAuthorized {
        _executeCustodyTransfer(tokenId, newCustodian, reason, "");
    }

    /**
     * @notice Transfer custody with EIP-712 cryptographic proof of current-custodian consent.
     * @dev Full verification path (Issue #100). Callers MUST supply:
     *
     *      1. `deadline` — unix timestamp after which the signature is invalid.
     *         Prevents the manager from holding a signed approval indefinitely.
     *
     *      2. `signature` — 65-byte ECDSA signature produced by the CURRENT CUSTODIAN over
     *         the EIP-712 typed-data digest:
     *
     *         CustodyTransfer(
     *             uint256 tokenId,
     *             address from,     // current custodian at time of signing
     *             address to,       // newCustodian argument
     *             uint256 nonce,    // custodyNonces[tokenId] at time of signing
     *             uint256 deadline
     *         )
     *
     *         Domain: { name: "TrustChain BEL Defence Asset", version: "1",
     *                   chainId: <deployment chainId>, verifyingContract: <this> }
     *
     *      Build the digest off-chain using `buildCustodyTransferDigest()` and sign with
     *      `eth_signTypedData_v4` (MetaMask) or `ethers.Wallet.signTypedData`.
     *
     *      Replay prevention: `custodyNonces[tokenId]` is incremented after each successful
     *      verified transfer. A captured valid signature becomes invalid after use.
     *
     *      Clearance gate (Issue #98): the new custodian must have an active registered
     *      identity with clearanceLevel >= asset.classificationTier.
     *
     * @param tokenId      The asset token ID
     * @param newCustodian Address of the intended new custodian
     * @param reason       Human-readable transfer reason (stored in custodyHistory)
     * @param deadline     Unix timestamp — signature must be used before this time
     * @param signature    65-byte EIP-712 ECDSA signature from the current custodian
     */
    function transferCustody(
        uint256 tokenId,
        address newCustodian,
        string calldata reason,
        uint256 deadline,
        bytes memory signature
    ) public onlyAuthorized {
        require(custodians[tokenId] != address(0), "AssetNFT: Asset does not exist");
        require(newCustodian != address(0), "AssetNFT: Invalid new custodian address");
        require(newCustodian != custodians[tokenId], "AssetNFT: New custodian is already current custodian");

        // --- Deadline check (Issue #100) ---
        // slither-disable-next-line timestamp
        require(block.timestamp <= deadline, "AssetNFT: Signature deadline expired");

        // --- EIP-712 signature verification (Issue #100) ---
        address currentCustodian = custodians[tokenId];
        uint256 nonce = custodyNonces[tokenId];

        bytes32 digest = buildCustodyTransferDigest(tokenId, currentCustodian, newCustodian, nonce, deadline);
        address recovered = ECDSA.recover(digest, signature);
        require(
            recovered == currentCustodian,
            "AssetNFT: Signature not from current custodian"
        );

        // Increment nonce BEFORE state changes to prevent re-entrancy replay
        custodyNonces[tokenId] = nonce + 1;

        // --- Clearance gate (Issue #98) ---
        if (address(identityRegistry) != address(0)) {
            IIdentityRegistry.IdentityRecord memory id = identityRegistry.getIdentity(newCustodian);
            require(id.isActive, "AssetNFT: Recipient has no active identity");
            require(
                id.clearanceLevel >= assets[tokenId].classificationTier,
                "AssetNFT: Recipient clearance insufficient for asset classification"
            );
        }

        _executeCustodyTransfer(tokenId, newCustodian, reason, signature);
    }

    /**
     * @dev Shared state-mutation logic for both `transferCustody` (verified) and
     *      `reassignCustody` (admin bypass). Callers are responsible for all pre-conditions.
     */
    function _executeCustodyTransfer(
        uint256 tokenId,
        address newCustodian,
        string calldata reason,
        bytes memory signature
    ) internal {
        require(custodians[tokenId] != address(0), "AssetNFT: Asset does not exist");
        require(newCustodian != address(0), "AssetNFT: Invalid new custodian address");
        require(newCustodian != custodians[tokenId], "AssetNFT: New custodian is already current custodian");

        // Clearance gate for reassignCustody path (transferCustody checks above)
        if (address(identityRegistry) != address(0)) {
            IIdentityRegistry.IdentityRecord memory id = identityRegistry.getIdentity(newCustodian);
            require(id.isActive, "AssetNFT: Recipient has no active identity");
            require(
                id.clearanceLevel >= assets[tokenId].classificationTier,
                "AssetNFT: Recipient clearance insufficient for asset classification"
            );
        }

        address previousCustodian = custodians[tokenId];
        custodians[tokenId] = newCustodian;

        custodyHistory[tokenId].push(CustodyRecord({
            custodian: newCustodian,
            timestamp: block.timestamp,
            transferReason: reason,
            signature: signature
        }));

        emit CustodyReassigned(tokenId, previousCustodian, newCustodian, reason, block.timestamp);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("CUSTODY_TRANSFERRED", msg.sender, newCustodian, bytes32(tokenId), reason) {} catch {}
        }
    }

    // -------------------------------------------------------------------------
    // Maintenance
    // -------------------------------------------------------------------------

    /**
     * @notice Set equipment maintenance flag
     */
    function setMaintenanceStatus(uint256 tokenId, bool isUnderMaintenance) external onlyAuthorized {
        require(custodians[tokenId] != address(0), "AssetNFT: Asset does not exist");
        assets[tokenId].isUnderMaintenance = isUnderMaintenance;
        emit MaintenanceStatusUpdated(tokenId, isUnderMaintenance);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent(
                "MAINTENANCE_STATUS",
                msg.sender,
                custodians[tokenId],
                bytes32(tokenId),
                isUnderMaintenance ? "ENTERED_MAINTENANCE" : "CLEARED_MAINTENANCE"
            ) {} catch {}
        }
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /**
     * @notice Retrieve the full custody provenance trail for an asset
     */
    function getCustodyHistory(uint256 tokenId) external view returns (CustodyRecord[] memory) {
        require(custodians[tokenId] != address(0), "AssetNFT: Asset does not exist");
        return custodyHistory[tokenId];
    }

    /**
     * @notice Get current custodian address
     */
    function getCustodian(uint256 tokenId) external view returns (address) {
        return custodians[tokenId];
    }

    /**
     * @notice Get asset details
     */
    function getAssetDetails(uint256 tokenId) external view returns (AssetDetails memory) {
        require(custodians[tokenId] != address(0), "AssetNFT: Asset does not exist");
        return assets[tokenId];
    }

    // -------------------------------------------------------------------------
    // Soulbound restrictions (ERC-721 standard transfers are disabled)
    // -------------------------------------------------------------------------

    function transferFrom(address, address, uint256) external pure {
        revert("AssetNFT: SOULBOUND token. Standard transfers disabled; use reassignCustody.");
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert("AssetNFT: SOULBOUND token. Standard transfers disabled; use reassignCustody.");
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert("AssetNFT: SOULBOUND token. Standard transfers disabled; use reassignCustody.");
    }

    function approve(address, uint256) external pure {
        revert("AssetNFT: Approvals disabled on soulbound assets.");
    }

    function setApprovalForAll(address, bool) external pure {
        revert("AssetNFT: Approvals disabled on soulbound assets.");
    }
}
