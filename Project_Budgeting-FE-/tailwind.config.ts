import type { Config } from 'tailwindcss'

export default {
  // We must add this 'content' array so Tailwind knows which files to scan
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          800: '#1e40af', 
          900: '#1e3a8a',
        },
        input: {
          bg: '#F0F4FA', 
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config