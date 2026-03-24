const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

function getConfig() {
  const required = ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing ${key}`);
    }
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || '3306'),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    connectTimeout: 15000
  };
}

function parseArgs(argv) {
  const args = {
    apply: false,
    limit: 500,
    paymentId: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg === '--limit') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('INVALID_LIMIT');
      }
      args.limit = value;
      i += 1;
      continue;
    }
    if (arg === '--payment-id') {
      const value = (argv[i + 1] || '').trim();
      if (!value) {
        throw new Error('INVALID_PAYMENT_ID');
      }
      args.paymentId = value;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    throw new Error(`UNKNOWN_ARG:${arg}`);
  }

  return args;
}

function printHelp() {
  console.log('Usage:');
  console.log('  node scripts/backfill-payments-sync.cjs [--apply] [--limit 500] [--payment-id <providerPaymentId>]');
  console.log('');
  console.log('Examples:');
  console.log('  npm run payments:backfill-sync');
  console.log('  npm run payments:backfill-sync -- --apply');
  console.log('  npm run payments:backfill-sync -- --payment-id 2f8a... --apply');
}

function readPaymentLinkId(metadataRaw) {
  if (!metadataRaw) return null;
  try {
    const metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
    const value = typeof metadata?.payment_link_id === 'string' ? metadata.payment_link_id.trim() : '';
    return value || null;
  } catch {
    return null;
  }
}

function normalizePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

async function findMatchingLinks(conn, payment) {
  const paymentLinkId = readPaymentLinkId(payment.metadata);

  if (paymentLinkId) {
    const [rows] = await conn.query(
      `
        SELECT
          spl.id,
          spl.student_id,
          spl.status,
          spl.provider_payment_id,
          tp.lessons_count
        FROM student_payment_links spl
        LEFT JOIN tariff_packages tp ON tp.id = spl.tariff_package_id
        WHERE spl.id = ?
      `,
      [paymentLinkId]
    );
    return { rows, mode: 'payment_link_id', paymentLinkId };
  }

  const [rows] = await conn.query(
    `
      SELECT
        spl.id,
        spl.student_id,
        spl.status,
        spl.provider_payment_id,
        tp.lessons_count
      FROM student_payment_links spl
      LEFT JOIN tariff_packages tp ON tp.id = spl.tariff_package_id
      WHERE spl.provider_payment_id = ?
    `,
    [payment.provider_payment_id]
  );
  return { rows, mode: 'provider_payment_id', paymentLinkId: null };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const conn = await mysql.createConnection(getConfig());
  const stats = {
    scannedPayments: 0,
    matchedLinks: 0,
    syncedLinks: 0,
    alreadyPaidLinks: 0,
    lessonsAddedTotal: 0,
    unresolvedPayments: 0,
    unresolvedByMode: {
      payment_link_id: 0,
      provider_payment_id: 0
    },
    unresolvedPaymentIds: [],
    modeMatches: {
      payment_link_id: 0,
      provider_payment_id: 0
    }
  };

  try {
    const where = ['status = ?'];
    const params = ['succeeded'];
    if (args.paymentId) {
      where.push('provider_payment_id = ?');
      params.push(args.paymentId);
    }
    params.push(args.limit);

    const [payments] = await conn.query(
      `
        SELECT id, provider_payment_id, lessons_count, metadata
        FROM yookassa_payments
        WHERE ${where.join(' AND ')}
        ORDER BY id DESC
        LIMIT ?
      `,
      params
    );

    stats.scannedPayments = payments.length;
    console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Payments selected: ${payments.length}`);

    for (const payment of payments) {
      const match = await findMatchingLinks(conn, payment);
      if (match.rows.length === 0) {
        stats.unresolvedPayments += 1;
        stats.unresolvedByMode[match.mode] += 1;
        stats.unresolvedPaymentIds.push(String(payment.provider_payment_id));
        continue;
      }

      stats.modeMatches[match.mode] += match.rows.length;
      stats.matchedLinks += match.rows.length;

      for (const row of match.rows) {
        const currentStatus = String(row.status);
        const lessonsFromPayment = normalizePositiveInt(payment.lessons_count);
        const lessonsFromTariff = normalizePositiveInt(row.lessons_count);
        const lessonsToAdd = lessonsFromPayment > 0 ? lessonsFromPayment : lessonsFromTariff;
        const shouldAddLessons = currentStatus !== 'paid' && lessonsToAdd > 0;

        if (currentStatus === 'paid') {
          stats.alreadyPaidLinks += 1;
        } else {
          stats.syncedLinks += 1;
          if (shouldAddLessons) {
            stats.lessonsAddedTotal += lessonsToAdd;
          }
        }

        if (!args.apply) {
          continue;
        }

        await conn.beginTransaction();
        try {
          const [lockedRows] = await conn.query(
            `
              SELECT spl.id, spl.student_id, spl.status
              FROM student_payment_links spl
              WHERE spl.id = ?
              FOR UPDATE
            `,
            [row.id]
          );

          if (lockedRows.length === 0) {
            await conn.rollback();
            continue;
          }

          const lockedStatus = String(lockedRows[0].status);
          const lockedStudentId = String(lockedRows[0].student_id);
          const lockedShouldAdd = lockedStatus !== 'paid' && lessonsToAdd > 0;

          if (lockedShouldAdd) {
            await conn.query(
              `
                UPDATE students
                SET paid_lessons_left = paid_lessons_left + ?
                WHERE id = ?
              `,
              [lessonsToAdd, lockedStudentId]
            );
          }

          await conn.query(
            `
              UPDATE student_payment_links
              SET status = 'paid', provider_payment_id = ?
              WHERE id = ?
            `,
            [payment.provider_payment_id, row.id]
          );

          await conn.commit();
        } catch (error) {
          await conn.rollback();
          throw error;
        }
      }
    }

    console.log('');
    console.log('Backfill summary');
    console.log(`- scannedPayments: ${stats.scannedPayments}`);
    console.log(`- matchedLinks: ${stats.matchedLinks}`);
    console.log(`- syncedLinks: ${stats.syncedLinks}`);
    console.log(`- alreadyPaidLinks: ${stats.alreadyPaidLinks}`);
    console.log(`- lessonsAddedTotal: ${stats.lessonsAddedTotal}`);
    console.log(`- unresolvedPayments: ${stats.unresolvedPayments}`);
    console.log(`- modeMatches.payment_link_id: ${stats.modeMatches.payment_link_id}`);
    console.log(`- modeMatches.provider_payment_id: ${stats.modeMatches.provider_payment_id}`);
    console.log(`- unresolvedByMode.payment_link_id: ${stats.unresolvedByMode.payment_link_id}`);
    console.log(`- unresolvedByMode.provider_payment_id: ${stats.unresolvedByMode.provider_payment_id}`);
    if (stats.unresolvedPaymentIds.length > 0) {
      console.log(`- unresolvedPaymentIds: ${stats.unresolvedPaymentIds.join(', ')}`);
    }
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
