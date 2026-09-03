import {
  MessageRole,
  OrderStatus,
  PaymentStatus,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

function ist(hours: number, minutes: number, day = 31) {
  return new Date(
    `2026-08-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`,
  );
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function seedDatabase() {
  await prisma.policyAuditLog.deleteMany();
  await prisma.agentActionLog.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.orderStatusEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.order.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.customerMetrics.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.merchantPolicy.deleteMany();
  await prisma.merchant.deleteMany();

  const merchant = await prisma.merchant.create({
    data: {
      id: "merchant_stitchline",
      name: "Stitchline Uniforms",
      tradeName: "Stitchline",
      policy: {
        create: {
          minimumAdvancePercentage: 25,
          maximumDiscountPercentage: 5,
          allowPartialPayment: true,
          allowCredit: false,
          newCustomerRequiresAdvance: true,
          maximumCreditAmount: 25000,
          maximumCreditDays: 7,
          highValueOrderThreshold: 100000,
          highRiskCustomerRequiresAdvance: true,
          requireApprovalForFinancialActions: true,
        },
      },
    },
  });

  // Customer 1: Rahul Textiles (Vikram Shah) - Trusted Repeat Customer
  const vikram = await prisma.customer.create({
    data: {
      name: "Rahul Textiles",
      company: "Rahul Textiles",
      phone: "+91 98200 11111",
      email: "rahul@rahultextiles.com",
      isNew: false,
      previousOrderCount: 7,
      onTimePaymentRate: 100,
      lastUnitPrice: 1850,
      metrics: {
        create: {
          totalOrders: 7,
          totalOrderValue: 420000,
          totalPaid: 420000,
          successfulPayments: 7,
          failedPayments: 0,
          latePayments: 0,
          averagePaymentDelayDays: 0,
          lastOrderDate: daysAgo(12),
          lastPaymentDate: daysAgo(12),
          outstandingAmount: 0,
        },
      },
    },
  });

  // Customer 2: New Buyer (Priya Nair) - New Lead
  const priya = await prisma.customer.create({
    data: {
      name: "Priya Nair",
      company: "Nova Prints",
      phone: "+91 98765 22001",
      email: "priya@novaprints.in",
      isNew: true,
      previousOrderCount: 0,
      onTimePaymentRate: 0,
      lastUnitPrice: null,
      metrics: {
        create: {
          totalOrders: 0,
          totalOrderValue: 0,
          totalPaid: 0,
          successfulPayments: 0,
          failedPayments: 0,
          latePayments: 0,
          averagePaymentDelayDays: 0,
          lastOrderDate: null,
          lastPaymentDate: null,
          outstandingAmount: 0,
        },
      },
    },
  });

  // Customer 3: Risky Buyer (Meera Kapoor) - Bad Payment History
  const meera = await prisma.customer.create({
    data: {
      name: "Meera Kapoor",
      company: "Hotel Lakeview",
      phone: "+91 98111 77880",
      email: "procurement@lakeviewresort.com",
      isNew: false,
      previousOrderCount: 8,
      onTimePaymentRate: 62,
      lastUnitPrice: 900,
      metrics: {
        create: {
          totalOrders: 8,
          totalOrderValue: 180000,
          totalPaid: 162000,
          successfulPayments: 5,
          failedPayments: 1,
          latePayments: 3,
          averagePaymentDelayDays: 8,
          lastOrderDate: daysAgo(20),
          lastPaymentDate: daysAgo(25),
          outstandingAmount: 18000,
        },
      },
    },
  });

  // Customer 4: Discount Negotiator (Arjun Mehta) - Asking 15% discount
  const arjun = await prisma.customer.create({
    data: {
      name: "Arjun Mehta",
      company: "Campus Store",
      phone: "+91 99000 33445",
      email: "arjun@campusstore.edu",
      isNew: false,
      previousOrderCount: 5,
      onTimePaymentRate: 100,
      lastUnitPrice: 400,
      metrics: {
        create: {
          totalOrders: 5,
          totalOrderValue: 150000,
          totalPaid: 150000,
          successfulPayments: 5,
          failedPayments: 0,
          latePayments: 0,
          averagePaymentDelayDays: 0,
          lastOrderDate: daysAgo(40),
          lastPaymentDate: daysAgo(40),
          outstandingAmount: 0,
        },
      },
    },
  });

  // Customer 5: Suresh Iyer (City Mart) - Partial Payment Tracking
  const suresh = await prisma.customer.create({
    data: {
      name: "Suresh Iyer",
      company: "City Mart",
      phone: "+91 97654 11223",
      email: "suresh@citymart.in",
      isNew: false,
      previousOrderCount: 4,
      onTimePaymentRate: 100,
      lastUnitPrice: 1000,
      metrics: {
        create: {
          totalOrders: 4,
          totalOrderValue: 200000,
          totalPaid: 165000,
          successfulPayments: 4,
          failedPayments: 0,
          latePayments: 0,
          averagePaymentDelayDays: 0,
          lastOrderDate: daysAgo(5),
          lastPaymentDate: daysAgo(5),
          outstandingAmount: 35000,
        },
      },
    },
  });

  await seedTrustedRepeat(merchant.id, vikram.id);
  await seedNewCustomer(merchant.id, priya.id);
  await seedDiscount(merchant.id, arjun.id);
  await seedCredit(merchant.id, meera.id);
  await seedPartial(merchant.id, suresh.id);
}

async function seedTrustedRepeat(merchantId: string, customerId: string) {
  const id = "conv_trusted";
  await prisma.conversation.create({
    data: {
      id,
      merchantId,
      customerId,
      title: "40 shirts · Monday delivery",
      caseType: "trusted_repeat",
      preview: "Need 40 shirts same rate as last time. Can pay 30% now.",
      lastMessageAt: ist(10, 41),
      messages: {
        create: [
          {
            role: MessageRole.CUSTOMER,
            body: "Hey bhai, need 40 shirts same rate as last time. Can pay 30% now. Need them by Monday.",
            sentAt: ist(10, 41),
          },
        ],
      },
      order: {
        create: {
          status: OrderStatus.QUOTE_CREATED,
          intent: "bulk_order",
          products: JSON.stringify([{ name: "Shirts", quantity: 40, unitPrice: 1850 }]),
          quantity: 40,
          unitPrice: 1850,
          totalAmount: 74000,
          requestedAdvancePercentage: 30,
          recommendedAdvancePercentage: 30,
          recommendedAdvanceAmount: 22200,
          remainingAmount: 51800,
          requestedCredit: false,
          deliveryDate: "Monday",
          customerRequestSummary: "₹74,000 order · 30% now · delivery Monday",
          reason:
            "Customer has completed 7 previous orders without a late payment. The requested 30% advance satisfies the merchant's 25% minimum advance policy. Recommended action: REQUEST 30% ADVANCE",
          nextAction: "createPaymentLink",
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: OrderStatus.NEW,
                reason: "Inbound WhatsApp message received",
                recordedAt: ist(10, 41),
              },
              {
                fromStatus: OrderStatus.NEW,
                toStatus: OrderStatus.QUALIFIED,
                reason: "Purchase intent and last-rate match confirmed",
                recordedAt: ist(10, 42),
              },
              {
                fromStatus: OrderStatus.QUALIFIED,
                toStatus: OrderStatus.QUOTE_CREATED,
                reason: "Quote generated at last unit price ₹1,850",
                recordedAt: ist(10, 43),
              },
            ],
          },
        },
      },
      activities: {
        create: [
          {
            occurredAt: ist(10, 42),
            type: "parse",
            title: "AI parsed customer request",
            detail: "Bulk shirt reorder at last contracted rate",
          },
          {
            occurredAt: ist(10, 42),
            type: "calc",
            title: "Order value calculated: ₹74,000",
            detail: "40 × ₹1,850",
          },
          {
            occurredAt: ist(10, 43),
            type: "policy",
            title: "Merchant policy evaluated",
            detail: "Minimum advance 25% · partial payment allowed",
          },
          {
            occurredAt: ist(10, 43),
            type: "recommend",
            title: "30% advance recommended",
            detail: "₹22,200 now · ₹51,800 on delivery",
          },
        ],
      },
    },
  });
}

