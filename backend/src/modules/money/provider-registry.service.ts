import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { CHECKOUT_PROVIDER_NAMES, ProviderFactory } from '../../providers/provider.factory';
import { EncryptionService } from '../../services/encryption.service';
import { FlutterwavePayouts } from './adapters/flutterwave-payout.adapter';
import { HostedCheckout } from './adapters/hosted-checkout.adapter';
import { YoAdapter, YoCredentials } from './adapters/yo.adapter';
import { MtnMomoAdapter, MtnMomoCredentials } from './adapters/mtn-momo.adapter';
import { AirtelMoneyAdapter, AirtelMoneyCredentials } from './adapters/airtel-money.adapter';
import { NowPaymentsAdapter, NowPaymentsCredentials } from './adapters/nowpayments.adapter';
import { EVERSEND_COINS, EversendAdapter, EversendCredentials } from './adapters/eversend.adapter';
import { TronUsdtAdapter, TronUsdtCredentials } from './adapters/tron-usdt.adapter';
import { BscUsdtAdapter, EthUsdtAdapter, EthUsdtCredentials } from './adapters/eth-usdt.adapter';
import { BINANCE_PAY_COINS, BinancePayAdapter, BinancePayCredentials } from './adapters/binance-pay.adapter';
import { BtcAdapter, BtcCredentials } from './adapters/btc.adapter';
import { GATEWAY_COLLECT, GatewayAdapter, gatewayConfig, GatewayCredentials } from './adapters/gateway.adapter';
import { detectNetwork } from './msisdn';
import { Capabilities, MoneyProvider, Party, Rail } from './types';

/** Providers that only move money (no invoice checkout). */
export const MONEY_ONLY_PROVIDERS = [
  'yo',
  'mtn_momo',
  'airtel_money',
  'nowpayments',
  'eversend',
  'binance_pay',
  'tron_usdt',
  'eth_usdt',
  'bsc_usdt',
  'btc',
  'gateway',
];

/** Watch-only providers: payments go straight to the merchant's own wallet; we read the chain. */
export const WATCH_ONLY_PROVIDERS = ['tron_usdt', 'eth_usdt', 'bsc_usdt', 'btc'];

/** Crypto providers that collect in the stablecoin itself rather than at a fiat price. */
const STABLECOIN_PROVIDERS: Record<string, { coins: string[]; chains?: string[] }> = {
  eversend: { coins: EVERSEND_COINS },
  tron_usdt: { coins: ['USDT'], chains: ['TRON', 'TRC20', 'TRX'] },
  eth_usdt: { coins: ['USDT'], chains: ['ETHEREUM', 'ETH', 'ERC20'] },
  bsc_usdt: { coins: ['USDT'], chains: ['BSC', 'BNB', 'BEP20', 'BNB SMART CHAIN', 'BINANCE SMART CHAIN'] },
  // Paid from the payer's Binance account rather than on a chain.
  binance_pay: { coins: BINANCE_PAY_COINS.filter((c) => ['USDT', 'USDC', 'FDUSD'].includes(c)), chains: ['BINANCE', 'BINANCE PAY', 'BINANCE_PAY'] },
};

/** Crypto providers that price in the merchant's currency, and the chains they take (none listed: any). */
const FIAT_PRICED_PROVIDERS: Record<string, string[] | undefined> = { nowpayments: undefined, btc: ['BITCOIN', 'BTC'] };

/** Operator APIs that only serve their own network's subscribers. */
const NETWORK_PROVIDERS: Record<string, 'MTN' | 'AIRTEL'> = { mtn_momo: 'MTN', airtel_money: 'AIRTEL' };

/**
 * Builds a MoneyProvider for one of the tenant's configured providers,
 * combining what each integration supports.
 */
@Injectable()
export class ProviderRegistryService {
  constructor(private readonly encryption: EncryptionService) {}

  async get(db: PrismaClient, providerName: string): Promise<MoneyProvider> {
    const name = providerName.toLowerCase();
    const config = await db.paymentProvider.findFirst({ where: { providerName: name, isActive: true } });
    if (!config) {
      throw new BadRequestException(`The ${name} provider is not configured or is inactive`);
    }
    return this.build(name, JSON.parse(this.encryption.decrypt(config.credentials)), db);
  }

