import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#090A0F",
        panel: "#11131C",
        panel2: "#181B27",
        line: "rgba(255,255,255,0.09)",
        violet: { DEFAULT: "#8B5CF6", soft: "#A78BFA" },
        mint: "#34D399",
        gold: "#F5B800",
        text: "#ECEAF5",
        muted: "#8D92A8",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(139,92,246,0.7), 0 0 24px rgba(139,92,246,0.35)",
        gold: "0 0 14px rgba(245,184,0,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
