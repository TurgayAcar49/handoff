"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { erc20Abi, zeroAddress } from "viem"
import { useAccount, useReadContract } from "wagmi"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { arc, arcTestnet, GAS_BUFFER, handoffAddress } from "@/lib/chains"
import { handoffAbi } from "@/lib/abi"
import { explainError } from "@/lib/errors"
import { byteLength, formatDuration, formatUsdc } from "@/lib/format"
import { REVIEW_WINDOWS, validateDraft, type ParsedDraft } from "@/lib/job-rules"
import { fundJob } from "@/lib/send"
import { rememberJob, useHandoffNetwork } from "@/lib/storage"

const control = "h-11 bg-card px-3 shadow-none"

export function JobForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { kind } = useHandoffNetwork()
  const chain = kind === "mainnet" ? arc : arcTestnet
  const handoff = handoffAddress(chain.id)
  const { address } = useAccount()
  const [title, setTitle] = useState("")
  const [payee, setPayee] = useState("")
  const [amount, setAmount] = useState("")
  const [reviewWindow, setReviewWindow] = useState<number>(259_200)
  const [deadline, setDeadline] = useState("")
  const [releaser, setReleaser] = useState("")
  const [arbitrator, setArbitrator] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [pending, setPending] = useState<"approve" | "fund" | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const ready = useRef<ParsedDraft | null>(null)

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000))
    tick()
    const timer = window.setInterval(tick, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const draft = useMemo(
    () =>
      validateDraft(
        { title, payee, amount, reviewWindow, deadline, releaser, arbitrator },
        now,
        address,
      ),
    [title, payee, amount, reviewWindow, deadline, releaser, arbitrator, now, address],
  )

  const { data: usdc } = useReadContract({
    chainId: chain.id,
    address: handoff,
    abi: handoffAbi,
    functionName: "usdc",
    query: { enabled: Boolean(handoff) },
  })

  const { data: balance } = useReadContract({
    chainId: chain.id,
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(usdc && address), refetchInterval: 8_000 },
  })

  const errors = attempted ? draft.errors : {}
  const shortGas =
    draft.value && balance !== undefined && balance < draft.value.amount + GAS_BUFFER

  async function fund(value: ParsedDraft) {
    if (!handoff || !usdc) return
    setConfirmOpen(false)
    try {
      setPending("fund")
      const result = await fundJob({
        chainId: chain.id,
        handoff,
        usdc,
        payee: value.payee,
        releaser: value.releaser ?? zeroAddress,
        arbitrator: value.arbitrator ?? zeroAddress,
        amount: value.amount,
        deadline: BigInt(value.deadline),
        reviewWindow: BigInt(value.reviewWindow),
        title: value.title,
        onPhase: setPending,
      })
      rememberJob({
        chainId: chain.id,
        id: result.id.toString(),
        hash: result.hash,
        title: value.title,
      })
      await queryClient.invalidateQueries()
      toast.success(`Ticket ${result.id.toString()} is funded.`)
      router.push(`/jobs/${result.id.toString()}`)
    } catch (error) {
      toast.error(explainError(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          const current = Math.floor(Date.now() / 1000)
          setNow(current)
          const result = validateDraft(
            { title, payee, amount, reviewWindow, deadline, releaser, arbitrator },
            current,
            address,
          )
          setAttempted(true)
          if (!result.value) return
          if (!handoff) {
            toast.error("Deploy Handoff on this network before funding a ticket.")
            return
          }
          if (balance !== undefined && balance < result.value.amount + GAS_BUFFER) return
          if (!address) {
            toast.error("Connect a wallet to fund this ticket.")
            return
          }
          ready.current = result.value
          if (kind === "mainnet") {
            setConfirmOpen(true)
            return
          }
          void fund(result.value)
        }}
      >
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="title">Title</Label>
            <span className="text-xs text-muted-foreground">{byteLength(title.trim())}/80 bytes</span>
          </div>
          <Input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Homepage illustrations"
            className={control}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="payee">Payee</Label>
          <Input
            id="payee"
            value={payee}
            onChange={(event) => setPayee(event.target.value)}
            placeholder="0x"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className={`${control} font-mono`}
            aria-invalid={Boolean(errors.payee)}
          />
          {errors.payee ? <p className="text-sm text-destructive">{errors.payee}</p> : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="250.00"
              className={control}
              aria-invalid={Boolean(errors.amount)}
            />
            {errors.amount ? <p className="text-sm text-destructive">{errors.amount}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="window">Review window</Label>
            <select
              id="window"
              value={reviewWindow}
              onChange={(event) => setReviewWindow(Number(event.target.value))}
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm"
            >
              {REVIEW_WINDOWS.map((option) => (
                <option key={option.seconds} value={option.seconds}>
                  {option.label}
                  {option.note ? ` · ${option.note}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="deadline">Deadline</Label>
            <span className="text-xs text-muted-foreground">Optional. After this, delivery is refused.</span>
          </div>
          <Input
            id="deadline"
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            className={control}
            aria-invalid={Boolean(errors.deadline)}
          />
          {errors.deadline ? <p className="text-sm text-destructive">{errors.deadline}</p> : null}
        </div>

        <details className="rounded-lg border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Agent and arbitrator
            <span className="ml-2 font-normal text-muted-foreground">Optional</span>
          </summary>
          <div className="grid gap-4 border-t border-border px-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="releaser">Agent that can release</Label>
              <Input
                id="releaser"
                value={releaser}
                onChange={(event) => setReleaser(event.target.value)}
                placeholder="0x"
                spellCheck={false}
                className={`${control} font-mono`}
                aria-invalid={Boolean(errors.releaser)}
              />
              <p className="text-xs text-muted-foreground">
                A script or another service can pay the ticket after delivery. It cannot overrule a dispute.
              </p>
              {errors.releaser ? <p className="text-sm text-destructive">{errors.releaser}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="arbitrator">Arbitrator</Label>
              <Input
                id="arbitrator"
                value={arbitrator}
                onChange={(event) => setArbitrator(event.target.value)}
                placeholder="0x"
                spellCheck={false}
                className={`${control} font-mono`}
                aria-invalid={Boolean(errors.arbitrator)}
              />
              <p className="text-xs text-muted-foreground">
                Leave this blank and there is no dispute. After delivery, you release the USDC or the payee claims it when the window ends.
              </p>
              {errors.arbitrator ? <p className="text-sm text-destructive">{errors.arbitrator}</p> : null}
            </div>
          </div>
        </details>

        {shortGas ? (
          <p className="text-sm text-destructive">
            Leave at least 0.05 USDC in the wallet. On Arc the network fee comes out of the same balance.
          </p>
        ) : null}
        {address && balance !== undefined ? (
          <p className="text-sm text-muted-foreground">Spendable balance: {formatUsdc(balance)} USDC</p>
        ) : null}
        {!handoff ? (
          <p className="text-sm text-muted-foreground">
            Deploy Handoff to {chain.name} and set its address before this form can move USDC.
          </p>
        ) : null}

        <Button
          type="submit"
          className="h-11 px-4"
          disabled={pending !== null || Boolean(shortGas)}
        >
          {pending === "approve"
            ? "Approve USDC in your wallet…"
            : pending === "fund"
              ? "Locking USDC…"
              : "Fund ticket"}
        </Button>
        {!address ? (
          <p className="text-sm text-muted-foreground">Connect a wallet to fund this ticket.</p>
        ) : null}
      </form>

      <aside className="rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6">
        <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Agreement</p>
        <p className="mt-3 font-serif text-4xl tracking-tight">
          {draft.value ? formatUsdc(draft.value.amount) : "—"}
        </p>
        <p className="text-sm text-muted-foreground">USDC, 6 decimals</p>
        <ul className="mt-5 grid gap-3 text-sm leading-6">
          <li>The full amount is locked in the contract, not split.</li>
          <li>You can refund it all until the payee marks the job delivered.</li>
          <li>
            Review window: {formatDuration(reviewWindow)}. After that, the payee can claim the USDC.
          </li>
          <li>
            {deadline
              ? "Delivery closes at the deadline you set."
              : "There is no delivery deadline."}
          </li>
          <li>
            {releaser.trim()
              ? "A named agent can release the fee after delivery."
              : "Only you can release the fee early."}
          </li>
          <li>
            {arbitrator.trim()
              ? "If you dispute, the arbitrator decides. You can still release, and the payee can still accept a refund."
              : "No arbitrator, so there is no dispute path."}
          </li>
        </ul>
      </aside>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This is real USDC</DialogTitle>
            <DialogDescription>
              {draft.value
                ? `You are about to lock ${formatUsdc(draft.value.amount)} USDC on Arc mainnet. You can take it back only before the payee marks the job delivered.`
                : "You are about to lock USDC on Arc mainnet."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending !== null}
              onClick={() => {
                if (ready.current) void fund(ready.current)
              }}
            >
              Lock the USDC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
