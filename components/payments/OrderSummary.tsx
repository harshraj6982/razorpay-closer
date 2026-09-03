import { Package, Calendar, Tag } from "lucide-react";
import type { DashboardConversation } from "@/lib/db/queries";
import { formatINR } from "@/lib/utils";

export function OrderSummary({ conversation }: { conversation: DashboardConversation }) {
  const order = conversation.order;
  if (!order) {
    return null;
  }

  const rec = order.liveRecommendation;
  const advancePct = rec?.recommendedAdvancePercentage ?? order.recommendedAdvancePercentage;
  const advanceAmt = rec?.recommendedAdvanceAmount ?? order.recommendedAdvanceAmount;
  const remaining = rec?.remainingAmount ?? order.remainingAmount;

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Package className="h-3 w-3" />
          </div>
          <h3 className="text-sm font-bold text-[#0C2340]">Order Specification</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold capitalize tracking-wider text-slate-600 border border-slate-200">
          {order.intent.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/80">
        <table className="w-full text-xs">
          <tbody>
            {order.products.map((product) => (
              <tr key={product.name} className="border-b border-slate-100 bg-slate-50/50">
                <td className="px-3.5 py-2.5 font-semibold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3 w-3 text-slate-400" />
                    {product.name}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 text-right tabular font-medium text-slate-600">
                  {product.quantity} × {formatINR(product.unitPrice)}
                </td>
              </tr>
            ))}
            <Metric label="Total Quantity" value={`${order.quantity} units`} />
            <Metric label="Base Unit Price" value={formatINR(order.unitPrice)} />
            <Metric
              label="Gross Order Value"
              value={formatINR(order.totalAmount)}
              emphasize
            />
            <Metric
              label={`Requested Advance${order.requestedAdvancePercentage != null ? ` (${order.requestedAdvancePercentage}%)` : ""}`}
              value={
                order.requestedAdvancePercentage != null
                  ? formatINR(
                      Math.round((order.totalAmount * order.requestedAdvancePercentage) / 100),
                    )
                  : "None"
              }
            />
            <Metric
              label={`Recommended Advance (${advancePct ?? 0}%)`}
              value={advanceAmt != null ? formatINR(advanceAmt) : "—"}
              badge="Razorpay Policy"
            />
            <Metric
              label="Remaining Balance"
              value={remaining != null ? formatINR(remaining) : "—"}
            />
            <tr className="border-b border-slate-100 last:border-0 bg-slate-50/30">
              <td className="px-3.5 py-2 text-slate-500 font-medium">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span>Target Delivery</span>
                </div>
              </td>
              <td className="px-3.5 py-2 text-right font-semibold text-slate-800">
                {order.deliveryDate ?? "Pending"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  emphasize,
  badge,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  badge?: string;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3.5 py-2 text-slate-600 font-medium">
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          {badge && (
            <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[9px] font-bold text-[#0C83FD] border border-blue-200">
              {badge}
            </span>
          )}
        </div>
      </td>
      <td
        className={`px-3.5 py-2 text-right tabular ${
          emphasize
            ? "font-extrabold text-sm text-[#0C2340]"
            : "font-semibold text-slate-800"
        }`}
      >
        {value}
      </td>
    </tr>
  );
}
