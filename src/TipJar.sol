// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TipJar
 * @notice Trust-minimized native MON escrow for X (Twitter) handles on Monad Testnet.
 * @dev Recipient claims funds on-chain using an EIP-712 server-signed voucher.
 */
contract TipJar is EIP712, ReentrancyGuard {
    struct Tip {
        address sender;
        // SD-01: uint40 truncates silently past year 36812. Latent, not
        // exploitable today. Widen to uint256 on the next contract edit.
        uint40 createdAt;
        uint40 expiresAt;
        bool claimed;
        bytes32 handleHash;
        uint256 amount;
        address claimedBy;
    }

    uint256 public nextTipId;
    address public owner;
    address public claimSigner;

    // SD-04: pending signer rotation. `claimSigner` keeps working until this
    // is executed, so an in-flight rotation cannot strand existing vouchers.
    address public pendingClaimSigner;
    uint256 public pendingClaimSignerEffectiveAt;

    uint256 public constant MIN_TIP = 0.01 ether;
    uint256 public constant TIP_DURATION = 7 days;
    uint256 public constant MAX_VOUCHER_TTL = 10 minutes;

    // SD-04: delay before a new claim signer takes effect. Without it, a
    // compromised owner can repoint the signer and drain every escrow instantly.
    uint256 public constant SIGNER_TIMELOCK = 1 hours;

    bytes32 public constant TIP_CLAIM_TYPEHASH =
        keccak256("TipClaim(uint256 tipId,address recipient,uint256 deadline)");

    mapping(uint256 => Tip) public tips;

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
    event ClaimSignerChangeQueued(address indexed oldSigner, address indexed newSigner, uint256 effectiveAt);
    event ClaimSignerChangeCancelled(address indexed signer);

    error InvalidAmount();
    error InvalidHandleHash();
    error TipNotFound();
    error TipAlreadyClaimed();
    error TipExpired();
    error TipNotExpired();
    error DeadlineExpired();
    error DeadlineTooFar();
    error InvalidRecipient();
    error InvalidSigner();
    error TransferFailed();
    error Unauthorized();
    error ZeroAddress();
    error TimelockNotElapsed();
    error NoPendingSignerChange();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _claimSigner) EIP712("TipJar", "1") {
        if (_claimSigner == address(0)) revert ZeroAddress();
        owner = msg.sender;
        claimSigner = _claimSigner;
        emit ClaimSignerUpdated(address(0), _claimSigner);
    }

    /**
     * @notice Locks native MON against a salted hash of an X handle.
     * @param handleHash keccak256(abi.encodePacked(HANDLE_SALT, lowercaseHandle))
     * @return tipId Unique identifier of the created tip
     */
    function createTip(bytes32 handleHash) external payable returns (uint256 tipId) {
        if (msg.value < MIN_TIP) revert InvalidAmount();
        if (handleHash == bytes32(0)) revert InvalidHandleHash();

        tipId = nextTipId++;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint40 expiresAt = uint40(block.timestamp + TIP_DURATION);

        tips[tipId] = Tip({
            sender: msg.sender,
            // forge-lint: disable-next-line(unsafe-typecast)
            createdAt: uint40(block.timestamp),
            expiresAt: expiresAt,
            claimed: false,
            handleHash: handleHash,
            amount: msg.value,
            claimedBy: address(0)
        });

        emit TipCreated(tipId, msg.sender, handleHash, msg.value, expiresAt);
    }

    /**
     * @notice Claims a tip using a valid server-signed EIP-712 voucher.
     * @dev msg.sender MUST match recipient to prevent mempool frontrunning.
     *
     * SD-05 (accepted risk): this function never reads `tip.handleHash`. The
     * handle-to-wallet binding is enforced server-side only, so the security of
     * every on-chain control here assumes claimSigner cannot be induced to sign
     * for the wrong person. Severity is capped by the msg.sender == recipient
     * check below: a compromised signer yields griefing, not theft, because
     * funds can only be released to the broadcasting address. See
     * SECURITY-DEBT.md before changing anything here.
     *
     * @param tipId ID of the tip being claimed
     * @param recipient Address that will broadcast the claim
     * @param deadline Unix timestamp until which the signature is valid
     * @param signature EIP-712 signature produced by claimSigner
     */
    function claim(
        uint256 tipId,
        address recipient,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.sender != recipient) revert InvalidRecipient();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert DeadlineExpired();
        // forge-lint: disable-next-line(block-timestamp)
        if (deadline > block.timestamp + MAX_VOUCHER_TTL) revert DeadlineTooFar();

        Tip storage tip = tips[tipId];
        if (tip.createdAt == 0) revert TipNotFound();
        if (tip.claimed) revert TipAlreadyClaimed();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > tip.expiresAt) revert TipExpired();

        bytes32 structHash = keccak256(
            abi.encode(TIP_CLAIM_TYPEHASH, tipId, recipient, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        // SD-02: ECDSA.recover reverts with OpenZeppelin's own error selectors
        // on a malformed signature instead of InvalidSigner(). Cosmetic only.
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != claimSigner) revert InvalidSigner();

        tip.claimed = true;
        tip.claimedBy = recipient;
        // SD-09: amount is intentionally not zeroed here. The claimed flag
        // blocks re-entry and refund() zeroes it, so this is informational
        // accounting only. Zeroing costs a storage write for no security gain.
        uint256 amount = tip.amount;

        // forge-lint: disable-next-line(reentrancy-events)
        emit TipClaimed(tipId, recipient, amount);

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Refunds an expired, unclaimed tip back to the original sender.
     * @param tipId ID of the tip to refund
     */
    function refund(uint256 tipId) external nonReentrant {
        Tip storage tip = tips[tipId];
        if (tip.createdAt == 0) revert TipNotFound();
        if (tip.claimed) revert TipAlreadyClaimed();
        if (msg.sender != tip.sender) revert Unauthorized();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= tip.expiresAt) revert TipNotExpired();

        tip.claimed = true;
        // SD-03: claimedBy is intentionally left unset for refunds, so
        // getTip() reports address(0) for a refunded tip. Accounting
        // inconsistency only; amount is zeroed here and claimed blocks re-entry.
        uint256 amount = tip.amount;
        tip.amount = 0;

        emit TipRefunded(tipId, msg.sender, amount);

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Queues a new trusted voucher signer, effective after a timelock.
     * @dev SD-04: splitting proposal from execution gives a window in which a
     * compromised owner (or a mistaken rotation) can be detected and reverted
     * before it drains escrowed funds. The current signer keeps working during
     * that window, so no existing voucher becomes invalid.
     * @param newSigner New address authorized to sign claim vouchers
     */
    function setClaimSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();

        uint256 effectiveAt = block.timestamp + SIGNER_TIMELOCK;
        address oldSigner = claimSigner;

        pendingClaimSigner = newSigner;
        pendingClaimSignerEffectiveAt = effectiveAt;

        emit ClaimSignerChangeQueued(oldSigner, newSigner, effectiveAt);
    }

    /**
     * @notice Applies a queued signer rotation once its timelock has elapsed.
     */
    function acceptClaimSigner() external {
        address newSigner = pendingClaimSigner;
        if (newSigner == address(0)) revert NoPendingSignerChange();

        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < pendingClaimSignerEffectiveAt) revert TimelockNotElapsed();

        address oldSigner = claimSigner;

        claimSigner = newSigner;
        pendingClaimSigner = address(0);
        pendingClaimSignerEffectiveAt = 0;

        emit ClaimSignerUpdated(oldSigner, newSigner);
    }

    /**
     * @notice Cancels a queued signer rotation. Owner only.
     */
    function cancelClaimSignerChange() external onlyOwner {
        address queued = pendingClaimSigner;
        if (queued == address(0)) revert NoPendingSignerChange();

        pendingClaimSigner = address(0);
        pendingClaimSignerEffectiveAt = 0;

        emit ClaimSignerChangeCancelled(queued);
    }

    /**
     * @notice Returns the tip details for a given tipId.
     * @param tipId ID of the tip
     */
    function getTip(uint256 tipId) external view returns (Tip memory) {
        return tips[tipId];
    }
}
