"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAccount, useReadContract } from "wagmi"
import { toast } from "sonner"
import { Ticket } from "@/components/ticket"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { handoffAbi } from "@/lib/abi"
import { arc, arcTestnet, addressUrl, handoffAddress, txUrl } from "@/lib/chains"
import { explainError } from "@/lib/errors"
import { byteLength, formatDuration, formatRemaining, formatUsdc, formatWhen, shortAddress } from "@/lib/format"
import {
  asJob,
  canAcceptRefund,
  canClaim,
  canDeliver,
  canDispute,
  canRefund,
  canRelease,
  canResolve,
  isZero,
  MAX_PROOF_BYTES,
  statusLabel,
} from "@/lib/job-rules"
import { sendJobCall } from "@/lib/send"
import { useHandoffNetwork, useRememberedJobs } from "@/lib/storage"

export function JobView({ id }: { id: string }) {
  const numeric = /^\d+$/.test(id) ? BigInt(id) : null
  const { kind } = useHandoffNetwork()
  const chain = kind === "mainnet" ? arc : arcTestnet
  const handoff = handoffAddress(chain.id)
  const { address } = useAccount()
  const remembered = useRememberedJobs()
  const saved = remembered.find((item) => item.chainId === chain.id && item.id === id)
  const [now, setNow] = useState<number | null>(null)
  const [proof, setProof] = useState("")
  const [pending, setPending] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const { data, error, isPending, refetch } = useReadContract({
    chainId: chain.id,
    address: handoff,
    abi: handoffAbi,
    functionName: "getJob",
    args: numeric && numeric > 0n ? [numeric] : undefined,
    query: {
      enabled: Boolean(handoff && numeric && numeric > 0n),
      refetchInterval: 5_000,
    },
  })

  if (!numeric || numeric <= 0n) {
    return <Empty title="That ticket number is not valid." body="Tickets are numbered 1, 2, 3…" />
  }
  if (!handoff) {
    return (
      <Empty
        title={`Handoff is not configured on ${chain.name}.`}
        body="Deploy the contract and put its address in .env.local. The form will start reading tickets after that."
      />
    )
  }
  if (isPending) return <TicketSkeleton />
  if (error || !data) {
    return (
      <Empty
        title="This ticket is not on the contract."
        body="Check the network toggle. A testnet ticket will not show up while Mainnet is selected."
      />
    )
  }

  const job = asJob(data)
  if (!job) {
    return <Empty title="The contract returned a ticket we could not read." body="Refresh the page." />
  }

  const clock = now ?? 0
  const claimAt = job.deliveredAt === 0n ? 0 : Number(job.deliveredAt + job.reviewWindow)
  const secondsLeft = claimAt && now ? claimAt - now : null
  const rows = [
    { label: "Client", value: shortAddress(job.client) },
    { label: "Payee", value: shortAddress(job.payee) },
    { label: "Review", value: formatDuration(Number(job.reviewWindow)) },
    {
      label: "Deadline",
      value: job.deadline === 0n ? "None" : formatWhen(Number(job.deadline)),
    },
    { label: "Agent", value: isZero(job.releaser) ? "None" : shortAddress(job.releaser) },
    {
      label: "Arbitrator",
      value: isZero(job.arbitrator) ? "None" : shortAddress(job.arbitrator),
    },
  ]
  if (job.proof) rows.push({ label: "Delivery", value: job.proof })

  async function act(request: Parameters<typeof sendJobCall>[2], success: string) {
    if (!handoff || pending) return
    setPending(true)
    try {
      const hash = await sendJobCall(chain.id, handoff, request)
      await queryClient.invalidateQueries()
      await refetch()
      toast.success(success, { description: hash })
    } catch (reason) {
      toast.error(explainError(reason))
    } finally {
      setPending(false)
    }
  }

  const deliverReady = canDeliver(job, address, clock) && byteLength(proof.trim()) > 0 && byteLength(proof.trim()) <= MAX_PROOF_BYTES

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-4">
        <Ticket
          eyebrow={`Ticket ${id}`}
          title={job.title}
          amount={formatUsdc(job.amount)}
          status={statusLabel(job.status)}
          rows={rows}
        />
        <p className="text-sm text-muted-foreground">
          <a className="underline underline-offset-4" href={addressUrl(chain.id, handoff)}>
            Contract
          </a>
          {saved?.hash ? (
            <>
              {" · "}
              <a className="underline underline-offset-4" href={txUrl(chain.id, saved.hash)}>
                Funding transaction
              </a>
            </>
          ) : null}
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-serif text-2xl tracking-tight">What you can do</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {guidance(job, address, clock, secondsLeft)}
        </p>

        {canDeliver(job, address, clock) ? (
          <div className="mt-4 grid gap-2">
            <Label htmlFor="proof">Delivery note</Label>
            <Textarea
              id="proof"
              value={proof}
              onChange={(event) => setProof(event.target.value)}
              placeholder="https://… or a short note"
              className="min-h-24 bg-background"
            />
            <p className="text-xs text-muted-foreground">{byteLength(proof.trim())}/200 bytes</p>
            <Button
              type="button"
              className="h-11"
              disabled={!deliverReady || pending}
              onClick={() =>
                void act({ functionName: "deliver", args: [numeric, proof.trim()] }, "Marked delivered.")
              }
            >
              Mark delivered
            </Button>
          </div>
        ) : null}

        <div className="mt-4 grid gap-2">
          {canRelease(job, address) ? (
            <Button
              type="button"
              className="h-11"
              disabled={pending}
              onClick={() => void act({ functionName: "release", args: [numeric] }, "USDC released to the payee.")}
            >
              Release USDC
            </Button>
          ) : null}
          {canClaim(job, address, clock) ? (
            <Button
              type="button"
              className="h-11"
              disabled={pending}
              onClick={() => void act({ functionName: "claim", args: [numeric] }, "USDC claimed.")}
            >
              Claim USDC
            </Button>
          ) : null}
          {canRefund(job, address) ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={pending}
              onClick={() => void act({ functionName: "refund", args: [numeric] }, "USDC refunded.")}
            >
              Refund to my wallet
            </Button>
          ) : null}
          {canDispute(job, address, clock) ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={pending}
              onClick={() => void act({ functionName: "dispute", args: [numeric] }, "Dispute opened.")}
            >
              Open a dispute
            </Button>
          ) : null}
          {canAcceptRefund(job, address) ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={pending}
              onClick={() =>
                void act({ functionName: "acceptRefund", args: [numeric] }, "Refund accepted.")
              }
            >
              Send the USDC back
            </Button>
          ) : null}
          {canResolve(job, address) ? (
            <>
              <Button
                type="button"
                className="h-11"
                disabled={pending}
                onClick={() =>
                  void act({ functionName: "resolve", args: [numeric, true] }, "Paid the payee.")
                }
              >
                Pay the payee
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={pending}
                onClick={() =>
                  void act({ functionName: "resolve", args: [numeric, false] }, "Refunded the client.")
                }
              >
                Refund the client
              </Button>
            </>
          ) : null}
        </div>
        {!address ? <p className="mt-4 text-sm text-muted-foreground">Connect the client, payee, or arbitrator wallet to act.</p> : null}
      </section>
    </div>
  )
}

