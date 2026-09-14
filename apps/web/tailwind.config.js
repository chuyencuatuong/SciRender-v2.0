/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae2',
          300: '#b0b9c7',
          400: '#8593a7',
          500: '#66748c',
          600: '#515d73',
          700: '#434c5e',
          800: '#3a4150',
          900: '#1e232d',
          950: '#12151c',
        },
        sci: {
          400: '#4d87e0',
          500: '#2f6fd0',
          600: '#1b4f9c',
          700: '#163f7d',
        },
      },
      fontFamily: {
        ui: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
