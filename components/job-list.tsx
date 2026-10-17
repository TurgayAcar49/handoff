"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useReadContract, useReadContracts } from "wagmi"
import { Ticket } from "@/components/ticket"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import { handoffAbi } from "@/lib/abi"
import { arc, arcTestnet, handoffAddress } from "@/lib/chains"
import { formatUsdc, shortAddress } from "@/lib/format"
import { asJob, statusLabel } from "@/lib/job-rules"
import { useHandoffNetwork, useRememberedJobs } from "@/lib/storage"

const PAGE = 25

export function JobList() {
  const { kind } = useHandoffNetwork()
  const chain = kind === "mainnet" ? arc : arcTestnet
  const handoff = handoffAddress(chain.id)
  const remembered = useRememberedJobs().filter((item) => item.chainId === chain.id)
  const [lookup, setLookup] = useState("")
  const router = useRouter()

  const nextIdQuery = useReadContract({
    chainId: chain.id,
    address: handoff,
    abi: handoffAbi,
    functionName: "nextId",
    query: { enabled: Boolean(handoff), refetchInterval: 8_000 },
  })

  const ids = useMemo(() => {
    const nextId = nextIdQuery.data
    if (nextId === undefined || nextId <= 1n) return [] as bigint[]
    const start = nextId > BigInt(PAGE + 1) ? nextId - BigInt(PAGE) : 1n
    const values: bigint[] = []
    for (let id = nextId - 1n; id >= start; id--) values.push(id)
    return values
  }, [nextIdQuery.data])

  const jobsQuery = useReadContracts({
    contracts: ids.map((id) => ({
      chainId: chain.id,
      address: handoff,
      abi: handoffAbi,
      functionName: "getJob" as const,
      args: [id] as const,
    })),
    query: { enabled: Boolean(handoff) && ids.length > 0, refetchInterval: 8_000 },
  })

  if (!handoff) {
    return (
      <div className="max-w-xl rounded-xl border border-dashed border-border bg-card px-6 py-10">
        <h1 className="font-serif text-3xl tracking-tight">No contract on {chain.name} yet.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Deploy Handoff, put the address in .env.local, and restart the app. Tickets you fund will show up here.
        </p>
        <Link href="/jobs/new" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 w-fit px-4")}>
          Write a ticket
        </Link>
      </div>
    )
  }

  const lookupId = lookup.trim()
  const recent = (jobsQuery.data ?? []).flatMap((row, index) => {
    if (row.status !== "success") return []
    const job = asJob(row.result)
    if (!job) return []
    return [{ id: ids[index].toString(), job }]
  })

  return (
    <div className="grid gap-8">
      <form
        className="flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (/^\d+$/.test(lookupId)) router.push(`/jobs/${lookupId}`)
        }}
      >
        <Input
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          inputMode="numeric"
          placeholder="Open ticket number"
          aria-label="Ticket number"
          className="h-11 bg-card"
        />
        <Button type="submit" className="h-11 px-4" disabled={!/^\d+$/.test(lookupId)}>
          Open
        </Button>
      </form>

      {remembered.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-medium">Funded in this browser</h2>
          <ul className="grid gap-2 text-sm">
            {remembered.map((item) => (
              <li key={`${item.chainId}-${item.id}`}>
                <Link href={`/jobs/${item.id}`} className="underline underline-offset-4">
                  Ticket {item.id}
                  {item.title ? ` · ${item.title}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {nextIdQuery.isPending ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
      ) : nextIdQuery.isError ? (
        <div className="max-w-xl rounded-xl border border-dashed border-border bg-card px-6 py-8">
          <h2 className="font-serif text-2xl">The Arc RPC did not answer.</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Check the connection, then reload. {chain.name} is chain id {chain.id}.
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void nextIdQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : recent.length === 0 ? (
        <div className="max-w-xl rounded-xl border border-dashed border-border bg-card px-6 py-10">
          <h2 className="font-serif text-3xl tracking-tight">No tickets yet.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The contract is there, and nobody has locked USDC in it. The first funded job becomes ticket 1.
          </p>
          <Link href="/jobs/new" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 w-fit px-4")}>
            Write the first ticket
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {recent.map(({ id, job }) => (
            <Ticket
              key={id}
              href={`/jobs/${id}`}
              eyebrow={`Ticket ${id} · ${shortAddress(job.payee)}`}
              title={job.title}
              amount={formatUsdc(job.amount)}
              status={statusLabel(job.status)}
              rows={[
                { label: "Client", value: shortAddress(job.client) },
                { label: "Payee", value: shortAddress(job.payee) },
              ]}
            />
          ))}
          {nextIdQuery.data && nextIdQuery.data > BigInt(PAGE + 1) ? (
            <p className="text-sm text-muted-foreground">Showing the latest {PAGE} tickets. Open an older one by number.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
