// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TipJar} from "../src/TipJar.sol";

contract MaliciousRecipient {
    TipJar public tipJar;
    uint256 public targetTipId;
    bytes public cachedSig;
    uint256 public cachedDeadline;
    bool public entered;

    constructor(address _tipJar) {
        tipJar = TipJar(_tipJar);
    }

    function setClaimData(uint256 tipId, uint256 deadline, bytes calldata sig) external {
        targetTipId = tipId;
        cachedDeadline = deadline;
        cachedSig = sig;
        entered = false;
    }

    receive() external payable {
        if (!entered) {
            entered = true;
            // Attempt reentrancy - hits nonReentrant modifier
            tipJar.claim(targetTipId, address(this), cachedDeadline, cachedSig);
        }
    }
}

contract MaliciousSender {
    TipJar public tipJar;
    uint256 public targetTipId;
    bool public entered;

    constructor(address _tipJar) {
        tipJar = TipJar(_tipJar);
    }

    function setTipId(uint256 tipId) external {
        targetTipId = tipId;
        entered = false;
    }

    function createTip(bytes32 handleHash) external payable returns (uint256) {
        return tipJar.createTip{value: msg.value}(handleHash);
    }

    receive() external payable {
        if (!entered) {
            entered = true;
            // Attempt reentrancy - hits nonReentrant modifier
            tipJar.refund(targetTipId);
        }
    }
}

