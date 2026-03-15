// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title SafeGuard Incident Registry
/// @notice Immutable on-chain log of women's safety incidents — no PII stored
contract SafeGuardRegistry {

    enum IncidentType { SOS, REPORT, CIRCLE_ALERT }

    struct Incident {
        bytes32      incidentHash;
        IncidentType itype;
        string       area;
        uint8        severity;
        uint256      timestamp;
        address      loggedBy;
        bool         resolved;
    }

    address public owner;
    uint256 public totalIncidents;
    uint256 public totalResolved;

    mapping(bytes32 => Incident)    public incidents;
    mapping(string  => bytes32[])   public incidentsByArea;
    bytes32[]                       public allIncidents;

    event IncidentLogged(
        bytes32 indexed incidentHash,
        uint8           itype,
        string          area,
        uint8           severity,
        uint256         timestamp
    );
    event IncidentResolved(bytes32 indexed incidentHash, uint256 resolvedAt);
    event PatternDetected(string area, uint256 count, uint256 detectedAt);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorised");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function logIncident(
        bytes32      incidentHash,
        IncidentType itype,
        string memory area,
        uint8         severity
    ) external returns (bool) {
        require(incidents[incidentHash].timestamp == 0, "Already logged");
        require(severity >= 1 && severity <= 5,         "Bad severity");
        require(bytes(area).length > 0,                 "Area required");

        incidents[incidentHash] = Incident({
            incidentHash: incidentHash,
            itype:        itype,
            area:         area,
            severity:     severity,
            timestamp:    block.timestamp,
            loggedBy:     msg.sender,
            resolved:     false
        });

        incidentsByArea[area].push(incidentHash);
        allIncidents.push(incidentHash);
        totalIncidents++;

        emit IncidentLogged(incidentHash, uint8(itype), area, severity, block.timestamp);

        if (incidentsByArea[area].length >= 3) {
            emit PatternDetected(area, incidentsByArea[area].length, block.timestamp);
        }

        return true;
    }

    function resolveIncident(bytes32 incidentHash) external returns (bool) {
        require(incidents[incidentHash].timestamp > 0, "Not found");
        require(!incidents[incidentHash].resolved,     "Already resolved");

        incidents[incidentHash].resolved = true;
        totalResolved++;

        emit IncidentResolved(incidentHash, block.timestamp);
        return true;
    }

    function getAreaCount(string memory area) external view returns (uint256) {
        return incidentsByArea[area].length;
    }

    function isLogged(bytes32 incidentHash) external view returns (bool) {
        return incidents[incidentHash].timestamp > 0;
    }

    function getStats() external view returns (uint256 total, uint256 resolved, uint256 active) {
        return (totalIncidents, totalResolved, totalIncidents - totalResolved);
    }

    function getRecentIncidents(uint256 n) external view returns (bytes32[] memory) {
        uint256 len   = allIncidents.length;
        uint256 count = n > len ? len : n;
        bytes32[] memory result = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = allIncidents[len - count + i];
        }
        return result;
    }
}
