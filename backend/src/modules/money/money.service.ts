import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { MoneyIntent, MoneyIntentStatus, MoneyIntentType, Prisma, PrismaClient } from '../../generated/prisma-tenant/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { getCurrencyDecimals } from '../../common/utils/currency.utils';
import { WEBHOOK_QUEUE, WebhookJobType } from '../../queues/billing.queue';
import { WalletsService } from '../wallets/wallets.service';
import { formatScaled, toScaled } from '../ledger/ledger.money';
import { ProviderRegistryService } from './provider-registry.service';
import { majorAmount, MoneyProvider, Party, ProviderAmbiguousError, ProviderOutcome, Rail, PaymentDetails } from './types';
import { parseParty } from './party';
import { notificationUrls } from './notification-urls';
export { notificationUrls };
import { CommissionKind, CommissionQuote, CommissionSettings, quoteCommission, validateCommission } from './commission';

export interface MoneySettings {
  collections: boolean;
  transfers: boolean;
  /** Enabled per tenant by a platform operator. */
  payouts: boolean;
  /** Payouts at or above this amount (per currency) wait for approval in the dashboard. */
  payoutApprovalThreshold: Record<string, string>;
  /** Maximum total payouts per currency per UTC day. */
  payoutDailyLimit: Record<string, string>;
  /** Platform commission rules; set by the platform operator only. */
  commission: CommissionSettings;
}

interface TenantRef {
  id: string;
  settings: Record<string, unknown> | null;
}

export interface CreateCollectionInput {
  amount: string | number;
  currency: string;
  payer: unknown;
  provider?: string;
  description?: string;
  reference?: string;
  customerId?: string;
  walletId?: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
  otp?: { pinId: string; pin: string };
}

export interface CreatePayoutInput {
  amount: string | number;
  currency: string;
  payee: unknown;
  provider?: string;
  description?: string;
  reference?: string;
  walletId?: string;
  metadata?: Record<string, unknown>;
  /** Who asked for it: a person's email, or "api_key". */
  createdBy?: string;
}

export interface CreateTransferInput {
  fromWalletId: string;
  toWalletId: string;
  amount: string | number;
  description?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

const OPEN: MoneyIntentStatus[] = ['PENDING', 'PROCESSING', 'STUCK'];

export function moneySettings(tenant: TenantRef): MoneySettings {
  const raw = ((tenant.settings ?? {}) as Record<string, unknown>).money as Partial<MoneySettings> | undefined;
  return {
    collections: raw?.collections === true,
    transfers: raw?.transfers === true,
    payouts: raw?.payouts === true,
    payoutApprovalThreshold: raw?.payoutApprovalThreshold ?? {},
    payoutDailyLimit: raw?.payoutDailyLimit ?? {},
    commission: raw?.commission ?? {},
  };
}

/**
 * One-time collections, payouts and wallet transfers. Each is a MoneyIntent
 * that moves through PENDING → PROCESSING → SUCCEEDED / FAILED (or STUCK when
 * the provider's answer is unknown). Status changes are compare-and-set, so a
 * webhook, a status check and a retry racing each other apply an outcome once;
 * wallet movements commit in the same transaction as the status change.
 * Ledger entries are derived from settled intents by the ledger projector.
 */
@Injectable()
export class MoneyService {
  private readonly logger = new Logger(MoneyService.name);

  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly wallets: WalletsService,
    private readonly centralPrisma: CentralPrismaService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  // --- Collections ---

