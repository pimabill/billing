import { Check, ShieldCheck } from "lucide-react";

/* "Pima" is Swahili for measure: a tally of bars, climbing like a reading. */
export function TallyArt({ className = "", bars = 46, id = "tally" }: { className?: string; bars?: number; id?: string }) {
  const width = 900;
  const height = 780;
  const step = width / bars;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden preserveAspectRatio="xMaxYMin slice">
      <defs>
        <linearGradient id={`${id}-colour`} gradientUnits="userSpaceOnUse" x1="0" y1={height} x2={width} y2="0">
          <stop offset="0" stopColor="#0e6e6b" />
          <stop offset="0.32" stopColor="#14b8a6" />
          <stop offset="0.58" stopColor="#7ddc8c" />
          <stop offset="0.78" stopColor="#ffc857" />
          <stop offset="1" stopColor="#ff7a45" />
        </linearGradient>
      </defs>
      {Array.from({ length: bars }, (_, i) => {
        const t = i / (bars - 1);
        const barHeight = Math.round(70 + 660 * Math.pow(t, 1.5) + 34 * Math.sin(i * 1.7) * (0.3 + t));
        const top = Math.round(height * 0.84 * (1 - Math.pow(t, 0.8)));
        return (
          <rect
            key={i}
            className="tally-bar"
            style={{ animationDelay: `${i * 14}ms` }}
            x={(i * step).toFixed(1)}
            y={top}
            width={(step * 0.62).toFixed(1)}
            height={barHeight}
            rx={(step * 0.31).toFixed(1)}
            fill={`url(#${id}-colour)`}
          />
        );
      })}
    </svg>
  );
}

/** A mobile money PIN prompt, as a customer sees it. */
export function PhonePrompt({ className = "" }: { className?: string }) {
  return (
    <div className={`w-56 rounded-[2.2rem] bg-ink p-2 shadow-card ${className}`} aria-hidden>
      <div className="rounded-[1.75rem] bg-white px-4 pb-5 pt-6 text-center text-[#10141b]">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#ffcb05] p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/providers/mtn_momo.svg" alt="" className="max-h-full max-w-full" />
        </span>
        <p className="mt-3 text-xs text-[#5b6670]">Pay Acme Internet</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">UGX 55,000</p>
        <p className="mt-1 text-xs text-[#5b6670]">Growth plan, November</p>
        <div className="mt-4 flex justify-center gap-2">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={`h-2.5 w-2.5 rounded-full ${n < 3 ? "bg-[#10141b]" : "bg-[#dfe5e3]"}`} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[#5b6670]">Enter your PIN</p>
        <span className="mt-4 block rounded-full bg-[#0e6e6b] py-2 text-xs font-semibold text-white">Approve</span>
      </div>
    </div>
  );
}

export function LedgerCard({ className = "" }: { className?: string }) {
  const lines = [
    ["Collected", "1,250,000"],
    ["Paid out", "−840,000"],
    ["Provider fees", "−18,750"],
  ];
  return (
    <div className={`w-72 rounded-2xl border border-line bg-white p-5 shadow-card ${className}`} aria-hidden>
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span className="font-medium text-ink">Ledger, this month</span>
        <span>Example</span>
      </div>
      <dl className="mt-3 text-sm tabular-nums">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-line py-2">
            <dt className="text-ink-2">{label}</dt>
            <dd className="font-medium">UGX {value}</dd>
          </div>
        ))}
        <div className="flex justify-between pt-2.5 font-semibold">
          <dt>Balance</dt>
          <dd className="text-teal">UGX 391,250</dd>
        </div>
      </dl>
    </div>
  );
}

