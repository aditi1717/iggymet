import mongoose from 'mongoose';
import 'dotenv/config';

import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import { FoodUserDebt } from '../src/modules/food/orders/models/userDebt.model.js';
import { FoodTransaction } from '../src/modules/food/orders/models/foodTransaction.model.js';

const isPaidLikePaymentStatus = (status) =>
  ['paid', 'authorized', 'captured', 'settled'].includes(String(status || '').toLowerCase());

const getPendingPaymentStatusForMethod = (method) => {
  const normalizedMethod = String(method || '').toLowerCase();
  if (normalizedMethod === 'razorpay_qr') return 'pending_qr';
  return 'cod_pending';
};

const hasAdminApprovalHistory = (order) =>
  Array.isArray(order?.statusHistory) &&
  order.statusHistory.some((entry) => {
    const byRole = String(entry?.byRole || '').toUpperCase();
    const to = String(entry?.to || '').toLowerCase();
    return byRole === 'ADMIN' && to === 'cancelled_by_user_unavailable';
  });

const usage = () => {
  console.log('Usage: node --env-file=.env scripts/migrate-user-unavailable-review.js [--apply]');
};

async function run() {
  const shouldApply = process.argv.includes('--apply');
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

  if (!mongoUri) {
    throw new Error('MongoDB connection string not found in env');
  }

  await mongoose.connect(mongoUri);

  const rawOrders = await FoodOrder.find({
    orderStatus: 'cancelled_by_user_unavailable',
    'userUnavailableRequest.status': 'pending',
    $or: [
      { 'userUnavailableRequest.reviewedAt': null },
      { 'userUnavailableRequest.reviewedAt': { $exists: false } },
    ],
  })
    .select('_id orderId orderStatus payment deliveryState userUnavailableRequest statusHistory createdAt updatedAt')
    .lean();

  const candidateIds = rawOrders.map((order) => order._id);
  const debts = candidateIds.length
    ? await FoodUserDebt.find({ failedOrderId: { $in: candidateIds } })
        .select('_id failedOrderId status settledOrderId settledAt amount')
        .lean()
    : [];
  const transactions = candidateIds.length
    ? await FoodTransaction.find({ orderId: { $in: candidateIds } })
        .select('_id orderId status paymentMethod settlement history')
        .lean()
    : [];

  const debtByOrderId = new Map(debts.map((row) => [String(row.failedOrderId), row]));
  const transactionByOrderId = new Map(transactions.map((row) => [String(row.orderId), row]));

  const candidates = [];
  const skipped = [];

  for (const order of rawOrders) {
    const orderKey = String(order._id);
    const debt = debtByOrderId.get(orderKey) || null;
    const transaction = transactionByOrderId.get(orderKey) || null;

    if (hasAdminApprovalHistory(order)) {
      skipped.push({
        orderId: order.orderId,
        reason: 'Admin approval history exists',
      });
      continue;
    }

    if (debt?.status === 'paid' || debt?.settledOrderId) {
      skipped.push({
        orderId: order.orderId,
        reason: 'Debt already settled/paid',
      });
      continue;
    }

    if (
      transaction?.settlement?.isRestaurantSettled === true ||
      transaction?.settlement?.isRiderSettled === true
    ) {
      skipped.push({
        orderId: order.orderId,
        reason: 'Transaction already settled',
      });
      continue;
    }

    candidates.push({
      order,
      debt,
      transaction,
    });
  }

  console.log(`Found ${rawOrders.length} raw direct-final records.`);
  console.log(`Eligible migration candidates: ${candidates.length}`);
  console.log(`Skipped: ${skipped.length}`);

  if (skipped.length > 0) {
    console.log('Skipped orders:');
    skipped.forEach((row) => console.log(`- ${row.orderId}: ${row.reason}`));
  }

  if (!shouldApply) {
    console.log('Dry run only. Re-run with --apply to migrate.');
    return;
  }

  let migrated = 0;
  let deletedDebts = 0;
  let updatedTransactions = 0;

  for (const row of candidates) {
    const { order, debt, transaction } = row;
    const orderDoc = await FoodOrder.findById(order._id);
    if (!orderDoc) continue;

    orderDoc.orderStatus = 'user_unavailable_review';
    orderDoc.userUnavailableRequest = {
      ...(orderDoc.userUnavailableRequest?.toObject?.() || orderDoc.userUnavailableRequest || {}),
      status: 'pending',
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: '',
    };
    orderDoc.deliveryState = {
      ...(orderDoc.deliveryState?.toObject?.() || orderDoc.deliveryState || {}),
      status: 'user_unavailable_review',
    };

    if (
      !isPaidLikePaymentStatus(orderDoc.payment?.status) &&
      ['cash', 'cod', ''].includes(String(orderDoc.payment?.method || '').toLowerCase())
    ) {
      orderDoc.payment.status = getPendingPaymentStatusForMethod(orderDoc.payment?.method);
    }

    orderDoc.statusHistory = Array.isArray(orderDoc.statusHistory) ? orderDoc.statusHistory : [];
    orderDoc.statusHistory.push({
      byRole: 'SYSTEM',
      from: 'cancelled_by_user_unavailable',
      to: 'user_unavailable_review',
      note: 'Migration: restored pending admin review for user unavailable request',
      at: new Date(),
    });

    await orderDoc.save();
    migrated += 1;

    if (debt?._id) {
      await FoodUserDebt.deleteOne({ _id: debt._id });
      deletedDebts += 1;
    }

    if (transaction?._id) {
      const nextStatus = isPaidLikePaymentStatus(orderDoc.payment?.status) ? 'captured' : 'pending';
      const nextHistory = Array.isArray(transaction.history)
        ? transaction.history.filter((entry) => String(entry?.kind || '') !== 'cancelled_by_delivery_no_response')
        : [];

      await FoodTransaction.updateOne(
        { _id: transaction._id },
        {
          $set: {
            status: nextStatus,
            history: [
              ...nextHistory,
              {
                kind: 'user_unavailable_review_restored',
                amount: transaction?.amounts?.totalCustomerPaid || 0,
                at: new Date(),
                note: 'Migration: restored pending admin review for user unavailable request',
                recordedBy: { role: 'SYSTEM' },
              },
            ],
          },
        },
      );
      updatedTransactions += 1;
    }

    console.log(`Migrated order ${order.orderId}`);
  }

  console.log(`Migration complete. Orders migrated: ${migrated}`);
  console.log(`Premature debts deleted: ${deletedDebts}`);
  console.log(`Transactions normalized: ${updatedTransactions}`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });
