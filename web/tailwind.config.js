/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontSize: {
        "heading-1": ["1.875rem", { lineHeight: "2.25rem" }],
        "heading-2": ["1.25rem", { lineHeight: "1.75rem" }],
        "heading-3": ["1rem", { lineHeight: "1.5rem" }],
        "heading-4": ["0.875rem", { lineHeight: "1.25rem" }],
      },
    },
  },
  plugins: [],
};
