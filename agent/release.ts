import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { handoffAbi } from "../lib/abi"
import { arc, arcTestnet, chainById, txUrl } from "../lib/chains"
import { explainError } from "../lib/errors"
import { feeFromBase } from "../lib/fees"
import { asJob, statusLabel } from "../lib/job-rules"

function arg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const network = arg("--network") ?? "testnet"
const jobArg = arg("--job")
const confirmMainnet = process.argv.includes("--confirm-mainnet")

if (network !== "testnet" && network !== "mainnet") {
  console.error("Pass --network testnet or --network mainnet.")
  process.exit(1)
}
if (!jobArg || !/^\d+$/.test(jobArg)) {
  console.error("Pass --job <id>.")
  process.exit(1)
}
if (network === "mainnet" && !confirmMainnet) {
  console.error("Mainnet spends real USDC. Re-run with --confirm-mainnet after you have reviewed the job.")
  process.exit(1)
}

const chain = network === "mainnet" ? arc : arcTestnet
const address = (process.env.HANDOFF_ADDRESS ||
  (network === "mainnet"
    ? process.env.NEXT_PUBLIC_HANDOFF_MAINNET
    : process.env.NEXT_PUBLIC_HANDOFF_TESTNET)) as `0x${string}` | undefined
const key = process.env.RELEASER_PRIVATE_KEY

if (!address) {
  console.error("Set HANDOFF_ADDRESS to the deployed contract.")
  process.exit(1)
}
if (!key) {
  console.error("Set RELEASER_PRIVATE_KEY to the client or the named agent. It is not printed.")
  process.exit(1)
}

const account = privateKeyToAccount(key as `0x${string}`)
const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) })
const wallet = createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0]) })
const jobId = BigInt(jobArg)

const raw = await publicClient.readContract({
  address,
  abi: handoffAbi,
  functionName: "getJob",
  args: [jobId],
})
const job = asJob(raw)
if (!job) {
  console.error("Could not read that ticket.")
  process.exit(1)
}

console.log(`Ticket ${jobId.toString()} is ${statusLabel(job.status)} on ${chain.name} (${chainById(chain.id).id}).`)
console.log(`Signer ${account.address}`)
if (job.status !== 2) {
  console.error("Release only runs while the ticket is Delivered. Nothing was sent.")
  process.exit(1)
}

try {
  await publicClient.simulateContract({
    address,
    abi: handoffAbi,
    functionName: "release",
    args: [jobId],
    account,
  })
  const fees = feeFromBase((await publicClient.getBlock()).baseFeePerGas ?? null)
  const hash = await wallet.writeContract({
    address,
    abi: handoffAbi,
    functionName: "release",
    args: [jobId],
    account,
    chain,
    ...fees,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log(receipt.status === "success" ? "Released." : "Reverted.")
  console.log(txUrl(chain.id, hash))
  if (receipt.status !== "success") process.exit(1)
} catch (error) {
  console.error(explainError(error))
  process.exit(1)
}
