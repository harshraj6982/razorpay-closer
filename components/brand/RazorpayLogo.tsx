import React from "react";
import { Sparkles } from "lucide-react";

interface RazorpayLogoProps {
  className?: string;
  showWordmark?: boolean;
  productName?: string;
  badge?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Authentic Razorpay Brand Mark & Product Lockup
 * Recreates the iconic Razorpay geometric lightning/razor glyph with precision SVG vectors.
 */
export function RazorpayLogo({
  className = "",
  showWordmark = true,
  productName = "Closer",
  badge = "AI AUTOPILOT",
  size = "md",
}: RazorpayLogoProps) {
  const iconSize = size === "sm" ? 20 : size === "lg" ? 30 : 24;

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Official Razorpay Dynamic Razor Glyph */}
      <div
        className="relative flex shrink-0 items-center justify-center rounded-xl bg-[#0C2340] shadow-xs"
        style={{ width: iconSize + 10, height: iconSize + 10 }}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-[75%] w-[75%]"
        >
          {/* Razorpay stylized lightning / razor blade polygons */}
          <path
            d="M5.5 24.5L14.2 4.5H19.5L10.8 24.5H5.5Z"
            fill="#3395FF"
          />
          <path
            d="M14.5 13.5L19.2 4.5H26.5L17.8 20.5H23.5L11.5 30.5L14.5 18.5H11.5L14.5 13.5Z"
            fill="#0C83FD"
          />
        </svg>
      </div>

      {showWordmark && (
        <div className="flex items-center gap-2">
          <div className="flex items-baseline gap-1.5">
            {/* Razorpay brand name */}
            <span className="text-[15px] font-bold tracking-tight text-[#0C2340]">
              Razorpay
            </span>
            {/* Product Name */}
            {productName && (
              <span className="text-[15px] font-extrabold tracking-tight bg-gradient-to-r from-[#0C83FD] to-[#0052cc] bg-clip-text text-transparent">
                {productName}
              </span>
            )}
          </div>

          {/* Product Category / AI Badge */}
          {badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold tracking-wider text-[#0C83FD] border border-blue-200/80 uppercase">
              <Sparkles className="h-2.5 w-2.5 text-[#0C83FD]" />
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function RazorpayIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M5.5 24.5L14.2 4.5H19.5L10.8 24.5H5.5Z" fill="#3395FF" />
      <path
        d="M14.5 13.5L19.2 4.5H26.5L17.8 20.5H23.5L11.5 30.5L14.5 18.5H11.5L14.5 13.5Z"
        fill="#0C83FD"
      />
    </svg>
  );
}
