import { site } from "@/lib/site";

/**
 * The PimaBill mark: two readings, the second higher than the first. Drawn
 * in currentColor so it follows the surrounding text colour.
 */
export default function BrandMark({ className = "h-5 w-5", animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={animated ? `pima-animated ${className}` : className}>
      <rect className="pima-low" x="24" y="62" width="30" height="30" rx="6" fill="currentColor" fillOpacity={0.55} />
      <rect className="pima-high" x="66" y="28" width="30" height="30" rx="6" fill="currentColor" />
    </svg>
  );
}

/** Mark and name: "Pima" in ink, "Bill" in teal. */
export function BrandLockup({ className = "" }: { className?: string }) {
  const name = site.name;
  return (
    <span className={`inline-flex items-center gap-2 font-brand text-lg font-semibold tracking-tight ${className}`}>
      <BrandMark className="h-7 w-7 text-teal" />
      <span>
        {name.slice(0, site.nameSplit)}
        <span className="text-teal">{name.slice(site.nameSplit)}</span>
      </span>
    </span>
  );
}