function guidance(
  job: NonNullable<ReturnType<typeof asJob>>,
  account: string | undefined,
  now: number,
  secondsLeft: number | null,
) {
  const client = account?.toLowerCase() === job.client.toLowerCase()
  const payee = account?.toLowerCase() === job.payee.toLowerCase()
  if (job.status === 1) {
    if (job.deadline !== 0n && BigInt(now) > job.deadline) {
      return "The deadline passed before delivery. The client can refund the full amount."
    }
    if (client) return "You can refund the full amount until the payee marks this delivered."
    if (payee) return "Add a link or a note. That starts the review window, and the client can no longer refund alone."
    return "Waiting on delivery."
  }
  if (job.status === 2) {
    const waiting =
      secondsLeft !== null && secondsLeft > 0
        ? `The payee can claim in ${formatRemaining(secondsLeft)}.`
        : "The review window has ended. The payee can claim the USDC."
    if (client) return `You can release the USDC now. ${waiting}`
    if (payee) return waiting
    return waiting
  }
  if (job.status === 3) {
    if (client) return "The dispute is open. You can still release the USDC to the payee."
    if (payee) return "You can send the USDC back, or wait for the arbitrator."
    return "The arbitrator can pay the payee or refund the client."
  }
  if (job.status === 4) return "The payee has the USDC."
  if (job.status === 5) return "The client has the USDC back."
  return "This ticket has no open action."
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-xl rounded-xl border border-dashed border-border bg-card px-6 py-10">
      <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}

function TicketSkeleton() {
  return <div className="h-56 animate-pulse rounded-xl border border-border bg-card" />
}
