import type { Metadata } from "next";
import { JobForm } from "@/components/job-form";

export const metadata: Metadata = {
  title: "New ticket",
};

export default function NewJobPage() {
  return (
    <div className="grid gap-8">
      <div className="max-w-2xl">
        <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Write a ticket</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          One payee, one amount. Funding it moves USDC into the contract. You get it back only if
          you refund before delivery.
        </p>
      </div>
      <JobForm />
    </div>
  );
}
