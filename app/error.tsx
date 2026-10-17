"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-4xl tracking-tight">This page did not finish loading.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        The view failed before it could read the ticket. Try it again.
      </p>
      <Button type="button" className="mt-6 h-11 px-4" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
