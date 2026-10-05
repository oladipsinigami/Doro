import { monadTestnet } from "./chain";

export const TIPJAR_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const TIPJAR_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_claimSigner", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "tipId", type: "uint256", internalType: "uint256" },
      { name: "recipient", type: "address", internalType: "address" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimSigner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createTip",
    inputs: [{ name: "handleHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "tipId", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "getTip",
    inputs: [{ name: "tipId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct TipJar.Tip",
        components: [
          { name: "sender", type: "address", internalType: "address" },
          { name: "createdAt", type: "uint40", internalType: "uint40" },
          { name: "expiresAt", type: "uint40", internalType: "uint40" },
          { name: "claimed", type: "bool", internalType: "bool" },
          { name: "handleHash", type: "bytes32", internalType: "bytes32" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "claimedBy", type: "address", internalType: "address" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextTipId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "refund",
    inputs: [{ name: "tipId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setClaimSigner",
    inputs: [{ name: "newSigner", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "tips",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "sender", type: "address", internalType: "address" },
      { name: "createdAt", type: "uint40", internalType: "uint40" },
      { name: "expiresAt", type: "uint40", internalType: "uint40" },
      { name: "claimed", type: "bool", internalType: "bool" },
      { name: "handleHash", type: "bytes32", internalType: "bytes32" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "claimedBy", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ClaimSignerUpdated",
    inputs: [
      { name: "oldSigner", type: "address", indexed: true, internalType: "address" },
      { name: "newSigner", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TipClaimed",
    inputs: [
      { name: "tipId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "recipient", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TipCreated",
    inputs: [
      { name: "tipId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "handleHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "expiresAt", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TipRefunded",
    inputs: [
      { name: "tipId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  { type: "error", name: "DeadlineExpired", inputs: [] },
  { type: "error", name: "DeadlineTooFar", inputs: [] },
  { type: "error", name: "ECDSAInvalidSignature", inputs: [] },
  { type: "error", name: "ECDSAInvalidSignatureLength", inputs: [{ name: "length", type: "uint256", internalType: "uint256" }] },
  { type: "error", name: "ECDSAInvalidSignatureS", inputs: [{ name: "s", type: "bytes32", internalType: "bytes32" }] },
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "InvalidHandleHash", inputs: [] },
  { type: "error", name: "InvalidRecipient", inputs: [] },
  { type: "error", name: "InvalidShortString", inputs: [] },
  { type: "error", name: "InvalidSigner", inputs: [] },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
  { type: "error", name: "StringTooLong", inputs: [{ name: "str", type: "string", internalType: "string" }] },
  { type: "error", name: "TipAlreadyClaimed", inputs: [] },
  { type: "error", name: "TipExpired", inputs: [] },
  { type: "error", name: "TipNotFound", inputs: [] },
  { type: "error", name: "TipNotExpired", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "Unauthorized", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
] as const;

export const EIP712_DOMAIN = {
  name: "TipJar",
  version: "1",
  chainId: monadTestnet.id,
  verifyingContract: TIPJAR_ADDRESS,
} as const;

export const TIP_CLAIM_TYPES = {
  TipClaim: [
    { name: "tipId", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
