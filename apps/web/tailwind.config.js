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
        ink: {
          50: '#f7f8fa',
          100: '#eef1f6',
          200: '#dde3ec',
          300: '#bcc6d6',
          400: '#8e9cb3',
          500: '#6b7a93',
          600: '#526078',
          700: '#414d61',
          800: '#323c4c',
          900: '#1b2230',
          950: '#0f141d',
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
