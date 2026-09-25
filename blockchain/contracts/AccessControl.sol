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

/**
 * @title AccessControl — 5-Tier Role Hierarchy, PACS Facility Zones & Emergency Lockdown
 * @notice Governs authorization, role assignment, physical access control verification,
 *         and CISO lockdown protocols for Bharat Electronics Limited.
 */
contract AccessControl {
    bytes32 public constant ROLE_SUPER_ADMIN = keccak256("ROLE_SUPER_ADMIN");
    bytes32 public constant ROLE_SBU_MANAGER = keccak256("ROLE_SBU_MANAGER");
    bytes32 public constant ROLE_AUDITOR = keccak256("ROLE_AUDITOR");
    bytes32 public constant ROLE_EMPLOYEE = keccak256("ROLE_EMPLOYEE");
    bytes32 public constant ROLE_SYSTEM_CONNECTOR = keccak256("ROLE_SYSTEM_CONNECTOR");

    address public admin;
    IAuditLog public auditLog;
    IIdentityRegistry public identityRegistry;

    struct ZoneConfig {
        bytes32 zoneId;          // e.g., "ZONE_RADAR_TEST", "ZONE_ANECHOIC_CHAMBER"
        uint8 requiredClearance; // 1 to 4
        bytes32 allowedSBU;      // Specific SBU or "ALL"
        bool isLockedDown;       // Emergency freeze
        bool exists;
    }

    mapping(bytes32 => mapping(address => bool)) private _roles;
    mapping(bytes32 => ZoneConfig) public zones;
    mapping(address => mapping(bytes32 => uint256)) public tempPassExpiry;

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
    event ZoneConfigured(bytes32 indexed zoneId, uint8 requiredClearance, bytes32 allowedSBU);
    event EmergencyLockdownToggled(bytes32 indexed zoneId, bool isLockedDown, address indexed actor);
    event TemporaryPassGranted(address indexed user, bytes32 indexed zoneId, uint256 validUntil);

    modifier onlyAdmin() {
        require(
            msg.sender == admin || _roles[ROLE_SUPER_ADMIN][msg.sender],
            "AccessControl: Caller is not super admin"
        );
        _;
    }

    constructor(address _admin, address _auditLog, address _identityRegistry) {
        admin = _admin != address(0) ? _admin : msg.sender;
        auditLog = IAuditLog(_auditLog);
        identityRegistry = IIdentityRegistry(_identityRegistry);

        _roles[ROLE_SUPER_ADMIN][admin] = true;
        _roles[ROLE_SUPER_ADMIN][msg.sender] = true;
        _roles[ROLE_SYSTEM_CONNECTOR][admin] = true;
        _roles[ROLE_SYSTEM_CONNECTOR][msg.sender] = true;
    }

    function setAuditLog(address _auditLog) external onlyAdmin {
        require(_auditLog != address(0), "AccessControl: Invalid audit log address");
        auditLog = IAuditLog(_auditLog);
    }

    function setIdentityRegistry(address _identityRegistry) external onlyAdmin {
        require(_identityRegistry != address(0), "AccessControl: Invalid identity registry address");
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function grantRole(bytes32 role, address account) external onlyAdmin {
        require(account != address(0), "AccessControl: Invalid account");
        _roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("ROLE_GRANTED", msg.sender, account, role, "Role assigned") {} catch {}
        }
    }

    function revokeRole(bytes32 role, address account) external onlyAdmin {
        require(account != address(0), "AccessControl: Invalid account");
        _roles[role][account] = false;
        emit RoleRevoked(role, account, msg.sender);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("ROLE_REVOKED", msg.sender, account, role, "Role revoked") {} catch {}
        }
    }

    /**
     * @notice Register or update a physical facility zone
     */
    function createZone(
        bytes32 zoneId,
        uint8 clearance,
        bytes32 allowedSBU
    ) external onlyAdmin {
        require(clearance >= 1 && clearance <= 4, "AccessControl: Clearance must be 1 to 4");
        zones[zoneId] = ZoneConfig({
            zoneId: zoneId,
            requiredClearance: clearance,
            allowedSBU: allowedSBU,
            isLockedDown: false,
            exists: true
        });

        emit ZoneConfigured(zoneId, clearance, allowedSBU);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("ZONE_CONFIG", msg.sender, address(0), zoneId, "Zone created/updated") {} catch {}
        }
    }

    /**
     * @notice Grant a time-boxed cross-department temporary access pass
     */
    function grantTemporaryPass(
        address user,
        bytes32 zoneId,
        uint256 durationInSeconds
    ) external {
        require(
            msg.sender == admin || _roles[ROLE_SUPER_ADMIN][msg.sender] || _roles[ROLE_SBU_MANAGER][msg.sender],
            "AccessControl: Unauthorized pass issuer"
        );
        require(user != address(0), "AccessControl: Invalid user");
        require(zones[zoneId].exists, "AccessControl: Zone does not exist");

        uint256 expiry = block.timestamp + durationInSeconds;
        tempPassExpiry[user][zoneId] = expiry;

        emit TemporaryPassGranted(user, zoneId, expiry);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("TEMP_PASS_GRANT", msg.sender, user, zoneId, "Temporary pass granted") {} catch {}
        }
    }

    /**
     * @notice Emergency Lockdown switch for facility zones (CISO / SuperAdmin only)
     */
    function toggleEmergencyLockdown(bytes32 zoneId, bool status) external onlyAdmin {
        require(zones[zoneId].exists, "AccessControl: Zone does not exist");
        zones[zoneId].isLockedDown = status;

        emit EmergencyLockdownToggled(zoneId, status, msg.sender);

        if (address(auditLog) != address(0)) {
            try auditLog.logEvent("LOCKDOWN", msg.sender, address(0), zoneId, status ? "ZONE_LOCKED" : "ZONE_UNLOCKED") {} catch {}
        }
    }

    /**
     * @notice Evaluates in one call: (1) Clearance, (2) SBU match / Temp Pass, (3) Lockdown
     * @return allowed True if access is permitted
     * @return reason Human-readable explanation if denied
     */
    function canAccessZone(
        address user,
        bytes32 zoneId
    ) external view returns (bool allowed, string memory reason) {
        ZoneConfig memory zone = zones[zoneId];
        if (!zone.exists) {
            return (false, "Zone does not exist");
        }

        if (zone.isLockedDown) {
            return (false, "Zone is under emergency lockdown");
        }

        if (address(identityRegistry) == address(0)) {
            return (false, "Identity registry not configured");
        }

        IIdentityRegistry.IdentityRecord memory id = identityRegistry.getIdentity(user);
        if (!id.isActive) {
            return (false, "User identity is inactive or not registered");
        }

        if (id.clearanceLevel < zone.requiredClearance) {
            return (false, "Insufficient clearance level for zone");
        }

        bytes32 allSbu = bytes32("ALL");
        if (zone.allowedSBU != allSbu && zone.allowedSBU != bytes32(0)) {
            if (id.sbuCode != zone.allowedSBU) {
                // Check active temporary pass
                if (tempPassExpiry[user][zoneId] <= block.timestamp) {
                    return (false, "SBU mismatch and no active temporary pass");
                }
            }
        }

        return (true, "ACCESS_GRANTED");
    }
}
