import type { Metadata } from "next";
import { JobList } from "@/components/job-list";

export const metadata: Metadata = {
  title: "Tickets",
};

export default function JobsPage() {
  return (
    <div className="grid gap-8">
      <div className="max-w-2xl">
        <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Tickets</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Recent jobs on the selected network. A ticket funded on testnet stays on testnet.
        </p>
      </div>
      <JobList />
    </div>
  );
}
