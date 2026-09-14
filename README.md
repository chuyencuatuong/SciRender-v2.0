# SciRender 2.0

[![CI](https://github.com/chuyencuatuong/SciRender-v2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/chuyencuatuong/SciRender-v2.0/actions/workflows/ci.yml)
[![Deploy](https://github.com/chuyencuatuong/SciRender-v2.0/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/chuyencuatuong/SciRender-v2.0/actions/workflows/deploy-pages.yml)

**Scientific Document Intelligence Studio** — *Write science once. Render it professionally everywhere.*

SciRender không phải trình soạn thảo AI, cũng không phải bản sao của Word. Nó là một
**trình biên dịch tài liệu khoa học**: nội dung có cấu trúc đi qua một pipeline cố định
và cho ra tài liệu chuẩn mực, nhất quán, sẵn sàng in.

Toàn bộ ứng dụng chạy trong trình duyệt. Không backend, không database, không API trả phí,
không tài khoản. Mở bằng `file://` hay host tĩnh đều được.

---

## Chạy thử

Yêu cầu Node ≥ 18.18 và **pnpm** (các package nội bộ khai báo bằng giao thức
`workspace:*`, npm và yarn classic không hiểu giao thức này — chạy `npm install`
sẽ dừng lại kèm hướng dẫn).

```bash
corepack enable        # Node 18+ đã có sẵn corepack; hoặc: npm i -g pnpm
pnpm install
pnpm dev               # http://localhost:5173
```

```bash
pnpm build       # bundle tĩnh vào apps/web/dist
pnpm preview     # phục vụ bản build tại http://localhost:4173
pnpm typecheck   # tsc --noEmit cho toàn bộ workspace
pnpm smoke       # 56 kiểm tra pipeline thuần (không cần trình duyệt)
```

Kiểm tra tầng cần DOM (phân trang, orphan/widow, KaTeX, Mermaid):

```bash
pnpm exec playwright install chromium   # playwright đã nằm trong devDependencies
pnpm build && pnpm preview              # cửa sổ 1
pnpm browser-check                      # cửa sổ 2 — 17 kiểm tra
```

---

## CI và triển khai

Hai workflow trong `.github/workflows/`:

| Workflow | Chạy khi | Làm gì |
|----------|----------|--------|
| `ci.yml` | push lên `main`, mọi pull request, hoặc bấm tay | Job **verify**: `typecheck` → `smoke` → `build`, tải `apps/web/dist` lên artifact. Job **browser**: cài Chromium, build, dựng preview rồi chạy `browser-check`, tải ảnh chụp trang lên artifact. Hai job chạy song song. |
| `deploy-pages.yml` | push lên `main`, hoặc bấm tay | Build với `VITE_BASE=/<tên-repo>/` rồi đẩy lên GitHub Pages. |

**Trước khi `deploy-pages.yml` chạy được lần đầu**, vào
**Settings → Pages → Build and deployment → Source** và chọn **GitHub Actions**.
Nếu để nguyên "Deploy from a branch" thì workflow sẽ fail ở bước `configure-pages`.

`base` của Vite lấy từ biến môi trường `VITE_BASE` (mặc định `/`), nên chỉ workflow Pages
mới đổi đường dẫn asset — `pnpm dev`, `pnpm preview` và host tĩnh thường vẫn chạy ở `/`.

CI dùng `pnpm install --frozen-lockfile`: sửa `package.json` mà quên commit
`pnpm-lock.yaml` thì CI sẽ fail ngay ở bước cài, cố ý như vậy.

---

## Bảy nguyên tắc và chỗ chúng được thực thi

| | Nguyên tắc | Được thực thi ở đâu |
|---|---|---|
| **P1** | Content Integrity | Parser chỉ *cấu trúc hóa*, không viết lại. TeX, mã nguồn, văn bản được mang nguyên văn. `table-engine` đệm ô thiếu **trên bản sao để render**, AST gốc không đổi. Khóa front matter lạ được giữ trong `meta.extra`. |
| **P2** | Deterministic Rendering | Parser, validator, intelligence, renderer đều là hàm thuần: không đồng hồ, không ngẫu nhiên, không I/O. Node id sinh từ `hash(type, dòng, cột, thứ tự)`. Chữ ký đầu vào hiện ở thanh trạng thái — cùng chữ ký ⇒ cùng bố cục. `scripts/smoke.ts` và `browser-check.mjs` đều khẳng định lại điều này. |
| **P3** | AST First | `@scirender/ast` là nguồn dữ liệu duy nhất. HTML và PDF là *đầu ra*, không bao giờ là nguồn. Đánh số nằm trên AST chứ không nằm trong HTML. |
| **P4** | Separation of Concerns | Mỗi package là một chặng và chỉ phụ thuộc chặng trước nó. Phân trang tách hẳn khỏi `compile()` vì nó cần DOM thật. |
| **P5** | Local First | `@scirender/storage` dùng IndexedDB cho tài liệu + ảnh, LocalStorage cho tùy chọn giao diện. Không có một lệnh gọi mạng nào lúc chạy. |
| **P6** | Fail Loudly | Mọi vấn đề thành một `Diagnostic` có mã (`SR-P010`, `SR-V012`…), vị trí dòng và gợi ý sửa. Công thức LaTeX hỏng hiện ra hộp đỏ; tham chiếu không phân giải hiện gạch chân đỏ. Không có chỗ nào "sửa ẩu". |
| **P7** | Research by Consent | `@scirender/telemetry` không được package nào khác import. Mặc định OFF. Bật lên vẫn chỉ ghi vào LocalStorage và lọc bỏ mọi trường có thể chứa nội dung; muốn dùng thì người dùng tự bấm xuất tệp. Tắt đi là xóa sạch. |

---

## Pipeline

```
Nguồn (Scientific Markdown)
   │
   ├─► parser ──────────► Document AST  ← P3: nguồn dữ liệu duy nhất
   │                          │
   │      template-engine ────┤  resolveTemplate(descriptor, overrides)
   │                          │
   ├─► assignNumbers ─────────┤  đánh số mục / công thức / hình / bảng,
   │                          │  phân giải @ref và [@citation]
   ├─► validator ─────────────┤  → Diagnostic[]
   ├─► intelligence ──────────┤  → Document Health Score
   └─► renderer-html ─────────┘  → mảng khối HTML
                              │
                   layout-engine (cần DOM)
                              │  phân trang, keep-with-next, orphan/widow
                              ▼
                     Trang A4 trên màn hình
                              │
                     renderer-pdf → window.print() / HTML độc lập
```

`compile()` trong `apps/web/src/lib/pipeline.ts` chạy toàn bộ phần thuần và đo thời gian
từng chặng (hiện ở thanh trạng thái). Phân trang chạy riêng trong `usePagination` vì
nó phải đo hộp dòng thật của trình duyệt.

---

## Cấu trúc kho

```
scirender/
├─ apps/web/                  Giao diện (React 18 + Vite + Tailwind + CodeMirror 6)
├─ packages/
│  ├─ ast/                    Kiểu dữ liệu AST, Diagnostic, tiện ích duyệt cây
│  ├─ parser/                 Scientific Markdown → AST (front matter, khối, nội dòng)
│  ├─ validator/              Luật cấu trúc / cú pháp / tài nguyên
│  ├─ intelligence/           Document Health Score + gợi ý
│  ├─ template-engine/        Descriptor → CSS + số đo; đánh số; phân giải tham chiếu
│  ├─ layout-engine/          Phân trang, cắt đoạn theo dòng, orphan/widow
│  ├─ renderer-html/          AST → HTML (thuần, không DOM)
│  ├─ renderer-pdf/           Luồng in và xuất HTML độc lập
│  ├─ equation-engine/        Bọc KaTeX + đánh số công thức
│  ├─ figure-engine/          Phân giải `asset:`, kiểm tra hình
│  ├─ table-engine/           Chuẩn hóa bảng, căn cột
│  ├─ storage/                IndexedDB + LocalStorage + bundle xuất/nhập
│  └─ telemetry/              Tầng nghiên cứu opt-in, cô lập hoàn toàn (P7)
├─ templates/scientific-standard/
└─ scripts/                   smoke.ts (pipeline), browser-check.mjs (DOM)
```

Các package được dùng **trực tiếp ở dạng mã nguồn TypeScript** (`main: src/index.ts`);
Vite biên dịch chúng qua alias trong `vite.config.ts`, TypeScript qua `paths` trong
`tsconfig.base.json`. Không có bước build trung gian, HMR xuyên suốt từ app vào package.
Khi cần publish riêng (hoặc khi thêm backend Typst ở Phase 3), mỗi package đã có ranh
giới sẵn để thêm `tsup`.

Kiểm chứng đã chạy trên cây kho này: `pnpm typecheck` sạch, `pnpm smoke` 56/56,
`pnpm browser-check` 17/17, `pnpm build` thành công.

---

## Cú pháp Scientific Markdown

Xem [docs/SYNTAX.md](docs/SYNTAX.md) cho bản đầy đủ. Tóm tắt:

````markdown
---
title: Tiêu đề bài báo
authors:
  - name: Trần Nhật Tường
    affiliation: HCMUT
    email: a@b.vn
    corresponding: true
keywords: [a, b]
abstract: |
  Tóm tắt 150–250 từ.
bibliography:
  - key: smith2020
    authors: Smith J.
    year: 2020
    title: Một bài báo
    source: Nature
---

# Mục cấp 1

Văn bản có công thức nội dòng $E = mc^2$, trích dẫn [@smith2020],
và tham chiếu tới @eq:nangluong, @fig:sodo, @tbl:ketqua.

$$
E = mc^2
$$ {#eq:nangluong}

![Chú thích hình](asset:so-do){#fig:sodo width=80%}

| Cột A | Cột B |
|:------|------:|
| 1     | 2     |

: Chú thích bảng {#tbl:ketqua}

::: note Ghi chú
Khung ghi chú.
:::
````

---

## Mã chẩn đoán

| Tiền tố | Chặng | Ví dụ |
|---------|-------|-------|
| `SR-P0xx` | Parser | `SR-P010` khối `$$` không đóng, `SR-P020` dòng bảng lệch số ô |
| `SR-V0xx` | Validator | `SR-V008` nhảy cấp đề mục, `SR-V012` nhãn không tồn tại, `SR-V021` lỗi LaTeX |
| `SR-F0xx` | Tài nguyên | `SR-F002` không tìm thấy ảnh `asset:` |
| `SR-T0xx` | Bảng | `SR-T002` bảng thiếu chú thích |
| `SR-L0xx` | Bố cục | `SR-L001` khối cao hơn vùng nội dung trang |

Bấm vào một chẩn đoán sẽ nhảy con trỏ tới đúng dòng nguồn. Bấm vào bất kỳ khối nào trên
trang xem trước cũng vậy.

---

## Giới hạn đã biết của MVP

Nói thẳng, để khỏi mất thời gian phát hiện lại:

- **Bảng và hình không cắt được qua trang.** Khối nào cao hơn phần còn lại của trang sẽ
  đẩy nguyên khối sang trang sau, để lại khoảng trắng. Cắt bảng nhiều trang (kèm lặp
  dòng tiêu đề) là việc của Phase 2.
- **Bố cục 2 cột dùng `column-count` của CSS**, nên trong một trang thì cân cột do
  trình duyệt quyết định, không do layout engine. Kiểm soát chặt hơn cần Typst (Phase 3).
- **Không có chú thích chân trang (footnote)** và không có mục lục tự động.
- **Kiểu trích dẫn chỉ có `numeric`** theo thứ tự xuất hiện. `author-year` đã có chỗ trong
  descriptor nhưng chưa cài đặt.
- **Chống ngắt trang mới ở mức đoạn văn.** Danh sách và blockquote hiện là khối nguyên.
- **PDF đi qua hộp thoại in của trình duyệt.** Chọn "Save as PDF", đặt lề = None và tắt
  "Headers and footers" để khớp đúng bản xem trước.
- Dữ liệu nằm trong IndexedDB của **một trình duyệt trên một máy**. Xóa dữ liệu duyệt web
  là mất. Dùng nút **Bundle** để sao lưu.

---

## Lộ trình

- **Phase 2** — cắt bảng qua trang, footnote, mục lục, `author-year`, import `.docx`/`.bib`.
- **Phase 3** — backend Typst thay cho Paged Media để kiểm soát bố cục ở mức nhà in;
  `renderer-pdf` đã tách sẵn để thay thế mà không đụng tới AST hay template.

---

## Giấy phép

Chưa chọn. Thêm `LICENSE` trước khi công bố.
