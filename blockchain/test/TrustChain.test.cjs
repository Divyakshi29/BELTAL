const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('TrustChain (BELTAL) Smart Contract Security & Functional Test Suite (#90)', function () {
  let admin, manager, employee, unauthorizedUser, systemConnector;
  let auditLog, identityRegistry, accessControl, assetNFT;

  const SBU_RADAR = ethers.encodeBytes32String('SBU_RADAR');
  const SBU_EW = ethers.encodeBytes32String('SBU_EW');
  const SBU_MILCOMM = ethers.encodeBytes32String('SBU_MILCOMM');

  beforeEach(async function () {
    [admin, manager, employee, unauthorizedUser, systemConnector] = await ethers.getSigners();

    // 1. Deploy AuditLog.sol
    const AuditLog = await ethers.getContractFactory('AuditLog');
    auditLog = await AuditLog.deploy(admin.address);
    await auditLog.waitForDeployment();
    const auditLogAddress = await auditLog.getAddress();

    // 2. Deploy IdentityRegistry.sol
    const IdentityRegistry = await ethers.getContractFactory('IdentityRegistry');
    identityRegistry = await IdentityRegistry.deploy(admin.address, auditLogAddress);
    await identityRegistry.waitForDeployment();
    const identityRegistryAddress = await identityRegistry.getAddress();

    // 3. Deploy AccessControl.sol
    const AccessControl = await ethers.getContractFactory('AccessControl');
    accessControl = await AccessControl.deploy(admin.address, auditLogAddress, identityRegistryAddress);
    await accessControl.waitForDeployment();
    const accessControlAddress = await accessControl.getAddress();

    // 4. Deploy AssetNFT.sol
    const AssetNFT = await ethers.getContractFactory('AssetNFT');
    assetNFT = await AssetNFT.deploy(
      admin.address,
      auditLogAddress,
      identityRegistryAddress,
      accessControlAddress
    );
    await assetNFT.waitForDeployment();
    const assetNFTAddress = await assetNFT.getAddress();

    // 5. Wire cross-contract authorization allowlists
    await auditLog.setAuthorizedCaller(identityRegistryAddress, true);
    await auditLog.setAuthorizedCaller(accessControlAddress, true);
    await auditLog.setAuthorizedCaller(assetNFTAddress, true);

    await identityRegistry.setAuthorizedCaller(accessControlAddress, true);
    await identityRegistry.setAuthorizedCaller(assetNFTAddress, true);
    await identityRegistry.setAuthorizedCaller(systemConnector.address, true);

    await accessControl.grantRole(await accessControl.ROLE_SBU_MANAGER(), manager.address);
    await accessControl.grantRole(await accessControl.ROLE_SYSTEM_CONNECTOR(), systemConnector.address);

    await assetNFT.setAuthorizedManager(manager.address, true);
  });

  // =========================================================================
  // 1. Access Rules & Role Gating
  // =========================================================================
  describe('1. Access Rules & Role Gating', function () {
    it('AuditLog: non-admin cannot update authorized callers', async function () {
      await expect(
        auditLog.connect(unauthorizedUser).setAuthorizedCaller(unauthorizedUser.address, true)
      ).to.be.revertedWith('AuditLog: Caller is not admin');
    });

    it('IdentityRegistry: non-authorized caller cannot register identity', async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes('EMP-SECRET'));
      await expect(
        identityRegistry.connect(unauthorizedUser).registerIdentity(
          employee.address,
          'did:beltal:EMP001',
          hash,
          3,
          SBU_RADAR
        )
      ).to.be.revertedWith('IdentityRegistry: Caller is not authorized');
    });

    it('IdentityRegistry: ROLE_SYSTEM_CONNECTOR can register identity', async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes('EMP-SYSTEM-CONNECTOR'));
      await expect(
        identityRegistry.connect(systemConnector).registerIdentity(
          employee.address,
          'did:beltal:EMP002',
          hash,
          3,
          SBU_RADAR
        )
      ).to.emit(identityRegistry, 'IdentityCreated');
    });

    it('AccessControl: non-admin cannot create zones or toggle lockdown', async function () {
      const zoneId = ethers.encodeBytes32String('ZONE_SECRET_LAB');
      await expect(
        accessControl.connect(unauthorizedUser).createZone(zoneId, 3, SBU_RADAR)
      ).to.be.revertedWith('AccessControl: Caller is not super admin');

      await expect(
        accessControl.connect(unauthorizedUser).toggleEmergencyLockdown(zoneId, true)
      ).to.be.revertedWith('AccessControl: Caller is not super admin');
    });

    it('AssetNFT: non-manager cannot mint assets or transfer custody', async function () {
      await expect(
        assetNFT.connect(unauthorizedUser).mintAsset(
          employee.address,
          'BEL-RADAR-01',
          2,
          SBU_RADAR,
          'ipfs://QmTest'
        )
      ).to.be.revertedWith('AssetNFT: Caller is not authorized manager');
    });
  });

  // =========================================================================
  // 2. Clearance & SBU Gating
  // =========================================================================
  describe('2. Clearance & SBU Gating', function () {
    beforeEach(async function () {
      // Register employee with Level 2 clearance in SBU_RADAR
      const hash = ethers.keccak256(ethers.toUtf8Bytes('EMP-CLEARANCE-2'));
      await identityRegistry.registerIdentity(
        employee.address,
        'did:beltal:EMP-L2',
        hash,
        2, // Level 2
        SBU_RADAR
      );
    });

    it('AssetNFT: mintAsset reverts if custodian clearance < classification tier', async function () {
      // Attempting to assign Tier 3 asset to Level 2 employee
      await expect(
        assetNFT.connect(manager).mintAsset(
          employee.address,
          'BEL-TOPSECRET-TAC',
          3, // Requires Tier 3
          SBU_RADAR,
          'ipfs://QmTopSecret'
        )
      ).to.be.revertedWith('AssetNFT: Recipient clearance insufficient for asset classification');
    });

    it('AssetNFT: mintAsset succeeds when custodian clearance >= classification tier', async function () {
      // Assigning Tier 2 asset to Level 2 employee
      await expect(
        assetNFT.connect(manager).mintAsset(
          employee.address,
          'BEL-CONFIDENTIAL-TAC',
          2, // Requires Tier 2
          SBU_RADAR,
          'ipfs://QmConfidential'
        )
      ).to.emit(assetNFT, 'AssetMinted');
    });

    it('AssetNFT: transferCustody reverts if new custodian clearance < classification tier', async function () {
      // Mint Tier 2 asset to employee (L2)
      const tx = await assetNFT.connect(manager).mintAsset(
        employee.address,
        'BEL-RADIO-L2',
        2,
        SBU_RADAR,
        'ipfs://QmRadio'
      );
      const receipt = await tx.wait();
      const tokenId = 1001;

      // Register new user with Level 1 clearance
      const lowClearanceUser = unauthorizedUser.address;
      await identityRegistry.registerIdentity(
        lowClearanceUser,
        'did:beltal:EMP-L1',
        ethers.keccak256(ethers.toUtf8Bytes('L1')),
        1,
        SBU_RADAR
      );

      // Attempt transfer to Level 1 user
      await expect(
        assetNFT.connect(manager).reassignCustody(tokenId, lowClearanceUser, 'HANDOVER')
      ).to.be.revertedWith('AssetNFT: Recipient clearance insufficient for asset classification');
    });

    it('AccessControl: canAccessZone correctly evaluates clearance and SBU', async function () {
      const radarZone = ethers.encodeBytes32String('ZONE_RADAR_TEST');
      const ewZone = ethers.encodeBytes32String('ZONE_EW_LAB');

      // Create Zone 1: Requires Level 2, SBU_RADAR
      await accessControl.createZone(radarZone, 2, SBU_RADAR);
      // Create Zone 2: Requires Level 2, SBU_EW
      await accessControl.createZone(ewZone, 2, SBU_EW);

      // Employee is Level 2, SBU_RADAR -> Should be granted access to radarZone
      const [allowedRadar, reasonRadar] = await accessControl.canAccessZone(employee.address, radarZone);
      expect(allowedRadar).to.be.true;
      expect(reasonRadar).to.equal('ACCESS_GRANTED');

      // Employee belongs to SBU_RADAR -> SBU mismatch for ewZone
      const [allowedEw, reasonEw] = await accessControl.canAccessZone(employee.address, ewZone);
      expect(allowedEw).to.be.false;
      expect(reasonEw).to.equal('SBU mismatch and no active temporary pass');

      // Grant temporary pass for ewZone for 3600 seconds
      await accessControl.grantTemporaryPass(employee.address, ewZone, 3600);

      // Now access to ewZone should be granted
      const [allowedAfterPass, reasonAfterPass] = await accessControl.canAccessZone(employee.address, ewZone);
      expect(allowedAfterPass).to.be.true;
      expect(reasonAfterPass).to.equal('ACCESS_GRANTED');
    });
  });

  // =========================================================================
  // 3. Emergency Lockdown
  // =========================================================================
  describe('3. Emergency Lockdown', function () {
    const lockZone = ethers.encodeBytes32String('ZONE_ANECHOIC_CHAMBER');

    beforeEach(async function () {
      // Register High-Clearance employee
      await identityRegistry.registerIdentity(
        employee.address,
        'did:beltal:CHIEF-01',
        ethers.keccak256(ethers.toUtf8Bytes('CHIEF')),
        4, // Level 4 (Top Secret)
        SBU_RADAR
      );

      await accessControl.createZone(lockZone, 3, SBU_RADAR);
    });

    it('canAccessZone immediately returns false for locked-down zone regardless of clearance', async function () {
      // Verify initial access allowed
      const [initAllowed] = await accessControl.canAccessZone(employee.address, lockZone);
      expect(initAllowed).to.be.true;

      // CISO engages Emergency Lockdown
      await accessControl.toggleEmergencyLockdown(lockZone, true);

      // Verify immediate block
      const [lockedAllowed, lockedReason] = await accessControl.canAccessZone(employee.address, lockZone);
      expect(lockedAllowed).to.be.false;
      expect(lockedReason).to.equal('Zone is under emergency lockdown');

      // CISO disengages Emergency Lockdown
      await accessControl.toggleEmergencyLockdown(lockZone, false);

      // Verify access restored
      const [restoredAllowed] = await accessControl.canAccessZone(employee.address, lockZone);
      expect(restoredAllowed).to.be.true;
    });
  });

  // =========================================================================
  // 4. Soulbound Restrictions
  // =========================================================================
  describe('4. Soulbound Restrictions (Non-Transferable Token Guarantee)', function () {
    let tokenId;

    beforeEach(async function () {
      await identityRegistry.registerIdentity(
        employee.address,
        'did:beltal:EMP-HOLDER',
        ethers.keccak256(ethers.toUtf8Bytes('HOLDER')),
        3,
        SBU_RADAR
      );

      const tx = await assetNFT.connect(manager).mintAsset(
        employee.address,
        'BEL-HARDWARE-DEFENCE',
        3,
        SBU_RADAR,
        'ipfs://QmSoulbound'
      );
      await tx.wait();
      tokenId = 1001;
    });

    it('transferFrom reverts with Soulbound error message', async function () {
      await expect(
        assetNFT.connect(employee).transferFrom(employee.address, unauthorizedUser.address, tokenId)
      ).to.be.revertedWith('AssetNFT: SOULBOUND token. Standard transfers disabled; use reassignCustody.');
    });

    it('safeTransferFrom (both overloads) revert with Soulbound error message', async function () {
      await expect(
        assetNFT.connect(employee)['safeTransferFrom(address,address,uint256)'](
          employee.address,
          unauthorizedUser.address,
          tokenId
        )
      ).to.be.revertedWith('AssetNFT: SOULBOUND token. Standard transfers disabled; use reassignCustody.');

      await expect(
        assetNFT.connect(employee)['safeTransferFrom(address,address,uint256,bytes)'](
          employee.address,
          unauthorizedUser.address,
          tokenId,
          '0x'
        )
      ).to.be.revertedWith('AssetNFT: SOULBOUND token. Standard transfers disabled; use reassignCustody.');
    });

    it('approve and setApprovalForAll revert on soulbound assets', async function () {
      await expect(
        assetNFT.connect(employee).approve(unauthorizedUser.address, tokenId)
      ).to.be.revertedWith('AssetNFT: Approvals disabled on soulbound assets.');

      await expect(
        assetNFT.connect(employee).setApprovalForAll(unauthorizedUser.address, true)
      ).to.be.revertedWith('AssetNFT: Approvals disabled on soulbound assets.');
    });
  });

  // =========================================================================
  // 5. Tamper Resistance & Hash Verification
  // =========================================================================
  describe('5. Tamper Resistance & Hash Verification', function () {
    const validHash = ethers.keccak256(ethers.toUtf8Bytes('EMP-101-LEGIT'));
    const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes('EMP-101-TAMPERED'));

    beforeEach(async function () {
      await identityRegistry.registerIdentity(
        employee.address,
        'did:beltal:EMP101',
        validHash,
        3,
        SBU_RADAR
      );
    });

    it('verifyIdentity returns true for matching hash and false for tampered hash', async function () {
      expect(await identityRegistry.verifyIdentity(employee.address, validHash)).to.be.true;
      expect(await identityRegistry.verifyIdentity(employee.address, tamperedHash)).to.be.false;
    });

    it('verifyIdentity returns false for unregistered address', async function () {
      expect(await identityRegistry.verifyIdentity(unauthorizedUser.address, validHash)).to.be.false;
    });

    it('revokeIdentity deactivates identity and causes verifyIdentity to return false', async function () {
      await identityRegistry.revokeIdentity(employee.address, 'Security quarantine revocation');
      expect(await identityRegistry.verifyIdentity(employee.address, validHash)).to.be.false;
    });
  });

  // =========================================================================
  // 6. Batch Registration Edge Cases (250 Cap)
  // =========================================================================
  describe('6. Batch Registration Edge Cases (250 Cap)', function () {
    it('Succeeds with batch entries (e.g. 100 entries) in a single transaction', async function () {
      const count = 100;
      const users = [];
      const dids = [];
      const hashes = [];
      const clearances = [];
      const sbus = [];

      for (let i = 0; i < count; i++) {
        const dummyWallet = ethers.getAddress(
          `0x${(BigInt('0x1000000000000000000000000000000000000000') + BigInt(i + 1)).toString(16).padStart(40, '0')}`
        );
        users.push(dummyWallet);
        dids.push(`did:beltal:BATCH-${i}`);
        hashes.push(ethers.keccak256(ethers.toUtf8Bytes(`HASH-${i}`)));
        clearances.push(2);
        sbus.push(SBU_RADAR);
      }

      const tx = await identityRegistry.batchRegisterIdentities(users, dids, hashes, clearances, sbus);
      await tx.wait();

      // Verify the 100th user is registered and valid
      expect(await identityRegistry.verifyIdentity(users[99], hashes[99])).to.be.true;
    });

    it('Reverts when batch size exceeds 250 (e.g. 251 entries)', async function () {
      const count = 251;
      const users = [];
      const dids = [];
      const hashes = [];
      const clearances = [];
      const sbus = [];

      for (let i = 0; i < count; i++) {
        const dummyWallet = ethers.getAddress(
          `0x${(BigInt('0x2000000000000000000000000000000000000000') + BigInt(i + 1)).toString(16).padStart(40, '0')}`
        );
        users.push(dummyWallet);
        dids.push(`did:beltal:OVER-${i}`);
        hashes.push(ethers.keccak256(ethers.toUtf8Bytes(`OVER-${i}`)));
        clearances.push(2);
        sbus.push(SBU_RADAR);
      }

      await expect(
        identityRegistry.batchRegisterIdentities(users, dids, hashes, clearances, sbus)
      ).to.be.revertedWith('IdentityRegistry: Batch size must be 1 to 250');
    });

    it('Reverts when batch array lengths do not match', async function () {
      const users = [unauthorizedUser.address];
      const dids = ['did:beltal:DUMMY'];
      const hashes = [ethers.keccak256(ethers.toUtf8Bytes('DUMMY'))];
      const clearances = [2];
      const sbus = []; // Mismatched empty array

      await expect(
        identityRegistry.batchRegisterIdentities(users, dids, hashes, clearances, sbus)
      ).to.be.revertedWith('IdentityRegistry: Array length mismatch');
    });
  });

  // =========================================================================
  // 7. Audit Log Restrictions & Event Anchoring
  // =========================================================================
  describe('7. Audit Log Restrictions & Event Anchoring', function () {
    it('AuditLog: logEvent reverts when called from unauthorized EOA', async function () {
      const eventType = ethers.encodeBytes32String('TEST_EVENT');
      await expect(
        auditLog.connect(unauthorizedUser).logEvent(
          eventType,
          unauthorizedUser.address,
          employee.address,
          ethers.ZeroHash,
          'Unauthorized log injection attempt'
        )
      ).to.be.revertedWith('AuditLog: Caller is not an authorized contract or admin');
    });

    it('AuditLog: logEvent succeeds when called by authorized contract and emits SecurityAuditLog', async function () {
      const countBefore = await auditLog.getLogCount();

      // Trigger a state change in IdentityRegistry (which is an authorized caller)
      const hash = ethers.keccak256(ethers.toUtf8Bytes('AUDIT-TEST-USER'));
      await identityRegistry.registerIdentity(
        employee.address,
        'did:beltal:AUDIT01',
        hash,
        3,
        SBU_RADAR
      );

      const countAfter = await auditLog.getLogCount();
      expect(countAfter).to.be.greaterThan(countBefore);

      const latestLog = await auditLog.getLog(countAfter - 1n);
      expect(latestLog.actor).to.equal(admin.address);
      expect(latestLog.target).to.equal(employee.address);
      expect(latestLog.details).to.equal('did:beltal:AUDIT01');
    });
  }); // end Section 7

  // =========================================================================
  // 8. Active-Identity + Clearance Gate (Issue #98)
  //    Verifies that unregistered wallets, revoked identities, and wallets
  //    with insufficient clearance all revert for both mintAsset and
  //    transferCustody. Closes the bypass where `if (id.isActive)` was
  //    skipped for zero-struct returns from getIdentity().
  // =========================================================================
  describe('8. Active-Identity + Clearance Gate (Issue #98)', function () {
    // A Tier-3 asset is used for all tests in this section
    const TIER = 3;
    const ASSET_TAG = 'BEL-RADAR-GATE-TEST';
    const TOKEN_URI = 'ipfs://QmGateTest';
    let tokenId;

    beforeEach(async function () {
      // Register a valid Level-3 holder so we can mint a Tier-3 asset for transfer tests
      await identityRegistry.registerIdentity(
        employee.address,
        'did:beltal:GATE-HOLDER',
        ethers.keccak256(ethers.toUtf8Bytes('GATE-HOLDER')),
        TIER,
        SBU_RADAR
      );
      const tx = await assetNFT.connect(manager).mintAsset(
        employee.address,
        ASSET_TAG,
        TIER,
        SBU_RADAR,
        TOKEN_URI
      );
      await tx.wait();
      tokenId = 1001;
    });

    // -----------------------------------------------------------------------
    // 8.1  mintAsset — revert cases
    // -----------------------------------------------------------------------
    it('mintAsset: reverts for unregistered wallet (no identity record)', async function () {
      // systemConnector.address has no identity registered in this suite
      await expect(
        assetNFT.connect(manager).mintAsset(
          systemConnector.address,
          'BEL-UNREG',
          TIER,
          SBU_RADAR,
          'ipfs://QmUnreg'
        )
      ).to.be.revertedWith('AssetNFT: Recipient has no active identity');
    });

    it('mintAsset: reverts for revoked identity', async function () {
      // Register then revoke unauthorizedUser
      await identityRegistry.registerIdentity(
        unauthorizedUser.address,
        'did:beltal:REVOKED-MINT',
        ethers.keccak256(ethers.toUtf8Bytes('REVOKED-MINT')),
        TIER,
        SBU_RADAR
      );
      await identityRegistry.revokeIdentity(unauthorizedUser.address, 'Security quarantine');

      await expect(
        assetNFT.connect(manager).mintAsset(
          unauthorizedUser.address,
          'BEL-REVOKED',
          TIER,
          SBU_RADAR,
          'ipfs://QmRevoked'
        )
      ).to.be.revertedWith('AssetNFT: Recipient has no active identity');
    });

    it('mintAsset: reverts for active identity with insufficient clearance', async function () {
      // Register unauthorizedUser with Level 1 (below TIER 3 required)
      await identityRegistry.registerIdentity(
        unauthorizedUser.address,
        'did:beltal:LOW-MINT',
        ethers.keccak256(ethers.toUtf8Bytes('LOW-MINT')),
        1, // Level 1 — insufficient for Tier 3
        SBU_RADAR
      );

      await expect(
        assetNFT.connect(manager).mintAsset(
          unauthorizedUser.address,
          'BEL-LOWCLEAR',
          TIER,
          SBU_RADAR,
          'ipfs://QmLowClear'
        )
      ).to.be.revertedWith('AssetNFT: Recipient clearance insufficient for asset classification');
    });

    // -----------------------------------------------------------------------
    // 8.2  transferCustody — revert cases
    // -----------------------------------------------------------------------
    it('transferCustody: reverts for unregistered wallet (no identity record)', async function () {
      // systemConnector.address has no identity registered in this suite.
      // Uses reassignCustody (admin bypass) — the clearance gate runs in _executeCustodyTransfer
      // and reverts before any signature check.
      await expect(
        assetNFT.connect(manager).reassignCustody(
          tokenId,
          systemConnector.address,
          'HANDOVER-UNREG'
        )
      ).to.be.revertedWith('AssetNFT: Recipient has no active identity');
    });

    it('transferCustody: reverts for revoked identity', async function () {
      await identityRegistry.registerIdentity(
        unauthorizedUser.address,
        'did:beltal:REVOKED-XFER',
        ethers.keccak256(ethers.toUtf8Bytes('REVOKED-XFER')),
        TIER,
        SBU_RADAR
      );
      await identityRegistry.revokeIdentity(unauthorizedUser.address, 'Revoked before transfer');

      await expect(
        assetNFT.connect(manager).reassignCustody(
          tokenId,
          unauthorizedUser.address,
          'HANDOVER-REVOKED'
        )
      ).to.be.revertedWith('AssetNFT: Recipient has no active identity');
    });

    it('transferCustody: reverts for active identity with insufficient clearance', async function () {
      await identityRegistry.registerIdentity(
        unauthorizedUser.address,
        'did:beltal:LOW-XFER',
        ethers.keccak256(ethers.toUtf8Bytes('LOW-XFER')),
        1, // Level 1 — insufficient for Tier 3
        SBU_RADAR
      );

      await expect(
        assetNFT.connect(manager).reassignCustody(
          tokenId,
          unauthorizedUser.address,
          'HANDOVER-LOWCLEAR'
        )
      ).to.be.revertedWith('AssetNFT: Recipient clearance insufficient for asset classification');
    });

    // -----------------------------------------------------------------------
    // 8.3  Success paths
    // -----------------------------------------------------------------------
    it('mintAsset: succeeds for active identity with exact clearance match (clearance == tier)', async function () {
      // unauthorizedUser gets exactly Level 3
      await identityRegistry.registerIdentity(
        unauthorizedUser.address,
        'did:beltal:EXACT-MINT',
        ethers.keccak256(ethers.toUtf8Bytes('EXACT-MINT')),
        TIER,
        SBU_RADAR
      );

      await expect(
        assetNFT.connect(manager).mintAsset(
          unauthorizedUser.address,
          'BEL-EXACT-L3',
          TIER,
          SBU_RADAR,
          'ipfs://QmExact'
        )
      ).to.emit(assetNFT, 'AssetMinted');
    });

    it('transferCustody: succeeds for active identity with sufficient clearance', async function () {
      // Register a Level-3 recipient
      await identityRegistry.registerIdentity(
        unauthorizedUser.address,
        'did:beltal:VALID-XFER',
        ethers.keccak256(ethers.toUtf8Bytes('VALID-XFER')),
        TIER,
        SBU_RADAR
      );

      // Use the admin-bypass path (no EIP-712 sig required) — verifies that
      // clearance gates still allow a valid transfer to proceed.
      const tx = await assetNFT.connect(manager).reassignCustody(
        tokenId,
        unauthorizedUser.address,
        'HANDOVER-VALID'
      );

      // Verify the event fired
      await expect(tx).to.emit(assetNFT, 'CustodyReassigned');

      // Also verify on-chain custodian state was updated
      expect(await assetNFT.getCustodian(tokenId)).to.equal(unauthorizedUser.address);
    });
  });

  // =========================================================================
  // 9. EIP-712 Custody Transfer Signature Verification (Issue #100)
  //    Verifies that transferCustody enforces on-chain EIP-712 typed-data
  //    signature recovery — only the current custodian's valid, unexpired,
  //    non-replayed signature is accepted.
  // =========================================================================
  describe('9. EIP-712 Custody Transfer Signature Verification (Issue #100)', function () {
    const TIER = 3;
    const ASSET_TAG = 'BEL-EIP712-TEST';
    const TOKEN_URI = 'ipfs://QmEip712Test';
    let tokenId;
    let assetNFTAddress;
    let chainId;

    // Helper: build the EIP-712 domain object for ethers.js signTypedData
    function buildDomain(contractAddress, cId) {
      return {
        name: 'TrustChain BEL Defence Asset',
        version: '1',
        chainId: cId,
        verifyingContract: contractAddress,
      };
    }

    // Helper: CustodyTransfer EIP-712 types
    const custodyTransferTypes = {
      CustodyTransfer: [
        { name: 'tokenId',  type: 'uint256' },
        { name: 'from',     type: 'address' },
        { name: 'to',       type: 'address' },
        { name: 'nonce',    type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    // Helper: sign a CustodyTransfer struct with ethers v6 signTypedData
    async function signCustodyTransfer(signer, contractAddress, cId, params) {
      const { tokenId: tid, from, to, nonce, deadline } = params;
      return signer.signTypedData(
        buildDomain(contractAddress, cId),
        custodyTransferTypes,
        { tokenId: tid, from, to, nonce, deadline }
      );
    }

    beforeEach(async function () {
      // Register employee (Level 3) — initial custodian
      await identityRegistry.registerIdentity(
        employee.address,
        'did:beltal:EIP712-HOLDER',
        ethers.keccak256(ethers.toUtf8Bytes('EIP712-HOLDER')),
        TIER,
        SBU_RADAR
      );

      // Mint a Tier-3 asset to employee
      const tx = await assetNFT.connect(manager).mintAsset(
        employee.address,
        ASSET_TAG,
        TIER,
        SBU_RADAR,
        TOKEN_URI
      );
      await tx.wait();
      tokenId = 1001;

      assetNFTAddress = await assetNFT.getAddress();
      const network = await ethers.provider.getNetwork();
      chainId = network.chainId;

      // Register unauthorizedUser as a valid Level-3 recipient for transfer tests
      await identityRegistry.registerIdentity(
        unauthorizedUser.address,
        'did:beltal:EIP712-RECIPIENT',
        ethers.keccak256(ethers.toUtf8Bytes('EIP712-RECIPIENT')),
        TIER,
        SBU_RADAR
      );
    });

    // -----------------------------------------------------------------------
    // 9.1  Valid signature — happy path
    // -----------------------------------------------------------------------
    it('transferCustody: succeeds with a valid EIP-712 signature from the current custodian', async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const nonce = await assetNFT.custodyNonces(tokenId);

      const sig = await signCustodyTransfer(employee, assetNFTAddress, chainId, {
        tokenId,
        from: employee.address,
        to: unauthorizedUser.address,
        nonce,
        deadline,
      });

      const receipt = await assetNFT.connect(manager).transferCustody(
        tokenId,
        unauthorizedUser.address,
        'EIP712_VERIFIED_HANDOVER',
        deadline,
        sig
      );

      // Verify the event fired (don't assert the exact block.timestamp value)
      await expect(receipt).to.emit(assetNFT, 'CustodyReassigned');

      // Custodian updated on-chain
      expect(await assetNFT.getCustodian(tokenId)).to.equal(unauthorizedUser.address);
      // Nonce incremented
      expect(await assetNFT.custodyNonces(tokenId)).to.equal(Number(nonce) + 1);
    });

    // -----------------------------------------------------------------------
    // 9.2  Wrong signer — signature not from current custodian
    // -----------------------------------------------------------------------
    it('transferCustody: reverts when signature is from a non-custodian address', async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await assetNFT.custodyNonces(tokenId);

      // manager signs instead of employee (the actual custodian)
      const wrongSig = await signCustodyTransfer(manager, assetNFTAddress, chainId, {
        tokenId,
        from: employee.address,
        to: unauthorizedUser.address,
        nonce,
        deadline,
      });

      await expect(
        assetNFT.connect(manager).transferCustody(
          tokenId,
          unauthorizedUser.address,
          'WRONG_SIGNER_HANDOVER',
          deadline,
          wrongSig
        )
      ).to.be.revertedWith('AssetNFT: Signature not from current custodian');
    });

    // -----------------------------------------------------------------------
    // 9.3  Replayed signature — nonce already consumed
    // -----------------------------------------------------------------------
    it('transferCustody: reverts on replay of a previously used signature', async function () {
      const deadline = Math.floor(Date.now() / 1000) + 7200;
      const nonce = await assetNFT.custodyNonces(tokenId);

      const sig = await signCustodyTransfer(employee, assetNFTAddress, chainId, {
        tokenId,
        from: employee.address,
        to: unauthorizedUser.address,
        nonce,
        deadline,
      });

      // First use — succeeds
      await assetNFT.connect(manager).transferCustody(
        tokenId,
        unauthorizedUser.address,
        'FIRST_USE',
        deadline,
        sig
      );

      // Register employee as a new valid recipient (custody returned) for a second transfer
      // But instead, let's prove a second call with the same sig fails (nonce consumed)
      // The custodian is now unauthorizedUser — employee's old sig refers to stale nonce
      await identityRegistry.registerIdentity(
        manager.address,
        'did:beltal:MANAGER-RECIPIENT',
        ethers.keccak256(ethers.toUtf8Bytes('MANAGER-RECIPIENT')),
        TIER,
        SBU_RADAR
      );

      // Replay the same signature (nonce is now stale)
      await expect(
        assetNFT.connect(manager).transferCustody(
          tokenId,
          manager.address,
          'REPLAY_ATTEMPT',
          deadline,
          sig
        )
      ).to.be.revertedWith('AssetNFT: Signature not from current custodian');
    });

    // -----------------------------------------------------------------------
    // 9.4  Expired deadline
    // -----------------------------------------------------------------------
    it('transferCustody: reverts when deadline has passed', async function () {
      const nonce = await assetNFT.custodyNonces(tokenId);
      // deadline = 1 second in the past
      const expiredDeadline = Math.floor(Date.now() / 1000) - 1;

      const sig = await signCustodyTransfer(employee, assetNFTAddress, chainId, {
        tokenId,
        from: employee.address,
        to: unauthorizedUser.address,
        nonce,
        deadline: expiredDeadline,
      });

      await expect(
        assetNFT.connect(manager).transferCustody(
          tokenId,
          unauthorizedUser.address,
          'EXPIRED_DEADLINE',
          expiredDeadline,
          sig
        )
      ).to.be.revertedWith('AssetNFT: Signature deadline expired');
    });

    // -----------------------------------------------------------------------
    // 9.5  Issue #98 gates still hold after EIP-712 check
    // -----------------------------------------------------------------------
    it('transferCustody: clearance gate still reverts even with a valid EIP-712 signature', async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await assetNFT.custodyNonces(tokenId);

      // Register a LOW clearance recipient
      await identityRegistry.registerIdentity(
        systemConnector.address,
        'did:beltal:LOW-CLEAR-RECIPIENT',
        ethers.keccak256(ethers.toUtf8Bytes('LOW-CLEAR-RECIPIENT')),
        1, // Level 1 — insufficient for Tier 3
        SBU_RADAR
      );

      // Employee (current custodian) signs for this low-clearance recipient
      const sig = await signCustodyTransfer(employee, assetNFTAddress, chainId, {
        tokenId,
        from: employee.address,
        to: systemConnector.address,
        nonce,
        deadline,
      });

      await expect(
        assetNFT.connect(manager).transferCustody(
          tokenId,
          systemConnector.address,
          'LOW_CLEARANCE_EIP712',
          deadline,
          sig
        )
      ).to.be.revertedWith('AssetNFT: Recipient clearance insufficient for asset classification');
    });

    // -----------------------------------------------------------------------
    // 9.6  reassignCustody admin bypass — no signature required
    // -----------------------------------------------------------------------
    it('reassignCustody: admin bypass succeeds without a signature (empty sig in history)', async function () {
      await expect(
        assetNFT.connect(manager).reassignCustody(
          tokenId,
          unauthorizedUser.address,
          'EMERGENCY_ADMIN_BYPASS'
        )
      ).to.emit(assetNFT, 'CustodyReassigned');

      expect(await assetNFT.getCustodian(tokenId)).to.equal(unauthorizedUser.address);

      // Verify the CustodyRecord has an empty signature (admin bypass marker)
      const history = await assetNFT.getCustodyHistory(tokenId);
      const lastRecord = history[history.length - 1];
      expect(lastRecord.signature).to.equal('0x');

      // Nonce is NOT incremented by the bypass path
      expect(await assetNFT.custodyNonces(tokenId)).to.equal(0n);
    });
  });
});
