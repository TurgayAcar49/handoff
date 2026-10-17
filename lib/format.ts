import { parseUnits } from "viem"

export function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

export function parseUsdc(input: string): bigint | null {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null
  const value = parseUnits(trimmed, 6)
  return value === 0n ? null : value
}

export function formatUsdc(amount: bigint) {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const whole = abs / 1_000_000n
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "")
  const fracShown = frac.length < 2 ? frac.padEnd(2, "0") : frac
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${negative ? "-" : ""}${wholeStr}.${fracShown}`
}

/** Native Arc balances use 18 decimals for the same USDC. Show the 6-decimal spendable amount. */
export function formatNativeUsdc(value: bigint) {
  return formatUsdc(value / 10n ** 12n)
}

export function shortAddress(address: string) {
  if (address.length < 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function formatDuration(seconds: number) {
  if (seconds <= 0) return "0 seconds"
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400
    return days === 1 ? "1 day" : `${days} days`
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600
    return hours === 1 ? "1 hour" : `${hours} hours`
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60
    return minutes === 1 ? "1 minute" : `${minutes} minutes`
  }
  return `${seconds} seconds`
}

export function formatRemaining(seconds: number) {
  if (seconds <= 0) return "now"
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const secs = seconds % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export function formatWhen(unixSeconds: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(unixSeconds * 1000))
}
