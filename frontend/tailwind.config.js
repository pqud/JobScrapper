/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1f1c",
        moss: "#0f766e",
        mossDark: "#115e59",
        sand: "#f4f7f5",
        mist: "#e6f2ef",
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
