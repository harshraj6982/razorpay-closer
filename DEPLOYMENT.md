# Production Deployment Guide: Razorpay Closer

This guide provides step-by-step instructions for deploying **Razorpay Closer** to **Vercel** with a managed PostgreSQL database on **Supabase**.

---

## Architecture Overview

```
[ Customer / WhatsApp ]
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                  │
│                                                         │
│   Next.js 16 App Router (React 19 Server Components)   │
│   ├─ /dashboard           (Merchant Dashboard)          │
│   ├─ /dashboard/evaluation (Evaluation Analytics)       │
│   ├─ /pay/[id]            (Hosted Payment Checkout)     │
│   └─ /api/webhooks/razorpay (HMAC Verified Webhooks)    │
└─────────────────────────────────────────────────────────┘
           │                                │
           ▼                                ▼
┌───────────────────────┐       ┌───────────────────────┐
│   Razorpay API &      │       │   Supabase Postgres   │
│   Webhook Engine      │       │   (Prisma ORM with    │
│   (Test / Live Mode)  │       │   Connection Pooler)  │
└───────────────────────┘       └───────────────────────┘
```

---

## Prerequisites

Before starting, ensure you have:
1. A **GitHub account** with access to the `razorpay-closer` repository.
2. A **Vercel account** ([vercel.com](https://vercel.com)).
3. A **Supabase account** ([supabase.com](https://supabase.com)).
4. A **Razorpay Merchant account** ([dashboard.razorpay.com](https://dashboard.razorpay.com)) with Test Mode enabled.
5. An **OpenAI API Key** (optional: if omitted, deterministic fallback engines execute with 100% policy accuracy).

---

## Phase 1: Database Provisioning on Supabase

1. **Create a New Supabase Project**:
   - Log in to [database.new](https://database.new).
   - Enter project name: `razorpay-closer`.
   - Set a strong database password and select your preferred AWS region (e.g., `ap-south-1` Mumbai for Indian merchants).
   - Click **Create new project**.

2. **Retrieve Database Connection Strings**:
   - Navigate to **Project Settings** → **Database** → **Connection string**.
   - Under **URI**, switch from `Transaction` to `Session` or copy both:
     - **Pooled connection string** (Transaction pooler, port 6543): Best for serverless runtime.
     - **Direct connection string** (port 5432): Used for migrations (`prisma db push`).

3. **Configure Prisma Schema for PostgreSQL**:
   - In `prisma/schema.prisma`, update the datasource provider when migrating from SQLite to PostgreSQL:
     ```prisma
     datasource db {
       provider  = "postgresql"
       url       = env("DATABASE_URL")
       directUrl = env("DIRECT_URL")
     }
     ```

4. **Initialize Database Schema & Seed Data**:
   From your local development machine or CI pipeline:
   ```bash
   # Set the Supabase connection string temporarily
   export DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
   export DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

   # Push the schema and apply indexes
   npx prisma db push

   # Seed the 5 benchmark demo conversations and policy rules
   npm run db:seed
   ```

---

## Phase 2: Deployment on Vercel

1. **Import the Git Repository**:
   - Go to [vercel.com/new](https://vercel.com/new).
   - Select your Git provider and import the `razorpay-closer` repository.

2. **Configure Build & Framework Settings**:
   - **Framework Preset**: Next.js
   - **Build Command**: `prisma generate && next build --webpack` (already set in `package.json`)
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

3. **Configure Environment Variables**:
   In the Vercel project settings, add the following environment variables:

   | Variable Name | Environment | Description / Example |
   | :--- | :--- | :--- |
   | `DATABASE_URL` | Production, Preview | Pooled Supabase connection string (`postgres://...`) |
   | `DIRECT_URL` | Production, Preview | Direct Supabase connection string (port 5432) |
   | `RAZORPAY_KEY_ID` | Production, Preview | `rzp_test_...` or `rzp_live_...` |
   | `RAZORPAY_KEY_SECRET` | Production, Preview | Razorpay Key Secret from dashboard |
   | `RAZORPAY_WEBHOOK_SECRET` | Production, Preview | Razorpay Webhook secret for HMAC verification |
   | `OPENAI_API_KEY` | Production, Preview | `sk-...` (optional, falls back deterministically) |
   | `NODE_ENV` | Production | `production` |

4. **Deploy**:
   - Click **Deploy**.
   - Vercel will run the build, generate Prisma clients, compile the Next.js application, and assign a production domain (e.g., `https://razorpay-closer.vercel.app`).

---

## Phase 3: Razorpay Webhook Configuration

1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Ensure toggle is in **Test Mode** (or **Live Mode** if going live).
3. Navigate to **Settings** → **Webhooks** → **Add New Webhook**.
4. Configure the webhook endpoint:
   - **Webhook URL**: `https://your-domain.vercel.app/api/webhooks/razorpay`
   - **Secret**: Enter the exact secret string you configured in `RAZORPAY_WEBHOOK_SECRET`.
   - **Alert Email**: Your operational notifications email.
5. Select the following **Active Events**:
   - `payment.captured` (triggers order balance recalculation and state transition)
   - `payment.failed` (audits payment attempts and records failures)
   - `payment_link.cancelled` (updates link status)
   - `payment_link.expired` (updates link status)
6. Click **Create Webhook**.

---

## Phase 4: Production Verification Checklist

After deployment completes:

1. **Health & UI Check**:
   - Open `https://your-domain.vercel.app`.
   - Verify the Merchant Dashboard loads the 5 seeded customer conversations.

2. **Test Payment Flow**:
   - Open **Rahul Textiles** (`conv_trusted`).
   - Click **APPROVE FINANCIAL ACTION** to generate a Razorpay Payment Link.
   - Click the generated payment link or `/pay/[id]` checkout.
   - Complete the test payment.
   - Verify the webhook status transitions to `PARTIALLY_PAID` and AI recommends `sendPaymentRequest` for the balance.

3. **Evaluation Dashboard Check**:
   - Open `https://your-domain.vercel.app/dashboard/evaluation`.
   - Click **Run Evaluation Suite**.
   - Verify all 80 scenarios pass with 100% policy compliance.

---

## Troubleshooting

- **Prisma Client Missing in Production**:
  Ensure the Vercel build command is `prisma generate && next build --webpack` (defined in `package.json`).
- **Webhook Signature Fails (HTTP 400)**:
  Verify that `RAZORPAY_WEBHOOK_SECRET` on Vercel exactly matches the secret set in the Razorpay Webhook settings. In production, signature checks strictly enforce timing-safe HMAC SHA256 equality.
- **Connection Pool Exhaustion**:
  Ensure `DATABASE_URL` uses Supabase's transaction pooler (`port 6543` with `?pgbouncer=true`).
