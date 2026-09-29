import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        foreground: "#f4f4f5",
        card: {
          DEFAULT: "#121215",
          hover: "#18181d",
          border: "#27272a",
        },
        primary: {
          DEFAULT: "#6366f1",
          hover: "#4f46e5",
          glow: "rgba(99, 102, 241, 0.15)",
        },
        safe: {
          DEFAULT: "#10b981",
          glow: "rgba(16, 185, 129, 0.15)",
        },
        llm: {
          DEFAULT: "#f59e0b",
          glow: "rgba(245, 158, 11, 0.15)",
        },
        reject: {
          DEFAULT: "#f43f5e",
          glow: "rgba(244, 63, 94, 0.15)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Courier New", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { opacity: "0.4" },
          "100%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
