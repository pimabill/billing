import type {
  Customer,
  Plan,
  Subscription,
  Invoice,
  Payment,
  PaymentProvider,
  ActivityEvent,
  RevenueData,
} from "@/types";

// Helper to generate random date
function randomDate(start: Date, end: Date): string {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  ).toISOString();
}

// Helper to generate ID
function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

// African names and countries
const africanNames = [
  {
    name: "Naledi Okello",
    email: "naledi.okello@example.ug",
    country: "Uganda",
    currency: "UGX",
  },
  {
    name: "Nakato Sarah",
    email: "nakato.sarah@example.ug",
    country: "Uganda",
    currency: "UGX",
  },
  {
    name: "Mugisha Brian",
    email: "mugisha.brian@example.ug",
    country: "Uganda",
    currency: "UGX",
  },
  {
    name: "Apio Grace",
    email: "apio.grace@example.ug",
    country: "Uganda",
    currency: "UGX",
  },
  {
    name: "Kizza Ronald",
    email: "kizza.ronald@example.ug",
    country: "Uganda",
    currency: "UGX",
  },
  {
    name: "Namubiru Janet",
    email: "namubiru.janet@example.ug",
    country: "Uganda",
    currency: "UGX",
  },
  {
    name: "Jabari Mwangi",
    email: "jabari.mwangi@example.ke",
    country: "Kenya",
    currency: "KES",
  },
  {
    name: "Emeka Onyango",
    email: "emeka.onyango@example.ke",
    country: "Kenya",
    currency: "KES",
  },
  {
    name: "Imani Kamau",
    email: "imani.kamau@example.ke",
    country: "Kenya",
    currency: "KES",
  },
  {
    name: "Adebayo Okonkwo",
    email: "adebayo.okonkwo@example.ng",
    country: "Nigeria",
    currency: "NGN",
  },
  {
    name: "Zainab Kamara",
    email: "zainab.kamara@example.ng",
    country: "Nigeria",
    currency: "NGN",
  },
  {
    name: "Kofi Adeyemi",
    email: "kofi.adeyemi@example.ng",
    country: "Nigeria",
    currency: "NGN",
  },
  {
    name: "Amara Mensah",
    email: "amara.mensah@example.gh",
    country: "Ghana",
    currency: "GHS",
  },
  {
    name: "Kwame Asante",
    email: "kwame.asante@example.gh",
    country: "Ghana",
    currency: "GHS",
  },
  {
    name: "Thandiwe Nkosi",
    email: "thandiwe.nkosi@example.za",
    country: "South Africa",
    currency: "ZAR",
  },
  {
    name: "Chiwetel Banda",
    email: "chiwetel.banda@example.za",
    country: "South Africa",
    currency: "ZAR",
  },
  {
    name: "Fatima Hassan",
    email: "fatima.hassan@example.eg",
    country: "Egypt",
    currency: "EGP",
  },
  {
    name: "Zuri Mwamba",
    email: "zuri.mwamba@example.tz",
    country: "Tanzania",
    currency: "TZS",
  },
  {
    name: "Aisha Diallo",
    email: "aisha.diallo@example.ma",
    country: "Morocco",
    currency: "MAD",
  },
  {
    name: "Amina Osman",
    email: "amina.osman@example.ke",
    country: "Kenya",
    currency: "KES",
  },
];

