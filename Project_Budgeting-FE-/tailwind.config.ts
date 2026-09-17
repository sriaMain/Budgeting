import type { Config } from 'tailwindcss'

export default {
  // We must add this 'content' array so Tailwind knows which files to scan
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Class-based dark mode: toggled by adding/removing `dark` on <html>
  // (see src/hooks/useTheme.ts) rather than only following the OS setting,
  // so the header's light/dark button actually controls it.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Site-wide accent, recolored to the violet identity requested by
        // the user (previously a blue/teal scheme) - single point of change,
        // every bg-brand-*/teal-*/navy-*/lime-* class picks this up automatically.
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        input: {
          bg: '#F0F4FA',
        },
        // Approved enterprise UI design tokens (enterprise-artifacts/UI_BUILD_HANDOFF.md).
        // Kept separate from `brand` (legacy) and from src/utils/chartTheme.ts (chart series colors,
        // which stay as-is - that palette is accessibility-validated, not brand decoration).
        navy: {
          700: '#3b1f78',
          800: '#2e1760',
          900: '#1e1042',
        },
        teal: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        amber: {
          50: '#fff0d8',
          600: '#a6670b',
          700: '#a76812',
        },
        risk: {
          50: '#fee5e5',
          600: '#b54141',
          700: '#bc4949',
        },
        lime: {
          400: '#7c3aed',
        },
        surface: {
          DEFAULT: '#f7f9fb',
          card: '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
