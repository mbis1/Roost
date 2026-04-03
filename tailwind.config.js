module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#FF385C", dark: "#E31C5F", light: "#FF5A7D", bg: "#FFF0ED" },
        surface: { DEFAULT: "#FFFFFF", soft: "#F7F7F7", muted: "#EBEBEB" },
        txt: { DEFAULT: "#222222", secondary: "#717171", tertiary: "#B0B0B0" },
        status: {
          green: "#008A05", "green-bg": "#E6F7E6",
          red: "#C13515", "red-bg": "#FFF0ED",
          orange: "#E07912", "orange-bg": "#FFF8F0",
          blue: "#0070F3", "blue-bg": "#EBF5FF",
        },
      },
      fontFamily: {
        sans: ['"Cereal"', '"Circular"', '"Helvetica Neue"', "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "12px", "2xl": "16px" },
    },
  },
  plugins: [],
};