// Generate Customers
export function generateCustomers(): Customer[] {
  const customers: Customer[] = [];
  const now = new Date();
  const yearAgo = new Date(
    now.getFullYear() - 1,
    now.getMonth(),
    now.getDate(),
  );

  africanNames.forEach((person, idx) => {
    customers.push({
      id: generateId("cus"),
      externalId: `EXT_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      name: person.name,
      email: person.email,
      country: person.country,
      currency: person.currency,
      status: Math.random() > 0.15 ? "active" : "inactive",
      totalSpent: Math.floor(Math.random() * 5000) + 50,
      activeSubscriptions:
        Math.random() > 0.3 ? Math.floor(Math.random() * 3) + 1 : 0,
      createdAt: randomDate(yearAgo, now),
      updatedAt: randomDate(yearAgo, now),
      metadata: {},
    });
  });

  return customers;
}

// Generate Plans
export function generatePlans(): Plan[] {
  return [
    {
      id: generateId("plan"),
      code: "basic",
      name: "Basic",
      description: "Essential features for small businesses",
      interval: "monthly",
      prices: [
        { currency: "UGX", amount: 105000 },
        { currency: "USD", amount: 29 },
        { currency: "NGN", amount: 12000 },
        { currency: "KES", amount: 3500 },
        { currency: "GHS", amount: 350 },
        { currency: "ZAR", amount: 450 },
      ],
      features: [
        "Up to 100 customers",
        "Basic analytics",
        "Email support",
        "Monthly invoicing",
      ],
      isActive: true,
      createdAt: "2023-06-15T10:00:00Z",
      updatedAt: "2023-06-15T10:00:00Z",
    },
    {
      id: generateId("plan"),
      code: "standard",
      name: "Standard",
      description: "Advanced features for growing companies",
      interval: "monthly",
      prices: [
        { currency: "UGX", amount: 290000 },
        { currency: "USD", amount: 79 },
        { currency: "NGN", amount: 32000 },
        { currency: "KES", amount: 9500 },
        { currency: "GHS", amount: 950 },
        { currency: "ZAR", amount: 1200 },
      ],
      features: [
        "Up to 500 customers",
        "Advanced analytics",
        "Priority support",
        "Automated billing",
        "Custom branding",
      ],
      isActive: true,
      createdAt: "2023-06-15T10:00:00Z",
      updatedAt: "2023-06-15T10:00:00Z",
    },
    {
      id: generateId("plan"),
      code: "premium",
      name: "Premium",
      description: "Complete solution for established businesses",
      interval: "monthly",
      prices: [
        { currency: "UGX", amount: 730000 },
        { currency: "USD", amount: 199 },
        { currency: "NGN", amount: 82000 },
        { currency: "KES", amount: 24000 },
        { currency: "GHS", amount: 2400 },
        { currency: "ZAR", amount: 3000 },
      ],
      features: [
        "Unlimited customers",
        "Premium analytics & reporting",
        "24/7 priority support",
        "Advanced automation",
        "Custom integrations",
        "Dedicated account manager",
      ],
      isActive: true,
      createdAt: "2023-06-15T10:00:00Z",
      updatedAt: "2023-06-15T10:00:00Z",
    },
    {
      id: generateId("plan"),
      code: "enterprise",
      name: "Enterprise",
      description: "Tailored solutions for large organizations",
      interval: "monthly",
      prices: [
        { currency: "UGX", amount: 1830000 },
        { currency: "USD", amount: 499 },
        { currency: "NGN", amount: 205000 },
        { currency: "KES", amount: 60000 },
        { currency: "GHS", amount: 6000 },
        { currency: "ZAR", amount: 7500 },
      ],
      features: [
        "Unlimited everything",
        "Custom analytics & BI",
        "White-glove support",
        "API access & webhooks",
        "Custom contracts",
        "SLA guarantee",
        "Training & onboarding",
      ],
      isActive: true,
      createdAt: "2023-06-15T10:00:00Z",
      updatedAt: "2023-06-15T10:00:00Z",
    },
  ];
}

// Generate Subscriptions
export function generateSubscriptions(
  customers: Customer[],
  plans: Plan[],
): Subscription[] {
  const subscriptions: Subscription[] = [];
  const statuses: Subscription["status"][] = [
    "active",
    "trial",
    "past_due",
    "canceled",
    "paused",
  ];
  const statusWeights = [0.6, 0.15, 0.1, 0.1, 0.05];

  const now = new Date();

  customers.forEach((customer) => {
    if (customer.activeSubscriptions > 0) {
      for (let i = 0; i < customer.activeSubscriptions; i++) {
        const plan = plans[Math.floor(Math.random() * plans.length)];
        const planPrice =
          plan.prices.find((p) => p.currency === customer.currency) ||
          plan.prices[0];

        // Weighted random status
        let random = Math.random();
        let statusIndex = 0;
        let cumulative = 0;
        for (let j = 0; j < statusWeights.length; j++) {
          cumulative += statusWeights[j];
          if (random <= cumulative) {
            statusIndex = j;
            break;
          }
        }
        const status = statuses[statusIndex];

        const createdAt = new Date(customer.createdAt);
        const currentPeriodStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
        );
        const currentPeriodEnd = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
        );
        const nextBillingDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          1,
        );

        subscriptions.push({
          id: generateId("sub"),
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          planId: plan.id,
          planName: plan.name,
          planInterval: plan.interval,
          status,
          amount: planPrice.amount,
          currency: customer.currency,
          currentPeriodStart: currentPeriodStart.toISOString(),
          currentPeriodEnd: currentPeriodEnd.toISOString(),
          nextBillingDate: nextBillingDate.toISOString(),
          trialEnd:
            status === "trial"
              ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
              : undefined,
          canceledAt:
            status === "canceled" ? randomDate(createdAt, now) : undefined,
          createdAt: createdAt.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
    }
  });

  return subscriptions;
}

// Generate Invoices
export function generateInvoices(
  subscriptions: Subscription[],
  customers: Customer[],
): Invoice[] {
  const invoices: Invoice[] = [];
  const statuses: Invoice["status"][] = [
    "paid",
    "pending",
    "failed",
    "canceled",
  ];
  const statusWeights = [0.7, 0.2, 0.07, 0.03];

  let invoiceCounter = 1;
  const now = new Date();

  subscriptions.forEach((subscription) => {
    // Generate 2-4 invoices per subscription
    const invoiceCount = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < invoiceCount; i++) {
      let random = Math.random();
      let statusIndex = 0;
      let cumulative = 0;
      for (let j = 0; j < statusWeights.length; j++) {
        cumulative += statusWeights[j];
        if (random <= cumulative) {
          statusIndex = j;
          break;
        }
      }
      const status = statuses[statusIndex];

      const createdDate = new Date(subscription.createdAt);
      createdDate.setMonth(createdDate.getMonth() + i);

      const dueDate = new Date(createdDate);
      dueDate.setDate(dueDate.getDate() + 7);

      const paidDate =
        status === "paid"
          ? new Date(
              dueDate.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000,
            )
          : undefined;

      invoices.push({
        id: generateId("inv"),
        invoiceNumber: `INV-2024-${String(invoiceCounter++).padStart(4, "0")}`,
        customerId: subscription.customerId,
        customerName: subscription.customerName,
        subscriptionId: subscription.id,
        amount: subscription.amount,
        amountPaid: status === "paid" ? subscription.amount : 0,
        currency: subscription.currency,
        status,
        dueDate: dueDate.toISOString(),
        paidDate: paidDate?.toISOString(),
        lineItems: [
          {
            description: `${subscription.planName} Plan - ${subscription.planInterval}`,
            quantity: 1,
            unitPrice: subscription.amount,
            amount: subscription.amount,
          },
        ],
        subtotal: subscription.amount,
        tax: 0,
        discount: 0,
        total: subscription.amount,
        createdAt: createdDate.toISOString(),
        updatedAt: createdDate.toISOString(),
      });
    }
  });

  return invoices.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// Generate Payments
export function generatePayments(invoices: Invoice[]): Payment[] {
  const payments: Payment[] = [];
  const providers: Payment["provider"][] = [
    "stripe",
    "flutterwave",
    "paystack",
    "pesapal",
  ];
  const providerWeights = [0.35, 0.35, 0.2, 0.1];

  invoices.forEach((invoice) => {
    if (invoice.status === "paid" || invoice.status === "failed") {
      let random = Math.random();
      let providerIndex = 0;
      let cumulative = 0;
      for (let j = 0; j < providerWeights.length; j++) {
        cumulative += providerWeights[j];
        if (random <= cumulative) {
          providerIndex = j;
          break;
        }
      }
      const provider = providers[providerIndex];

      const status = invoice.status === "paid" ? "succeeded" : "failed";

      payments.push({
        id: generateId("pay"),
        transactionId: `${provider.toUpperCase()}_${Math.random().toString(36).substr(2, 16).toUpperCase()}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        amount: invoice.amount,
        currency: invoice.currency,
        provider,
        status,
        createdAt: invoice.paidDate || invoice.createdAt,
        updatedAt: invoice.paidDate || invoice.createdAt,
        metadata: {},
      });
    }
  });

  return payments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// Generate Payment Providers
