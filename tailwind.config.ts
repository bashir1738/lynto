import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      maxWidth: {
        "8xl": "96rem",
      },
      colors: {
        comfort: {
          bg: "#FAF9F5",
          ivory: "#F5F4EE",
          surface: "#FFFFFF",
          "surface-soft": "#FBFBF9",
          border: "#EAE7DE",
          "border-subtle": "#F1EEE6",
          text: "#191A16",
          "text-muted": "#666960",
          "text-soft": "#91948B",
          butter: "#FCFF52",
          "butter-hover": "#E8EB3A",
          "butter-soft": "#F7F8C8",
          sage: "#E8F5EC",
          "sage-dark": "#1E5637",
          forest: "#16221C",
          "forest-soft": "#212E27",
        },
        celo: {
          yellow: "#FCFF52",
          "yellow-hover": "#E8EB3A",
          "yellow-soft": "#F7F8C8",
          black: "#0A0A0A",
          forest: "#002D24",
          "forest-soft": "#0B3D33",
        },
        accent: {
          DEFAULT: "#FCFF52",
          hover: "#E8EB3A",
          subtle: "#F7F8C8",
          foreground: "#0A0A0A",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#FAF9F5",
          dark: "#16221C",
          forest: "#16221C",
        },
        border: {
          DEFAULT: "#EAE7DE",
          strong: "#D8D4C7",
        },
        sidebar: {
          DEFAULT: "#141C18",
          muted: "#1B2721",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-serif)",
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
        serif: [
          "var(--font-serif)",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(28, 25, 23, 0.04)",
        soft: "0 4px 20px -2px rgba(28, 25, 23, 0.04)",
        comfort: "0 8px 30px -4px rgba(28, 25, 23, 0.06)",
        card: "0 2px 10px 0 rgba(28, 25, 23, 0.03)",
        butter: "0 0 0 1px rgba(246, 228, 105, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
