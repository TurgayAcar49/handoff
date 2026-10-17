/** Arc drops transactions whose maxFeePerGas is under 20 gwei. They never get a receipt. */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n

export function feeFromBase(baseFee: bigint | null) {
  const base = baseFee ?? MIN_MAX_FEE_PER_GAS
  const doubled = base * 2n
  const maxFeePerGas = doubled < MIN_MAX_FEE_PER_GAS ? MIN_MAX_FEE_PER_GAS : doubled
  const preferredPriority = 1_000_000_000n
  const maxPriorityFeePerGas =
    preferredPriority > maxFeePerGas ? maxFeePerGas : preferredPriority
  return { maxFeePerGas, maxPriorityFeePerGas }
}