export function generatePaymentProviders(): PaymentProvider[] {
  return [
    {
      id: generateId("prov"),
      name: "Stripe",
      code: "stripe",
      description: "Global payment processing for internet businesses",
      isConfigured: true,
      isActive: true,
      priority: 1,
      config: {},
    },
    {
      id: generateId("prov"),
      name: "Flutterwave",
      code: "flutterwave",
      description: "Accept payments across Africa with Flutterwave",
      isConfigured: true,
      isActive: true,
      priority: 2,
      config: {},
    },
    {
      id: generateId("prov"),
      name: "Paystack",
      code: "paystack",
      description: "Modern payment infrastructure for Africa",
      isConfigured: true,
      isActive: true,
      priority: 3,
      config: {},
    },
    {
      id: generateId("prov"),
      name: "DPO Group",
      code: "dpo",
      description: "Pan-African payment gateway for cards, mobile wallets, and bank transfers",
      isConfigured: false,
      isActive: false,
      priority: 4,
      config: {},
    },
    {
      id: generateId("prov"),
      name: "PayU",
      code: "payu",
      description: "Payment gateway for South Africa supporting credit cards, EFT, and instant payments",
      isConfigured: false,
      isActive: false,
      priority: 5,
      config: {},
    },
    {
      id: generateId("prov"),
      name: "Pesapal",
      code: "pesapal",
      description: "East African payment platform for mobile money, cards, and bank transfers",
      isConfigured: false,
      isActive: false,
      priority: 6,
      config: {},
    },
  ];
}