export function PaidToast({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-full border border-line bg-white py-2 pl-2 pr-4 shadow-card ${className}`} aria-hidden>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal text-white">
        <Check className="h-4 w-4" />
      </span>
      <span className="text-sm leading-tight">
        <span className="block font-semibold">Paid</span>
        <span className="block text-xs text-ink-2">Posted to the ledger</span>
      </span>
    </div>
  );
}

/** Ways to pay, as a hosted checkout lists them. */
export function CheckoutCard({ className = "" }: { className?: string }) {
  const methods: [string, string, string][] = [
    ["MTN MoMo", "/providers/mtn_momo.svg", "bg-[#ffcb05]"],
    ["Airtel Money", "/providers/airtel_money.svg", "bg-white"],
    ["Card", "/providers/flutterwave.png", "bg-white"],
    ["USDT on TRON", "/providers/tron_usdt.png", "bg-white"],
  ];
  return (
    <div className={`w-72 rounded-2xl border border-line bg-white p-4 shadow-card ${className}`} aria-hidden>
      <p className="text-xs text-ink-2">Invoice INV-0142</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight">UGX 120,000</p>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {methods.map(([name, logo, background], i) => (
          <li key={name} className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${i === 0 ? "border-teal bg-teal-soft/50" : "border-line"}`}>
            <span className={`flex h-6 w-6 items-center justify-center overflow-hidden rounded-md p-0.5 ${background}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
            </span>
            <span className="font-medium">{name}</span>
          </li>
        ))}
      </ul>
      <span className="mt-3 block rounded-lg bg-ink py-2 text-center text-sm font-semibold text-white">Pay now</span>
    </div>
  );
}

export function JournalCard() {
  const lines = [
    ["Provider clearing", "+120,000"],
    ["Merchant payable", "−115,200"],
    ["Commission", "−4,800"],
  ];
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card" aria-hidden>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Collection confirmed</span>
        <span className="rounded-md bg-teal-soft px-1.5 py-0.5 font-medium text-teal">Balanced</span>
      </div>
      <dl className="mt-2 font-mono text-xs tabular-nums">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between border-t border-line py-1.5">
            <dt className="text-ink-2">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TerminalCard() {
  return (
    <pre className="overflow-hidden rounded-xl bg-night p-4 font-mono text-xs leading-6 text-night-ink shadow-card" aria-hidden>
      <span className="text-night-ink-2">$ </span>git clone pimabill/billing{"\n"}
      <span className="text-night-ink-2">$ </span>docker compose up -d{"\n"}
      <span className="text-glow-plain">✓ api</span>        running{"\n"}
      <span className="text-glow-plain">✓ dashboard</span>  running
    </pre>
  );
}

export function WebhookCard() {
  const rows = ["invoice.paid", "payment.succeeded", "payout.completed"];
  return (
    <div className="rounded-xl border border-line bg-white p-2 shadow-card" aria-hidden>
      {rows.map((event) => (
        <div key={event} className="flex items-center justify-between rounded-lg px-2.5 py-2 font-mono text-xs">
          <span>{event}</span>
          <span className="rounded bg-teal-soft px-1.5 py-0.5 font-medium text-teal">200</span>
        </div>
      ))}
    </div>
  );
}

export function TeamCard() {
  const people: [string, string, string][] = [
    ["AN", "Owner", "bg-[#0e6e6b]"],
    ["JO", "Finance", "bg-[#ff7a45]"],
    ["SK", "Developer", "bg-[#5b5bd6]"],
  ];
  return (
    <div className="rounded-xl border border-line bg-white p-2 shadow-card" aria-hidden>
      {people.map(([initials, role, colour]) => (
        <div key={role} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ${colour}`}>{initials}</span>
          <span className="font-medium">{role}</span>
          <ShieldCheck className="ml-auto h-4 w-4 text-ink-2" />
        </div>
      ))}
    </div>
  );
}

/** Money in, held, money out: managed payments as a flow. */
export function PayoutFlow() {
  const steps: [string, string][] = [
    ["Customer pays", "UGX 120,000"],
    ["We collect for you", "No provider contract"],
    ["Paid out to you", "Mobile money, bank or PayPal"],
  ];
  return (
    <ol className="flex flex-col gap-3 md:flex-row md:items-center" aria-hidden>
      {steps.map(([title, detail], i) => (
        <li key={title} className="flex flex-1 items-center gap-3">
          <div className="flex-1 rounded-xl border border-line bg-white p-3.5 shadow-card">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-xs text-ink-2">{detail}</p>
          </div>
          {i < steps.length - 1 && <span className="hidden h-px w-5 bg-teal md:block" />}
        </li>
      ))}
    </ol>
  );
}
