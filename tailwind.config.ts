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
        cyber: {
          bg: "rgb(var(--cyber-bg))",
          panel: "rgb(var(--cyber-panel))",
          cyan: "rgb(var(--cyber-cyan))",
          magenta: "rgb(var(--cyber-magenta))",
          yellow: "rgb(var(--cyber-yellow))",
          text: "rgb(var(--cyber-text))",
          muted: "rgb(var(--cyber-muted))",
        },
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        "cyber-cyan": "0 0 20px -2px rgba(0, 245, 255, 0.4)",
        "cyber-magenta": "0 0 20px -2px rgba(255, 0, 255, 0.3)",
        "cyber-yellow": "0 0 15px -2px rgba(252, 238, 10, 0.3)",
      },
      transitionDuration: {
        200: "200ms",
        250: "250ms",
      },
    },
  },
  plugins: [],
};

export default config;