async function seedNewCustomer(merchantId: string, customerId: string) {
  const id = "conv_new";
  await prisma.conversation.create({
    data: {
      id,
      merchantId,
      customerId,
      title: "40 hoodies · first order",
      caseType: "new_customer",
      preview: "Can I pay after delivery? Need 40 hoodies.",
      lastMessageAt: ist(11, 5),
      unread: true,
      messages: {
        create: [
          {
            role: MessageRole.CUSTOMER,
            body: "Hi, need 40 hoodies for our startup event. Total should be around 40k. Can I pay after delivery?",
            sentAt: ist(11, 2),
          },
          {
            role: MessageRole.CUSTOMER,
            body: "Budget is tight, so COD or post-delivery payment would be perfect.",
            sentAt: ist(11, 5),
          },
        ],
      },
      order: {
        create: {
          status: OrderStatus.QUALIFIED,
          intent: "order",
          products: JSON.stringify([{ name: "Hoodies", quantity: 40, unitPrice: 1000 }]),
          quantity: 40,
          unitPrice: 1000,
          totalAmount: 40000,
          requestedAdvancePercentage: 0,
          recommendedAdvancePercentage: 25,
          recommendedAdvanceAmount: 10000,
          remainingAmount: 30000,
          requestedCredit: true,
          deliveryDate: "This weekend",
          customerRequestSummary: "New buyer · 40 hoodies · ₹40,000 · pay after delivery",
          reason:
            "Customer has no previous order history. Merchant policy requires new customers to provide an advance. Recommended action: REQUEST 25% ADVANCE",
          nextAction: "createPaymentLink",
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: OrderStatus.NEW,
                reason: "Inbound inquiry received",
                recordedAt: ist(11, 2),
              },
              {
                fromStatus: OrderStatus.NEW,
                toStatus: OrderStatus.QUALIFIED,
                reason: "Catalog rate applied for hoodies",
                recordedAt: ist(11, 6),
              },
            ],
          },
        },
      },
      activities: {
        create: [
          {
            occurredAt: ist(11, 6),
            type: "parse",
            title: "AI parsed customer request",
            detail: "40 hoodies · post-delivery payment requested",
          },
          {
            occurredAt: ist(11, 6),
            type: "calc",
            title: "Order value calculated: ₹40,000",
            detail: "40 × ₹1,000 list price",
          },
          {
            occurredAt: ist(11, 7),
            type: "policy",
            title: "Merchant policy evaluated",
            detail: "New customer must pay advance · credit disabled",
          },
          {
            occurredAt: ist(11, 7),
            type: "recommend",
            title: "25% advance recommended",
            detail: "Decline COD · collect ₹10,000 to start production",
          },
        ],
      },
    },
  });
}

