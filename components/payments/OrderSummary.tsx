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
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Order summary</h3>
      <p className="mt-1 text-[12px] capitalize text-muted">{order.intent.replaceAll("_", " ")}</p>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <tbody>
            {order.products.map((product) => (
              <tr key={product.name} className="border-b border-line">
                <td className="px-3 py-2 text-slate-600">{product.name}</td>
                <td className="px-3 py-2 text-right tabular text-muted">
                  {product.quantity} × {formatINR(product.unitPrice)}
                </td>
              </tr>
            ))}
            <Metric label="Quantity" value={String(order.quantity)} />
            <Metric label="Unit price" value={formatINR(order.unitPrice)} />
            <Metric label="Total" value={formatINR(order.totalAmount)} emphasize />
            <Metric
              label={`Requested advance${order.requestedAdvancePercentage != null ? ` (${order.requestedAdvancePercentage}%)` : ""}`}
              value={
                order.requestedAdvancePercentage != null
                  ? formatINR(Math.round((order.totalAmount * order.requestedAdvancePercentage) / 100))
                  : "None"
              }
            />
            <Metric
              label={`Recommended advance (${advancePct ?? 0}%)`}
              value={advanceAmt != null ? formatINR(advanceAmt) : "—"}
            />
            <Metric
              label="Remaining"
              value={remaining != null ? formatINR(remaining) : "—"}
            />
            <Metric label="Delivery" value={order.deliveryDate ?? "—"} />
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
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2 text-slate-600">{label}</td>
      <td
        className={`px-3 py-2 text-right tabular ${emphasize ? "font-semibold text-slate-900" : "text-slate-800"}`}
      >
        {value}
      </td>
    </tr>
  );
}
