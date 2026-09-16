# Ảnh nền chính thức của Playwright đã có sẵn Chromium + toàn bộ thư viện hệ
# thống cần thiết — không cần `playwright install` trong lúc build, và phiên
# bản Chromium khớp chính xác với phiên bản gói `playwright` bên dưới.
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

WORKDIR /app

COPY package.json ./
# Cài cả devDependencies vì tsx (chạy thẳng TypeScript, không cần bước build
# riêng — đúng phong cách "package dùng trực tiếp dạng mã nguồn" mà phần còn
# lại của SciRender dùng) nằm ở đó.
RUN npm install

COPY src ./src
COPY tsconfig.json ./

ENV NODE_ENV=production
EXPOSE 8787

CMD ["npx", "tsx", "src/server.ts"]
