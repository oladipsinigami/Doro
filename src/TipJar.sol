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

    uint256 public constant MIN_TIP = 0.01 ether;
    uint256 public constant TIP_DURATION = 7 days;
    uint256 public constant MAX_VOUCHER_TTL = 10 minutes;

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
     * @param tipId ID of the tip being claimed
     * @param recipient Embedded wallet address of the claimer
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
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != claimSigner) revert InvalidSigner();

        tip.claimed = true;
        tip.claimedBy = recipient;
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
        uint256 amount = tip.amount;
        tip.amount = 0;

        emit TipRefunded(tipId, msg.sender, amount);

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Updates the trusted voucher signer. Owner only.
     * @param newSigner New address authorized to sign claim vouchers
     */
    function setClaimSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address oldSigner = claimSigner;
        claimSigner = newSigner;
        emit ClaimSignerUpdated(oldSigner, newSigner);
    }

    /**
     * @notice Returns the tip details for a given tipId.
     * @param tipId ID of the tip
     */
    function getTip(uint256 tipId) external view returns (Tip memory) {
        return tips[tipId];
    }
}
