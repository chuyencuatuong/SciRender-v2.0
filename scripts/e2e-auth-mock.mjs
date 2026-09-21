// E2E with a mocked Supabase backend (no real project needed).
import { chromium } from 'playwright';
import fs from 'node:fs';
// Build with fake keys first (see docs/DAY1-INTEGRATION.md), then `pnpm preview`.
const BASE = process.env.SCIRENDER_URL ?? 'http://localhost:4173/';
const REF = 'abcdefghijklmnop';
const UID = '11111111-2222-3333-4444-555555555555';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`); };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, aud: 'authenticated', role: 'authenticated', email: 'sv@hcmut.edu.vn' })}.sig`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'sv@hcmut.edu.vn', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' } };
}
const PROFILE = { id: UID, full_name: 'Nguyễn Thị Kiểm Thử', university: 'Đại học Bách Khoa - ĐHQG-HCM', faculty: 'Khoa học Ứng dụng', major: 'Kỹ thuật Y sinh', academic_year: 'K22', student_id: '2299999', birth_year: 2004, hometown: 'Cần Thơ', role: 'student', auto_fill_cover: true, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' };

async function ctxWith({ profile = PROFILE, signedIn = true, others = [] } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const errors = [];
  const calls = [];
  if (signedIn) await context.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(session())]);
  await context.route(`https://${REF}.supabase.co/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); calls.push(`${req.method()} ${url.pathname}${url.search}`);
    const accept = req.headers()['accept'] || '';
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.pathname === '/auth/v1/user') return json(session().user);
    if (url.pathname === '/rest/v1/rpc/admin_document_count') return json(42);
    if (url.pathname === '/rest/v1/profiles') {
      if (req.method() === 'PATCH') { Object.assign(profile, JSON.parse(req.postData() || '{}')); return json(accept.includes('vnd.pgrst.object') ? profile : [profile]); }
      if (url.searchParams.get('id')) return json(accept.includes('vnd.pgrst.object') ? profile : [profile]);
      return json([profile, ...others]);
    }
    return json({ message: 'not mocked' }, 404);
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { browser, context, page, errors, calls, profile };
}

async function waitPages(page) {
  await page.waitForSelector('.sr-page-body', { timeout: 60000 });
  let last = -1, stable = 0;
  for (let i = 0; i < 60 && stable < 5; i++) { await page.waitForTimeout(500); const n = await page.locator('.sr-page').count(); if (n === last) stable++; else { stable = 0; last = n; } }
}

console.log('\nA · Landing & guest');
{
  const { browser, page, errors } = await ctxWith({ signedIn: false });
  await page.goto(BASE);
  check('"/" hiện landing có nút Vào Editor', await page.getByRole('link', { name: /Vào Editor/ }).isVisible());
  await page.goto(BASE + '#dashboard');
  await page.waitForSelector('#scirender-auth-title', { timeout: 20000 });
  check('#dashboard khi chưa đăng nhập tự mở AuthModal', await page.locator('#scirender-auth-title').isVisible());
  await page.getByRole('button', { name: /Dùng thử ngay/ }).click();
  await page.waitForTimeout(300);
  check('"Dùng thử" chuyển sang #app', new URL(page.url()).hash === '#app');
  await waitPages(page);
  const cover = (await page.locator('.sr-page-cover').allTextContents()).join(' ');
  check('khách: bìa giữ nguyên bài mẫu (không tự điền)', cover.includes('Trần Nhật Tường'));
  await page.goto(BASE + '#admin');
  await page.waitForTimeout(1500);
  check('khách vào #admin bị đưa về #dashboard', new URL(page.url()).hash === '#dashboard');
  check('không có lỗi JS', errors.length === 0, errors.join(' | '));
  await browser.close();
}

console.log('\nB · Sinh viên đăng nhập, auto_fill_cover = true');
{
  const { browser, page, errors, calls } = await ctxWith();
  await page.goto(BASE + '#app');
  await waitPages(page);
  await page.waitForTimeout(1500);
  await waitPages(page);
  const cover = (await page.locator('.sr-page-cover').allTextContents()).join(' ');
  check('bìa có tên sinh viên từ hồ sơ', cover.includes('Nguyễn Thị Kiểm Thử'), cover.slice(0, 200));
  check('bìa có MSSV từ hồ sơ', cover.includes('2299999'));
  check('bìa có khoa (đã thêm tiền tố "Khoa")', /Khoa Khoa học Ứng dụng/i.test(cover), cover.slice(0, 200));
  check('thành viên mẫu bị thay (tài liệu mẫu nguyên vẹn)', !cover.includes('Nguyễn Văn A'));
  check('canvas báo "Đã điền trang bìa từ hồ sơ"', await page.getByText(/Đã điền trang bìa từ hồ sơ/).isVisible());
  check('chỉ đọc profiles theo id (không đọc cả bảng)', calls.some((c) => c.startsWith('GET /rest/v1/profiles') && c.includes('id=eq.')), calls.join('\n'));
  // persisted?
  const saved = await page.evaluate(async () => new Promise((res) => { const r = indexedDB.open('scirender'); r.onsuccess = () => { try { const tx = r.result.transaction('documents'); const q = tx.objectStore('documents').getAll(); q.onsuccess = () => res(q.result.map((d) => d.source)); } catch (e) { res(String(e)); } }; r.onerror = () => res('err'); }));
  check('nguồn đã lưu IndexedDB chứa cover đã điền', Array.isArray(saved) && saved.some((s) => s.includes('"Nguyễn Thị Kiểm Thử"')), JSON.stringify(saved).slice(0, 120));

  await page.goto(BASE + '#admin');
  await page.waitForTimeout(2000);
  check('sinh viên vào #admin bị đưa về #dashboard', new URL(page.url()).hash === '#dashboard');
  await page.waitForSelector('text=Xin chào', { timeout: 20000 });
  check('dashboard chào đúng tên', await page.getByText('Xin chào, Nguyễn Thị Kiểm Thử').isVisible());
  check('dashboard liệt kê tài liệu cục bộ', (await page.getByRole('button', { name: /Mở trong Editor/ }).count()) >= 1);
  check('dashboard không hiện nút Quản trị cho sinh viên', (await page.getByRole('link', { name: /Quản trị/ }).count()) === 0);
  await page.getByRole('button', { name: /Mở trong Editor/ }).first().click();
  await page.waitForTimeout(1500);
  check('"Mở trong Editor" về #app (tham số doc được dọn khỏi URL)', new URL(page.url()).hash === '#app', page.url());
  await waitPages(page);
  const exportsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('scirender.usage.v1') || '{}').exports ?? 0);
  await page.goto(BASE + '#dashboard');
  await page.waitForSelector('text=Xin chào', { timeout: 20000 });
  await page.getByRole('button', { name: /^PDF$/ }).first().click();
  await page.waitForTimeout(500);
  await waitPages(page);
  await page.waitForTimeout(1500);
  const exportsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('scirender.usage.v1') || '{}').exports ?? 0);
  check('nút PDF ở dashboard mở editor và chạy "In / Lưu PDF" sau khi dựng xong', exportsAfter === exportsBefore + 1 && new URL(page.url()).hash === '#app', `${exportsBefore}→${exportsAfter} ${page.url()}`);
  check('editor mở lại đúng tài liệu', ((await page.locator('.sr-page-cover').allTextContents()).join(' ')).includes('Nguyễn Thị Kiểm Thử'));
  check('không có lỗi JS', errors.length === 0, errors.join(' | '));
  await browser.close();
}

console.log('\nC · auto_fill_cover = false');
{
  const { browser, page, errors } = await ctxWith({ profile: { ...PROFILE, auto_fill_cover: false } });
  await page.goto(BASE + '#app');
  await waitPages(page);
  await page.waitForTimeout(1500);
  const cover = (await page.locator('.sr-page-cover').allTextContents()).join(' ');
  check('tắt tự điền: bìa giữ nguyên bài mẫu', cover.includes('Trần Nhật Tường') && !cover.includes('Kiểm Thử'));
  check('không có lỗi JS', errors.length === 0, errors.join(' | '));
  await browser.close();
}

console.log('\nD · Admin');
{
  const other = { ...PROFILE, id: 'x2', full_name: '=HYPERLINK("http://evil","x")', student_id: '2200001', faculty: 'Khoa Cơ khí', role: 'student' };
  const { browser, page, errors } = await ctxWith({ profile: { ...PROFILE, role: 'admin' }, others: [other] });
  await page.goto(BASE + '#admin');
  await page.waitForTimeout(2500);
  check('admin ở lại #admin', new URL(page.url()).hash === '#admin', page.url());
  const text = await page.locator('body').innerText();
  check('admin thấy danh sách hồ sơ', text.includes('Nguyễn Thị Kiểm Thử') && text.includes('2200001'));
  check('tổng tài liệu lấy từ RPC admin_document_count', /42/.test(text));
  const exportBtn = page.getByRole('button', { name: /Excel|Xuất/ }).first();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), exportBtn.click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check('CSV có BOM UTF-8 (Excel đọc được tiếng Việt)', csv.charCodeAt(0) === 0xfeff);
  check('CSV chặn công thức Excel (=HYPERLINK → \'=HYPERLINK)', csv.includes(`"'=HYPERLINK(`) && !/(^|,)"=HYPERLINK/m.test(csv), csv.slice(0, 300));
  check('không có lỗi JS', errors.length === 0, errors.join(' | '));
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} kiểm tra E2E đạt.`);
process.exit(fail ? 1 : 0);
