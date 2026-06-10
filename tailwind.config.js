/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    fontFamily: {
      // RN needs a single concrete family, not a web font stack.
      serif: ["Georgia"],
    },
    extend: {
      colors: {
        // Warm, editorial palette — not another blue fitness app.
        ink: "#1C1917",
        paper: "#FAF7F2",
        card: "#FFFFFF",
        accent: "#C2572B",
        accentSoft: "#F3E0D5",
        moss: "#4D6A4F",
        slate: "#6B6560",
        line: "#E7E0D8",
      },
    },
  },
  plugins: [],
};
