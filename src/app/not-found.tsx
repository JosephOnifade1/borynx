import Link from "next/link";
import { routes } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-16">
      <div className="panel mx-auto max-w-lg rounded-lg p-8 text-center">
        <p className="eyebrow">404 · no ledger entry</p>
        <h1 className="display mt-2 text-[26px]">Nothing lives at this path</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">Legacy and malformed links are normalised automatically, so this one is probably deleted or never existed. Try ⌘K to jump anywhere.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={routes.home()} className="btn btn-primary">Front page</Link>
          <Link href={routes.spaces()} className="btn">Spaces</Link>
          <Link href={routes.leads()} className="btn">Leads</Link>
        </div>
      </div>
    </div>
  );
}