  /** Every active provider with what it can do. */
  async list(db: PrismaClient): Promise<{ provider: string; capabilities: Capabilities }[]> {
    const configs = await db.paymentProvider.findMany({ where: { isActive: true }, orderBy: { priority: 'asc' } });
    return configs
      .filter((c) => [...CHECKOUT_PROVIDER_NAMES, ...MONEY_ONLY_PROVIDERS].includes(c.providerName.toLowerCase()))
      .map((c) => ({ provider: c.providerName.toLowerCase(), capabilities: this.capabilitiesOf(c.providerName.toLowerCase()) }));
  }

  /**
   * First active provider, by priority, that supports this rail. For mobile
   * money, an operator's own API (MTN, Airtel) is only chosen for its own
   * subscribers, and is preferred over aggregators for them. For crypto,
   * stablecoin providers (Eversend, USDT on TRON) only take collections in
   * their coins (and chains) and NOWPayments only fiat-priced ones, so the
   * currency decides.
   */
  async pick(db: PrismaClient, kind: 'collect' | 'payout', rail: Rail, party?: Party, currency?: string): Promise<string> {
    let candidates = (await this.list(db)).filter((p) => p.capabilities[kind].includes(rail));
    if (rail === 'crypto' && currency) {
      const coin = currency.toUpperCase();
      const chain = party?.type === 'crypto' ? party.chain : undefined;
      const payCoin = party?.type === 'crypto' ? party.payCurrency?.toUpperCase() : undefined;
      candidates = candidates.filter((p) => {
        const s = STABLECOIN_PROVIDERS[p.provider];
        if (s) return s.coins.includes(coin) && (!chain || !s.chains || s.chains.includes(chain));
        if ([...EVERSEND_COINS, 'USDT'].includes(coin)) return false;
        const chains = FIAT_PRICED_PROVIDERS[p.provider];
        if (!chains) return true;
        return (!chain || chains.includes(chain)) && (!payCoin || payCoin === 'BTC');
      });
      // A connection made for the named chain (the merchant's own wallet, or Binance Pay) beats a
      // processor that takes any chain: no extra fee, no middleman.
      if (chain) {
        const named = candidates.filter((p) => (STABLECOIN_PROVIDERS[p.provider]?.chains ?? FIAT_PRICED_PROVIDERS[p.provider])?.includes(chain));
        if (named.length) candidates = named;
      }
    }
    if (rail === 'mobile_money' && party?.type === 'mobile_money') {
      const network = (party.network?.toUpperCase().startsWith('MTN') ? 'MTN' : party.network?.toUpperCase().startsWith('AIRTEL') ? 'AIRTEL' : undefined) ?? detectNetwork(party.msisdn);
      candidates = candidates.filter((p) => !NETWORK_PROVIDERS[p.provider] || NETWORK_PROVIDERS[p.provider] === network);
      const direct = candidates.find((p) => NETWORK_PROVIDERS[p.provider] === network);
      if (direct) candidates = [direct];
    }
    const match = candidates[0];
    if (!match) {
      throw new BadRequestException(
        `No configured provider can ${kind === 'collect' ? 'collect from' : 'pay out to'} ${rail.replace('_', ' ')}`,
      );
    }
    return match.provider;
  }

  /** Refuse to send an MTN number to Airtel's API or the other way round. */
  assertNetwork(provider: string, party: Party) {
    const expected = NETWORK_PROVIDERS[provider];
    if (!expected || party.type !== 'mobile_money') return;
    const detected = detectNetwork(party.msisdn);
    if (detected && detected !== expected) {
      throw new BadRequestException(`${party.msisdn} looks like an ${detected} number; ${provider} only serves ${expected} subscribers`);
    }
  }

