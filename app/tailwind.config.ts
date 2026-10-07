import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        doro: {
          ink: "#141210",
          paper: "#F3EEE6",
          inktext: "#1C1915",
          muted: "#6F675E",
          faint: "#A3988C",
          line: "#E4DDD2",
          hairline: "#2C2824",
          seal: "#6E56CF",
          danger: "#9F2D2D",
          ok: "#1F6B45",
          warn: "#8A5A12",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Segoe UI", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
