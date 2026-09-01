# Razorpay Closer

**Razorpay Closer** is an AI sales-to-payment agent for merchants.

The merchant receives informal customer conversations. The AI understands customer purchase intent, extracts structured order details, applies merchant policies, recommends the appropriate payment strategy, and executes financial actions using Razorpay APIs.

## Core Demo Workflow

```
Customer Conversation
  ↓
AI Order Extraction & Policy Engine Evaluation
  ↓
Merchant Reviews "Why did I do this?" Decision Panel & Approves
  ↓
Razorpay Test-Mode Payment Link Created
  ↓
Payment Webhook Received & Signature Verified
  ↓
Order State Machine Transitions (e.g. QUOTE_CREATED → PAYMENT_REQUESTED → PARTIALLY_PAID → PAID)
  ↓
AI Recommends Next Action (e.g. request delivery balance or fulfill order)
```

## Features

- **Merchant Dashboard**: Desktop-first SaaS UI featuring Inbox, Conversation Thread, AI Decision Panel ("Why did I do this?"), Order Summary, Payment Status progress, and Agent Activity Timeline.
- **Typed Agent Tools**:
  - `createPaymentLink`: Generates Razorpay Test Mode link (or fallback test simulation), logs status and activity.
  - `getPaymentStatus`: Verifies payment state against Razorpay.
  - `updateOrderStatus`: Strict state transitions with audit trail.
  - `sendPaymentRequest`: Formats and dispatches payment reminders.
  - `createFollowUp`: Schedules follow-ups within policy limits.
  - `recordAgentAction`: Complete structured logging in `AgentActionLog`.
- **Policy Engine**: Enforces minimum advance %, maximum discount %, credit allowances, and new customer requirements.
- **Webhook Processing**: Validates HMAC SHA256 signatures, manages partial/full payments, updates order state machine, and triggers subsequent AI recommendations.
- **Interactive Test Checkout Simulator**: Dedicated `/pay/[id]` page allowing presenters and judges to experience the Razorpay checkout and trigger instant webhook payments.
- **1-Click Demo Reset**: Reset all conversations back to the pristine seed state directly from the dashboard header or CLI.

## Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Setup database & seed 5 demo cases
npm run db:reset

# 3. Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env`:

```env
DATABASE_URL="file:./dev.db"
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
OPENAI_API_KEY=""
```

*Note: The project operates deterministically out of the box even without live API keys, using high-fidelity test-mode simulations for flawless hackathon presentations.*

## Automated Verification

Run the end-to-end verification suite:

```bash
npx tsx scripts/verify-all.ts
```
