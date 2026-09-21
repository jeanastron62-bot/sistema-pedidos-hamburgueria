/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        bg: { DEFAULT: '#161618', surface: '#1f1f22', elevated: '#333338' },
        primary: { DEFAULT: '#FF6B00', hover: '#cc5600', light: '#ff8933' },
        secondary: { DEFAULT: '#F6E05E', hover: '#D69E2E' },
        delivery: { DEFAULT: '#E63946', hover: '#b82e38' },
        neutral: { 950: '#161618', 900: '#1f1f22', 850: '#29292d', 800: '#333338', 750: '#3d3d43', 700: '#47474f', 600: '#63636f', 500: '#7e7e8b', 400: '#a5a5b5' },
      },
    },
  },
  plugins: [],
}
