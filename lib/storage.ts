"use client"

import { useMemo, useSyncExternalStore } from "react"

export type RememberedJob = {
  chainId: number
  id: string
  hash?: string
  title?: string
}

const NETWORK_KEY = "handoff.network"
const JOBS_KEY = "handoff.jobs"

function subscribe(event: string, callback: () => void) {
  const onChange = () => callback()
  window.addEventListener("storage", onChange)
  window.addEventListener(event, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(event, onChange)
  }
}

export type NetworkKind = "testnet" | "mainnet"

function readNetworkKind(): NetworkKind {
  return localStorage.getItem(NETWORK_KEY) === "mainnet" ? "mainnet" : "testnet"
}

export function useHandoffNetwork() {
  const kind = useSyncExternalStore(
    (callback) => subscribe("handoff-network", callback),
    readNetworkKind,
    (): NetworkKind => "testnet",
  )
  return {
    kind,
    setKind(next: "testnet" | "mainnet") {
      localStorage.setItem(NETWORK_KEY, next)
      window.dispatchEvent(new Event("handoff-network"))
    },
  }
}

function parseJobs(raw: string): RememberedJob[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const row = item as RememberedJob
      if (typeof row.chainId !== "number" || typeof row.id !== "string") return []
      return [
        {
          chainId: row.chainId,
          id: row.id,
          hash: typeof row.hash === "string" ? row.hash : undefined,
          title: typeof row.title === "string" ? row.title : undefined,
        },
      ]
    })
  } catch {
    return []
  }
}

export function useRememberedJobs() {
  const raw = useSyncExternalStore(
    (callback) => subscribe("handoff-jobs", callback),
    () => localStorage.getItem(JOBS_KEY) ?? "",
    () => "",
  )
  return useMemo(() => parseJobs(raw), [raw])
}

export function rememberJob(job: RememberedJob) {
  const current = parseJobs(localStorage.getItem(JOBS_KEY) ?? "")
  const next = [
    job,
    ...current.filter((item) => !(item.chainId === job.chainId && item.id === job.id)),
  ].slice(0, 40)
  localStorage.setItem(JOBS_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event("handoff-jobs"))
}
