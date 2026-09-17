/**
 * Đợt 8 — mỗi màu tra qua biến CSS `--<family>-<bậc>` (RGB cách nhau bởi
 * dấu cách, khai theo `[data-theme]` trong index.css) thay vì hex cứng, để
 * toàn bộ 300+ chỗ dùng `bg-ink-50`, `text-deep-600`,... tự đổi màu theo
 * Sáng/Tối mà không phải sửa từng nơi. `<alpha-value>` là điểm mấu chốt: nó
 * cho phép cú pháp Tailwind `bg-ink-900/10` hoạt động bình thường.
 * @param {string} name
 * @returns {(opts: { opacityValue?: string }) => string}
 */
function themedColor(name) {
  return ({ opacityValue }) =>
    opacityValue === undefined
      ? `rgb(var(--${name}) / 1)`
      : `rgb(var(--${name}) / ${opacityValue})`;
}

function themedScale(family) {
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  return Object.fromEntries(steps.map((s) => [s, themedColor(`${family}-${s}`)]));
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Bảng màu lấy từ logo Bách khoa: xanh đậm (deep), xanh trời (sky),
        // cùng một sắc đỏ dành riêng cho cảnh báo (flag) — giữ nguyên sắc,
        // đổi độ sáng theo từng bậc để vừa dịu mắt vừa đạt tương phản WCAG AA
        // ở cả hai nền (xem Đợt 8, /tmp/gen_palette3.py).
        deep: themedScale('deep'),
        sky: themedScale('sky'),
        flag: themedScale('flag'),
        // Trung tính ấm (thay xám xanh cũ) — nền "giấy ngà" đỡ chói hơn xám lạnh.
        ink: themedScale('ink'),
        // Cảnh báo/thành công vốn dùng thẳng amber/emerald mặc định của
        // Tailwind (hex cứng) — không đổi theo Tối nên chữ vàng/xanh lá gần
        // như biến mất trên nền tối. Định nghĩa lại toàn bộ thang để ăn theo
        // biến CSS như các màu thương hiệu.
        amber: themedScale('amber'),
        emerald: themedScale('emerald'),
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