  async createCollection(db: PrismaClient, tenant: TenantRef, input: CreateCollectionInput) {
    const settings = this.requireFeature(tenant, 'collections');
    const payer = parseParty(input.payer, 'payer');
    const currency = input.currency.toUpperCase();
    const amount = this.parseAmount(input.amount, currency);
    const rail = payer.type as Rail;
    const providerName = input.provider?.toLowerCase() ?? (await this.registry.pick(db, 'collect', rail, payer, currency));
    const provider = await this.registry.get(db, providerName);
    if (!provider.collect || !provider.capabilities.collect.includes(rail)) {
      throw new BadRequestException(`${providerName} cannot collect from ${rail.replace('_', ' ')}`);
    }
    this.registry.assertNetwork(providerName, payer);
    if (input.walletId) await this.requireWallet(db, input.walletId, currency);

    const existing = await this.byClientReference(db, 'COLLECTION', input.reference);
    if (existing) return this.present(existing);

    const commission = this.commission(settings, 'collection', amount, currency);
    const intent = await this.createIntent(db, {
      type: 'COLLECTION',
      amount,
      currency,
      ...commission,
      provider: providerName,
      rail,
      party: payer,
      description: input.description,
      clientReference: input.reference,
      customerId: input.customerId,
      walletId: input.walletId,
      metadata: input.metadata,
      providerReference: newReference('col'),
    });
    if (intent.existing) return this.present(intent.row);

    const notify = notificationUrls(providerName, tenant.id);
    const outcome = await this.callProvider(() =>
      provider.collect!({
        reference: intent.row.providerReference!,
        // Includes the commission when it is passed on to the payer.
        amount: majorAmount(intent.row.chargedAmount ?? intent.row.amount, getCurrencyDecimals(currency)),
        currency,
        payer,
        description: input.description || 'Payment',
        callbackUrl: input.returnUrl,
        ...notify,
        ...(input.otp && { otp: { pinId: String(input.otp.pinId ?? ''), pin: String(input.otp.pin ?? '') } }),
      }),
    );
    return this.present(await this.applyOutcome(db, tenant.id, intent.row, outcome, 'create'));
  }

  // --- Payouts ---

  async createPayout(db: PrismaClient, tenant: TenantRef, input: CreatePayoutInput) {
    const settings = this.requireFeature(tenant, 'payouts');
    const payee = parseParty(input.payee, 'payee');
    const currency = input.currency.toUpperCase();
    const amount = this.parseAmount(input.amount, currency);
    const rail = payee.type as Rail;
    const providerName = input.provider?.toLowerCase() ?? (await this.registry.pick(db, 'payout', rail, payee));
    const provider = await this.registry.get(db, providerName);
    if (!provider.payout || !provider.capabilities.payout.includes(rail)) {
      throw new BadRequestException(`${providerName} cannot pay out to ${rail.replace('_', ' ')}`);
    }
    this.registry.assertNetwork(providerName, payee);
    if (input.walletId) await this.requireWallet(db, input.walletId, currency);

    const existing = await this.byClientReference(db, 'PAYOUT', input.reference);
    if (existing) return this.present(existing);

    const threshold = settings.payoutApprovalThreshold[currency];
    const needsApproval = threshold !== undefined && toScaled(amount) >= toScaled(threshold);

    // The wallet hold (if any) commits together with the intent.
    const intent = await this.createIntent(
      db,
      {
        type: 'PAYOUT',
        status: needsApproval ? 'REQUIRES_APPROVAL' : 'PENDING',
        amount,
        currency,
        ...this.commission(settings, 'payout', amount, currency),
        provider: providerName,
        rail,
        party: payee,
        description: input.description,
        clientReference: input.reference,
        walletId: input.walletId,
        metadata: input.metadata,
        createdBy: input.createdBy ?? null,
        providerReference: newReference('pay'),
      },
      async (tx, row) => {
        if (row.walletId) {
          await this.wallets.applyAmountInTransaction(tx, row.walletId, Number(amount), 'WITHDRAWN', { moneyIntentId: row.id });
        }
      },
      // The daily limit is checked under a lock, in the same transaction as the
      // new payout, so concurrent payouts cannot together exceed it.
      (tx) => this.checkDailyLimit(tx, settings, currency, amount),
    );
    if (intent.existing) return this.present(intent.row);
    this.emit(tenant.id, needsApproval ? 'payout.requires_approval' : 'payout.created', intent.row);

    if (needsApproval) return this.present(intent.row);
    return this.present(await this.submitPayout(db, tenant.id, intent.row.id, provider));
  }