async function seedDiscount(merchantId: string, customerId: string) {
  const id = "conv_discount";
  await prisma.conversation.create({
    data: {
      id,
      merchantId,
      customerId,
      title: "250 tees · 15% discount ask",
      caseType: "excessive_discount",
      preview: "Give me 15% discount on this ₹100,000 order.",
      lastMessageAt: ist(12, 18),
      messages: {
        create: [
          {
            role: MessageRole.CUSTOMER,
            body: "Bro 250 t-shirts. Rate was 400 last time. Total is ₹100,000. Give me 15% discount.",
            sentAt: ist(12, 14),
          },
          {
            role: MessageRole.CUSTOMER,
            body: "I can pay 50% advance now if 15% discount is applied.",
            sentAt: ist(12, 18),
          },
        ],
      },
      order: {
        create: {
          status: OrderStatus.QUALIFIED,
          intent: "discount_request",
          products: JSON.stringify([{ name: "T-shirts", quantity: 250, unitPrice: 400 }]),
          quantity: 250,
          unitPrice: 400,
          totalAmount: 100000,
          requestedAdvancePercentage: 50,
          recommendedAdvancePercentage: 50,
          recommendedAdvanceAmount: 47500,
          remainingAmount: 47500,
          requestedDiscountPercentage: 15,
          requestedCredit: false,
          deliveryDate: "This week",
          customerRequestSummary: "250 tees at ₹400 (₹100,000) · asking 15% discount",
          reason:
            "Customer requested 15% discount. Merchant policy allows maximum 5%. Recommended action: REJECT 15% DISCOUNT, ALLOW MAXIMUM 5%",
          nextAction: "createFollowUp",
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: OrderStatus.NEW,
                reason: "Inbound bulk enquiry",
                recordedAt: ist(12, 14),
              },
              {
                fromStatus: OrderStatus.NEW,
                toStatus: OrderStatus.QUALIFIED,
                reason: "Matched last unit price ₹400",
                recordedAt: ist(12, 19),
              },
            ],
          },
        },
      },
      activities: {
        create: [
          {
            occurredAt: ist(12, 19),
            type: "parse",
            title: "AI parsed customer request",
            detail: "250 t-shirts · 15% discount demanded",
          },
          {
            occurredAt: ist(12, 19),
            type: "calc",
            title: "Order value calculated: ₹100,000",
            detail: "250 × ₹400 list",
          },
          {
            occurredAt: ist(12, 20),
            type: "policy",
            title: "Merchant policy evaluated",
            detail: "Maximum discount 5% · requested 15%",
          },
          {
            occurredAt: ist(12, 20),
            type: "recommend",
            title: "Counter-offer 5% discount",
            detail: "Do not issue payment link at 15% discount",
          },
        ],
      },
    },
  });
}

