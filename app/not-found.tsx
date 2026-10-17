import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-4xl tracking-tight">That page is not a ticket.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Handoff only has the desk, the new-ticket form, and numbered jobs.
      </p>
      <Link href="/" className="mt-6 inline-flex text-sm underline underline-offset-4">
        Back to the desk
      </Link>
    </div>
  );
}
