// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAuditLog {
    function logEvent(
        bytes32 eventType,
        address actor,
        address target,
        bytes32 entityId,
        string calldata details
    ) external returns (uint256);
}

/**
 * @title IdentityRegistry — Sovereign Defence DID & Clearance Level Anchor
 * @notice Stores employee cryptographic identity hashes (Keccak-256) and military clearance levels (1-4)
 *         with zero PII stored on-chain.
 */
contract IdentityRegistry {
    address public admin;
    IAuditLog public auditLog;

    struct IdentityRecord {
        bytes32 identityHash; // Slot 1: keccak256(empid, fullname, sbucode, salt)
        bytes32 sbuCode;      // Slot 2: "SBU_RADAR", "SBU_EW", "SBU_MILCOMM", "SBU_CYBER"
        uint64 registeredAt;  // Slot 3: timestamp
        uint64 updatedAt;     // Slot 3: timestamp
        uint8 clearanceLevel; // Slot 3: 1 to 4
        bool isActive;        // Slot 3: false = quarantined/revoked
    }

    mapping(address => IdentityRecord) public identities;
    mapping(string => address) public didToAddress;
    mapping(address => bool) public authorizedCallers;

    event IdentityCreated(address indexed user, string did, bytes32 indexed identityHash, uint8 clearanceLevel, bytes32 indexed sbuCode);
    event ClearanceUpdated(address indexed user, uint8 oldClearance, uint8 newClearance);
    event IdentityRevoked(address indexed user, string reason);

    modifier onlyAdmin() {
        require(msg.sender == admin, "IdentityRegistry: Caller is not admin");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == admin || authorizedCallers[msg.sender],
            "IdentityRegistry: Caller is not authorized"
        );
        _;
    }

    constructor(address _admin, address _auditLog) {
        admin = _admin != address(0) ? _admin : msg.sender;
        auditLog = IAuditLog(_auditLog);
        authorizedCallers[admin] = true;
        authorizedCallers[msg.sender] = true;
    }

    function setAuditLog(address _auditLog) external onlyAdmin {
        require(_auditLog != address(0), "IdentityRegistry: Invalid audit log address");
        auditLog = IAuditLog(_auditLog);
    }

    function setAuthorizedCaller(address caller, bool status) external onlyAdmin {
        require(caller != address(0), "IdentityRegistry: Invalid caller");
        authorizedCallers[caller] = status;
    }

    function _registerIdentity(
        address user,
        string memory did,
        bytes32 hash,
        uint8 clearance,
        bytes32 sbu
    ) internal {
        require(user != address(0), "IdentityRegistry: Invalid user address");
        require(bytes(did).length > 0, "IdentityRegistry: Empty DID");
        require(hash != bytes32(0), "IdentityRegistry: Empty identity hash");
        require(clearance >= 1 && clearance <= 4, "IdentityRegistry: Clearance must be between 1 and 4");
        require(!identities[user].isActive, "IdentityRegistry: Identity already registered");

        identities[user] = IdentityRecord({
            identityHash: hash,
            sbuCode: sbu,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            clearanceLevel: clearance,
            isActive: true
        });

        didToAddress[did] = user;

        emit IdentityCreated(user, did, hash, clearance, sbu);
    }

    /**
     * @notice Register a single employee DID and cryptographic identity hash
     */
    function registerIdentity(
        address user,
        string memory did,
        bytes32 hash,
        uint8 clearance,
        bytes32 sbu
    ) public onlyAuthorized {
        _registerIdentity(user, did, hash, clearance, sbu);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("DID_REG", msg.sender, user, hash, did) {} catch {}
        }
    }

    /**
     * @notice Batch register multiple employee identities (supports up to 250 records for bulk HRMS sync)
     */
    function batchRegisterIdentities(
        address[] calldata users,
        string[] calldata dids,
        bytes32[] calldata hashes,
        uint8[] calldata clearances,
        bytes32[] calldata sbus
    ) external onlyAuthorized {
        uint256 len = users.length;
        require(len > 0 && len <= 250, "IdentityRegistry: Batch size must be 1 to 250");
        require(
            dids.length == len && hashes.length == len && clearances.length == len && sbus.length == len,
            "IdentityRegistry: Array length mismatch"
        );

        for (uint256 i = 0; i < len; i++) {
            _registerIdentity(users[i], dids[i], hashes[i], clearances[i], sbus[i]);
        }

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("BATCH_DID_REG", msg.sender, address(0), bytes32(len), "Batch registered DIDs") {} catch {}
        }
    }

    /**
     * @notice Update clearance level of an existing identity
     */
    function updateClearance(address user, uint8 newClearance) external onlyAuthorized {
        require(identities[user].isActive, "IdentityRegistry: Identity not active");
        require(newClearance >= 1 && newClearance <= 4, "IdentityRegistry: Invalid clearance");

        uint8 oldClearance = identities[user].clearanceLevel;
        identities[user].clearanceLevel = newClearance;
        identities[user].updatedAt = uint64(block.timestamp);

        emit ClearanceUpdated(user, oldClearance, newClearance);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("CLEARANCE_UPDATE", msg.sender, user, bytes32(uint256(newClearance)), "Clearance level modified") {} catch {}
        }
    }

    /**
     * @notice Revoke or quarantine an identity
     */
    function revokeIdentity(address user, string memory reason) external onlyAuthorized {
        require(identities[user].isActive, "IdentityRegistry: Identity not active");

        identities[user].isActive = false;
        identities[user].updatedAt = uint64(block.timestamp);

        emit IdentityRevoked(user, reason);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("DID_REVOKE", msg.sender, user, bytes32(0), reason) {} catch {}
        }
    }

    /**
     * @notice Cryptographically verify if a given hash matches the on-chain stored identity
     */
    function verifyIdentity(address user, bytes32 testHash) external view returns (bool) {
        if (!identities[user].isActive) return false;
        return identities[user].identityHash == testHash;
    }

    function getIdentity(address user) external view returns (IdentityRecord memory) {
        return identities[user];
    }
}
