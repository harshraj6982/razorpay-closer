import assert from "node:assert/strict";
import { prisma } from "../lib/db/client";
import { calculateCustomerRisk } from "../lib/policies/risk";
import { getCustomerContext, syncCustomerMetrics } from "../lib/policies/customer";
import { recordPolicyAudit } from "../lib/policies/audit";
import { evaluatePolicy } from "../lib/policies/engine";
import { seedDatabase } from "../prisma/seed";

async function runCustomerHistoryTests() {
  console.log("\n=======================================================");
  console.log("📊 RUNNING CUSTOMER HISTORY & RISK TESTS");
  console.log("=======================================================\n");

  await seedDatabase();

  // -------------------------------------------------------------
  // TEST 1: Customer Risk Score is Deterministic
  // -------------------------------------------------------------
  console.log("▶ TEST 1: Customer Risk Score is Deterministic");

  // Trusted customer with 7 orders, 0 late payments
  const lowRisk1 = calculateCustomerRisk({
    totalOrders: 7,
    totalOrderValue: 420000,
    totalPaid: 420000,
    successfulPayments: 7,
    failedPayments: 0,
    latePayments: 0,
    averagePaymentDelayDays: 0,
    outstandingAmount: 0,
  });

  const lowRisk2 = calculateCustomerRisk({
    totalOrders: 7,
    totalOrderValue: 420000,
    totalPaid: 420000,
    successfulPayments: 7,
    failedPayments: 0,
    latePayments: 0,
    averagePaymentDelayDays: 0,
    outstandingAmount: 0,
  });

  assert.equal(lowRisk1.level, "LOW", "Trusted customer must be LOW risk");
  assert.equal(lowRisk1.score, 100, "Clean track record must yield top score 100");
  assert.equal(lowRisk1.score, lowRisk2.score, "Risk calculation must be completely deterministic");
  console.log("✅ Low Risk Customer Verified:", lowRisk1);

  // New customer
  const medRisk = calculateCustomerRisk({
    totalOrders: 0,
    totalOrderValue: 0,
    totalPaid: 0,
    successfulPayments: 0,
    failedPayments: 0,
    latePayments: 0,
    averagePaymentDelayDays: 0,
    outstandingAmount: 0,
  });
  assert.equal(medRisk.level, "MEDIUM", "New customer without history must be MEDIUM risk");
  console.log("✅ Medium Risk (New Customer) Verified:", medRisk);

  // Risky customer with 3 late payments and outstanding balance
  const highRisk = calculateCustomerRisk({
    totalOrders: 8,
    totalOrderValue: 180000,
    totalPaid: 162000,
    successfulPayments: 5,
    failedPayments: 1,
    latePayments: 3,
    averagePaymentDelayDays: 8,
    outstandingAmount: 18000,
  });
  assert.equal(highRisk.level, "HIGH", "Customer with multiple late payments must be HIGH risk");
  assert.ok(highRisk.reasons.some((r) => r.includes("late payment")), "Must flag late payments in reasons");
  console.log("✅ High Risk Customer Verified:", highRisk);
  console.log("✅ TEST 1 PASSED: Risk scoring is explainable and deterministic.\n");

  // -------------------------------------------------------------
  // TEST 2: Customer Context Summary Generation
  // -------------------------------------------------------------
  console.log("▶ TEST 2: Customer Context Summary for AI");
  const rahulCustomer = await prisma.customer.findFirst({
    where: { name: "Rahul Textiles" },
  });
  assert.ok(rahulCustomer, "Rahul Textiles must exist");

  const context = await getCustomerContext(rahulCustomer.id);
  assert.ok(context, "Context must be retrieved");
  assert.equal(context.risk.level, "LOW", "Risk level should be LOW");
  assert.ok(context.summaryText.includes("Rahul Textiles"), "Summary must include customer name");
  assert.ok(context.summaryText.includes("Orders:"), "Summary must include order count");
  assert.ok(context.summaryText.includes("Risk:\nLOW"), "Summary must include risk level");
  console.log("Customer Summary Text:\n" + context.summaryText);
  console.log("✅ TEST 2 PASSED: getCustomerContext returns compact, structured summary.\n");

  // -------------------------------------------------------------
  // TEST 3: Customer Metrics Sync and Outstanding Balance
  // -------------------------------------------------------------
  console.log("▶ TEST 3: Customer Metrics & Outstanding Balance Calculation");
  const sureshCustomer = await prisma.customer.findFirst({
    where: { name: "Suresh Iyer" },
  });
  assert.ok(sureshCustomer, "Suresh Iyer must exist");

  const updatedMetrics = await syncCustomerMetrics(sureshCustomer.id);
  assert.ok(updatedMetrics, "Metrics must sync");
  assert.equal(updatedMetrics.totalOrders >= 1, true, "Total orders must be at least 1");
  assert.equal(updatedMetrics.outstandingAmount, 35000, "Outstanding balance should be ₹35,000 (50k total - 15k paid)");
  console.log("Synced Metrics for Suresh:", updatedMetrics);
  console.log("✅ TEST 3 PASSED: Outstanding balance computed accurately.\n");

  // -------------------------------------------------------------
  // TEST 4: Policy Audit Trail Logging
  // -------------------------------------------------------------
  console.log("▶ TEST 4: Policy Decisions are Recorded in Audit Trail");
  const testEval = evaluatePolicy({
    merchantPolicy: {
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
    order: {
      totalAmount: 74000,
      requestedAdvancePercentage: 30,
      requestedDiscountPercentage: null,
      requestedCredit: false,
    },
    customer: {
      id: rahulCustomer.id,
      name: rahulCustomer.name,
      previousOrderCount: 7,
      onTimePaymentRate: 100,
    },
  });

  const auditLogResult = await recordPolicyAudit({
    customerId: rahulCustomer.id,
    actionRequested: "createPaymentLink",
    evaluation: testEval,
    customerName: rahulCustomer.name,
  });

  assert.equal(auditLogResult.success, true, "Audit log creation must succeed");

  const auditRow = await prisma.policyAuditLog.findFirst({
    where: { customerId: rahulCustomer.id },
    orderBy: { createdAt: "desc" },
  });

  assert.ok(auditRow, "Policy audit log row must exist in database");
  assert.equal(auditRow.policyDecision, "REQUEST_ADVANCE", "Policy decision should match evaluation");
  assert.equal(auditRow.allowed, true, "Allowed flag must be true");
  console.log("Policy Audit Record:", auditRow);
  console.log("✅ TEST 4 PASSED: Policy decisions recorded in audit trail.\n");

  console.log("=======================================================");
  console.log("🎉 ALL CUSTOMER HISTORY & RISK TESTS PASSED!");
  console.log("=======================================================\n");
}

runCustomerHistoryTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Customer history test failed:", err);
    process.exit(1);
  });
