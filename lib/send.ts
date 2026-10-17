import { erc20Abi, parseEventLogs, type Address, type Hex } from "viem"
import { getPublicClient, getWalletClient, switchChain } from "wagmi/actions"
import { handoffAbi } from "@/lib/abi"
import { chainById } from "@/lib/chains"
import { feeFromBase } from "@/lib/fees"
import { wagmiConfig } from "@/lib/wagmi"

async function prepared(chainId: number) {
  const chain = chainById(chainId)
  await switchChain(wagmiConfig, { chainId: chain.id })
  const wallet = await getWalletClient(wagmiConfig, { chainId: chain.id })
  const publicClient = getPublicClient(wagmiConfig, { chainId: chain.id })
  if (!wallet?.account || !publicClient) throw new Error("Connect a wallet on Arc first.")
  const block = await publicClient.getBlock()
  const fees = feeFromBase(block.baseFeePerGas ?? null)
  return { chain, wallet, publicClient, fees }
}

export async function approveUsdc(chainId: number, token: Address, spender: Address, amount: bigint) {
  const { chain, wallet, publicClient, fees } = await prepared(chainId)
  const hash = await wallet.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
    chain,
    account: wallet.account,
    ...fees,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error("The USDC approval reverted.")
  return hash
}

export async function readAllowance(chainId: number, token: Address, owner: Address, spender: Address) {
  const chain = chainById(chainId)
  const publicClient = getPublicClient(wagmiConfig, { chainId: chain.id })
  if (!publicClient) throw new Error("Arc RPC is not configured.")
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  })
}

type JobCall =
  | { functionName: "deliver"; args: readonly [bigint, string] }
  | { functionName: "release"; args: readonly [bigint] }
  | { functionName: "claim"; args: readonly [bigint] }
  | { functionName: "refund"; args: readonly [bigint] }
  | { functionName: "dispute"; args: readonly [bigint] }
  | { functionName: "acceptRefund"; args: readonly [bigint] }
  | { functionName: "resolve"; args: readonly [bigint, boolean] }

export async function sendJobCall(chainId: number, address: Address, request: JobCall) {
  const { chain, wallet, publicClient, fees } = await prepared(chainId)
  const shared = {
    address,
    abi: handoffAbi,
    chain,
    account: wallet.account,
    ...fees,
  } as const

  if (request.functionName === "deliver") {
    await publicClient.simulateContract({ ...shared, functionName: "deliver", args: request.args })
  } else if (request.functionName === "release") {
    await publicClient.simulateContract({ ...shared, functionName: "release", args: request.args })
  } else if (request.functionName === "claim") {
    await publicClient.simulateContract({ ...shared, functionName: "claim", args: request.args })
  } else if (request.functionName === "refund") {
    await publicClient.simulateContract({ ...shared, functionName: "refund", args: request.args })
  } else if (request.functionName === "dispute") {
    await publicClient.simulateContract({ ...shared, functionName: "dispute", args: request.args })
  } else if (request.functionName === "acceptRefund") {
    await publicClient.simulateContract({
      ...shared,
      functionName: "acceptRefund",
      args: request.args,
    })
  } else {
    await publicClient.simulateContract({ ...shared, functionName: "resolve", args: request.args })
  }

  let hash: Hex
  switch (request.functionName) {
    case "deliver":
      hash = await wallet.writeContract({ ...shared, functionName: "deliver", args: request.args })
      break
    case "release":
      hash = await wallet.writeContract({ ...shared, functionName: "release", args: request.args })
      break
    case "claim":
      hash = await wallet.writeContract({ ...shared, functionName: "claim", args: request.args })
      break
    case "refund":
      hash = await wallet.writeContract({ ...shared, functionName: "refund", args: request.args })
      break
    case "dispute":
      hash = await wallet.writeContract({ ...shared, functionName: "dispute", args: request.args })
      break
    case "acceptRefund":
      hash = await wallet.writeContract({
        ...shared,
        functionName: "acceptRefund",
        args: request.args,
      })
      break
    case "resolve":
      hash = await wallet.writeContract({ ...shared, functionName: "resolve", args: request.args })
      break
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error("The transaction reverted.")
  return hash
}

export async function fundJob(params: {
  chainId: number
  handoff: Address
  usdc: Address
  payee: Address
  releaser: Address
  arbitrator: Address
  amount: bigint
  deadline: bigint
  reviewWindow: bigint
  title: string
  onPhase?: (phase: "approve" | "fund") => void
}) {
  const { chain, wallet, publicClient, fees } = await prepared(params.chainId)
  const allowance = await publicClient.readContract({
    address: params.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [wallet.account.address, params.handoff],
  })
  if (allowance < params.amount) {
    params.onPhase?.("approve")
    const approval = await wallet.writeContract({
      address: params.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [params.handoff, params.amount],
      chain,
      account: wallet.account,
      ...fees,
    })
    const approved = await publicClient.waitForTransactionReceipt({ hash: approval })
    if (approved.status !== "success") throw new Error("The USDC approval reverted.")
  }

  const args = [
    params.payee,
    params.releaser,
    params.arbitrator,
    params.amount,
    params.deadline,
    params.reviewWindow,
    params.title,
  ] as const

  await publicClient.simulateContract({
    address: params.handoff,
    abi: handoffAbi,
    functionName: "createAndFund",
    args,
    account: wallet.account,
  })

  params.onPhase?.("fund")
  const latest = feeFromBase((await publicClient.getBlock()).baseFeePerGas ?? null)
  const hash = await wallet.writeContract({
    address: params.handoff,
    abi: handoffAbi,
    functionName: "createAndFund",
    args,
    chain,
    account: wallet.account,
    ...latest,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error("Funding reverted.")
  const funded = parseEventLogs({
    abi: handoffAbi,
    logs: receipt.logs,
    eventName: "JobFunded",
  })
  const id = funded[0]?.args.id
  if (id === undefined) throw new Error("The ticket was funded, but the receipt had no job id.")
  return { hash, id }
}