contract TipJarTest is Test {
    TipJar public tipJar;

    uint256 internal signerPrivateKey = 0xA11CE;
    address internal claimSigner;

    uint256 internal roguePrivateKey = 0xB0B;
    address internal rogueSigner;

    address internal owner = address(this);
    address internal alice = address(0x1111);
    address internal bob = address(0x2222);

    bytes32 internal aliceHandleHash = keccak256("alice_salted");
    bytes32 internal bobHandleHash = keccak256("bob_salted");

    event TipCreated(
        uint256 indexed tipId,
        address indexed sender,
        bytes32 indexed handleHash,
        uint256 amount,
        uint256 expiresAt
    );
    event TipClaimed(
        uint256 indexed tipId,
        address indexed recipient,
        uint256 amount
    );
    event TipRefunded(
        uint256 indexed tipId,
        address indexed sender,
        uint256 amount
    );
    event ClaimSignerUpdated(
        address indexed oldSigner,
        address indexed newSigner
    );

    function setUp() public {
        claimSigner = vm.addr(signerPrivateKey);
        rogueSigner = vm.addr(roguePrivateKey);

        tipJar = new TipJar(claimSigner);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // Helper: construct and sign an EIP-712 voucher
    function _signVoucher(
        uint256 privateKey,
        uint256 tipId,
        address recipient,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(tipJar.TIP_CLAIM_TYPEHASH(), tipId, recipient, deadline)
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("TipJar")),
                keccak256(bytes("1")),
                block.chainid,
                address(tipJar)
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ==================== CREATE TESTS ====================

    function test_CreateTip_Success() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit TipCreated(0, alice, aliceHandleHash, 1 ether, block.timestamp + 7 days);

        uint256 tipId = tipJar.createTip{value: 1 ether}(aliceHandleHash);
        assertEq(tipId, 0);

        TipJar.Tip memory tip = tipJar.getTip(tipId);
        assertEq(tip.sender, alice);
        assertEq(tip.amount, 1 ether);
        assertEq(tip.handleHash, aliceHandleHash);
        assertEq(tip.claimed, false);
        assertEq(tip.claimedBy, address(0));
        assertEq(tip.expiresAt, block.timestamp + 7 days);
    }

    function test_CreateTip_RevertIf_BelowMinAmount() public {
        vm.prank(alice);
        vm.expectRevert(TipJar.InvalidAmount.selector);
        tipJar.createTip{value: 0.009 ether}(aliceHandleHash);
    }

    function test_CreateTip_RevertIf_ZeroHash() public {
        vm.prank(alice);
        vm.expectRevert(TipJar.InvalidHandleHash.selector);
        tipJar.createTip{value: 0.01 ether}(bytes32(0));
    }

    // ==================== CLAIM TESTS ====================

    function test_Claim_Success() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _signVoucher(signerPrivateKey, tipId, bob, deadline);

        uint256 bobBalBefore = bob.balance;

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit TipClaimed(tipId, bob, 1 ether);

        tipJar.claim(tipId, bob, deadline, sig);

        assertEq(bob.balance, bobBalBefore + 1 ether);
        TipJar.Tip memory tip = tipJar.getTip(tipId);
        assertTrue(tip.claimed);
        assertEq(tip.claimedBy, bob);
    }

    function test_Claim_RevertIf_CallerNotRecipient() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _signVoucher(signerPrivateKey, tipId, bob, deadline);

        // Eve tries to frontrun or call claim with Bob's voucher
        address eve = address(0x999);
        vm.prank(eve);
        vm.expectRevert(TipJar.InvalidRecipient.selector);
        tipJar.claim(tipId, bob, deadline, sig);
    }

    function test_Claim_RevertIf_DeadlineExpired() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = vm.getBlockTimestamp() + 5 minutes;
        bytes memory sig = _signVoucher(signerPrivateKey, tipId, bob, deadline);

        // Warp past deadline
        vm.warp(deadline + 1 seconds);

        vm.prank(bob);
        vm.expectRevert(TipJar.DeadlineExpired.selector);
        tipJar.claim(tipId, bob, deadline, sig);
    }

    function test_Claim_RevertIf_DeadlineTooFar() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        // Deadline greater than 10 minutes
        uint256 deadline = block.timestamp + 11 minutes;
        bytes memory sig = _signVoucher(signerPrivateKey, tipId, bob, deadline);

        vm.prank(bob);
        vm.expectRevert(TipJar.DeadlineTooFar.selector);
        tipJar.claim(tipId, bob, deadline, sig);
    }

    function test_Claim_RevertIf_InvalidSigner() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = block.timestamp + 5 minutes;
        // Signed with unauthorized key
        bytes memory rogueSig = _signVoucher(roguePrivateKey, tipId, bob, deadline);

        vm.prank(bob);
        vm.expectRevert(TipJar.InvalidSigner.selector);
        tipJar.claim(tipId, bob, deadline, rogueSig);
    }

    function test_Claim_RevertIf_TipExpired() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        // Warp past tip duration (7 days)
        uint256 currentTimestamp = vm.getBlockTimestamp();
        vm.warp(currentTimestamp + 7 days + 1 seconds);

        uint256 deadline = vm.getBlockTimestamp() + 5 minutes;
        bytes memory sig = _signVoucher(signerPrivateKey, tipId, bob, deadline);

        vm.prank(bob);
        vm.expectRevert(TipJar.TipExpired.selector);
        tipJar.claim(tipId, bob, deadline, sig);
    }

    function test_Claim_RevertIf_AlreadyClaimed() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _signVoucher(signerPrivateKey, tipId, bob, deadline);

        vm.prank(bob);
        tipJar.claim(tipId, bob, deadline, sig);

        // Try double claim
        vm.prank(bob);
        vm.expectRevert(TipJar.TipAlreadyClaimed.selector);
        tipJar.claim(tipId, bob, deadline, sig);
    }

    function test_Claim_RevertIf_ReplayingVoucherDifferentTip() public {
        vm.prank(alice);
        uint256 tip1 = tipJar.createTip{value: 1 ether}(bobHandleHash);
        uint256 tip2 = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = block.timestamp + 5 minutes;
        // Signature is for tip1
        bytes memory sig1 = _signVoucher(signerPrivateKey, tip1, bob, deadline);

        // Attempt to use sig1 for tip2
        vm.prank(bob);
        vm.expectRevert(TipJar.InvalidSigner.selector);
        tipJar.claim(tip2, bob, deadline, sig1);
    }

    function test_Claim_RevertIf_WrongDomainSeparator() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = block.timestamp + 5 minutes;

        // Sign with wrong chainId (e.g. mainnet 143)
        bytes32 structHash = keccak256(
            abi.encode(tipJar.TIP_CLAIM_TYPEHASH(), tipId, bob, deadline)
        );
        bytes32 wrongDomain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("TipJar")),
                keccak256(bytes("1")),
                143, // wrong chain ID
                address(tipJar)
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", wrongDomain, structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        bytes memory wrongSig = abi.encodePacked(r, s, v);

        vm.prank(bob);
        vm.expectRevert(TipJar.InvalidSigner.selector);
        tipJar.claim(tipId, bob, deadline, wrongSig);
    }

    // ==================== REFUND TESTS ====================

    function test_Refund_Success() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 2 ether}(bobHandleHash);

        // Warp past 7 days
        vm.warp(block.timestamp + 7 days + 1 seconds);

        uint256 aliceBalBefore = alice.balance;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit TipRefunded(tipId, alice, 2 ether);

        tipJar.refund(tipId);

        assertEq(alice.balance, aliceBalBefore + 2 ether);
        TipJar.Tip memory tip = tipJar.getTip(tipId);
        assertTrue(tip.claimed);
        assertEq(tip.amount, 0);
    }

    function test_Refund_RevertIf_BeforeExpiry() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        // 6 days passed, not yet 7
        vm.warp(block.timestamp + 6 days);

        vm.prank(alice);
        vm.expectRevert(TipJar.TipNotExpired.selector);
        tipJar.refund(tipId);
    }

    function test_Refund_RevertIf_NotSender() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        vm.warp(block.timestamp + 8 days);

        // Bob attempts to refund Alice's tip
        vm.prank(bob);
        vm.expectRevert(TipJar.Unauthorized.selector);
        tipJar.refund(tipId);
    }

    function test_Refund_RevertIf_AlreadyClaimed() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _signVoucher(signerPrivateKey, tipId, bob, deadline);

        vm.prank(bob);
        tipJar.claim(tipId, bob, deadline, sig);

        // Warp past expiry
        vm.warp(block.timestamp + 8 days);

        // Alice tries to refund after claim
        vm.prank(alice);
        vm.expectRevert(TipJar.TipAlreadyClaimed.selector);
        tipJar.refund(tipId);
    }

    // ==================== REENTRANCY TESTS ====================

    function test_Reentrancy_Claim() public {
        MaliciousRecipient attacker = new MaliciousRecipient(address(tipJar));
        vm.deal(address(attacker), 1 ether);

        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bytes32("attacker"));

        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _signVoucher(signerPrivateKey, tipId, address(attacker), deadline);

        attacker.setClaimData(tipId, deadline, sig);

        // When attacker claims, receive() attempts to call claim() again.
        // The reentrant call fails inside ReentrancyGuard, causing TransferFailed() revert
        vm.prank(address(attacker));
        vm.expectRevert(TipJar.TransferFailed.selector);
        tipJar.claim(tipId, address(attacker), deadline, sig);
    }

    function test_Reentrancy_Refund() public {
        MaliciousSender attacker = new MaliciousSender(address(tipJar));
        vm.deal(address(attacker), 2 ether);

        uint256 tipId = attacker.createTip{value: 1 ether}(bytes32("target"));
        attacker.setTipId(tipId);

        vm.warp(block.timestamp + 8 days);

        // When attacker refunds, receive() attempts to call refund() again.
        // The reentrant call fails inside ReentrancyGuard, causing TransferFailed() revert
        vm.prank(address(attacker));
        vm.expectRevert(TipJar.TransferFailed.selector);
        tipJar.refund(tipId);
    }

    // ==================== ACCESS CONTROL & KEY ROTATION ====================

    function test_SetClaimSigner_AccessControl() public {
        address newSigner = address(0x3333);

        vm.prank(alice);
        vm.expectRevert(TipJar.Unauthorized.selector);
        tipJar.setClaimSigner(newSigner);

        // Owner can update
        vm.expectEmit(true, true, false, false);
        emit ClaimSignerUpdated(claimSigner, newSigner);
        tipJar.setClaimSigner(newSigner);
        assertEq(tipJar.claimSigner(), newSigner);
    }

    function test_SetClaimSigner_RotatesSignerAndInvalidatesOldVouchers() public {
        vm.prank(alice);
        uint256 tipId = tipJar.createTip{value: 1 ether}(bobHandleHash);

        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory oldSig = _signVoucher(signerPrivateKey, tipId, bob, deadline);

        // Rotate signer to rogueSigner key
        tipJar.setClaimSigner(rogueSigner);

        // Old voucher fails
        vm.prank(bob);
        vm.expectRevert(TipJar.InvalidSigner.selector);
        tipJar.claim(tipId, bob, deadline, oldSig);

        // New voucher signed by rogueSigner succeeds
        bytes memory newSig = _signVoucher(roguePrivateKey, tipId, bob, deadline);
        vm.prank(bob);
        tipJar.claim(tipId, bob, deadline, newSig);

        assertTrue(tipJar.getTip(tipId).claimed);
    }
}
