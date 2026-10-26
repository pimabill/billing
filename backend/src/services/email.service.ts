import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { promises as dns } from 'dns';
import { CentralPrismaService } from '../database/central-prisma.service';
import { getBrand } from '../config/brand';
import { EncryptionService } from './encryption.service';
import { isSandbox } from '../config/sandbox';
import { resolvePublicHost } from '../common/net/safe-url';

/** Sandbox emails say so in the subject, so nobody mistakes a test invoice for a real one. */
const sandboxSubject = (subject: string) => (isSandbox() ? `[Sandbox] ${subject}` : subject);

/** Domains that never receive mail (RFC 2606 and 6761). */
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost|local)$/i;
const DOMAIN_CACHE_MS = 60 * 60 * 1000;

/** Ports a tenant's SMTP server may use. */
export const SMTP_PORTS = [25, 465, 587, 2525];
/** How a stored SMTP password is shown: never in full. */
export const SMTP_PASSWORD_MASK = '********';
const ENCRYPTED_PREFIX = 'enc:';

export interface SmtpSettings {
  host: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  from?: string;
  fromName?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private systemTransporter: nodemailer.Transporter | null = null;
  private tenantTransporters = new Map<string, { transporter: nodemailer.Transporter; from: string; cachedAt: number }>();
  private domainCache = new Map<string, { receives: boolean; checkedAt: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly centralPrisma: CentralPrismaService,
    private readonly encryption: EncryptionService,
  ) {
    const host = this.configService.get<string>('EMAIL_HOST');
    if (host) {
      this.systemTransporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('EMAIL_PORT', 587),
        secure: false,
        auth: {
          user: this.configService.get<string>('EMAIL_USER'),
          pass: this.configService.get<string>('EMAIL_PASSWORD'),
        },
      });
    }
  }

  /**
   * Get a nodemailer transporter for a tenant.
   * Uses tenant SMTP settings if configured, otherwise falls back to system SMTP.
   */
  private async getTransporterForTenant(tenantId?: string): Promise<{ transporter: nodemailer.Transporter | null; from: string }> {
    const systemFromEmail = this.configService.get<string>('EMAIL_FROM', getBrand().supportEmail);
    const systemFromName = this.configService.get<string>('EMAIL_FROM_NAME', process.env.BRAND_NAME?.trim() || 'PimaBill');
    const systemFrom = `"${systemFromName}" <${systemFromEmail}>`;

    if (!tenantId) {
      return { transporter: this.systemTransporter, from: systemFrom };
    }

    // Check cache
    const cached = this.tenantTransporters.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < EmailService.CACHE_TTL_MS) {
      return { transporter: cached.transporter, from: cached.from };
    }

    // Lookup tenant SMTP settings
    try {
      const tenant = await this.centralPrisma.client.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true, email: true },
      });

      const settings = (tenant?.settings || {}) as Record<string, unknown>;
      const smtp = settings.smtp as SmtpSettings | undefined;

      if (smtp?.host) {
        const port = smtp.port || 587;
        if (!SMTP_PORTS.includes(port)) throw new Error(`SMTP port ${port} is not allowed`);
        // Connect to the checked public address, keeping the name for TLS.
        const address = await resolvePublicHost(smtp.host);
        const password = this.smtpPassword(smtp.password);
        const transporter = nodemailer.createTransport({
          host: address,
          port,
          secure: smtp.secure || false,
          tls: { servername: smtp.host },
          ...(smtp.user && password
            ? { auth: { user: smtp.user, pass: password } }
            : {}),
        });

        const fromEmail = smtp.from || tenant?.email || systemFromEmail;
        const from = smtp.fromName ? `"${smtp.fromName}" <${fromEmail}>` : fromEmail;

        this.tenantTransporters.set(tenantId, { transporter, from, cachedAt: Date.now() });
        return { transporter, from };
      }
    } catch (error) {
      this.logger.warn(`Failed to load SMTP settings for tenant ${tenantId}, using system SMTP: ${error instanceof Error ? error.message : error}`);
    }

    // Fallback to system SMTP
    return { transporter: this.systemTransporter, from: systemFrom };
  }

  /** Stored SMTP passwords are encrypted; older plaintext ones still work. */
  private smtpPassword(stored?: string): string | undefined {
    if (!stored) return undefined;
    return stored.startsWith(ENCRYPTED_PREFIX) ? this.encryption.decrypt(stored.slice(ENCRYPTED_PREFIX.length)) : stored;
  }

  encryptSmtpPassword(password: string): string {
    return `${ENCRYPTED_PREFIX}${this.encryption.encrypt(password)}`;
  }

  /** Drop a tenant's cached transport after its SMTP settings change. */
  forgetTenant(tenantId: string): void {
    this.tenantTransporters.delete(tenantId);
  }

  /**
   * Why the platform's own mail account should not send to this address, or
   * null to send. Every send counts against the platform's quota and every
   * bounce against its reputation, so it skips domains that cannot receive
   * mail; the sandbox emails only people with a login or an invitation (test
   * customers are usually made up), like a payment provider's test mode.
   * A tenant's own SMTP server is theirs to spend.
   */
  async refusal(to: string, transporter: nodemailer.Transporter): Promise<string | null> {
    if (transporter !== this.systemTransporter) return null;
    const domain = to.split('@').pop()?.trim().toLowerCase() ?? '';
    if (!domain || RESERVED_DOMAIN.test(domain)) return 'a test domain';
    if (isSandbox()) {
      const email = { equals: to.trim(), mode: 'insensitive' as const };
      const [user, invitation] = await Promise.all([
        this.centralPrisma.client.user.findFirst({ where: { email }, select: { id: true } }),
        this.centralPrisma.client.invitation.findFirst({ where: { email, acceptedAt: null }, select: { id: true } }),
      ]);
      if (!user && !invitation) return 'the sandbox emails only team members';
    }
    if (!(await this.receivesMail(domain))) return `${domain} has no mail server`;
    return null;
  }

  /** A domain receives mail if it has an MX record, or else an address (RFC 5321). */
  private async receivesMail(domain: string): Promise<boolean> {
    const cached = this.domainCache.get(domain);
    if (cached && Date.now() - cached.checkedAt < DOMAIN_CACHE_MS) return cached.receives;
    const has = (lookup: Promise<unknown[]>) => lookup.then((r) => r.length > 0, (e: NodeJS.ErrnoException) => (['ENOTFOUND', 'ENODATA'].includes(e.code ?? '') ? false : null));
    // A lookup that fails for another reason (a timeout) proves nothing: send.
    const mx = await has(dns.resolveMx(domain));
    const receives = mx !== false || (await has(dns.resolve4(domain))) !== false;
    this.domainCache.set(domain, { receives, checkedAt: Date.now() });
    return receives;
  }

  async sendMail(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
    tenantId?: string,
    attachments?: { filename: string; content: string; contentType: string }[],
  ): Promise<void> {
    const { transporter, from } = await this.getTransporterForTenant(tenantId);
    subject = sandboxSubject(subject);

    if (!transporter) {
      this.logger.warn(`Email not configured. Would send to ${to}: ${subject}`);
      this.logger.debug(`Template: ${template}, Context: ${JSON.stringify(context)}`);
      return;
    }
    const refused = await this.refusal(to, transporter);
    if (refused) {
      this.logger.log(`Not sent to ${to} (${refused}): ${subject}`);
      return;
    }

    const html = this.renderTemplate(template, context);

    const mailAttachments = attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'base64'),
      contentType: a.contentType,
    }));

    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text: this.stripHtml(html),
        ...(mailAttachments?.length && { attachments: mailAttachments }),
      });
      this.logger.log(`Email sent to ${to}: ${subject}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }

  /** Send ready-made HTML; false when neither the tenant nor the platform has SMTP set up. */
  async sendHtml(to: string, subject: string, html: string, tenantId?: string): Promise<boolean> {
    const { transporter, from } = await this.getTransporterForTenant(tenantId);
    subject = sandboxSubject(subject);
    if (!transporter) {
      this.logger.warn(`Email not configured. Would send to ${to}: ${subject}`);
      return false;
    }
    const refused = await this.refusal(to, transporter);
    if (refused) {
      this.logger.log(`Not sent to ${to} (${refused}): ${subject}`);
      return false;
    }
    await transporter.sendMail({ from, to, subject, html, text: this.stripHtml(html) });
    this.logger.log(`Email sent to ${to}: ${subject}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
    return true;
  }

  /** Invalidate cached transporter for a tenant (call after SMTP settings change) */
  invalidateTenantCache(tenantId: string): void {
    this.tenantTransporters.delete(tenantId);
  }

  async sendInvoiceEmail(
    customerEmail: string,
    customerName: string,
    invoiceId: string,
    amount: string,
    currency: string,
    dueDate: string,
    pdfUrl?: string,
  ): Promise<void> {
    await this.sendMail(customerEmail, `Invoice ${invoiceId}`, 'invoice', {
      customerName,
      invoiceId,
      amount,
      currency,
      dueDate,
      pdfUrl,
    });
  }

  async sendPaymentConfirmation(
    customerEmail: string,
    customerName: string,
    amount: string,
    currency: string,
  ): Promise<void> {
    await this.sendMail(customerEmail, 'Payment Confirmation', 'payment-confirmation', {
      customerName,
      amount,
      currency,
    });
  }

  async sendPaymentFailed(
    customerEmail: string,
    customerName: string,
    amount: string,
    currency: string,
    reason: string,
  ): Promise<void> {
    await this.sendMail(customerEmail, 'Payment Failed', 'payment-failed', {
      customerName,
      amount,
      currency,
      reason,
    });
  }

  /** Wraps body content in a modern, responsive email layout */
  private wrapInLayout(body: string, context: Record<string, unknown>): string {
    const tenantName = String(context.tenantName || 'Your billing provider');
    const accentColor = '#6d28d9';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background-color:${accentColor};padding:24px 32px;">
<span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${tenantName}</span>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px;">
${body}
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 32px;border-top:1px solid #e4e4e7;background-color:#fafafa;">
<p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;">
This email was sent by ${tenantName}.<br>
Powered by <span style="color:${accentColor};font-weight:600;">${getBrand().name}</span>
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
  }

  private renderTemplate(template: string, context: Record<string, unknown>): string {
    const s = (key: string) => String(context[key] ?? '');
    const accentColor = '#6d28d9';

    const heading = (text: string) =>
      `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">${text}</h1>`;
    const subtext = (text: string) =>
      `<p style="margin:0 0 24px;font-size:14px;color:#71717a;line-height:1.5;">${text}</p>`;
    const greeting = () =>
      `<p style="margin:0 0 16px;font-size:15px;color:#3f3f46;">Hi ${s('customerName') || 'there'},</p>`;
    const paragraph = (text: string) =>
      `<p style="margin:0 0 16px;font-size:15px;color:#3f3f46;line-height:1.6;">${text}</p>`;
    const button = (text: string, url: string) =>
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background-color:${accentColor};border-radius:8px;"><a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${text}</a></td></tr></table>`;
    const metricRow = (label: string, value: string) =>
      `<tr><td style="padding:8px 0;font-size:14px;color:#71717a;border-bottom:1px solid #f4f4f5;">${label}</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#18181b;text-align:right;border-bottom:1px solid #f4f4f5;">${value}</td></tr>`;
    const metricTable = (rows: string) =>
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">${rows}</table>`;
    const badge = (text: string, bgColor: string, textColor: string) =>
      `<span style="display:inline-block;padding:4px 12px;font-size:12px;font-weight:600;color:${textColor};background-color:${bgColor};border-radius:20px;">${text}</span>`;

    const templates: Record<string, string> = {
      // --- Trial lifecycle ---
      'trial-started': [
        heading('Your free trial has started'),
        subtext('Welcome aboard! Your trial is now active.'),
        greeting(),
        paragraph(
          `You now have access to the <strong>${s('planName')}</strong> plan. Your free trial runs until <strong>${s('trialEnd')}</strong>.`,
        ),
        metricTable(
          metricRow('Plan', s('planName')) +
            metricRow('Trial ends', s('trialEnd')) +
            metricRow('Status', 'Trial Active'),
        ),
        paragraph(
          'Take this time to explore all the features. No payment is required until your trial ends.',
        ),
      ].join('\n'),

      'trial-ending-soon': [
        heading('Your trial ends soon'),
        subtext('Just a heads up — your free trial is almost over.'),
        greeting(),
        paragraph(
          `Your free trial of the <strong>${s('planName')}</strong> plan will end on <strong>${s('trialEnd')}</strong>.`,
        ),
        paragraph(
          'After the trial ends, your subscription will automatically become active and billing will begin. Make sure your payment method is up to date.',
        ),
        metricTable(metricRow('Plan', s('planName')) + metricRow('Trial ends', s('trialEnd'))),
      ].join('\n'),

      'trial-converted': [
        heading('Your trial has ended'),
        subtext('Your subscription is now active.'),
        greeting(),
        paragraph(
          `Your free trial of the <strong>${s('planName')}</strong> plan has ended and your subscription is now active.`,
        ),
        metricTable(
          metricRow('Plan', s('planName')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Status', 'Active'),
        ),
        paragraph('Your first invoice has been generated. Thank you for your continued trust.'),
      ].join('\n'),

      // --- Subscription lifecycle ---
      'subscription-activated': [
        heading('Subscription confirmed'),
        subtext('You are all set.'),
        greeting(),
        paragraph(`Your subscription to the <strong>${s('planName')}</strong> plan is now active.`),
        metricTable(
          metricRow('Plan', s('planName')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Billing cycle', s('interval')),
        ),
      ].join('\n'),

      'subscription-paused': [
        heading('Subscription paused'),
        subtext('Your subscription has been temporarily paused.'),
        greeting(),
        paragraph(
          `Your <strong>${s('planName')}</strong> subscription has been paused. You will not be billed during this period.`,
        ),
        paragraph('You can resume your subscription at any time to regain access.'),
      ].join('\n'),

      'subscription-resumed': [
        heading('Subscription resumed'),
        subtext('Welcome back!'),
        greeting(),
        paragraph(
          `Your <strong>${s('planName')}</strong> subscription has been resumed and is now active again.`,
        ),
        paragraph('Billing will continue from your next billing cycle.'),
      ].join('\n'),

      'subscription-plan-changed': [
        heading('Plan changed'),
        subtext('Your subscription has been updated.'),
        greeting(),
        paragraph(
          `Your subscription has been changed from <strong>${s('oldPlanName')}</strong> to <strong>${s('newPlanName')}</strong>.`,
        ),
        metricTable(
          metricRow('Previous plan', s('oldPlanName')) +
            metricRow('New plan', s('newPlanName')) +
            metricRow('Effective', 'Immediately'),
        ),
        paragraph('A new billing period has started with the updated plan.'),
      ].join('\n'),

      'subscription-canceled': [
        heading('Subscription canceled'),
        subtext('We are sorry to see you go.'),
        greeting(),
        paragraph(
          `Your subscription has been canceled and will end <strong>${s('cancelAt')}</strong>.`,
        ),
        paragraph(
          'You will continue to have access until the end of your current billing period. If this was a mistake, you can resubscribe at any time.',
        ),
      ].join('\n'),

      // --- Invoice lifecycle ---
      invoice: [
        heading('New invoice'),
        subtext(`Invoice ${s('invoiceId')} is ready.`),
        greeting(),
        paragraph('A new invoice has been generated for your account.'),
        metricTable(
          metricRow('Invoice', s('invoiceId')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Due date', s('dueDate')) +
            metricRow('Status', 'Pending'),
        ),
        paragraph('The invoice PDF is attached to this email for your records.'),
        paragraph('Please ensure payment is made by the due date to avoid service interruption.'),
      ].join('\n'),

      'invoice-paid': [
        heading('Payment received'),
        subtext(`Invoice ${s('invoiceId')} has been paid.`),
        greeting(),
        paragraph('We have received your payment. Thank you!'),
        metricTable(
          metricRow('Invoice', s('invoiceId')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Status', 'Paid'),
        ),
      ].join('\n'),

      'invoice-voided': [
        heading('Invoice voided'),
        subtext(`Invoice ${s('invoiceId')} has been voided.`),
        greeting(),
        paragraph(
          `Invoice <strong>${s('invoiceId')}</strong> has been voided and is no longer due. No payment is required.`,
        ),
      ].join('\n'),

      // --- Payment lifecycle ---
      'payment-confirmation': [
        heading('Payment successful'),
        subtext(s('invoiceId') ? `Invoice ${s('invoiceId')} has been paid.` : 'Your payment has been processed.'),
        greeting(),
        paragraph(
          `Your payment of <strong>${s('currency')} ${s('amount')}</strong> has been successfully processed. Thank you!`,
        ),
        s('invoiceId')
          ? metricTable(
              metricRow('Invoice', s('invoiceId')) +
                metricRow('Amount', `${s('currency')} ${s('amount')}`) +
                metricRow('Status', badge('Paid', '#dcfce7', '#166534')),
            )
          : '',
        s('invoiceId') ? paragraph('The paid invoice is attached to this email for your records.') : '',
      ].join('\n'),

      'payment-failed': [
        heading('Payment failed'),
        subtext('We were unable to process your payment.'),
        greeting(),
        paragraph(
          `Your payment of <strong>${s('currency')} ${s('amount')}</strong> could not be processed.`,
        ),
        context.reason ? paragraph(`<strong>Reason:</strong> ${s('reason')}`) : '',
        paragraph('Please update your payment method and try again to avoid service interruption.'),
      ].join('\n'),

      'payment-refunded': [
        heading('Refund processed'),
        subtext('Your refund has been issued.'),
        greeting(),
        paragraph(
          `A refund of <strong>${s('currency')} ${s('amount')}</strong> has been issued to your original payment method.`,
        ),
        paragraph('Please allow 5-10 business days for the refund to appear on your statement.'),
      ].join('\n'),

      // --- Payment reminders ---
      'payment-reminder-upcoming': [
        heading('Upcoming payment'),
        subtext(`Invoice ${s('invoiceId')} is due soon.`),
        greeting(),
        paragraph(
          `This is a friendly reminder that invoice <strong>${s('invoiceId')}</strong> for <strong>${s('currency')} ${s('amount')}</strong> is due on <strong>${s('dueDate')}</strong>.`,
        ),
        metricTable(
          metricRow('Invoice', s('invoiceId')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Due date', s('dueDate')),
        ),
        paragraph('The invoice PDF is attached for your reference.'),
        paragraph('Please ensure payment is made by the due date to avoid any disruption to your service.'),
      ].join('\n'),

      'payment-reminder-due-today': [
        heading('Payment due today'),
        subtext(`Invoice ${s('invoiceId')} is due today.`),
        greeting(),
        paragraph(
          `Invoice <strong>${s('invoiceId')}</strong> for <strong>${s('currency')} ${s('amount')}</strong> is due <strong>today</strong>.`,
        ),
        metricTable(
          metricRow('Invoice', s('invoiceId')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Status', badge('Due Today', '#fef3c7', '#92400e')),
        ),
        paragraph('The invoice PDF is attached for your reference.'),
        paragraph('Please make your payment today to avoid service interruption.'),
      ].join('\n'),

      'payment-reminder-overdue': [
        heading('Payment overdue'),
        subtext(`Invoice ${s('invoiceId')} is past due.`),
        greeting(),
        paragraph(
          `Invoice <strong>${s('invoiceId')}</strong> for <strong>${s('currency')} ${s('amount')}</strong> was due on <strong>${s('dueDate')}</strong> and is now <strong>${s('daysOverdue')} days overdue</strong>.`,
        ),
        metricTable(
          metricRow('Invoice', s('invoiceId')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Due date', s('dueDate')) +
            metricRow('Status', badge('Overdue', '#fee2e2', '#991b1b')),
        ),
        paragraph('The invoice PDF is attached for your reference.'),
        paragraph('Please make your payment as soon as possible to avoid service interruption or account suspension.'),
      ].join('\n'),

      // --- Dunning / payment retry ---
      'payment-retry-success': [
        heading('Payment successful'),
        subtext(`Invoice ${s('invoiceNumber')} has been paid.`),
        greeting(),
        paragraph(
          `Great news! Your payment of <strong>${s('currency')} ${s('amount')}</strong> for invoice <strong>${s('invoiceNumber')}</strong> has been successfully processed.`,
        ),
        paragraph('Your subscription is now in good standing. Thank you!'),
      ].join('\n'),

      'payment-retry-failed': [
        heading('Payment retry failed'),
        subtext('We will try again soon.'),
        greeting(),
        paragraph(
          `We attempted to charge your payment method for <strong>${s('currency')} ${s('amount')}</strong> (invoice <strong>${s('invoiceNumber')}</strong>), but it was unsuccessful.`,
        ),
        metricTable(
          metricRow('Invoice', s('invoiceNumber')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Attempt', `${s('attemptNumber')} of 3`) +
            metricRow('Next retry', s('nextRetryDate')),
        ),
        paragraph('Please update your payment method to avoid service interruption.'),
      ].join('\n'),

      'payment-retry-exhausted': [
        heading('Subscription canceled'),
        subtext('All payment attempts have failed.'),
        greeting(),
        paragraph(
          `We were unable to collect payment for invoice <strong>${s('invoiceNumber')}</strong> after multiple attempts. As a result, your subscription has been <strong>canceled</strong>.`,
        ),
        metricTable(
          metricRow('Invoice', s('invoiceNumber')) +
            metricRow('Amount', `${s('currency')} ${s('amount')}`) +
            metricRow('Status', badge('Canceled', '#fee2e2', '#991b1b')),
        ),
        paragraph('To reactivate your subscription, please update your payment method and subscribe again.'),
      ].join('\n'),
    };

    const templateBody = templates[template] || paragraph(template);

    // Process conditionals: {{#if key}}...{{/if}}
    let html = templateBody.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (_match, key, content) => {
      return context[key] ? content : '';
    });

    // Replace remaining variables
    for (const [key, value] of Object.entries(context)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value ?? ''));
    }

    return this.wrapInLayout(html, context);
  }

  /**
   * The plain-text part of an email: everything outside tags, in one linear
   * pass (no regular expression to backtrack, and a nested `<<b>script>`
   * leaves no tag behind), then whitespace collapsed.
   */
  private stripHtml(html: string): string {
    let text = '';
    let depth = 0;
    for (const ch of html) {
      if (ch === '<') depth++;
      else if (ch === '>') depth = Math.max(0, depth - 1);
      else if (depth === 0) text += ch;
    }
    return text.split(/\s+/).filter(Boolean).join(' ');
  }
}
