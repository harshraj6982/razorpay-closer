import assert from "node:assert/strict";
import { calculatePaymentStrategy } from "../lib/policies/engine";
import { recommendationSchema, type MerchantPolicyInput, type OrderExtraction } from "../lib/ai/schemas";

async function runPolicyEngineTests() {
  console.log("\n=======================================================");
  console.log("🛡️ RUNNING MERCHANT POLICY ENGINE TESTS");
  console.log("=======================================================\n");

  const standardPolicy: MerchantPolicyInput = {
    minimumAdvancePercentage: 25,
    maximumDiscountPercentage: 5,
    allowPartialPayment: true,
    allowCredit: false,
    newCustomerRequiresAdvance: true,
    requireApprovalForFinancialActions: true,
  };

  // -------------------------------------------------------------
  // TEST 1: Trusted Repeat Customer (30% advance requested)
  // -------------------------------------------------------------
  console.log("▶ TEST 1: Trusted Repeat Customer (Satisfies Policy)");
  const trustedOrder: OrderExtraction = {
    product: "Shirts",
    products: [{ name: "Shirts", quantity: 40, unitPrice: 1850 }],
    quantity: 40,
    unitPrice: 1850,
    totalAmount: 74000,
    requestedAdvancePercentage: 30,
    requestedAdvanceAmount: 22200,
    requestedDiscountPercentage: null,
    requestedCredit: false,
    deliveryDate: "Monday",
    intent: "repeat_order",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "40 shirts · 30% advance",
    notes: null,
  };

  const rec1 = calculatePaymentStrategy(standardPolicy, trustedOrder, {
    isNew: false,
    previousOrderCount: 7,
    onTimePaymentRate: 100,
  });

  recommendationSchema.parse(rec1);
  console.log("Result 1:", JSON.stringify(rec1, null, 2));

  assert.equal(rec1.recommendedAdvancePercentage, 30, "Should approve requested 30% advance");
  assert.equal(rec1.recommendedAdvanceAmount, 22200, "Advance should be ₹22,200");
  assert.equal(rec1.remainingAmount, 51800, "Remaining should be ₹51,800");
  assert.equal(rec1.canIssuePaymentLink, true, "Should allow payment link creation");
  assert.equal(rec1.nextAction, "createPaymentLink", "Action should be createPaymentLink");
  assert.equal(rec1.violations.length, 0, "There should be 0 policy violations");
  console.log("✅ TEST 1 PASSED: Trusted repeat customer approved at requested 30% rate.\n");

  // -------------------------------------------------------------
  // TEST 2: New Customer Asking For COD / 0% Advance
  // -------------------------------------------------------------
  console.log("▶ TEST 2: New Customer Requesting COD (Violation Bumps to 25%)");
  const newCustomerOrder: OrderExtraction = {
    product: "Hoodies",
    products: [{ name: "Hoodies", quantity: 12, unitPrice: 890 }],
    quantity: 12,
    unitPrice: 890,
    totalAmount: 10680,
    requestedAdvancePercentage: 0,
    requestedAdvanceAmount: 0,
    requestedDiscountPercentage: null,
    requestedCredit: true,
    deliveryDate: "This weekend",
    intent: "order",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "12 hoodies · pay after event",
    notes: null,
  };

  const rec2 = calculatePaymentStrategy(standardPolicy, newCustomerOrder, {
    isNew: true,
    previousOrderCount: 0,
    onTimePaymentRate: 0,
  });

  recommendationSchema.parse(rec2);
  console.log("Result 2:", JSON.stringify(rec2, null, 2));

  assert.equal(rec2.recommendedAdvancePercentage, 25, "New customer must be bumped to 25% minimum advance");
  assert.equal(rec2.recommendedAdvanceAmount, 2670, "Advance amount should be 25% of 10,680 = ₹2,670");
  assert.equal(rec2.remainingAmount, 8010, "Remaining should be ₹8,010");
  assert.ok(rec2.violations.some((v) => v.includes("New customers must pay")), "Should report new customer advance violation");
  assert.ok(rec2.violations.some((v) => v.includes("Credit terms are not allowed")), "Should report credit disallowed");
  console.log("✅ TEST 2 PASSED: New customer COD request overridden to mandatory 25% advance.\n");

  // -------------------------------------------------------------
  // TEST 3: Excessive Discount Request (20% asked vs 5% max)
  // -------------------------------------------------------------
  console.log("▶ TEST 3: Excessive Discount Request (Capped at 5%, Follow-up Required)");
  const discountOrder: OrderExtraction = {
    product: "T-shirts",
    products: [{ name: "T-shirts", quantity: 200, unitPrice: 400 }],
    quantity: 200,
    unitPrice: 400,
    totalAmount: 80000,
    requestedAdvancePercentage: 50,
    requestedAdvanceAmount: 40000,
    requestedDiscountPercentage: 20,
    requestedCredit: false,
    deliveryDate: "This week",
    intent: "discount_request",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "200 tees · 20% off asked",
    notes: null,
  };

  const rec3 = calculatePaymentStrategy(standardPolicy, discountOrder);
  recommendationSchema.parse(rec3);
  console.log("Result 3:", JSON.stringify(rec3, null, 2));

  assert.equal(rec3.approvedDiscountPercentage, 5, "Discount must be capped at 5% policy maximum");
  assert.equal(rec3.discountedTotalAmount, 76000, "Discounted total should be 80,000 - 5% = ₹76,000");
  assert.equal(rec3.recommendedAdvanceAmount, 38000, "50% advance of ₹76,000 = ₹38,000");
  assert.equal(rec3.canIssuePaymentLink, false, "Must not issue payment link before agreement on discount");
  assert.equal(rec3.nextAction, "createFollowUp", "Next action must be createFollowUp counter-offer");
  assert.ok(rec3.violations.some((v) => v.includes("exceeds the 5% maximum")), "Must flag excessive discount violation");
  console.log("✅ TEST 3 PASSED: Excessive discount capped at 5% and routed to follow-up.\n");

  // -------------------------------------------------------------
  // TEST 4: Partial Payment Disabled by Policy
  // -------------------------------------------------------------
  console.log("▶ TEST 4: Partial Payment Disabled Policy (Forces 100% Full Payment)");
  const fullPaymentOnlyPolicy: MerchantPolicyInput = {
    ...standardPolicy,
    allowPartialPayment: false,
  };

  const partialOrder: OrderExtraction = {
    product: "Polo tees",
    products: [{ name: "Polo tees", quantity: 50, unitPrice: 1000 }],
    quantity: 50,
    unitPrice: 1000,
    totalAmount: 50000,
    requestedAdvancePercentage: 30,
    requestedAdvanceAmount: 15000,
    requestedDiscountPercentage: null,
    requestedCredit: false,
    deliveryDate: "Friday",
    intent: "partial_payment_order",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "50 polos · 30% advance",
    notes: null,
  };

  const rec4 = calculatePaymentStrategy(fullPaymentOnlyPolicy, partialOrder);
  recommendationSchema.parse(rec4);
  console.log("Result 4:", JSON.stringify(rec4, null, 2));

  assert.equal(rec4.recommendedAdvancePercentage, 100, "Advance percentage must be 100% when partial payment is disabled");
  assert.equal(rec4.recommendedAdvanceAmount, 50000, "Advance amount must be full order total ₹50,000");
  assert.equal(rec4.remainingAmount, 0, "Remaining amount must be 0");
  assert.ok(rec4.violations.some((v) => v.includes("Partial payment is disabled")), "Should flag partial payment disabled");
  console.log("✅ TEST 4 PASSED: Partial payment disabled policy forces 100% full payment.\n");

  // -------------------------------------------------------------
  // TEST 5: Ambiguous Order Handling
  // -------------------------------------------------------------
  console.log("▶ TEST 5: Ambiguous Order (Blocks Payment Links)");
  const ambiguousOrder: OrderExtraction = {
    product: "Shirts or Hoodies",
    products: [],
    quantity: null,
    unitPrice: null,
    totalAmount: null,
    requestedAdvancePercentage: null,
    requestedAdvanceAmount: null,
    requestedDiscountPercentage: null,
    requestedCredit: false,
    deliveryDate: null,
    intent: "ambiguous",
    isAmbiguous: true,
    missingPrice: false,
    customerRequestSummary: "Ambiguous inquiry",
    notes: "Conflicting quantities",
  };

  const rec5 = calculatePaymentStrategy(standardPolicy, ambiguousOrder);
  recommendationSchema.parse(rec5);
  console.log("Result 5:", JSON.stringify(rec5, null, 2));

  assert.equal(rec5.canIssuePaymentLink, false, "Must not allow payment link on ambiguous order");
  assert.equal(rec5.nextAction, "createFollowUp", "Must route to followUp");
  assert.equal(rec5.recommendedAdvanceAmount, 0, "Advance amount should be 0");
  console.log("✅ TEST 5 PASSED: Ambiguous order blocks financial execution.\n");

  // -------------------------------------------------------------
  // TEST 6: Missing Price Handling
  // -------------------------------------------------------------
  console.log("▶ TEST 6: Missing Price (Routes to Quote / Follow-up)");
  const missingPriceOrder: OrderExtraction = {
    product: "Hoodies",
    products: [{ name: "Hoodies", quantity: 50, unitPrice: null }],
    quantity: 50,
    unitPrice: null,
    totalAmount: null,
    requestedAdvancePercentage: null,
    requestedAdvanceAmount: null,
    requestedDiscountPercentage: null,
    requestedCredit: false,
    deliveryDate: "Friday",
    intent: "quote_request",
    isAmbiguous: false,
    missingPrice: true,
    customerRequestSummary: "50 hoodies · quote requested",
    notes: null,
  };

  const rec6 = calculatePaymentStrategy(standardPolicy, missingPriceOrder);
  recommendationSchema.parse(rec6);
  console.log("Result 6:", JSON.stringify(rec6, null, 2));

  assert.equal(rec6.canIssuePaymentLink, false, "Must not allow payment link when price is missing");
  assert.equal(rec6.nextAction, "createFollowUp", "Must route to quote follow-up");
  assert.ok(rec6.violations.some((v) => v.includes("Unit price is missing")), "Should flag missing price");
  console.log("✅ TEST 6 PASSED: Missing price correctly routed to quote follow-up.\n");

  console.log("=======================================================");
  console.log("🎉 ALL 6 MERCHANT POLICY ENGINE TESTS PASSED PERFECTLY!");
  console.log("=======================================================\n");
}

runPolicyEngineTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Policy engine test failed:", err);
    process.exit(1);
  });
