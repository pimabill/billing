import { cn } from "@/lib/utils/cn";

/** Logos in /public/providers. Providers without one get a monogram tile in their colour. */
const LOGOS: Record<string, string> = {
  stripe: "stripe.svg",
  paypal: "paypal.svg",
  flutterwave: "flutterwave.png",
  paystack: "paystack.png",
  dpo: "dpo.png",
  payu: "payu.png",
  yo: "yo.png",
  mtn_momo: "mtn_momo.svg",
  airtel_money: "airtel_money.svg",
  eversend: "eversend.png",
  tron_usdt: "tron_usdt.png",
  eth_usdt: "eth_usdt.svg",
  bsc_usdt: "bsc_usdt.svg",
  btc: "btc.svg",
  binance_pay: "binance_pay.svg",
};

const MONOGRAMS: Record<string, { mark: string; color: string }> = {
  pesapal: { mark: "Pp", color: "bg-[#19a64c]" },
  nowpayments: { mark: "NP", color: "bg-[#2a2d3e]" },
  managed: { mark: "M", color: "bg-primary" },
};

const SIZES = { sm: "h-7 w-7 rounded-md p-1 text-[10px]", md: "h-11 w-11 rounded-xl p-1.5 text-sm" } as const;

export function ProviderLogo({ code, name, size = "md", className }: { code: string; name?: string; size?: keyof typeof SIZES; className?: string }) {
  const logo = LOGOS[code];
  if (logo) {
    return (
      <span aria-hidden className={cn("flex shrink-0 items-center justify-center overflow-hidden border shadow-sm", SIZES[size], code === "mtn_momo" ? "bg-[#ffcb05]" : "bg-white", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/providers/${logo}`} alt="" className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  const m = MONOGRAMS[code] ?? { mark: (name ?? code).slice(0, 2), color: "bg-slate-500" };
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center font-bold text-white shadow-sm", SIZES[size], m.color, className)}>
      {m.mark}
    </span>
  );
}
