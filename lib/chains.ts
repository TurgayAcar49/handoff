import { defineChain, isAddress } from "viem"

export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
})

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
})

/** Canonical Arc USDC ERC-20 interface. Six decimals. Same address on mainnet and testnet. */
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const

/** Leave this much ERC-20 USDC in the wallet. Gas is the same balance, priced at 18 decimals. */
export const GAS_BUFFER = 50_000n

export type HandoffChain = typeof arc | typeof arcTestnet

export function chainById(chainId: number): HandoffChain {
  if (chainId === arc.id) return arc
  if (chainId === arcTestnet.id) return arcTestnet
  throw new Error("Handoff only sends transactions on Arc.")
}

export function explorerBase(chainId: number) {
  return chainById(chainId).blockExplorers.default.url
}

export function txUrl(chainId: number, hash: string) {
  return `${explorerBase(chainId)}/tx/${hash}`
}

export function addressUrl(chainId: number, address: string) {
  return `${explorerBase(chainId)}/address/${address}`
}

export function handoffAddress(chainId: number): `0x${string}` | undefined {
  const raw =
    chainId === arc.id
      ? process.env.NEXT_PUBLIC_HANDOFF_MAINNET
      : chainId === arcTestnet.id
        ? process.env.NEXT_PUBLIC_HANDOFF_TESTNET
        : undefined
  if (!raw || !isAddress(raw)) return undefined
  return raw
}
