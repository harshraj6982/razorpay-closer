import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    })
      .format(d)
      .toUpperCase();
  } catch {
    return iso;
  }
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function getPaymentCheckoutUrl(
  url?: string | null,
  linkId?: string | null,
  paymentId?: string | null,
): string {
  if (!url && !linkId && !paymentId) return "#";

  const isDemoUrl =
    url === "https://rzp.io/i/demo-partial" ||
    (typeof url === "string" &&
      (url.includes("demo-partial") ||
        url.includes("rzp.io/i/demo") ||
        url.includes("placeholder")));

  if (isDemoUrl) {
    const id =
      linkId ||
      (url?.includes("demo-partial") ? "plink_demo_partial_1" : null) ||
      paymentId ||
      "plink_demo_partial_1";
    return `/pay/${id.replace(/^\/pay\//, "")}`;
  }

  if (url?.startsWith("/")) {
    return url;
  }

  if (url?.startsWith("http://") || url?.startsWith("https://")) {
    return url;
  }

  const target = linkId || paymentId || url || "plink_demo_partial_1";
  return `/pay/${target.replace(/^\/pay\//, "")}`;
}

export function getPaymentDisplayUrl(
  url?: string | null,
  linkId?: string | null,
  paymentId?: string | null,
): string {
  const checkoutUrl = getPaymentCheckoutUrl(url, linkId, paymentId);
  return checkoutUrl;
}

export function getPaymentAbsoluteUrl(
  url?: string | null,
  linkId?: string | null,
  paymentId?: string | null,
): string {
  const checkoutUrl = getPaymentCheckoutUrl(url, linkId, paymentId);
  if (
    checkoutUrl.startsWith("http://") ||
    checkoutUrl.startsWith("https://") ||
    checkoutUrl === "#"
  ) {
    return checkoutUrl;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}${checkoutUrl.startsWith("/") ? "" : "/"}${checkoutUrl}`;
  }
  return checkoutUrl;
}