async function seedCredit(merchantId: string, customerId: string) {
  const id = "conv_credit";
  await prisma.conversation.create({
    data: {
      id,
      merchantId,
      customerId,
      title: "100 uniforms · 30-day credit ask",
      caseType: "credit_request",
      preview: "Give me 30 days credit for ₹90,000 order.",
      lastMessageAt: ist(14, 3),
      messages: {
        create: [
          {
            role: MessageRole.CUSTOMER,
            body: "Need 100 staff uniforms for new season. Total amount is ₹90,000.",
            sentAt: ist(13, 55),
          },
          {
            role: MessageRole.CUSTOMER,
            body: "Give me 30 days credit. We will settle after guest bookings.",
            sentAt: ist(14, 3),
          },
        ],
      },
      order: {
        create: {
          status: OrderStatus.QUOTE_CREATED,
          intent: "credit_request",
          products: JSON.stringify([
            { name: "Staff uniforms", quantity: 100, unitPrice: 900 },
          ]),
          quantity: 100,
          unitPrice: 900,
          totalAmount: 90000,
          requestedAdvancePercentage: 0,
          recommendedAdvancePercentage: 25,
          recommendedAdvanceAmount: 22500,
          remainingAmount: 67500,
          requestedCredit: true,
          deliveryDate: "Before wedding season",
          customerRequestSummary: "₹90,000 uniforms · 30-day credit requested · HIGH risk buyer",
          reason:
            "Customer has 3 late payments and ₹18,000 outstanding. Credit is rejected. Policy requires advance payment and human approval before fulfillment. Recommended action: REJECT CREDIT, REQUIRE ADVANCE, REQUIRE HUMAN APPROVAL",
          nextAction: "createPaymentLink",
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: OrderStatus.NEW,
                reason: "Inbound restock inquiry",
                recordedAt: ist(13, 55),
              },
              {
                fromStatus: OrderStatus.NEW,
                toStatus: OrderStatus.QUALIFIED,
                reason: "Quantity and unit rate confirmed",
                recordedAt: ist(14, 4),
              },
              {
                fromStatus: OrderStatus.QUALIFIED,
                toStatus: OrderStatus.QUOTE_CREATED,
                reason: "Quote created with advance requirement",
                recordedAt: ist(14, 5),
              },
            ],
          },
        },
      },
      activities: {
        create: [
          {
            occurredAt: ist(14, 4),
            type: "parse",
            title: "AI parsed customer request",
            detail: "100 uniforms · 30-day credit",
          },
          {
            occurredAt: ist(14, 4),
            type: "calc",
            title: "Order value calculated: ₹90,000",
            detail: "100 × ₹900",
          },
          {
            occurredAt: ist(14, 5),
            type: "policy",
            title: "Merchant policy evaluated",
            detail: "HIGH risk customer · credit rejected · human approval required",
          },
          {
            occurredAt: ist(14, 5),
            type: "recommend",
            title: "Decline credit · require 25% advance + approval",
            detail: "₹22,500 advance to book production",
          },
        ],
      },
    },
  });
}

