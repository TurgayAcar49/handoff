import { BaseError, ContractFunctionRevertedError } from "viem"

const REVERT_COPY: Record<string, string> = {
  BadAmount: "Enter an amount greater than zero.",
  BadPayee: "The payee has to be a different wallet.",
  BadReleaser: "The agent cannot be the payee.",
  BadArbitrator: "The arbitrator has to be someone other than the client or the payee.",
  BadWindow: "The review window must be between 1 minute and 90 days.",
  BadDeadline: "The deadline has to be in the future, within a year.",
  BadTitle: "The title must be between 1 and 80 bytes.",
  BadProof: "The delivery note must be between 1 and 200 bytes.",
  UnknownJob: "That ticket does not exist.",
  BadStatus: "This ticket is not in the right state for that.",
  NotClient: "Only the client can do that.",
  NotPayee: "Only the payee can do that.",
  NotReleaser: "Only the client or the named agent can release this ticket.",
  NotArbitrator: "An arbitrator has to be named, and only they can settle a dispute.",
  TooEarly: "The review window is still open.",
  TooLate: "That window has closed.",
  TransferFailed: "The USDC transfer did not complete.",
  NoNative: "Send USDC with the token functions. Native transfers are rejected.",
  Reentered: "The token tried to call back into the contract.",
  BadDecimals: "The token must report 6 decimals.",
  BadToken: "On Arc, Handoff only accepts canonical USDC.",
  ZeroAddress: "That address is missing.",
}

export function explainError(error: unknown) {
  if (error instanceof BaseError) {
    const revert = error.walk((item) => item instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      if (name && REVERT_COPY[name]) return REVERT_COPY[name]
    }
    const lower = error.shortMessage.toLowerCase()
    if (lower.includes("user rejected") || lower.includes("denied")) {
      return "You rejected the request in the wallet."
    }
    if (lower.includes("insufficient")) {
      return "The wallet does not have enough USDC for the transfer and the network fee."
    }
    return error.shortMessage
  }
  if (error instanceof Error && error.message) return error.message
  return "Something went wrong."
}
