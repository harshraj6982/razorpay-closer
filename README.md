# Razorpay Closer

**Razorpay Closer** is an autonomous AI sales-to-payment agent designed for Indian B2B and SMB merchants.

In commercial wholesale and retail trade, merchants negotiate deals over informal messaging channels like WhatsApp. Orders are frequently delayed or lost in friction between agreement, policy compliance, credit checks, and payment link creation.

**Razorpay Closer** bridges this gap:
1. Understands unstructured customer requests and extracts structured orders.
2. Ingests customer purchase history and calculates a real-time risk score.
3. Evaluates merchant credit, discount, and advance policies with an authoritative rule engine.
4. Explains its reasoning transparently in an AI Decision Panel ("Why did I do this?").
5. Enforces human merchant approval on financial actions when required.
6. Generates Razorpay Test Mode Payment Links and tracks payment status via HMAC-verified webhooks.
7. Drives state machine transitions (`QUOTE_CREATED` → `PAYMENT_REQUESTED` → `PARTIALLY_PAID` → `PAID` → `FULFILLED`) and recommends the next operational action.

---

## System Architecture

```
                                  ┌──────────────────────────────────────────────────────────┐
                                  │               INFORMAL CHAT (e.g. WhatsApp)              │
                                  └─────────────────────────────┬────────────────────────────┘
                                                                │
                                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                 RAZORPAY CLOSER ENGINE                                                 │
│                                                                                                                        │
│  ┌───────────────────────────┐      ┌───────────────────────────┐      ┌────────────────────────────────────────────┐  │
│  │    AI Extraction Layer    │ ───► │  Policy Engine & Risk     │ ───► │      Merchant Dashboard & Decision UI      │  │
│  │   (OpenAI + Deterministic │      │  (Deterministic Rules,    │      │  ("Why did I do this?" Explanation,       │  │
│  │       Rule Fallback)      │      │   Customer Risk Scoring)  │      │    Approval Mode & Human-in-the-Loop)      │  │
│  └───────────────────────────┘      └───────────────────────────┘      └─────────────────────┬──────────────────────┘  │
│                                                                                              │                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┘                         │
│  │                                                                                                                     │
│  ▼                                                                                                                     │
│  ┌───────────────────────────┐      ┌───────────────────────────┐      ┌────────────────────────────────────────────┐  │
│  │     Typed Agent Tools     │ ───► │  Razorpay API Integration │ ───► │        Authoritative State Machine         │  │
│  │  - createPaymentLink      │      │  - Payment Links API      │      │  - OrderStatus: NEW → QUALIFIED →          │  │
│  │  - getPaymentStatus       │      │  - Test Mode Simulation   │      │    QUOTE_CREATED → PAYMENT_REQUESTED →     │  │
│  │  - updateOrderStatus      │      │  - HMAC Webhook Receiver  │      │    PARTIALLY_PAID → PAID → FULFILLED       │  │
│  │  - sendPaymentRequest     │      │                           │      │                                            │  │
│  │  - recordAgentAction      │      │                           │      │                                            │  │
│  └───────────────────────────┘      └───────────────────────────┘      └────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Features

- **Multi-Turn Inbox & Context**: Seamless switching between active customer conversations with unread badges, risk tags, and order status indicators.
- **Explainable Decision Panel ("Why did I do this?")**: Shows exactly which customer metrics, risk factors, and merchant rules triggered the decision.
- **Defense-in-Depth Policy Safeguards**:
  - Minimum advance payment requirements.
  - Maximum allowable discount thresholds.
  - Credit restrictions (duration, limits, high-risk blocking).
  - Backend financial validation prevents tool invocation with mismatched amounts.
  - State machine locks prevent illegal actions on finalized orders.
- **Razorpay Payment Hub**:
  - Live/Test Razorpay Payment Link creation.
  - Webhook receiver verifying `x-razorpay-signature` HMAC SHA-256 signatures with timing-safe comparison.
  - Idempotent duplicate-webhook protection prevents duplicate payments and corrupted balances.
  - Partial payment tracking (e.g., ₹22,200 advance on ₹74,000 order moves to `PARTIALLY_PAID`; remaining ₹51,800 moves to `PAID`).
- **Interactive Hosted Checkout (`/pay/[id]`)**:
  - Test checkout page allowing judges and merchants to experience the payment experience and trigger instant simulated webhooks.
- **Comprehensive Evaluation Engine**:
  - 80 synthetic test scenarios covering edge cases, adversarial discount attacks, high-risk buyers, and credit violations.
  - Evaluates decision accuracy, policy compliance, exact monetary matching, and failure taxonomy.
  - Compares results dynamically against a naive AI baseline.
- **1-Click Demo Reset**: Reset all conversations, payments, and audit logs back to the pristine seed state directly from the dashboard or CLI.

---

## Local Development Setup

### 1. Prerequisites
- Node.js 20+ installed
- npm 10+ installed

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` as needed:
```env
DATABASE_URL="file:./dev.db"
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
OPENAI_API_KEY=""
```
> [!NOTE]
> The system is fully self-contained and deterministic. If Razorpay or OpenAI credentials are not provided, it seamlessly activates high-fidelity test simulations and deterministic fallback engines, guaranteeing 100% policy compliance.

