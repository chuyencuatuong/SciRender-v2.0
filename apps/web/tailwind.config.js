/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bảng màu lấy từ logo Bách khoa: xanh đậm, xanh trời, cùng một sắc đỏ
        // dành riêng cho cảnh báo. Trắng là nền.
        deep: {
          50: '#eef2fb',
          100: '#d6e0f5',
          200: '#adc0ea',
          300: '#7d99db',
          400: '#4a6ec7',
          500: '#274bab',
          600: '#0b2c7f',
          700: '#092467',
          800: '#071b4d',
          900: '#051337',
        },
        sky: {
          50: '#ecf6fe',
          100: '#d2eafd',
          200: '#a5d4fa',
          300: '#6fbaf3',
          400: '#3ea1ea',
          500: '#1a8fe3',
          600: '#0f72bd',
          700: '#0d5a95',
          800: '#0c4874',
          900: '#0a3a5e',
        },
        flag: {
          50: '#fdecec',
          100: '#fad5d5',
          200: '#f4adad',
          300: '#ec7d7d',
          400: '#e04f4f',
          500: '#d62828',
          600: '#b41f1f',
          700: '#8f1919',
          800: '#6d1414',
          900: '#4f0f0f',
        },
        // Trung tính lệch nhẹ về xanh của Bách khoa, để xám không bị "chết"
        ink: {
          50: '#f8f9fa',
          100: '#f1f2f5',
          200: '#e4e6ec',
          300: '#c3c7d0',
          400: '#9ba1ad',
          500: '#6b7280',
          600: '#525866',
          700: '#3c414d',
          800: '#272b34',
          900: '#16181d',
          950: '#0b0d11',
        },
      },
      fontFamily: {
        // Cả ba mặt chữ đều có bộ dấu tiếng Việt và nằm trong app (xem fonts.css)
        ui: ['Be Vietnam Pro', 'Segoe UI', 'system-ui', 'sans-serif'],
        serif: ['Literata', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 12px 24px -8px rgba(15,23,42,.07)',
        pop: '0 1px 2px rgba(15,23,42,.05), 0 8px 16px -6px rgba(15,23,42,.10), 0 24px 48px -16px rgba(15,23,42,.14)',
        island: '0 1px 2px rgba(15,23,42,.06), 0 10px 28px -10px rgba(15,23,42,.22)',
      },
    },
  },
  plugins: [],
};
