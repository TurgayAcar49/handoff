import assert from "node:assert/strict"
import { test } from "node:test"
import { GAS_BUFFER } from "./chains"
import { feeFromBase, MIN_MAX_FEE_PER_GAS } from "./fees"
import { formatUsdc, parseUsdc } from "./format"
import {
  canClaim,
  canDispute,
  canRefund,
  canRelease,
  Status,
  validateDraft,
  type Job,
} from "./job-rules"

const client = "0x1111111111111111111111111111111111111111" as const
const payee = "0x2222222222222222222222222222222222222222" as const
const agent = "0x3333333333333333333333333333333333333333" as const
const arbitrator = "0x4444444444444444444444444444444444444444" as const
const zero = "0x0000000000000000000000000000000000000000" as const

function job(overrides: Partial<Job> = {}): Job {
  return {
    client,
    payee,
    releaser: zero,
    arbitrator: zero,
    amount: 1_000_000n,
    deadline: 0n,
    reviewWindow: 100n,
    fundedAt: 1_000n,
    deliveredAt: 0n,
    status: Status.Funded,
    title: "Logo",
    proof: "",
    ...overrides,
  }
}

test("formats and parses USDC at 6 decimals", () => {
  assert.equal(parseUsdc("10"), 10_000_000n)
  assert.equal(parseUsdc("1.5"), 1_500_000n)
  assert.equal(parseUsdc("0.000001"), 1n)
  assert.equal(parseUsdc("0"), null)
  assert.equal(parseUsdc("1.1234567"), null)
  assert.equal(parseUsdc(""), null)
  assert.equal(formatUsdc(1_800_000_000n), "1,800.00")
  assert.equal(formatUsdc(1n), "0.000001")
})

test("keeps Arc's 20 gwei fee floor", () => {
  assert.equal(feeFromBase(1n).maxFeePerGas, MIN_MAX_FEE_PER_GAS)
  assert.equal(feeFromBase(30_000_000_000n).maxFeePerGas, 60_000_000_000n)
  assert.equal(GAS_BUFFER, 50_000n)
})

test("refund and release follow the ticket state", () => {
  const funded = job()
  assert.equal(canRefund(funded, client), true)
  assert.equal(canRefund(funded, payee), false)
  assert.equal(canRelease(funded, client), false)

  const delivered = job({
    status: Status.Delivered,
    deliveredAt: 2_000n,
    releaser: agent,
    arbitrator,
  })
  assert.equal(canRelease(delivered, client), true)
  assert.equal(canRelease(delivered, agent), true)
  assert.equal(canRelease(delivered, payee), false)
  assert.equal(canRefund(delivered, client), false)

  const disputed = job({ ...delivered, status: Status.Disputed })
  assert.equal(canRelease(disputed, client), true)
  assert.equal(canRelease(disputed, agent), false)
})

test("claim and dispute meet at the review window and do not overlap", () => {
  const delivered = job({
    status: Status.Delivered,
    deliveredAt: 1_000n,
    reviewWindow: 100n,
    arbitrator,
  })
  assert.equal(canClaim(delivered, payee, 1_099), false)
  assert.equal(canDispute(delivered, client, 1_099), true)
  assert.equal(canClaim(delivered, payee, 1_100), true)
  assert.equal(canDispute(delivered, client, 1_100), false)
  assert.equal(canDispute(job({ status: Status.Delivered, deliveredAt: 1_000n }), client, 1_050), false)
})

test("rejects a ticket the contract would reject", () => {
  const now = 1_800_000_000
  const bad = validateDraft(
    {
      title: "",
      payee: client,
      amount: "0",
      reviewWindow: 10,
      deadline: "",
      releaser: "",
      arbitrator: "",
    },
    now,
    client,
  )
  assert.ok(bad.errors.title)
  assert.ok(bad.errors.payee)
  assert.ok(bad.errors.amount)
  assert.ok(bad.errors.reviewWindow)
  assert.equal(bad.value, undefined)

  const good = validateDraft(
    {
      title: "Homepage",
      payee,
      amount: "25",
      reviewWindow: 3_600,
      deadline: "",
      releaser: agent,
      arbitrator,
    },
    now,
    client,
  )
  assert.deepEqual(good.errors, {})
  assert.equal(good.value?.amount, 25_000_000n)
  assert.equal(good.value?.deadline, 0)
})
