import { getAddress, isAddress } from "viem"
import { byteLength, parseUsdc } from "@/lib/format"

export const ZERO = "0x0000000000000000000000000000000000000000"
export const MIN_REVIEW_WINDOW = 60
export const MAX_REVIEW_WINDOW = 7_776_000
export const MAX_DEADLINE_HORIZON = 31_536_000
export const MAX_TITLE_BYTES = 80
export const MAX_PROOF_BYTES = 200

export const Status = {
  None: 0,
  Funded: 1,
  Delivered: 2,
  Disputed: 3,
  Released: 4,
  Refunded: 5,
} as const

export const REVIEW_WINDOWS = [
  { seconds: 120, label: "2 minutes", note: "demo" },
  { seconds: 3_600, label: "1 hour", note: "" },
  { seconds: 86_400, label: "1 day", note: "" },
  { seconds: 259_200, label: "3 days", note: "usual" },
  { seconds: 604_800, label: "7 days", note: "" },
] as const

export type Job = {
  client: `0x${string}`
  payee: `0x${string}`
  releaser: `0x${string}`
  arbitrator: `0x${string}`
  amount: bigint
  deadline: bigint
  reviewWindow: bigint
  fundedAt: bigint
  deliveredAt: bigint
  status: number
  title: string
  proof: string
}

export type DraftInput = {
  title: string
  payee: string
  amount: string
  reviewWindow: number
  deadline: string
  releaser: string
  arbitrator: string
}

export type ParsedDraft = {
  title: string
  payee: `0x${string}`
  amount: bigint
  reviewWindow: number
  deadline: number
  releaser: `0x${string}` | null
  arbitrator: `0x${string}` | null
}

export function sameAddress(a?: string, b?: string) {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

export function isZero(address?: string) {
  return !address || address.toLowerCase() === ZERO
}

function asAccount(value: string): `0x${string}` | null {
  const trimmed = value.trim()
  if (!trimmed || !isAddress(trimmed) || isZero(trimmed)) return null
  return getAddress(trimmed)
}

export function validateDraft(input: DraftInput, nowSec: number | null, client?: string) {
  const errors: Partial<Record<keyof DraftInput, string>> = {}
  const title = input.title.trim()
  const titleBytes = byteLength(title)
  if (titleBytes === 0 || titleBytes > MAX_TITLE_BYTES) {
    errors.title = "Use a title between 1 and 80 bytes."
  }

  const payee = asAccount(input.payee)
  if (!payee) errors.payee = "Enter the payee's wallet address."
  else if (client && sameAddress(payee, client)) {
    errors.payee = "The payee has to be a different wallet."
  }

  const amount = parseUsdc(input.amount)
  if (amount === null) errors.amount = "Enter a USDC amount with up to 6 decimals."

  if (
    !Number.isInteger(input.reviewWindow) ||
    input.reviewWindow < MIN_REVIEW_WINDOW ||
    input.reviewWindow > MAX_REVIEW_WINDOW
  ) {
    errors.reviewWindow = "Pick a review window between 1 minute and 90 days."
  }

  let deadline = 0
  if (input.deadline.trim()) {
    const parsed = new Date(input.deadline).getTime()
    if (Number.isNaN(parsed)) errors.deadline = "That deadline is not a real date."
    else {
      deadline = Math.floor(parsed / 1000)
      if (nowSec !== null && deadline <= nowSec + 60) {
        errors.deadline = "Put the deadline at least a minute out."
      } else if (nowSec !== null && deadline > nowSec + MAX_DEADLINE_HORIZON) {
        errors.deadline = "The deadline has to fall within a year."
      }
    }
  }

  const releaserRaw = input.releaser.trim()
  let releaser: `0x${string}` | null = null
  if (releaserRaw) {
    releaser = asAccount(releaserRaw)
    if (!releaser) errors.releaser = "Enter a wallet address, or leave this blank."
    else if (payee && sameAddress(releaser, payee)) {
      errors.releaser = "The agent cannot be the payee."
    } else if (client && sameAddress(releaser, client)) {
      errors.releaser = "That is your wallet. Leave this blank if you will release it yourself."
    }
  }

  const arbitratorRaw = input.arbitrator.trim()
  let arbitrator: `0x${string}` | null = null
  if (arbitratorRaw) {
    arbitrator = asAccount(arbitratorRaw)
    if (!arbitrator) errors.arbitrator = "Enter a wallet address, or leave this blank."
    else if (client && sameAddress(arbitrator, client)) {
      errors.arbitrator = "The arbitrator has to be someone else."
    } else if (payee && sameAddress(arbitrator, payee)) {
      errors.arbitrator = "The arbitrator cannot be the payee."
    }
  }

  const value: ParsedDraft | undefined =
    Object.keys(errors).length === 0 && payee && amount !== null
      ? {
          title,
          payee,
          amount,
          reviewWindow: input.reviewWindow,
          deadline,
          releaser,
          arbitrator,
        }
      : undefined

  return { errors, value }
}

export function canRefund(job: Job, account?: string) {
  return sameAddress(account, job.client) && job.status === Status.Funded
}

export function canDeliver(job: Job, account?: string, now = 0) {
  if (!sameAddress(account, job.payee) || job.status !== Status.Funded) return false
  if (job.deadline !== 0n && BigInt(now) > job.deadline) return false
  return true
}

export function canRelease(job: Job, account?: string) {
  if (!account) return false
  const client = sameAddress(account, job.client)
  if (job.status === Status.Disputed) return client
  if (job.status !== Status.Delivered) return false
  if (client) return true
  return !isZero(job.releaser) && sameAddress(account, job.releaser)
}

export function canClaim(job: Job, account?: string, now = 0) {
  if (!sameAddress(account, job.payee) || job.status !== Status.Delivered) return false
  if (job.deliveredAt === 0n) return false
  return BigInt(now) >= job.deliveredAt + job.reviewWindow
}

export function canDispute(job: Job, account?: string, now = 0) {
  if (isZero(job.arbitrator)) return false
  if (!sameAddress(account, job.client) || job.status !== Status.Delivered) return false
  if (job.deliveredAt === 0n) return false
  return BigInt(now) < job.deliveredAt + job.reviewWindow
}

export function canAcceptRefund(job: Job, account?: string) {
  return sameAddress(account, job.payee) && job.status === Status.Disputed
}

export function canResolve(job: Job, account?: string) {
  return !isZero(job.arbitrator) && sameAddress(account, job.arbitrator) && job.status === Status.Disputed
}

export function statusLabel(status: number) {
  switch (status) {
    case Status.Funded:
      return "Funded"
    case Status.Delivered:
      return "Delivered"
    case Status.Disputed:
      return "Disputed"
    case Status.Released:
      return "Released"
    case Status.Refunded:
      return "Refunded"
    default:
      return "Unknown"
  }
}

export function asJob(value: unknown): Job | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.title !== "string" || typeof row.client !== "string") return null
  return {
    client: row.client as `0x${string}`,
    payee: row.payee as `0x${string}`,
    releaser: row.releaser as `0x${string}`,
    arbitrator: row.arbitrator as `0x${string}`,
    amount: BigInt(row.amount as bigint),
    deadline: BigInt(row.deadline as bigint),
    reviewWindow: BigInt(row.reviewWindow as bigint),
    fundedAt: BigInt(row.fundedAt as bigint),
    deliveredAt: BigInt(row.deliveredAt as bigint),
    status: Number(row.status),
    title: row.title,
    proof: typeof row.proof === "string" ? row.proof : "",
  }
}
