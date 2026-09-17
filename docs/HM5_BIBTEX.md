# HM5 — BibTeX & Citation Manager

## Phạm vi

- Parser BibTeX thuần TypeScript, không dependency ngoài.
- Hỗ trợ `@article`, `@book`, `@inproceedings`, `@incollection`, `@misc`, `@techreport`, `@phdthesis`, `@mastersthesis`, `@unpublished` và fallback entry type.
- Chuẩn hóa tác giả BibTeX `and` thành danh sách ổn định phân cách bằng `;`.
- Import `.bib` từ file, drag-and-drop hoặc paste.
- Citation syntax giữ nguyên dạng `[@key]` / `[@key1; @key2]`.
- IEEE numeric là mặc định cho template HCMUT BTL; APA author-year là tùy chọn.
- Citation và bibliography liên kết hai chiều bằng anchor HTML.

## Kiểm tra

- `packages/citation-engine` có smoke runtime độc lập.
- `scripts/smoke.ts` có các assertion cho parser, IEEE/APA formatter và frontmatter merge.
- Toàn bộ file HM5 đã qua syntax/transpile check trong sandbox.

## Giới hạn môi trường kiểm thử

Sandbox hiện không có `node_modules` và không có pnpm binary, vì vậy `pnpm typecheck` / `pnpm smoke` không thể chạy end-to-end tại đây. Core TypeScript (`ast + citation-engine`) và runtime parser/formatter đã được chạy độc lập.