  capabilitiesOf(name: string): Capabilities {
    if (name === 'nowpayments') {
      return { collect: ['crypto'], payout: [], balance: false, verifyPayee: false };
    }
    if (name === 'gateway') {
      return { collect: GATEWAY_COLLECT, payout: [], balance: false, verifyPayee: false };
    }
    if (WATCH_ONLY_PROVIDERS.includes(name) || name === 'binance_pay') {
      return { collect: ['crypto'], payout: [], balance: false, verifyPayee: false };
    }
    if (name === 'eversend') {
      return { collect: ['mobile_money', 'crypto'], payout: ['mobile_money', 'bank'], balance: true, verifyPayee: false };
    }
    if (name === 'mtn_momo' || name === 'airtel_money') {
      return { collect: ['mobile_money'], payout: ['mobile_money'], balance: true, verifyPayee: true };
    }
    if (name === 'yo') {
      return { collect: ['mobile_money'], payout: ['mobile_money', 'bank', 'yo_account'], balance: true, verifyPayee: true };
    }
    const hosted: Rail[] = name === 'paypal' ? ['hosted', 'paypal'] : ['hosted'];
    if (name === 'flutterwave') {
      return { collect: hosted, payout: ['bank', 'mobile_money'], balance: false, verifyPayee: false };
    }
    return { collect: hosted, payout: [], balance: false, verifyPayee: false };
  }

  build(name: string, credentials: Record<string, unknown>, db?: PrismaClient): MoneyProvider {
    if (name === 'yo') {
      return new YoAdapter(credentials as unknown as YoCredentials);
    }
    if (name === 'mtn_momo') {
      return new MtnMomoAdapter(credentials as unknown as MtnMomoCredentials);
    }
    if (name === 'airtel_money') {
      return new AirtelMoneyAdapter(credentials as unknown as AirtelMoneyCredentials);
    }
    if (name === 'nowpayments') {
      return new NowPaymentsAdapter(credentials as unknown as NowPaymentsCredentials);
    }
    if (name === 'eversend') {
      return new EversendAdapter(credentials as unknown as EversendCredentials);
    }
    if (name === 'tron_usdt') {
      if (!db) throw new Error('USDT on TRON needs the tenant database');
      return new TronUsdtAdapter(credentials as unknown as TronUsdtCredentials, db);
    }
    if (name === 'eth_usdt') {
      if (!db) throw new Error('USDT on Ethereum needs the tenant database');
      return new EthUsdtAdapter(credentials as unknown as EthUsdtCredentials, db);
    }
    if (name === 'bsc_usdt') {
      if (!db) throw new Error('USDT on BNB Chain needs the tenant database');
      return new BscUsdtAdapter(credentials as unknown as EthUsdtCredentials, db);
    }
    if (name === 'gateway') {
      const config = gatewayConfig();
      if (!config) throw new BadRequestException('The payment gateway is not available on this deployment');
      return new GatewayAdapter(credentials as unknown as GatewayCredentials, config);
    }
    if (name === 'binance_pay') {
      return new BinancePayAdapter(credentials as unknown as BinancePayCredentials);
    }
    if (name === 'btc') {
      if (!db) throw new Error('Bitcoin needs the tenant database');
      return new BtcAdapter(credentials as unknown as BtcCredentials, db);
    }

    const checkout = new HostedCheckout(ProviderFactory.create(name, credentials));
    const provider: MoneyProvider = {
      name,
      capabilities: this.capabilitiesOf(name),
      collect: (request) => checkout.collect(request),
      getCollection: (reference, txn) => checkout.getCollection(reference, txn),
    };
    if (name === 'flutterwave') {
      const payouts = new FlutterwavePayouts(String(credentials.secretKey ?? ''));
      provider.payout = (request) => payouts.payout(request);
      provider.getPayout = (reference, txn) => payouts.getPayout(reference, txn);
    }
    return provider;
  }

  /** The Yo adapter for verifying notifications, or null when Yo is not configured. */
  async yo(db: PrismaClient): Promise<YoAdapter | null> {
    const config = await db.paymentProvider.findFirst({ where: { providerName: 'yo', isActive: true } });
    if (!config) return null;
    return new YoAdapter(JSON.parse(this.encryption.decrypt(config.credentials)) as YoCredentials);
  }
}
