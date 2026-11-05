"use client";

import { usePathname } from "next/navigation";

/**
 * Gaming-themed pearl canvas: pearlescent base + low-contrast line art of loot crystals,
 * D-pads, controllers and hex shield nodes. Static (painted once, fixed layer), so it costs
 * nothing while scrolling. Strong on login / register / welcome, muted on the store.
 */
export function PearlBackdrop() {
  const pathname = usePathname() ?? "/";
  const strong = pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/welcome");
  return (
    <div className={`pearl-canvas pointer-events-none fixed inset-0 ${strong ? "is-strong" : "is-muted"}`} aria-hidden>
      <svg className="pearl-art absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pearl-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="55%" stopColor="#7DD3FC" />
            <stop offset="100%" stopColor="#C4B5FD" />
          </linearGradient>
          <pattern id="pearl-games" width="360" height="360" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="url(#pearl-stroke)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
              {/* isometric loot crystal */}
              <g transform="translate(28 30)">
                <polygon points="40,4 68,20 68,52 40,68 12,52 12,20" />
                <polyline points="12,20 40,36 68,20" />
                <line x1="40" y1="36" x2="40" y2="68" />
                <polyline points="26,12 40,20 54,12" opacity="0.6" />
              </g>
              {/* D-pad crosshair */}
              <g transform="translate(232 40)">
                <path d="M22 0h20v22h22v20H42v22H22V42H0V22h22z" />
                <circle cx="32" cy="32" r="5" opacity="0.7" />
              </g>
              {/* controller contour */}
              <g transform="translate(120 170)">
                <path d="M18 14C18 4 30 0 40 4h44c10-4 22 0 22 10l6 34c2 12-10 18-18 10l-10-10H40L30 58c-8 8-20 2-18-10z" />
                <path d="M30 22v14M23 29h14" />
                <circle cx="86" cy="24" r="3" />
                <circle cx="94" cy="32" r="3" />
              </g>
              {/* hexagonal shield nodes */}
              <g transform="translate(250 240)">
                <polygon points="30,0 56,15 56,45 30,60 4,45 4,15" />
                <circle cx="30" cy="30" r="6" />
                <line x1="56" y1="15" x2="84" y2="0" opacity="0.6" />
                <line x1="4" y1="45" x2="-24" y2="62" opacity="0.6" />
                <circle cx="88" cy="-2" r="3" />
                <circle cx="-28" cy="64" r="3" />
              </g>
              {/* small crystal shard */}
              <g transform="translate(40 268) rotate(-12)">
                <polygon points="16,0 32,12 16,40 0,12" />
                <line x1="0" y1="12" x2="32" y2="12" opacity="0.6" />
              </g>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pearl-games)" />
      </svg>
    </div>
  );
}