async function seedPartial(merchantId: string, customerId: string) {
  const id = "conv_partial";
  await prisma.conversation.create({
    data: {
      id,
      merchantId,
      customerId,
      title: "50 polos · 30% received",
      caseType: "partially_paid",
      preview: "Paid the 30%. When do the rest of the polos ship?",
      lastMessageAt: ist(16, 12),
      messages: {
        create: [
          {
            role: MessageRole.CUSTOMER,
            body: "Need 50 polo tees, same ₹1,000 rate. I can pay 30% today and the rest on delivery Friday.",
            sentAt: ist(9, 10),
          },
          {
            role: MessageRole.AGENT,
            body: "Payment link sent for ₹15,000 (30% advance). Remaining ₹35,000 due on Friday delivery.",
            sentAt: ist(9, 18),
          },
          {
            role: MessageRole.CUSTOMER,
            body: "Paid the 30%. When do the rest of the polos ship?",
            sentAt: ist(16, 12),
          },
        ],
      },
      order: {
        create: {
          status: OrderStatus.PARTIALLY_PAID,
          intent: "bulk_order",
          products: JSON.stringify([{ name: "Polo tees", quantity: 50, unitPrice: 1000 }]),
          quantity: 50,
          unitPrice: 1000,
          totalAmount: 50000,
          requestedAdvancePercentage: 30,
          recommendedAdvancePercentage: 30,
          recommendedAdvanceAmount: 15000,
          remainingAmount: 35000,
          requestedCredit: false,
          deliveryDate: "Friday",
          customerRequestSummary: "₹50,000 polos · 30% already paid",
          reason:
            "Advance of ₹15,000 is in. Next action is to request the remaining ₹35,000 against delivery.",
          nextAction: "sendPaymentRequest",
          payments: {
            create: [
              {
                amount: 15000,
                status: PaymentStatus.PAID,
                razorpayPaymentLinkId: "plink_demo_partial_1",
                razorpayPaymentLinkUrl: "https://rzp.io/i/demo-partial",
                razorpayPaymentId: "pay_demo_partial_1",
                paidAt: ist(10, 48),
              },
            ],
          },
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: OrderStatus.NEW,
                reason: "Inbound reorder",
                recordedAt: ist(9, 10),
              },
              {
                fromStatus: OrderStatus.NEW,
                toStatus: OrderStatus.QUALIFIED,
                reason: "Last rate ₹1,000 applied",
                recordedAt: ist(9, 12),
              },
              {
                fromStatus: OrderStatus.QUALIFIED,
                toStatus: OrderStatus.QUOTE_CREATED,
                reason: "Quote issued",
                recordedAt: ist(9, 14),
              },
              {
                fromStatus: OrderStatus.QUOTE_CREATED,
                toStatus: OrderStatus.PAYMENT_REQUESTED,
                reason: "Razorpay Payment Link created for ₹15,000",
                recordedAt: ist(9, 18),
              },
              {
                fromStatus: OrderStatus.PAYMENT_REQUESTED,
                toStatus: OrderStatus.PARTIALLY_PAID,
                reason: "Webhook: payment.captured ₹15,000",
                recordedAt: ist(10, 48),
              },
            ],
          },
        },
      },
      activities: {
        create: [
          {
            occurredAt: ist(9, 12),
            type: "parse",
            title: "AI parsed customer request",
            detail: "50 polos · 30% advance",
          },
          {
            occurredAt: ist(9, 12),
            type: "calc",
            title: "Order value calculated: ₹50,000",
            detail: "50 × ₹1,000",
          },
          {
            occurredAt: ist(9, 14),
            type: "policy",
            title: "Merchant policy evaluated",
            detail: "30% advance ≥ 25% minimum",
          },
          {
            occurredAt: ist(9, 18),
            type: "payment_link",
            title: "Payment Link created",
            detail: "₹15,000 test-mode link",
          },
          {
            occurredAt: ist(10, 48),
            type: "payment",
            title: "₹15,000 payment received",
            detail: "Razorpay payment.captured",
          },
          {
            occurredAt: ist(10, 48),
            type: "status",
            title: "Order moved to PARTIALLY_PAID",
            detail: "₹35,000 remaining",
          },
          {
            occurredAt: ist(16, 13),
            type: "recommend",
            title: "Request remaining balance",
            detail: "Send ₹35,000 link before Friday dispatch",
          },
        ],
      },
    },
  });
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seedDatabase()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