  /**
   * Approve a payout waiting for approval. The person who asked for it cannot
   * approve it, unless they are the organisation's only possible approver.
   */
  async approvePayout(db: PrismaClient, tenant: TenantRef, id: string, approvedBy: string) {
    this.requireFeature(tenant, 'payouts');
    const pending = await this.find(db, id);
    if (pending.createdBy && pending.createdBy.toLowerCase() === approvedBy.toLowerCase()) {
      const approvers = await this.centralPrisma.client.membership.count({
        where: { tenantId: tenant.id, role: { in: ['OWNER', 'ADMIN', 'FINANCE'] }, user: { isActive: true } },
      });
      if (approvers > 1) {
        throw new ForbiddenException('Someone other than the person who requested this payout must approve it');
      }
      this.logger.warn(`Payout ${id} approved by its requester ${approvedBy}: the organisation has no other approver`);
    }
    const claimed = await db.moneyIntent.updateMany({
      where: { id, type: 'PAYOUT', status: 'REQUIRES_APPROVAL' },
      data: { status: 'PENDING', approvedAt: new Date(), approvedBy },
    });
    if (claimed.count === 0) throw new ConflictException('Only payouts waiting for approval can be approved');
    const intent = await this.find(db, id);
    return this.present(await this.submitPayout(db, tenant.id, id, await this.registry.get(db, intent.provider!)));
  }

  async cancel(db: PrismaClient, tenant: TenantRef, id: string) {
    const intent = await this.find(db, id);
    if (intent.type !== 'PAYOUT' && intent.type !== 'COLLECTION') {
      throw new BadRequestException('Transfers complete immediately and cannot be canceled');
    }
    const cancelable: MoneyIntentStatus[] = intent.type === 'PAYOUT' ? ['REQUIRES_APPROVAL'] : ['PENDING'];
    const updated = await db.$transaction(async (tx) => {
      const claimed = await tx.moneyIntent.updateMany({
        where: { id, status: { in: cancelable } },
        data: { status: 'CANCELED', completedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          intent.type === 'PAYOUT'
            ? 'Only payouts waiting for approval can be canceled; submitted payouts are with the provider'
            : 'Only collections that have not reached the provider can be canceled',
        );
      }
      if (intent.type === 'PAYOUT' && intent.walletId) {
        await this.wallets.applyAmountInTransaction(tx, intent.walletId, Number(intent.amount), 'PAYOUT_REVERSED', {
          moneyIntentId: id,
          reason: 'canceled',
        });
      }
      return tx.moneyIntent.findUniqueOrThrow({ where: { id } });
    });
    this.emit(tenant.id, `${intent.type.toLowerCase()}.canceled`, updated);
    return this.present(updated);
  }

  /**
   * Send a payout to the provider exactly once: the PENDING → PROCESSING claim
   * means a concurrent approve, retry or poll cannot submit it a second time.
   */
  private async submitPayout(db: PrismaClient, tenantId: string, id: string, provider: MoneyProvider): Promise<MoneyIntent> {
    const claimed = await db.moneyIntent.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'PROCESSING' } });
    const intent = await this.find(db, id);
    if (claimed.count === 0) return intent;

