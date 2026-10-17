"use client"

import Link from "next/link"
import { useBalance, useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import { Button } from "@/components/ui/button"
import { arc, arcTestnet, handoffAddress } from "@/lib/chains"
import { formatNativeUsdc, shortAddress } from "@/lib/format"
import { explainError } from "@/lib/errors"
import { useHandoffNetwork } from "@/lib/storage"
import { toast } from "sonner"

export function SiteHeader() {
  const { kind, setKind } = useHandoffNetwork()
  const chain = kind === "mainnet" ? arc : arcTestnet
  const deployed = handoffAddress(chain.id)

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-serif text-2xl tracking-tight">
            Handoff
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/jobs/new" className="hover:underline">
              New ticket
            </Link>
            <Link href="/jobs" className="hover:underline">
              Tickets
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            <NetworkButton current={kind} value="testnet" onSelect={setKind}>
              Testnet
            </NetworkButton>
            <NetworkButton current={kind} value="mainnet" onSelect={setKind}>
              Mainnet
            </NetworkButton>
          </div>
          <ConnectButton chainId={chain.id} chainName={chain.name} />
        </div>
      </div>
      {kind === "mainnet" ? (
        <p className="border-t border-wax/30 bg-wax/10 px-4 py-2 text-center text-sm text-wax">
          Arc mainnet. Funding a ticket moves real USDC.
        </p>
      ) : null}
      {deployed ? null : (
        <p className="border-t border-border px-4 py-2 text-center text-sm text-muted-foreground">
          No Handoff contract is set for {chain.name}. Deploy it, then add the address to .env.local.
        </p>
      )}
    </header>
  )
}

function NetworkButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: "testnet" | "mainnet"
  value: "testnet" | "mainnet"
  onSelect: (next: "testnet" | "mainnet") => void
  children: string
}) {
  const selected = current === value
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={
        selected
          ? "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
          : "rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  )
}

function ConnectButton({ chainId, chainName }: { chainId: number; chainName: string }) {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { connectAsync, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: switching } = useSwitchChain()
  const { data: balance } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  })

  if (!isConnected || !address) {
    return (
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          const connector = connectors[0]
          if (!connector) {
            toast.error("No browser wallet found. Install one, then try again.")
            return
          }
          void connectAsync({ connector }).catch((error: unknown) => {
            toast.error(explainError(error))
          })
        }}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </Button>
    )
  }

  const wrongNetwork = walletChainId !== chainId

  return (
    <div className="flex items-center gap-2">
      {balance ? (
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {formatNativeUsdc(balance.value)} USDC
        </span>
      ) : null}
      {wrongNetwork ? (
        <Button
          type="button"
          variant="outline"
          disabled={switching}
          onClick={() => {
            void switchChainAsync({ chainId }).catch((error: unknown) => {
              toast.error(explainError(error))
            })
          }}
        >
          {switching ? "Switching…" : `Switch to ${chainName}`}
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={() => disconnect()}>
        {shortAddress(address)}
      </Button>
    </div>
  )
}

export function SiteFooter() {
  const { kind } = useHandoffNetwork()
  const chain = kind === "mainnet" ? arc : arcTestnet
  const deployed = handoffAddress(chain.id)
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto grid max-w-5xl gap-3 px-4 py-8 text-sm text-muted-foreground sm:grid-cols-[1fr_auto]">
        <p>
          Handoff locks USDC inside a job ticket. After deployment there is no owner and no
          admin withdrawal.
        </p>
        <div className="flex flex-col gap-1 sm:items-end">
          {deployed ? (
            <a className="underline underline-offset-4" href={`${chain.blockExplorers.default.url}/address/${deployed}`}>
              Contract on {chain.name}
            </a>
          ) : (
            <span>Contract not configured</span>
          )}
          {kind === "testnet" ? (
            <a className="underline underline-offset-4" href="https://faucet.circle.com">
              Circle testnet faucet
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
