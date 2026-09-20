import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E1220",
        panel: "#161B2E",
        panel2: "#1D2338",
        line: "#2A3050",
        ember: "#FF6B4A",
        emberDim: "#B84F37",
        violet: "#7C5CFC",
        text: "#EDEBF5",
        muted: "#8A8FA3",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
      borderRadius: {
        sharp: "4px",
      },
    },
  },
  plugins: [],
};

export default config;
