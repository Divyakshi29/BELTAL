// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AuditLog — Unified Append-Only Security Audit Stream
 * @notice Central audit stream contract for TrustChain (BELTAL) - SIH 26125 (MoD / BEL).
 *         All verified contracts (IdentityRegistry, AccessControl, AssetNFT) emit and anchor
 *         their state transitions into this single queryable log.
 */
contract AuditLog {
    address public admin;

    struct LogEntry {
        bytes32 eventType; // e.g. "DID_REG", "ACCESS_OK", "ACCESS_DENY", "ASSET_MINT", "ASSET_XFER", "LOCKDOWN"
        address actor;
        address target;
        bytes32 entityId;
        uint256 timestamp;
        string details;
    }

    LogEntry[] private logs;

    // Authorized verified contract callers
    mapping(address => bool) public isAuthorizedCaller;

    event SecurityAuditLog(
        bytes32 indexed eventType,
        address indexed actor,
        address indexed target,
        bytes32 entityId,
        uint256 timestamp,
        string details
    );

    event AuthorizedCallerUpdated(address indexed caller, bool status);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AuditLog: Caller is not admin");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == admin || isAuthorizedCaller[msg.sender],
            "AuditLog: Caller is not an authorized contract or admin"
        );
        _;
    }

    constructor(address _admin) {
        admin = _admin != address(0) ? _admin : msg.sender;
        isAuthorizedCaller[admin] = true;
        isAuthorizedCaller[msg.sender] = true;
    }

    function setAuthorizedCaller(address caller, bool status) external onlyAdmin {
        require(caller != address(0), "AuditLog: Invalid caller address");
        isAuthorizedCaller[caller] = status;
        emit AuthorizedCallerUpdated(caller, status);
    }

    /**
     * @notice Append a tamper-evident audit record to the log stream
     * @dev Restricted to authorized verified subsystem contracts
     */
    function logEvent(
        bytes32 eventType,
        address actor,
        address target,
        bytes32 entityId,
        string calldata details
    ) external onlyAuthorized returns (uint256) {
        uint256 logIndex = logs.length;

        logs.push(LogEntry({
            eventType: eventType,
            actor: actor,
            target: target,
            entityId: entityId,
            timestamp: block.timestamp,
            details: details
        }));

        emit SecurityAuditLog(
            eventType,
            actor,
            target,
            entityId,
            block.timestamp,
            details
        );

        return logIndex;
    }

    function getLogCount() external view returns (uint256) {
        return logs.length;
    }

    function getLog(uint256 index) external view returns (LogEntry memory) {
        require(index < logs.length, "AuditLog: Log index out of bounds");
        return logs[index];
    }
}
