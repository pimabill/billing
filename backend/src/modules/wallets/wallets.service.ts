import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, PrismaClient, WalletTransactionKind } from '../../generated/prisma-tenant/client';

type WalletTx = Prisma.TransactionClient;

const INBOUND_KINDS = new Set<WalletTransactionKind>(['PURCHASED', 'GRANTED', 'PAYOUT_REVERSED', 'TRANSFERRED_IN', 'REFUNDED']);
import { CreateWalletDto, UpdateWalletDto, TopUpWalletDto } from './dto/create-wallet.dto';
import { WEBHOOK_QUEUE, WebhookJobType } from '../../queues/billing.queue';
import { assertKnownCurrency } from '../../common/utils/currency.utils';
import { dec, Dec } from '../billing/pricing';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  // --- Conversion helpers ---

  // Decimal arithmetic, rounded to the 4 places the columns hold.
  private creditsToAmount(credits: number, rateAmount: number): number {
    return dec(credits).mul(dec(rateAmount)).toDecimalPlaces(4, Dec.ROUND_HALF_UP).toNumber();
  }

  private amountToCredits(amount: number, rateAmount: number): number {
    const rate = dec(rateAmount);
    if (rate.lte(0)) throw new BadRequestException('Wallet rate must be positive');
    return dec(amount).div(rate).toDecimalPlaces(4, Dec.ROUND_HALF_UP).toNumber();
  }

  // --- CRUD ---

  async create(db: PrismaClient, tenantId: string, dto: CreateWalletDto) {
    const customer = await db.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const rateAmount = dto.rateAmount || 1;

    const wallet = await db.wallet.create({
      data: {
        customerId: dto.customerId,
        name: dto.name || null,
        currency: await assertKnownCurrency(db, dto.currency),
        rateAmount,
        expirationAt: dto.expirationAt ? new Date(dto.expirationAt) : null,
        metadata: dto.metadata as any,
        ...(dto.createdAt && { createdAt: new Date(dto.createdAt) }),
      },
      include: { customer: true },
    });

    // Grant free credits (settled immediately)
    if (dto.grantedCredits && dto.grantedCredits > 0) {
      await this.addCredits(db, wallet.id, dto.grantedCredits, 'GRANTED', tenantId);
    }

    // Add paid credits (settled immediately — invoice generation optional)
    if (dto.paidCredits && dto.paidCredits > 0) {
      await this.addCredits(db, wallet.id, dto.paidCredits, 'PURCHASED', tenantId);
    }

    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'wallet.created',
      payload: { walletId: wallet.id, customerId: dto.customerId, currency: wallet.currency },
    });

    return this.findOne(db, wallet.id);
  }

  async findAll(db: PrismaClient, query: { customerId?: string; status?: string; page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      db.wallet.findMany({
        where,
        skip,
        take: limit,
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
      }),
      db.wallet.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(db: PrismaClient, id: string) {
    const wallet = await db.wallet.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async update(db: PrismaClient, tenantId: string, id: string, dto: UpdateWalletDto) {
    const wallet = await db.wallet.findUnique({ where: { id } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.status === 'TERMINATED') throw new BadRequestException('Cannot update a terminated wallet');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.expirationAt !== undefined) data.expirationAt = dto.expirationAt ? new Date(dto.expirationAt) : null;
    if (dto.metadata !== undefined) data.metadata = dto.metadata as any;

    await db.wallet.update({ where: { id }, data });

    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'wallet.updated',
      payload: { walletId: id, customerId: wallet.customerId },
    });

    return this.findOne(db, id);
  }

  async terminate(db: PrismaClient, tenantId: string, id: string) {
    const wallet = await db.wallet.findUnique({ where: { id } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.status === 'TERMINATED') throw new BadRequestException('Wallet is already terminated');

    const now = new Date();
    const remaining = Number(wallet.creditsBalance);

    // Void any remaining credits
    if (remaining > 0) {
      const voidAmount = this.creditsToAmount(remaining, Number(wallet.rateAmount));
      await db.walletTransaction.create({
        data: {
          walletId: id,
          transactionType: 'OUTBOUND',
          status: 'SETTLED',
          transactionStatus: 'VOIDED',
          creditAmount: remaining,
          amount: voidAmount,
          settledAt: now,
          metadata: { reason: 'wallet_terminated' } as any,
        },
      });
    }

    const terminated = await db.wallet.update({
      where: { id },
      data: {
        status: 'TERMINATED',
        terminatedAt: now,
        creditsBalance: 0,
        balance: 0,
      },
      include: { customer: true },
    });

    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'wallet.terminated',
      payload: { walletId: id, customerId: wallet.customerId },
    });

    return terminated;
  }

  // --- Transactions ---

  async topUp(db: PrismaClient, tenantId: string, dto: TopUpWalletDto) {
    const wallet = await db.wallet.findUnique({ where: { id: dto.walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.status === 'TERMINATED') throw new BadRequestException('Cannot top up a terminated wallet');

    const results: any[] = [];

    if (dto.voidedCredits && dto.voidedCredits > 0) {
      if (dto.voidedCredits > Number(wallet.creditsBalance)) {
        throw new BadRequestException(
          `Cannot void ${dto.voidedCredits} credits — only ${wallet.creditsBalance} available`,
        );
      }
      results.push(await this.removeCredits(db, wallet.id, dto.voidedCredits, 'VOIDED', tenantId, undefined, dto.metadata));
    }

    if (dto.grantedCredits && dto.grantedCredits > 0) {
      results.push(await this.addCredits(db, wallet.id, dto.grantedCredits, 'GRANTED', tenantId, dto.metadata));
    }

    if (dto.paidCredits && dto.paidCredits > 0) {
      results.push(await this.addCredits(db, wallet.id, dto.paidCredits, 'PURCHASED', tenantId, dto.metadata));
    }

    if (results.length === 0) {
      throw new BadRequestException('Specify at least one of: paidCredits, grantedCredits, voidedCredits');
    }

    return { transactions: results, wallet: await this.findOne(db, wallet.id) };
  }

  async listTransactions(
    db: PrismaClient,
    walletId: string,
    query: { status?: string; transactionStatus?: string; transactionType?: string; page?: number; limit?: number },
  ) {
    const wallet = await db.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { walletId };
    if (query.status) where.status = query.status;
    if (query.transactionStatus) where.transactionStatus = query.transactionStatus;
    if (query.transactionType) where.transactionType = query.transactionType;

    const [data, total] = await Promise.all([
      db.walletTransaction.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      db.walletTransaction.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // --- Balance helpers ---

  /**
   * Credit and debit run in one transaction with the wallet row locked, so the
   * transaction history and the stored balances can never disagree and two
   * concurrent debits cannot take the balance below zero.
   */
  private async addCredits(
    db: PrismaClient,
    walletId: string,
    credits: number,
    kind: 'GRANTED' | 'PURCHASED',
    tenantId: string,
    metadata?: Record<string, unknown>,
  ) {
    return db.$transaction((tx) => this.applyChange(tx, walletId, { credits, kind, metadata }));
  }

  private async removeCredits(
    db: PrismaClient,
    walletId: string,
    credits: number,
    kind: 'VOIDED' | 'INVOICED',
    tenantId: string,
    invoiceId?: string,
    metadata?: Record<string, unknown>,
  ) {
    return db.$transaction((tx) => this.applyChange(tx, walletId, { credits, kind, invoiceId, metadata }));
  }

  /**
   * Move money in or out of a wallet inside the caller's transaction, by
   * monetary amount (converted to credits at the wallet's rate). Used by
   * payouts, collections and transfers so the wallet change commits together
   * with the status change that caused it.
   */
  async applyAmountInTransaction(
    tx: WalletTx,
    walletId: string,
    amount: number,
    kind: WalletTransactionKind,
    metadata?: Record<string, unknown>,
  ) {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const credits = this.amountToCredits(amount, Number(wallet.rateAmount));
    return this.applyChange(tx, walletId, { credits, kind, metadata }, true);
  }

  private async applyChange(
    tx: WalletTx,
    walletId: string,
    change: { credits: number; kind: WalletTransactionKind; invoiceId?: string; metadata?: Record<string, unknown> },
    alreadyLocked = false,
  ) {
    if (!alreadyLocked) {
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
    }
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const inbound = INBOUND_KINDS.has(change.kind);
    const { credits } = change;
    if (!inbound && credits > Number(wallet.creditsBalance) + 1e-9) {
      throw new BadRequestException(
        `Wallet ${walletId} has ${wallet.creditsBalance} credits; cannot remove ${credits}`,
      );
    }

    const amount = this.creditsToAmount(credits, Number(wallet.rateAmount));
    const txn = await tx.walletTransaction.create({
      data: {
        walletId,
        transactionType: inbound ? 'INBOUND' : 'OUTBOUND',
        status: 'SETTLED',
        transactionStatus: change.kind,
        creditAmount: credits,
        amount,
        invoiceId: change.invoiceId,
        settledAt: new Date(),
        metadata: change.metadata as any,
      },
    });

    // Consumption counts only what customers actually used (invoices, expiry),
    // not money moved out by payouts or transfers.
    const consumed = change.kind === 'INVOICED' || change.kind === 'VOIDED';
    await tx.wallet.update({
      where: { id: walletId },
      data: inbound
        ? { creditsBalance: { increment: credits }, balance: { increment: amount } }
        : {
            creditsBalance: { decrement: credits },
            balance: { decrement: amount },
            ...(consumed && { consumedCredits: { increment: credits }, consumedAmount: { increment: amount } }),
          },
    });

    return txn;
  }

  // --- Invoice integration ---

  /**
   * Auto-deduct wallet credits from an invoice during finalization.
   * Wallets are applied in creation order (oldest first), after coupons.
   * Returns the total monetary amount deducted.
   */
  async applyToInvoice(
    db: PrismaClient,
    tenantId: string,
    customerId: string,
    invoiceId: string,
    invoiceAmount: number,
    currency: string,
  ): Promise<number> {
    if (invoiceAmount <= 0) return 0;

    // Once per invoice: a retried job gets back what was already deducted.
    const previous = await db.walletTransaction.findMany({
      where: { invoiceId, transactionStatus: 'INVOICED' },
      select: { amount: true },
    });
    if (previous.length) return previous.reduce((sum, t) => sum.add(dec(t.amount)), new Dec(0)).toNumber();

    const wallets = await db.wallet.findMany({
      where: {
        customerId,
        status: 'ACTIVE',
        currency: currency.toUpperCase(),
        balance: { gt: 0 },
        OR: [{ expirationAt: null }, { expirationAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
    });

    let remaining = dec(invoiceAmount);
    let totalDeducted = new Dec(0);

    for (const wallet of wallets) {
      if (remaining.lte(0)) break;

      const deductAmount = Dec.min(remaining, dec(wallet.balance));
      if (deductAmount.lte(0)) continue;
      const deductCredits = this.amountToCredits(deductAmount.toNumber(), Number(wallet.rateAmount));

      await this.removeCredits(db, wallet.id, deductCredits, 'INVOICED', tenantId, invoiceId);

      remaining = remaining.sub(deductAmount);
      totalDeducted = totalDeducted.add(deductAmount);

      this.logger.log(
        `Wallet ${wallet.id}: deducted ${deductCredits} credits (${deductAmount} ${currency}) for invoice ${invoiceId}`,
      );
    }

    return totalDeducted.toNumber();
  }

  /** Give back the credits an invoice used, when it is voided. Once per invoice. */
  async refundInvoice(db: PrismaClient, invoiceId: string): Promise<number> {
    const used = await db.walletTransaction.findMany({ where: { invoiceId, transactionStatus: 'INVOICED' } });
    let refunded = new Dec(0);
    for (const txn of used) {
      const done = await db.walletTransaction.findFirst({
        where: { invoiceId, walletId: txn.walletId, transactionStatus: 'REFUNDED' },
        select: { id: true },
      });
      if (done) continue;
      await db.$transaction((tx) =>
        this.applyChange(tx, txn.walletId, {
          credits: Number(txn.creditAmount),
          kind: 'REFUNDED',
          invoiceId,
          metadata: { reason: 'invoice_voided' },
        }),
      );
      refunded = refunded.add(dec(txn.amount));
    }
    return refunded.toNumber();
  }

  // --- Expiration (called by cron) ---

  async processExpirations(db: PrismaClient, tenantId: string): Promise<number> {
    const expired = await db.wallet.findMany({
      where: {
        status: 'ACTIVE',
        expirationAt: { lte: new Date() },
        creditsBalance: { gt: 0 },
      },
    });

    for (const wallet of expired) {
      const remaining = Number(wallet.creditsBalance);
      if (remaining > 0) {
        await this.removeCredits(db, wallet.id, remaining, 'VOIDED', tenantId, undefined, { reason: 'expired' });
      }
      await db.wallet.update({
        where: { id: wallet.id },
        data: { status: 'TERMINATED', terminatedAt: new Date() },
      });
      this.logger.log(`Wallet ${wallet.id} expired — voided ${remaining} credits`);
    }

    return expired.length;
  }
}
