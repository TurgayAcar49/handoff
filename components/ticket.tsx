import Link from "next/link"
import { cn } from "cn"

const tones: Record<string, string> = {
  Funded: "border-gold text-gold",
  Delivered: "border-foreground text-foreground",
  Disputed: "border-wax text-wax",
  Released: "border-stamp text-stamp",
  Refunded: "border-muted-foreground text-muted-foreground",
  Sample: "border-gold text-gold",
}

export function Ticket({
  eyebrow,
  title,
  amount,
  status,
  rows,
  href,
}: {
  eyebrow: string
  title: string
  amount: string
  status: string
  rows: { label: string; value: string }[]
  href?: string
}) {
  const body = (
    <article className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_16px_40px_rgba(28,23,18,0.05)]">
      <div className="grid md:grid-cols-[11rem_1fr]">
        <div className="border-b border-dashed border-border px-5 py-5 md:border-r md:border-b-0">
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">USDC</p>
          <p className="mt-2 font-serif text-4xl leading-none tracking-tight">{amount}</p>
          <p className="mt-3 text-xs text-muted-foreground">{eyebrow}</p>
        </div>
        <div className="px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-serif text-2xl leading-tight tracking-tight">{title}</h2>
            <p
              className={cn(
                "shrink-0 rounded-md border-2 px-2 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase",
                tones[status] ?? tones.Funded,
              )}
            >
              {status}
            </p>
          </div>
          <dl className="mt-4 grid gap-2 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 break-all">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </article>
  )

  if (!href) return body
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {body}
    </Link>
  )
}