### 4. Database Setup
Generate Prisma client and seed the 5 benchmark demo cases:
```bash
npm run db:reset
```

### 5. Start Development Server
```bash
npm run dev
```
Open `http://localhost:3000` to view the merchant dashboard.

---

## Razorpay Configuration

To connect live Razorpay Test Mode keys:
1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Switch to **Test Mode** in the top navigation bar.
3. Go to **Settings** → **API Keys** → **Generate Key**.
4. Set the credentials in your `.env` file:
   ```env
   RAZORPAY_KEY_ID="rzp_test_YourKeyId"
   RAZORPAY_KEY_SECRET="YourKeySecret"
   ```

### Webhook Setup
1. In Razorpay Dashboard, go to **Settings** → **Webhooks** → **Add New Webhook**.
2. Webhook URL:
   - Local testing: Use a tunnel URL or test using the in-app simulator (`/pay/[id]` or "Simulate Webhook" button).
   - Production: `https://your-domain.vercel.app/api/webhooks/razorpay`
3. Secret: Enter a secret string and set it as `RAZORPAY_WEBHOOK_SECRET` in `.env`.
4. Active Events:
   - `payment.captured`
   - `payment.failed`
   - `payment_link.cancelled`
   - `payment_link.expired`

---

## Running Verification & Evaluation

### Run All Automated Tests
```bash
npm test
```

### Run End-to-End Workflow Verification
```bash
npm run verify
```

### Run Evaluation Engine Benchmark
```bash
npm run evaluate
```

To compare against the naive baseline:
```bash
npm run evaluate:baseline
```

### Run Linter & Build
```bash
npm run lint
npm run build
```

---

## Hackathon Judge Demo Walkthrough

Follow these steps for the complete presentation flow:

1. **Reset Database**:
   - In the top-right of the dashboard header, click **Reset Demo State** (or run `npm run db:seed`).

2. **Select Rahul Textiles (`conv_trusted`)**:
   - Notice the customer risk profile: **LOW RISK** (7 orders, 0 late payments, ₹420,000 LTV).
   - Read the incoming message: *"Need 40 shirts same rate as last time. Can pay 30% now."*

3. **Inspect AI Extraction & Policy Decision**:
   - Order extracted: 40 units @ ₹1,850/unit = **₹74,000** total.
   - Advance requested: 30% = **₹22,200**.
   - Merchant policy: Requires minimum 25% advance.
   - AI Decision Panel displays: *"The requested 30% advance satisfies the merchant's 25% minimum advance policy."*
   - Status: **Merchant Approval Required** (Human-in-the-Loop protection).

4. **Approve Action**:
   - Click **APPROVE FINANCIAL ACTION · createPaymentLink**.
   - Watch the order transition from `QUOTE_CREATED` to `PAYMENT_REQUESTED`.
   - The Payment Hub displays the newly generated payment link.

5. **Complete Payment**:
   - Click the payment link to open the hosted checkout page (`/pay/[id]`).
   - Click **Pay ₹22,200 (Simulate Webhook)**.
   - The webhook is received, HMAC signature verified, and the order transitions to **`PARTIALLY_PAID`**.
   - Total Collected updates to ₹22,200 (30%); Remaining updates to ₹51,800.

6. **Review Next AI Action**:
   - AI automatically evaluates the new post-payment state.
   - Next Action updates to `sendPaymentRequest`: *"Advance payment of ₹22,200 received. Next action is to request the remaining ₹51,800 against delivery."*

7. **Settle Full Payment**:
   - Click **Simulate Webhook** for the remaining ₹51,800 balance.
   - Order transitions to **`PAID`**.
   - AI recommends `updateOrderStatus` to **`FULFILLED`**.

8. **View Evaluation Engine**:
   - Click **Evaluation Suite** in the top navigation (`/dashboard/evaluation`).
   - View accuracy scores across all 80 scenarios.
   - Highlight: **100% Policy Compliance**, **Zero Financial Mutations on Unsafe Requests**, and **10/10 Unsafe Policy Violations Blocked**.
