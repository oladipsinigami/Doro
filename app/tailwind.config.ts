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
        monad: {
          purple: "#836EF9",
          deep: "#0E0926",
          card: "#171033",
          border: "#2E215C",
          cyan: "#20E1FF",
        },
      },
    },
  },
  plugins: [],
};

export default config;
