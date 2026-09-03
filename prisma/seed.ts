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

export async function seedDatabase() {
  await prisma.agentActionLog.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.orderStatusEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.order.deleteMany();
  await prisma.conversation.deleteMany();
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
          requireApprovalForFinancialActions: true,
        },
      },
    },
  });

  const vikram = await prisma.customer.create({
    data: {
      name: "Vikram Shah",
      company: "Rajan Textiles",
      phone: "+91 98200 11111",
      isNew: false,
      previousOrderCount: 7,
      onTimePaymentRate: 100,
      lastUnitPrice: 1850,
    },
  });

  const priya = await prisma.customer.create({
    data: {
      name: "Priya Nair",
      company: "Nova Prints",
      phone: "+91 98765 22001",
      isNew: true,
      previousOrderCount: 0,
      onTimePaymentRate: 0,
      lastUnitPrice: null,
    },
  });

  const arjun = await prisma.customer.create({
    data: {
      name: "Arjun Mehta",
      company: "Campus Store",
      phone: "+91 99000 33445",
      isNew: false,
      previousOrderCount: 2,
      onTimePaymentRate: 50,
      lastUnitPrice: 400,
    },
  });

  const meera = await prisma.customer.create({
    data: {
      name: "Meera Kapoor",
      company: "Hotel Lakeview",
      phone: "+91 98111 77880",
      isNew: false,
      previousOrderCount: 3,
      onTimePaymentRate: 67,
      lastUnitPrice: 980,
    },
  });

  const suresh = await prisma.customer.create({
    data: {
      name: "Suresh Iyer",
      company: "City Mart",
      phone: "+91 97654 11223",
      isNew: false,
      previousOrderCount: 4,
      onTimePaymentRate: 100,
      lastUnitPrice: 1000,
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
            "The order is large, the customer is trusted, and the requested 30% advance satisfies the merchant's minimum-payment policy.",
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
      title: "12 hoodies · first order",
      caseType: "new_customer",
      preview: "Can I pay after the fest? Found you on Instagram.",
      lastMessageAt: ist(11, 5),
      unread: true,
      messages: {
        create: [
          {
            role: MessageRole.CUSTOMER,
            body: "Hi, I found you on Instagram. Need 12 hoodies for a college fest this weekend. What's the rate? Can I pay after the event?",
            sentAt: ist(11, 2),
          },
          {
            role: MessageRole.CUSTOMER,
            body: "Budget is tight, so COD would be perfect if possible.",
            sentAt: ist(11, 5),
          },
        ],
      },
      order: {
        create: {
          status: OrderStatus.QUALIFIED,
          intent: "event_order",
          products: JSON.stringify([{ name: "Hoodies", quantity: 12, unitPrice: 890 }]),
          quantity: 12,
          unitPrice: 890,
          totalAmount: 10680,
          requestedAdvancePercentage: 0,
          recommendedAdvancePercentage: 25,
          recommendedAdvanceAmount: 2670,
          remainingAmount: 8010,
          requestedCredit: true,
          deliveryDate: "This weekend",
          customerRequestSummary: "New Instagram lead · 12 hoodies · pay after event",
          reason:
            "This is a new customer. Policy requires a 25% advance before production starts.",
          nextAction: "createPaymentLink",
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: OrderStatus.NEW,
                reason: "Inbound Instagram enquiry",
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
            detail: "12 hoodies · post-event payment requested",
          },
          {
            occurredAt: ist(11, 6),
            type: "calc",
            title: "Order value calculated: ₹10,680",
            detail: "12 × ₹890 list price",
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
            detail: "Decline COD · collect ₹2,670 to start production",
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
      title: "200 tees · 20% off ask",
      caseType: "excessive_discount",
      preview: "Give me 20% off or I go to someone else.",
      lastMessageAt: ist(12, 18),
      messages: {
        create: [
          {
            role: MessageRole.CUSTOMER,
            body: "Bro 200 t-shirts. Best price last time was 400. Give me 20% off or I go to someone else this week.",
            sentAt: ist(12, 14),
          },
          {
            role: MessageRole.CUSTOMER,
            body: "I can pay 50% now if the discount is done.",
            sentAt: ist(12, 18),
          },
        ],
      },
      order: {
        create: {
          status: OrderStatus.QUALIFIED,
          intent: "bulk_order",
          products: JSON.stringify([{ name: "T-shirts", quantity: 200, unitPrice: 400 }]),
          quantity: 200,
          unitPrice: 400,
          totalAmount: 80000,
          requestedAdvancePercentage: 50,
          recommendedAdvancePercentage: 50,
          recommendedAdvanceAmount: 38000,
          remainingAmount: 38000,
          requestedDiscountPercentage: 20,
          requestedCredit: false,
          deliveryDate: "This week",
          customerRequestSummary: "200 tees at ₹400 · asking 20% discount",
          reason:
            "Counter with a 5% discount. The requested 20% discount would breach merchant policy.",
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
            detail: "200 t-shirts · 20% discount demanded",
          },
          {
            occurredAt: ist(12, 19),
            type: "calc",
            title: "Order value calculated: ₹80,000",
            detail: "200 × ₹400 list",
          },
          {
            occurredAt: ist(12, 20),
            type: "policy",
            title: "Merchant policy evaluated",
            detail: "Maximum discount 5% · requested 20%",
          },
          {
            occurredAt: ist(12, 20),
            type: "recommend",
            title: "Counter-offer 5% discount",
            detail: "Do not issue a payment link at the requested price",
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
      title: "Staff uniforms · 45-day credit",
      caseType: "credit_request",
      preview: "Run it on 45 day credit like last year?",
      lastMessageAt: ist(14, 3),
      messages: {
        create: [
          {
            role: MessageRole.CUSTOMER,
            body: "Need 28 staff uniforms, same cut as last year. Total should be around 25k.",
            sentAt: ist(13, 55),
          },
          {
            role: MessageRole.CUSTOMER,
            body: "Can you run it on 45 day credit like last year? We'll pay after wedding season.",
            sentAt: ist(14, 3),
          },
        ],
      },
      order: {
        create: {
          status: OrderStatus.QUOTE_CREATED,
          intent: "repeat_order",
          products: JSON.stringify([
            { name: "Staff uniforms", quantity: 28, unitPrice: 890 },
          ]),
          quantity: 28,
          unitPrice: 890,
          totalAmount: 24920,
          requestedAdvancePercentage: 0,
          recommendedAdvancePercentage: 25,
          recommendedAdvanceAmount: 6230,
          remainingAmount: 18690,
          requestedCredit: true,
          deliveryDate: "Before wedding season",
          customerRequestSummary: "₹24,920 uniforms · 45-day credit requested",
          reason:
            "Credit was requested but is disabled. Collect at least the minimum advance via a payment link instead of opening a receivable.",
          nextAction: "sendPaymentRequest",
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: OrderStatus.NEW,
                reason: "Inbound hotel restock",
                recordedAt: ist(13, 55),
              },
              {
                fromStatus: OrderStatus.NEW,
                toStatus: OrderStatus.QUALIFIED,
                reason: "Quantity and catalog rate confirmed",
                recordedAt: ist(14, 4),
              },
              {
                fromStatus: OrderStatus.QUALIFIED,
                toStatus: OrderStatus.QUOTE_CREATED,
                reason: "Quote created without credit terms",
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
            detail: "28 uniforms · 45-day credit",
          },
          {
            occurredAt: ist(14, 4),
            type: "calc",
            title: "Order value calculated: ₹24,920",
            detail: "28 × ₹890",
          },
          {
            occurredAt: ist(14, 5),
            type: "policy",
            title: "Merchant policy evaluated",
            detail: "allowCredit = false",
          },
          {
            occurredAt: ist(14, 5),
            type: "recommend",
            title: "Decline credit · request 25% advance",
            detail: "₹6,230 to book production",
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