    const outcome = await this.callProvider(() =>
      provider.payout!({
        reference: intent.providerReference!,
        amount: majorAmount(intent.amount, getCurrencyDecimals(intent.currency)),
        currency: intent.currency,
        payee: intent.party as unknown as Party,
        description: intent.description || 'Payout',
      }),
    );
    return this.applyOutcome(db, tenantId, intent, outcome, 'create');
  }

  // --- Transfers ---

  async createTransfer(db: PrismaClient, tenant: TenantRef, input: CreateTransferInput) {
    const settings = this.requireFeature(tenant, 'transfers');
    if (input.fromWalletId === input.toWalletId) throw new BadRequestException('Choose two different wallets');
    const [from, to] = await Promise.all([
      db.wallet.findUnique({ where: { id: input.fromWalletId } }),
      db.wallet.findUnique({ where: { id: input.toWalletId } }),
    ]);
    if (!from || !to) throw new NotFoundException('Wallet not found');
    if (from.currency !== to.currency) {
      throw new BadRequestException(`Both wallets must use the same currency (${from.currency} and ${to.currency})`);
    }
    if (from.status !== 'ACTIVE' || to.status !== 'ACTIVE') throw new BadRequestException('Both wallets must be active');
    const amount = this.parseAmount(input.amount, from.currency);

    const existing = await this.byClientReference(db, 'TRANSFER', input.reference);
    if (existing) return this.present(existing);

    const intent = await this.createIntent(
      db,
      {
        type: 'TRANSFER',
        status: 'SUCCEEDED',
        amount,
        currency: from.currency,
        ...this.commission(settings, 'transfer', amount, from.currency),
        rail: 'wallet',
        description: input.description,
        clientReference: input.reference,
        customerId: from.customerId,
        walletId: from.id,
        toWalletId: to.id,
        metadata: input.metadata,
        completedAt: new Date(),
      },
      async (tx, row) => {
        // Lock both wallets in id order so opposite transfers cannot deadlock.
        for (const walletId of [from.id, to.id].sort()) {
          await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
        }
        await this.wallets.applyAmountInTransaction(tx, from.id, Number(amount), 'TRANSFERRED_OUT', { moneyIntentId: row.id, toWalletId: to.id });
        await this.wallets.applyAmountInTransaction(tx, to.id, Number(amount), 'TRANSFERRED_IN', { moneyIntentId: row.id, fromWalletId: from.id });
      },
    );
    if (!intent.existing) this.emit(tenant.id, 'transfer.succeeded', intent.row);
    return this.present(intent.row);
  }

  // --- Status updates ---

  /** Ask the provider for the current state of an open collection or payout. */
  async refresh(db: PrismaClient, tenantId: string, id: string) {
    const intent = await this.find(db, id);
    if (!OPEN.includes(intent.status) || !intent.provider) return this.present(intent);
    const provider = await this.registry.get(db, intent.provider);
    const check =
      intent.type === 'COLLECTION'
        ? provider.getCollection?.bind(
            provider,
            intent.providerReference!,
            intent.providerTxnId,
            majorAmount(intent.chargedAmount ?? intent.amount, getCurrencyDecimals(intent.currency)),
            intent.rail as Rail,
          )
        : provider.getPayout?.bind(provider, intent.providerReference!, intent.providerTxnId, intent.rail as Rail);
    if (!check) return this.present(intent);

    let outcome: ProviderOutcome;
    try {
      outcome = await check();
    } catch (error) {
      await db.moneyIntent.update({ where: { id }, data: { lastCheckedAt: new Date() } });
      throw error;
    }
    return this.present(await this.applyOutcome(db, tenantId, intent, outcome, 'check'));
  }

  /**
   * Apply a provider outcome. Settling transitions are compare-and-set on the
   * current status; the side effects (wallet credit or reversal, tenant
   * webhook) only run for the caller that won the transition.
   */
  async applyOutcome(
    db: PrismaClient,
    tenantId: string,
    intent: MoneyIntent,
    outcome: ProviderOutcome,
    source: 'create' | 'check' | 'webhook',
  ): Promise<MoneyIntent> {
    const now = new Date();
    const details = {
      ...(outcome.providerTxnId && { providerTxnId: outcome.providerTxnId }),
      ...(outcome.providerStatus && { providerStatus: outcome.providerStatus }),
      ...(outcome.paymentUrl && { paymentUrl: outcome.paymentUrl }),
      ...(outcome.paymentDetails && { paymentDetails: outcome.paymentDetails as unknown as Prisma.InputJsonValue }),
      ...(outcome.fee !== undefined && { fee: new Prisma.Decimal(outcome.fee) }),
      lastCheckedAt: now,
    };

    if (outcome.state === 'pending') {
      const next: MoneyIntentStatus = outcome.indeterminate ? 'STUCK' : 'PROCESSING';
      const from: MoneyIntentStatus[] = next === 'STUCK' ? ['PENDING', 'PROCESSING'] : ['PENDING', 'PROCESSING', 'STUCK'];
      const moved = await db.moneyIntent.updateMany({
        where: { id: intent.id, status: { in: from } },
        data: { ...details, status: next, ...(outcome.failureReason && { failureReason: outcome.failureReason }) },
      });
      const updated = await this.find(db, intent.id);
      if (moved.count && next === 'STUCK' && intent.status !== 'STUCK') {
        this.logger.warn(`${intent.type} ${intent.id} is stuck: ${outcome.failureReason ?? outcome.providerStatus}`);
        this.emit(tenantId, `${intent.type.toLowerCase()}.stuck`, updated);
      }
      return updated;
    }

    const status: MoneyIntentStatus = outcome.state === 'succeeded' ? 'SUCCEEDED' : 'FAILED';
    const won = await db.$transaction(async (tx) => {
      const moved = await tx.moneyIntent.updateMany({
        where: { id: intent.id, status: { in: OPEN } },
        data: {
          ...details,
          status,
          completedAt: now,
          ...(status === 'FAILED' && { failureReason: outcome.failureReason ?? 'Failed at the provider' }),
        },
      });
      if (moved.count === 0) return false;

      if (status === 'SUCCEEDED' && intent.type === 'COLLECTION' && intent.walletId) {
        await this.wallets.applyAmountInTransaction(tx, intent.walletId, Number(intent.amount), 'PURCHASED', {
          moneyIntentId: intent.id,
        });
      }
      if (status === 'FAILED' && intent.type === 'PAYOUT' && intent.walletId) {
        await this.wallets.applyAmountInTransaction(tx, intent.walletId, Number(intent.amount), 'PAYOUT_REVERSED', {
          moneyIntentId: intent.id,
        });
      }
      return true;
    });

    const updated = await this.find(db, intent.id);
    if (won) {
      this.logger.log(`${intent.type} ${intent.id} → ${status} (${source})`);
      this.emit(tenantId, `${intent.type.toLowerCase()}.${status === 'SUCCEEDED' ? 'succeeded' : 'failed'}`, updated);
    }
    return updated;
  }

  /**
   * A verified notification from a checkout provider (Stripe, Paystack, ...)
   * that matched no invoice payment. Returns true when it belonged to a
   * one-time collection. A reported amount or currency that differs from the
   * collection holds it as stuck for review instead of settling it.
   */
  async handleCheckoutNotification(
    db: PrismaClient,
    tenantId: string,
    provider: string,
    route: string,
    payload: Record<string, unknown>,
    data: {
      status: 'succeeded' | 'failed' | 'pending';
      transactionId: string;
      amount: number;
      currency: string;
      invoiceId?: string;
      referenceVerified?: boolean;
    },
  ): Promise<boolean> {
    let intent: MoneyIntent | null;
    try {
      // Our reference only counts when the provider vouched for it (signed, or from its API).
      intent = await this.findByProviderRef(db, provider, {
        providerTxnId: data.transactionId,
        reference: data.referenceVerified ? data.invoiceId : undefined,
      });
    } catch (error) {
      // Tenant database not yet synced to the money-movement schema.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') return false;
      throw error;
    }
    if (!intent || intent.type !== 'COLLECTION') return false;

    const expected = intent.chargedAmount ?? intent.amount;
    // A success that reports no amount cannot be checked, so it is held too.
    const amountDiffers = !(data.amount > 0) || toScaled(data.amount) !== toScaled(expected);
    const currencyDiffers = Boolean(data.currency) && data.currency.toUpperCase() !== intent.currency;
    const mismatch = data.status === 'succeeded' && (amountDiffers || currencyDiffers)
      ? `provider reported ${data.amount || 'no amount'} ${data.currency}, expected ${expected.toString()} ${intent.currency}`
      : null;

    try {
      await db.providerEvent.create({
        data: {
          provider,
          eventKey: `${this.eventId(payload) ?? data.transactionId ?? intent.id}:${data.status}`,
          eventType: String(payload.event_type ?? payload.event ?? payload.type ?? data.status),
          status: 'PROCESSED',
          route,
          intentId: intent.id,
          amount: data.amount ? String(data.amount) : null,
          currency: data.currency || null,
          mismatch,
          payload: payload as never,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      // Redelivery: the compare-and-set in applyOutcome keeps it harmless.
    }

    const outcome: ProviderOutcome = mismatch
      ? { state: 'pending', indeterminate: true, failureReason: `Held for review: ${mismatch}`, providerTxnId: data.transactionId }
      : { state: data.status, providerTxnId: data.transactionId || undefined, providerStatus: `WEBHOOK_${data.status.toUpperCase()}` };
    await this.applyOutcome(db, tenantId, intent, outcome, 'webhook');
    return true;
  }

  private eventId(payload: Record<string, unknown>): string | null {
    const id = payload.id ?? payload.event_id;
    return typeof id === 'string' && id.length > 0 && id.length <= 200 ? `event:${id}` : null;
  }

  /** Match a verified provider notification to an intent, by provider id or our reference. */
  async findByProviderRef(db: PrismaClient, provider: string, refs: { providerTxnId?: string; reference?: string }) {
    const or: Prisma.MoneyIntentWhereInput[] = [];
    if (refs.providerTxnId) or.push({ providerTxnId: refs.providerTxnId });
    if (refs.reference) or.push({ providerReference: refs.reference });
    if (or.length === 0) return null;
    return db.moneyIntent.findFirst({ where: { provider, OR: or } });
  }

  // --- Reads ---

  async list(
    db: PrismaClient,
    type: MoneyIntentType,
    query: { status?: string; page?: number; limit?: number; walletId?: string; customerId?: string },
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const where: Prisma.MoneyIntentWhereInput = {
      type,
      ...(query.status && { status: query.status.toUpperCase() as MoneyIntentStatus }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.walletId && { OR: [{ walletId: query.walletId }, { toWalletId: query.walletId }] }),
    };
    const [rows, total] = await Promise.all([
      db.moneyIntent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.moneyIntent.count({ where }),
    ]);
    return { data: rows.map((r) => this.present(r)), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async get(db: PrismaClient, type: MoneyIntentType, id: string) {
    const intent = await this.find(db, id);
    if (intent.type !== type) throw new NotFoundException(`${type.toLowerCase()} not found`);
    return this.present(intent);
  }

  async capabilities(db: PrismaClient, tenant: TenantRef) {
    return { settings: moneySettings(tenant), providers: await this.registry.list(db) };
  }

  async balance(db: PrismaClient, providerName: string) {
    const provider = await this.registry.get(db, providerName);
    if (!provider.getBalance) throw new BadRequestException(`${providerName} does not report balances`);
    return { provider: providerName, balances: await provider.getBalance() };
  }

  async verifyPayee(db: PrismaClient, providerName: string, rawParty: unknown) {
    const provider = await this.registry.get(db, providerName);
    if (!provider.verifyPayee) throw new BadRequestException(`${providerName} cannot look up account names`);
    return provider.verifyPayee(parseParty(rawParty, 'payee'));
  }

  // --- Watch-only crypto deposits ---

  async listCryptoDeposits(db: PrismaClient, query: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const where = query.status ? { status: query.status.toUpperCase() } : {};
    const [rows, total] = await Promise.all([
      db.cryptoDeposit.findMany({ where, orderBy: { blockTime: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.cryptoDeposit.count({ where }),
    ]);
    const refs = rows.map((r) => r.reference).filter((r): r is string => Boolean(r));
    const intents = refs.length
      ? await db.moneyIntent.findMany({ where: { providerReference: { in: refs } }, select: { id: true, providerReference: true } })
      : [];
    const byRef = new Map(intents.map((i) => [i.providerReference, i.id]));
    return {
      data: rows.map((r) => ({
        id: r.id,
        chain: r.chain,
        token: r.token,
        address: r.address,
        txHash: r.txHash,
        from: r.fromAddress,
        amount: r.amount.toString(),
        blockTime: r.blockTime,
        status: r.status.toLowerCase(),
        collectionId: r.reference ? (byRef.get(r.reference) ?? null) : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * A person settles an open crypto collection with a deposit that did not
   * match on its own (e.g. the payer left off the amount's tail, or paid a
   * different amount the merchant accepts).
   */
  async assignCryptoDeposit(db: PrismaClient, tenantId: string, depositId: string, collectionId: string) {
    const deposit = await db.cryptoDeposit.findUnique({ where: { id: depositId } });
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (deposit.status !== 'UNMATCHED') throw new BadRequestException('This deposit already paid a collection');
    const intent = await this.find(db, collectionId);
    if (intent.type !== 'COLLECTION' || !['tron_usdt', 'eth_usdt', 'bsc_usdt'].includes(intent.provider ?? '')) {
      throw new BadRequestException('Deposits can only be assigned to USDT collections paid to your own wallet');
    }
    // Ethereum addresses are stored lowercase; TRON's are case-sensitive but never differ only by case.
    const asked = (intent.paymentDetails as { address?: string } | null)?.address ?? '';
    if (deposit.address.toLowerCase() !== asked.toLowerCase()) {
      throw new BadRequestException('This deposit arrived at a different address from the one this collection asked for');
    }
    if (!OPEN.includes(intent.status)) throw new BadRequestException(`This collection is already ${intent.status.toLowerCase()}`);
    if (await db.cryptoDeposit.findFirst({ where: { reference: intent.providerReference } })) {
      throw new BadRequestException('This collection already has a deposit');
    }
    const moved = await db.cryptoDeposit.updateMany({
      where: { id: depositId, status: 'UNMATCHED' },
      data: { status: 'ASSIGNED', reference: intent.providerReference },
    });
    if (moved.count === 0) throw new BadRequestException('This deposit already paid a collection');
    this.logger.log(`Crypto deposit ${deposit.txHash} assigned to collection ${intent.id}`);
    return this.refresh(db, tenantId, intent.id);
  }

  /** Text the payer a one-time code for a provider that confirms collections that way. */
  async requestPayerOtp(db: PrismaClient, providerName: string, phone: string) {
    const provider = await this.registry.get(db, providerName);
    if (!provider.requestPayerOtp) throw new BadRequestException(`${providerName} does not use one-time codes`);
    return provider.requestPayerOtp(phone);
  }

  /** Tenant settings changes for the self-service features (collections, transfers, approval rules). */
  async updateSettings(tenant: TenantRef, patch: Partial<MoneySettings>, operator: boolean) {
    if (patch.payouts !== undefined && !operator) {
      throw new BadRequestException('Payouts are enabled by the platform operator after review');
    }
    if (patch.commission !== undefined) {
      if (!operator) throw new BadRequestException('Commission is set by the platform operator');
      patch = { ...patch, commission: validateCommission(patch.commission) };
    }
    for (const map of [patch.payoutApprovalThreshold, patch.payoutDailyLimit]) {
      for (const [currency, value] of Object.entries(map ?? {})) {
        this.parseAmount(value, currency.toUpperCase());
      }
    }
    const current = (tenant.settings ?? {}) as Record<string, unknown>;
    const money = { ...moneySettings(tenant), ...patch };
    await this.centralPrisma.client.tenant.update({
      where: { id: tenant.id },
      data: { settings: { ...current, money } as never },
    });
    return money;
  }

  // --- Internals ---

  private commission(settings: MoneySettings, kind: CommissionKind, amount: string, currency: string) {
    const quote: CommissionQuote | null = quoteCommission(settings.commission, kind, amount, currency, getCurrencyDecimals(currency));
    if (!quote) return {};
    return {
      commission: quote.amount,
      commissionChargeTo: quote.chargeTo,
      ...(quote.charged !== amount && { chargedAmount: quote.charged }),
    };
  }

  private requireFeature(tenant: TenantRef, feature: 'collections' | 'payouts' | 'transfers'): MoneySettings {
    const settings = moneySettings(tenant);
    if (!settings[feature]) {
      throw new BadRequestException(
        feature === 'payouts'
          ? 'Payouts are not enabled for this account. Contact the platform operator to enable them.'
          : `${feature[0].toUpperCase()}${feature.slice(1)} are not enabled for this account. Turn them on in Settings → Money movement.`,
      );
    }
    return settings;
  }

  private parseAmount(raw: string | number, currency: string): string {
    const text = String(raw).trim();
    if (!/^\d+(\.\d+)?$/.test(text) || Number(text) <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }
    const decimals = getCurrencyDecimals(currency);
    const fraction = text.split('.')[1] ?? '';
    if (fraction.replace(/0+$/, '').length > decimals) {
      throw new BadRequestException(`${currency} amounts allow at most ${decimals} decimal places`);
    }
    return formatScaled(toScaled(text));
  }

  private async requireWallet(db: PrismaClient, walletId: string, currency: string) {
    const wallet = await db.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.currency !== currency) throw new BadRequestException(`Wallet currency is ${wallet.currency}, not ${currency}`);
    if (wallet.status !== 'ACTIVE') throw new BadRequestException('Wallet is not active');
    return wallet;
  }

  private async checkDailyLimit(db: Prisma.TransactionClient, settings: MoneySettings, currency: string, amount: string) {
    const limit = settings.payoutDailyLimit[currency];
    if (limit === undefined) return;
    // The lock function returns void, which Prisma cannot read back: cast it.
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout-daily-limit:${currency}`}))::text AS locked`;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const today = await db.moneyIntent.aggregate({
      where: { type: 'PAYOUT', currency, createdAt: { gte: startOfDay }, status: { notIn: ['FAILED', 'CANCELED'] } },
      _sum: { amount: true },
    });
    if (toScaled(today._sum.amount ?? 0) + toScaled(amount) > toScaled(limit)) {
      throw new BadRequestException(`This payout would exceed the daily payout limit of ${limit} ${currency}`);
    }
  }

  private async byClientReference(db: PrismaClient, type: MoneyIntentType, reference?: string) {
    if (!reference) return null;
    return db.moneyIntent.findUnique({ where: { type_clientReference: { type, clientReference: reference } } });
  }

  /** Create the intent (plus any same-transaction work); a duplicate client reference returns the original. */
  private async createIntent(
    db: PrismaClient,
    data: Omit<Prisma.MoneyIntentUncheckedCreateInput, 'party' | 'metadata'> & { party?: Party; metadata?: Record<string, unknown> },
    withinTransaction?: (tx: Prisma.TransactionClient, row: MoneyIntent) => Promise<void>,
    beforeCreate?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<{ row: MoneyIntent; existing: boolean }> {
    try {
      const row = await db.$transaction(async (tx) => {
        if (beforeCreate) await beforeCreate(tx);
        const created = await tx.moneyIntent.create({
          data: { ...data, party: data.party as never, metadata: data.metadata as never },
        });
        if (withinTransaction) await withinTransaction(tx, created);
        return created;
      });
      return { row, existing: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && data.clientReference) {
        const original = await this.byClientReference(db, data.type, data.clientReference);
        if (original) return { row: original, existing: true };
      }
      throw error;
    }
  }

  private async callProvider(call: () => Promise<ProviderOutcome>): Promise<ProviderOutcome> {
    try {
      return await call();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof ProviderAmbiguousError) {
        return { state: 'pending', indeterminate: true, failureReason: message };
      }
      // Errors raised before the provider was reached (bad credentials, validation).
      return { state: 'failed', failureReason: message };
    }
  }

  private async find(db: PrismaClient, id: string): Promise<MoneyIntent> {
    const intent = await db.moneyIntent.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException('Not found');
    return intent;
  }

  private emit(tenantId: string, event: string, intent: MoneyIntent) {
    this.webhookQueue
      .add(WebhookJobType.SEND_WEBHOOK, { tenantId, event, payload: this.present(intent) })
      .catch((error) => this.logger.warn(`Could not queue ${event} webhook: ${error}`));
  }

  present(intent: MoneyIntent) {
    return {
      id: intent.id,
      type: intent.type.toLowerCase(),
      status: intent.status.toLowerCase(),
      amount: intent.amount.toString(),
      currency: intent.currency,
      provider: intent.provider,
      rail: intent.rail,
      party: intent.party,
      description: intent.description,
      reference: intent.clientReference,
      providerReference: intent.providerReference,
      providerTransactionId: intent.providerTxnId,
      providerStatus: intent.providerStatus,
      paymentUrl: intent.paymentUrl,
      paymentDetails: intent.paymentDetails as unknown as PaymentDetails | null,
      failureReason: intent.failureReason,
      fee: intent.fee?.toString() ?? null,
      commission: intent.commission?.toString() ?? null,
      commissionChargeTo: intent.commissionChargeTo,
      chargedAmount: intent.chargedAmount?.toString() ?? null,
      customerId: intent.customerId,
      walletId: intent.walletId,
      toWalletId: intent.toWalletId,
      approvedAt: intent.approvedAt,
      approvedBy: intent.approvedBy,
      metadata: intent.metadata,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
      completedAt: intent.completedAt,
    };
  }
}

function newReference(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString('hex')}`;
}
