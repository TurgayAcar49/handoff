"use client"

import { useParams } from "next/navigation"
import { JobView } from "@/components/job-view"

export function JobPageClient() {
  const params = useParams<{ id: string }>()
  const id = typeof params.id === "string" ? params.id : ""
  return <JobView id={id} />
}
