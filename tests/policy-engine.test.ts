import assert from "node:assert/strict";
import { evaluatePolicy } from "../lib/policies/engine";
import { type MerchantPolicyInput, type OrderExtraction } from "../lib/ai/schemas";

async function runPolicyEngineTests() {
  console.log("\n=======================================================");
  console.log("🛡️ RUNNING MERCHANT POLICY ENGINE TESTS (PHASE C)");
  console.log("=======================================================\n");

  const standardPolicy: MerchantPolicyInput = {
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
  };

  // -------------------------------------------------------------
  // TEST 1: Existing Trusted Customer Can Use Allowed Terms
  // -------------------------------------------------------------
  console.log("▶ TEST 1: Existing Trusted Customer (Satisfies Policy)");
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

  const eval1 = evaluatePolicy({
    merchantPolicy: standardPolicy,
    order: trustedOrder,
    customer: {
      isNew: false,
      previousOrderCount: 7,
      onTimePaymentRate: 100,
    },
    customerHistory: {
      totalOrders: 7,
      totalOrderValue: 420000,
      totalPaid: 420000,
      successfulPayments: 7,
      failedPayments: 0,
      latePayments: 0,
      averagePaymentDelayDays: 0,
      outstandingAmount: 0,
    },
  });

  console.log("Result 1:", JSON.stringify(eval1, null, 2));
  assert.equal(eval1.allowed, true, "Evaluation must be allowed");
  assert.equal(eval1.decision, "REQUEST_ADVANCE", "Decision should be REQUEST_ADVANCE");
  assert.equal(eval1.recommendedAdvancePercentage, 30, "Should approve requested 30% advance");
  assert.equal(eval1.recommendedAdvanceAmount, 22200, "Advance should be ₹22,200");
  assert.equal(eval1.remainingAmount, 51800, "Remaining should be ₹51,800");
  assert.equal(eval1.canIssuePaymentLink, true, "Should allow payment link creation");
  assert.equal(eval1.violations.length, 0, "There should be 0 policy violations");
  console.log("✅ TEST 1 PASSED: Trusted repeat customer approved at requested 30% rate.\n");

  // -------------------------------------------------------------
  // TEST 2: New Customer Requires Advance
  // -------------------------------------------------------------
  console.log("▶ TEST 2: New Customer Requires Advance (COD Request Overridden)");
  const newCustomerOrder: OrderExtraction = {
    product: "Hoodies",
    products: [{ name: "Hoodies", quantity: 40, unitPrice: 1000 }],
    quantity: 40,
    unitPrice: 1000,
    totalAmount: 40000,
    requestedAdvancePercentage: 0,
    requestedAdvanceAmount: 0,
    requestedDiscountPercentage: null,
    requestedCredit: true,
    deliveryDate: "This weekend",
    intent: "order",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "40 hoodies · pay after delivery",
    notes: null,
  };

  const eval2 = evaluatePolicy({
    merchantPolicy: standardPolicy,
    order: newCustomerOrder,
    customer: {
      isNew: true,
      previousOrderCount: 0,
      onTimePaymentRate: 0,
    },
    customerHistory: {
      totalOrders: 0,
      totalOrderValue: 0,
      totalPaid: 0,
      successfulPayments: 0,
      failedPayments: 0,
      latePayments: 0,
      averagePaymentDelayDays: 0,
      outstandingAmount: 0,
    },
  });

  console.log("Result 2:", JSON.stringify(eval2, null, 2));
  assert.equal(eval2.recommendedAdvancePercentage, 25, "New customer must be bumped to 25% minimum advance");
  assert.equal(eval2.recommendedAdvanceAmount, 10000, "Advance amount should be 25% of 40,000 = ₹10,000");
  assert.equal(eval2.remainingAmount, 30000, "Remaining should be ₹30,000");
  assert.ok(eval2.violations.some((v) => v.includes("New customers must pay")), "Should report new customer advance violation");
  console.log("✅ TEST 2 PASSED: New customer COD request overridden to mandatory 25% advance.\n");

  // -------------------------------------------------------------
  // TEST 3: Credit Disabled Rejects Credit
  // -------------------------------------------------------------
  console.log("▶ TEST 3: Credit Disabled Rejects Credit");
  const creditOrder: OrderExtraction = {
    product: "Staff uniforms",
    products: [{ name: "Staff uniforms", quantity: 28, unitPrice: 890 }],
    quantity: 28,
    unitPrice: 890,
    totalAmount: 24920,
    requestedAdvancePercentage: 0,
    requestedAdvanceAmount: 0,
    requestedDiscountPercentage: null,
    requestedCredit: true,
    deliveryDate: "Next week",
    intent: "credit_request",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "28 uniforms · credit requested",
    notes: null,
  };

  const eval3 = evaluatePolicy({
    merchantPolicy: standardPolicy, // allowCredit = false
    order: creditOrder,
    customer: { isNew: false, previousOrderCount: 3, onTimePaymentRate: 100 },
  });

  assert.equal(eval3.creditAllowed, false, "Credit must be disallowed");
  assert.ok(eval3.violations.some((v) => v.includes("Credit terms are not allowed")), "Must flag credit disallowed");
  assert.equal(eval3.recommendedAdvancePercentage, 25, "Advance should be set to 25%");
  console.log("✅ TEST 3 PASSED: Disabled credit policy rejects credit terms.\n");

  // -------------------------------------------------------------
  // TEST 4: Credit Above Maximum Amount is Rejected
  // -------------------------------------------------------------
  console.log("▶ TEST 4: Credit Above Maximum Amount is Rejected");
  const creditEnabledPolicy: MerchantPolicyInput = {
    ...standardPolicy,
    allowCredit: true,
    maximumCreditAmount: 25000,
    maximumCreditDays: 7,
  };

  const largeCreditOrder: OrderExtraction = {
    product: "Uniforms",
    products: [{ name: "Uniforms", quantity: 50, unitPrice: 1000 }],
    quantity: 50,
    unitPrice: 1000,
    totalAmount: 50000, // 50,000 exceeds 25,000 max credit
    requestedAdvancePercentage: 0,
    requestedAdvanceAmount: 0,
    requestedDiscountPercentage: null,
    requestedCredit: true,
    deliveryDate: "Next month",
    intent: "credit_request",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "₹50,000 uniforms on credit",
    notes: null,
  };

  const eval4 = evaluatePolicy({
    merchantPolicy: creditEnabledPolicy,
    order: largeCreditOrder,
    customer: { isNew: false, previousOrderCount: 5, onTimePaymentRate: 100 },
  });

  assert.equal(eval4.creditAllowed, false, "Credit exceeding max amount must be rejected");
  assert.ok(eval4.violations.some((v) => v.includes("exceeds maximum credit limit")), "Must flag exceeding credit limit");
  console.log("✅ TEST 4 PASSED: Credit amount exceeding policy cap is rejected.\n");

  // -------------------------------------------------------------
  // TEST 5: Credit Above Maximum Duration is Rejected
  // -------------------------------------------------------------
  console.log("▶ TEST 5: Credit Above Maximum Duration is Rejected");
  const creditDurationOrder = {
    ...creditOrder,
    totalAmount: 20000, // within 25k limit
    requestedCreditDays: 30, // exceeds 7 days max
  };

  const eval5 = evaluatePolicy({
    merchantPolicy: creditEnabledPolicy,
    order: creditDurationOrder,
    customer: { isNew: false, previousOrderCount: 5, onTimePaymentRate: 100 },
    requestedTerms: {
      creditRequested: true,
      creditDays: 30,
    },
  });

  assert.equal(eval5.creditAllowed, false, "Credit duration exceeding max days must be rejected");
  assert.ok(eval5.violations.some((v) => v.includes("exceeds maximum policy limit of 7 days")), "Must flag duration violation");
  console.log("✅ TEST 5 PASSED: Credit duration exceeding policy cap is rejected.\n");

  // -------------------------------------------------------------
  // TEST 6: Discount Above Maximum is Rejected
  // -------------------------------------------------------------
  console.log("▶ TEST 6: Discount Above Maximum is Rejected");
  const discountOrder: OrderExtraction = {
    product: "T-shirts",
    products: [{ name: "T-shirts", quantity: 250, unitPrice: 400 }],
    quantity: 250,
    unitPrice: 400,
    totalAmount: 100000,
    requestedAdvancePercentage: 50,
    requestedAdvanceAmount: 50000,
    requestedDiscountPercentage: 15, // asks 15% vs 5% max
    requestedCredit: false,
    deliveryDate: "This week",
    intent: "discount_request",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "250 tees at ₹400 · asking 15% discount",
    notes: null,
  };

  const eval6 = evaluatePolicy({
    merchantPolicy: standardPolicy,
    order: discountOrder,
    customer: { isNew: false, previousOrderCount: 5, onTimePaymentRate: 100 },
  });

  assert.equal(eval6.allowed, false, "Excessive discount cannot be approved without counter-offer");
  assert.equal(eval6.approvedDiscountPercentage, 5, "Approved discount capped at 5%");
  assert.equal(eval6.discountedTotalAmount, 95000, "Discounted total should be 100k - 5% = ₹95,000");
  assert.equal(eval6.canIssuePaymentLink, false, "Payment link issuance blocked on excessive discount");
  assert.equal(eval6.nextAction, "createFollowUp", "Must route to follow-up counter-offer");
  assert.ok(eval6.violations.some((v) => v.includes("exceeds the 5% maximum")), "Must flag discount violation");
  console.log("✅ TEST 6 PASSED: Excessive discount rejected and capped at policy maximum.\n");

  // -------------------------------------------------------------
  // TEST 7: High-Risk Customer Requires Advance + Approval
  // -------------------------------------------------------------
  console.log("▶ TEST 7: High-Risk Customer Requires Advance + Human Approval");
  const highRiskOrder: OrderExtraction = {
    product: "Staff uniforms",
    products: [{ name: "Staff uniforms", quantity: 100, unitPrice: 900 }],
    quantity: 100,
    unitPrice: 900,
    totalAmount: 90000,
    requestedAdvancePercentage: 0,
    requestedAdvanceAmount: 0,
    requestedDiscountPercentage: null,
    requestedCredit: true,
    deliveryDate: "Before wedding season",
    intent: "credit_request",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "100 uniforms · 30-day credit requested",
    notes: null,
  };

  const eval7 = evaluatePolicy({
    merchantPolicy: creditEnabledPolicy, // Even if credit is enabled generally
    order: highRiskOrder,
    customer: {
      isNew: false,
      previousOrderCount: 8,
      onTimePaymentRate: 62,
    },
    customerHistory: {
      totalOrders: 8,
      totalOrderValue: 180000,
      totalPaid: 162000,
      successfulPayments: 5,
      failedPayments: 1,
      latePayments: 3,
      averagePaymentDelayDays: 8,
      outstandingAmount: 18000,
    },
  });

  assert.equal(eval7.creditAllowed, false, "High-risk customer must NOT be given credit");
  assert.equal(eval7.requiresHumanApproval, true, "High-risk customer actions must require human approval");
  assert.equal(eval7.recommendedAdvancePercentage, 25, "Must enforce 25% minimum advance");
  assert.equal(eval7.recommendedAdvanceAmount, 22500, "Advance should be ₹22,500");
  assert.ok(eval7.violations.some((v) => v.includes("High-risk customers must pay at least 25% advance")), "Must report high risk advance violation");
  console.log("✅ TEST 7 PASSED: High-risk customer credit rejected, advance and human approval enforced.\n");

  // -------------------------------------------------------------
  // TEST 8: High-Value Order Requires Advance + Approval
  // -------------------------------------------------------------
  console.log("▶ TEST 8: High-Value Order Requires Advance + Human Approval");
  const highValueOrder: OrderExtraction = {
    product: "Bulk Blazers",
    products: [{ name: "Bulk Blazers", quantity: 100, unitPrice: 1500 }],
    quantity: 100,
    unitPrice: 1500,
    totalAmount: 150000, // Exceeds 100,000 threshold
    requestedAdvancePercentage: 25,
    requestedAdvanceAmount: 37500,
    requestedDiscountPercentage: null,
    requestedCredit: false,
    deliveryDate: "End of month",
    intent: "bulk_order",
    isAmbiguous: false,
    missingPrice: false,
    customerRequestSummary: "₹150,000 bulk order",
    notes: null,
  };

  const eval8 = evaluatePolicy({
    merchantPolicy: standardPolicy,
    order: highValueOrder,
    customer: { isNew: false, previousOrderCount: 5, onTimePaymentRate: 100 },
  });

  assert.equal(eval8.requiresHumanApproval, true, "High-value orders must require human approval");
  assert.equal(eval8.recommendedAdvancePercentage, 25, "Advance percentage should satisfy minimum");
  assert.ok(eval8.reasons.some((r) => r.includes("high-value threshold")), "Reasons must mention high value threshold");
  console.log("✅ TEST 8 PASSED: High value order correctly flags human approval.\n");

  // -------------------------------------------------------------
  // TEST 9: Valid Partial Payment is Allowed
  // -------------------------------------------------------------
  console.log("▶ TEST 9: Valid Partial Payment is Allowed");
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

  const eval9 = evaluatePolicy({
    merchantPolicy: standardPolicy,
    order: partialOrder,
    customer: { isNew: false, previousOrderCount: 4, onTimePaymentRate: 100 },
  });

  assert.equal(eval9.recommendedAdvancePercentage, 30, "Advance percentage should be 30%");
  assert.equal(eval9.recommendedAdvanceAmount, 15000, "Advance should be ₹15,000");
  assert.equal(eval9.remainingAmount, 35000, "Remaining balance should be ₹35,000");
  assert.equal(eval9.canIssuePaymentLink, true, "Should allow payment link");
  console.log("✅ TEST 9 PASSED: Valid partial payment accepted and calculated.\n");

  console.log("=======================================================");
  console.log("🎉 ALL 9 POLICY ENGINE TESTS PASSED PERFECTLY!");
  console.log("=======================================================\n");
}

runPolicyEngineTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Policy engine test failed:", err);
    process.exit(1);
  });
