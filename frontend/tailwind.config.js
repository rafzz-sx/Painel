import forms from "@tailwindcss/forms"

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#070B12",
          soft: "#0B111C",
        },
        surface: {
          DEFAULT: "#0F1622",
          light: "#141D2E",
        },
        primary: {
          DEFAULT: "#3AA7FF",
          dim: "#1E5F94",
          soft: "rgba(58, 167, 255, 0.14)",
        },
        amber: {
          DEFAULT: "#FFB648",
          soft: "rgba(255, 182, 72, 0.14)",
        },
        danger: {
          DEFAULT: "#FF6B6B",
          soft: "rgba(255, 107, 107, 0.14)",
        },
        success: {
          DEFAULT: "#4ADE80",
          soft: "rgba(74, 222, 128, 0.14)",
        },
        ink: {
          DEFAULT: "#E8EEF7",
          dim: "#8492A6",
          faint: "#4C5A70",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(58,167,255,0.15), 0 8px 40px -8px rgba(58,167,255,0.35)",
        "glow-amber": "0 0 0 1px rgba(255,182,72,0.15), 0 8px 40px -8px rgba(255,182,72,0.3)",
      },
      keyframes: {
        "scan-rotate": {
          to: { transform: "rotate(360deg)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: 0.45, transform: "scale(1)" },
          "50%": { opacity: 0.85, transform: "scale(1.06)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(5px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(3px)" },
        },
        blink: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.25 },
        },
      },
      animation: {
        "scan-rotate": "scan-rotate 7s linear infinite",
        "pulse-soft": "pulse-soft 4s ease-in-out infinite",
        shake: "shake 0.5s ease-in-out",
        blink: "blink 2s ease-in-out infinite",
      },
    },
  },
  plugins: [forms],
}