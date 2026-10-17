import type { Metadata } from "next";
import { JobPageClient } from "@/components/job-page";

export const metadata: Metadata = {
  title: "Ticket",
};

export default function JobPage() {
  return <JobPageClient />;
}
