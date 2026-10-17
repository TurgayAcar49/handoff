import Link from "next/link";
import { Ticket } from "@/components/ticket";

const rules = [
  {
    title: "Refunds stay open until delivery",
    body: "The client can take the full amount back while the job is still funded. Marking it delivered closes that door.",
  },
  {
    title: "The review window is the clock",
    body: "After delivery, the client can release early. When the window ends, the payee claims the USDC. A dispute exists only if an arbitrator was named up front.",
  },
  {
    title: "An agent can pay it out",
    body: "A deploy script, a webhook, or another wallet can be allowed to release the fee. It cannot override a dispute.",
  },
];

export default function HomePage() {
  return (
    <div className="grid gap-16">
      <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div>
          <p className="text-sm tracking-[0.16em] text-muted-foreground uppercase">
            USDC escrow on Arc
          </p>
          <h1 className="mt-3 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
            The USDC waits until the work lands.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
            Handoff is a job ticket. A client locks USDC in the contract. The payee delivers a
            note. The client releases the fee, or the payee claims it when the review window closes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/jobs/new"
              className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Write a ticket
            </Link>
            <Link
              href="/jobs"
              className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium"
            >
              See tickets
            </Link>
          </div>
        </div>
        <Ticket
          eyebrow="Sample · not onchain"
          title="Brand illustrations for the October drop"
          amount="1,800.00"
          status="Sample"
          rows={[
            { label: "Client", value: "0x1111…1111" },
            { label: "Payee", value: "0x2222…2222" },
            { label: "Review", value: "3 days" },
            { label: "Deadline", value: "None" },
            { label: "Agent", value: "None" },
          ]}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {rules.map((rule, index) => (
          <article key={rule.title} className="rounded-xl border border-border bg-card p-5">
            <p className="font-mono text-xs text-muted-foreground">0{index + 1}</p>
            <h2 className="mt-3 font-serif text-2xl leading-tight tracking-tight">{rule.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{rule.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 border-t border-border pt-8 text-sm text-muted-foreground sm:grid-cols-3">
        <p>Arc mainnet is chain 5042. Testnet is 5042002.</p>
        <p>USDC at 0x3600…0000 uses 6 decimals. Gas is the same USDC at 18 decimals.</p>
        <p>Leave a little USDC in the wallet. The network fee comes out of the balance you spend.</p>
      </section>
    </div>
  );
}