// Generate Activity Events
export function generateActivityEvents(
  customers: Customer[],
  subscriptions: Subscription[],
  invoices: Invoice[],
  payments: Payment[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Customer created events
  customers.slice(0, 5).forEach((customer) => {
    if (new Date(customer.createdAt) > sevenDaysAgo) {
      events.push({
        id: generateId("evt"),
        type: "customer.created",
        description: `New customer ${customer.name} was created`,
        entityId: customer.id,
        entityType: "customer",
        createdAt: customer.createdAt,
        metadata: {},
      });
    }
  });

  // Subscription events
  subscriptions.slice(0, 10).forEach((subscription) => {
    events.push({
      id: generateId("evt"),
      type: "subscription.created",
      description: `${subscription.customerName} subscribed to ${subscription.planName}`,
      entityId: subscription.id,
      entityType: "subscription",
      createdAt: randomDate(sevenDaysAgo, now),
      metadata: {},
    });
  });

  // Payment events
  payments.slice(0, 15).forEach((payment) => {
    if (new Date(payment.createdAt) > sevenDaysAgo) {
      events.push({
        id: generateId("evt"),
        type:
          payment.status === "succeeded"
            ? "payment.succeeded"
            : "payment.failed",
        description: `Payment of ${payment.amount} ${payment.currency} ${payment.status === "succeeded" ? "succeeded" : "failed"} for ${payment.customerName}`,
        entityId: payment.id,
        entityType: "payment",
        createdAt: payment.createdAt,
        metadata: {},
      });
    }
  });

  return events.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// Generate Revenue Data
export function generateRevenueData(): RevenueData[] {
  const data: RevenueData[] = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const baseRevenue = 50000 + Math.random() * 20000;
    const growthFactor = 1 + (11 - i) * 0.08; // 8% monthly growth

    data.push({
      date: date.toISOString().split("T")[0],
      revenue: Math.floor(baseRevenue * growthFactor),
      mrr: Math.floor(baseRevenue * growthFactor * 0.7),
      oneTime: Math.floor(baseRevenue * growthFactor * 0.3),
    });
  }

  return data;
}

// Initialize all mock data
export function initializeMockData() {
  const customers = generateCustomers();
  const plans = generatePlans();
  const subscriptions = generateSubscriptions(customers, plans);
  const invoices = generateInvoices(subscriptions, customers);
  const payments = generatePayments(invoices);
  const providers = generatePaymentProviders();
  const activities = generateActivityEvents(
    customers,
    subscriptions,
    invoices,
    payments,
  );
  const revenueData = generateRevenueData();

  return {
    customers,
    plans,
    subscriptions,
    invoices,
    payments,
    providers,
    activities,
    revenueData,
  };
}
