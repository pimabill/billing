import { cn } from "@/lib/utils/cn";
import { brand } from "@/lib/brand";

/**
 * The PimaBill mark: two readings, the second higher than the first. Drawn
 * in currentColor so it follows the surrounding text colour.
 */
export function BrandMark({ className, animated = false, tight = false }: { className?: string; animated?: boolean; tight?: boolean }) {
  // tight crops the margin around the readings (keeping room for the climb), for inline sizes like a button's 16px.
  return (
    <svg viewBox={tight ? "20 20 80 80" : "0 0 120 120"} aria-hidden className={cn("h-6 w-6", animated && "brand-mark-animated", className)}>
      <rect className="brand-mark-low" x="24" y="62" width="30" height="30" rx="6" fill="currentColor" fillOpacity={0.55} />
      <rect className="brand-mark-high" x="66" y="28" width="30" height="30" rx="6" fill="currentColor" />
    </svg>
  );
}

/** Full-area loading state: the mark climbing, with an accessible label. */
export function BrandLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center justify-center p-8 text-primary", className)}>
      <BrandMark animated className="h-12 w-12" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Mark and name: "Pima" in the text colour, "Bill" in the accent. */
export function BrandLockup({ className, accent = "text-primary" }: { className?: string; accent?: string }) {
  const name = brand.name;
  return (
    <span className={cn("inline-flex items-center gap-2 font-brand text-lg font-semibold tracking-tight", className)}>
      <BrandMark className={cn("h-7 w-7", accent)} />
      <span>
        {name.slice(0, brand.nameSplit)}
        <span className={accent}>{name.slice(brand.nameSplit)}</span>
      </span>
    </span>
  );
}
