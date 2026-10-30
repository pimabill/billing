import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { encryptValue } from '../src/services/crypto';
import { execSync } from 'child_process';

const centralDb = new PrismaClient({
  datasources: {
    db: { url: process.env.CENTRAL_DATABASE_URL },
  },
});

function encrypt(text: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not set');

  return encryptValue(text, key);
}

async function seedDemoTenant(): Promise<void> {
  console.log('Creating demo tenant...\n');

  const internalUrl = process.env.INTERNAL_POSTGRES_URL;
  if (!internalUrl) {
    throw new Error('INTERNAL_POSTGRES_URL not set');
  }

  // Create tenant in central DB
  const apiKey = `sk_live_${randomBytes(32).toString('hex')}`;
  const webhookSecret = randomBytes(32).toString('hex');

  const tenant = await centralDb.tenant.create({
    data: {
      name: 'Demo User',
      slug: 'demo-company',
      email: 'demo@pimabill.com',
      password: '$2b$10$dummyhashedpasswordfordemo', // "password123"
      // Stored hashed, like every API key; the plaintext is printed once below.
      apiKeyHash: createHash('sha256').update(apiKey).digest('hex'),
      apiKeyLast4: apiKey.slice(-4),
      webhookSecret,
    },
  });

  await centralDb.tenantBilling.create({
    data: { tenantId: tenant.id, status: 'active' },
  });

  console.log(`Tenant created: ${tenant.id}`);
  console.log(`API Key: ${apiKey}`);

  // Create demo database
  const dbName = `tenant_demo`;
  const dbUser = `tenant_user_demo`;
  const dbPassword = randomBytes(24).toString('hex');

  const adminClient = new PrismaClient({
    datasources: { db: { url: internalUrl } },
  });

  try {
    await adminClient.$connect();
    await adminClient.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    await adminClient.$executeRawUnsafe(
      `CREATE USER "${dbUser}" WITH ENCRYPTED PASSWORD '${dbPassword}'`,
    );
    await adminClient.$executeRawUnsafe(
      `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`,
    );
  } catch (error) {
    console.log('Database may already exist, continuing...');
  } finally {
    await adminClient.$disconnect();
  }

  const urlObj = new URL(internalUrl);
  const connectionUrl = `postgresql://${dbUser}:${dbPassword}@${urlObj.hostname}:${urlObj.port || '5432'}/${dbName}?schema=public`;

  await centralDb.databaseConnection.create({
    data: {
      tenantId: tenant.id,
      provider: 'INTERNAL',
      connectionUrl: encrypt(connectionUrl),
      isHealthy: true,
      lastHealthCheck: new Date(),
    },
  });

  // Run migrations
  console.log('Running tenant migrations...');
  execSync(
    'npx prisma migrate deploy --schema=./prisma/schema-tenant.prisma',
    {
      env: { ...process.env, DATABASE_URL: connectionUrl },
      encoding: 'utf-8',
    },
  );

  // Seed tenant data
  const tenantDb = new PrismaClient({
    datasources: { db: { url: connectionUrl } },
  });

  await tenantDb.$connect();

  console.log('Seeding customers...');
  const customers = [];
  for (let i = 1; i <= 10; i++) {
    const customer = await tenantDb.customer.create({
      data: {
        externalId: `user_${i}`,
        email: `customer${i}@example.com`,
        name: `Customer ${i}`,
        country: ['NG', 'KE', 'GH', 'ZA', 'US'][i % 5],
        currency: ['NGN', 'KES', 'GHS', 'ZAR', 'USD'][i % 5],
      },
    });
    customers.push(customer);
  }

  console.log('Seeding plans...');
  const plans = [];
  const planDefs = [
    { name: 'Starter', code: 'starter_monthly', interval: 'MONTHLY', price: 9.99 },
    { name: 'Pro Monthly', code: 'pro_monthly', interval: 'MONTHLY', price: 29.99 },
    { name: 'Pro Yearly', code: 'pro_yearly', interval: 'YEARLY', price: 299.99 },
    { name: 'Enterprise Monthly', code: 'enterprise_monthly', interval: 'MONTHLY', price: 99.99 },
    { name: 'Enterprise Yearly', code: 'enterprise_yearly', interval: 'YEARLY', price: 999.99 },
  ];

  for (const def of planDefs) {
    const plan = await tenantDb.plan.create({
      data: {
        name: def.name,
        code: def.code,
        billingInterval: def.interval as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
        features: ['Feature A', 'Feature B'],
        prices: {
          create: [
            { currency: 'USD', amount: def.price },
            { currency: 'NGN', amount: def.price * 1500 },
          ],
        },
      },
    });
    plans.push(plan);
  }

  console.log('Seeding subscriptions...');
  for (let i = 0; i < Math.min(customers.length, 8); i++) {
    const plan = plans[i % plans.length];
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);

    await tenantDb.subscription.create({
      data: {
        customerId: customers[i].id,
        planId: plan.id,
        currency: 'USD',
        status: i < 6 ? 'ACTIVE' : i < 7 ? 'TRIALING' : 'CANCELED',
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });
  }

  console.log('Seeding invoices...');
  const subscriptions = await tenantDb.subscription.findMany();
  for (const sub of subscriptions) {
    for (let j = 0; j < 3; j++) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (j + 1) * 30);

      await tenantDb.invoice.create({
        data: {
          subscriptionId: sub.id,
          customerId: sub.customerId,
          amount: 29.99,
          currency: sub.currency,
          status: j === 0 ? 'PAID' : j === 1 ? 'PENDING' : 'PENDING',
          dueDate,
          paidAt: j === 0 ? new Date() : null,
        },
      });
    }
  }

  await tenantDb.$disconnect();

  console.log('\nDemo tenant seeded successfully!');
  console.log('---');
  console.log(`Email: demo@pimabill.com`);
  console.log(`API Key: ${apiKey}`);
  console.log(`Customers: 10`);
  console.log(`Plans: ${planDefs.length}`);
  console.log(`Subscriptions: ${subscriptions.length}`);
  console.log('---');

  await centralDb.$disconnect();
}

seedDemoTenant().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
