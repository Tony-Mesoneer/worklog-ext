/*
 * Spike: cookie-session có ghi được worklog vào Jira Cloud không?
 *
 * CÁCH CHẠY
 *   1. Mở tab https://mesoneerag.atlassian.net (đang đăng nhập)
 *   2. DevTools (Cmd+Opt+I) → Console
 *   3. Paste toàn bộ file này → Enter
 *   4. Copy output gửi lại
 *
 * Nó ghi 1 phút worklog vào SCRATCH rồi XOÁ ngay. Nếu bước xoá fail,
 * output sẽ in worklog id để xoá tay.
 */
(async () => {
  const BASE = location.origin;
  const SCRATCH = 'CAG-3028';
  const out = [];
  const log = (name, ok, detail) => {
    out.push({ step: name, ok, detail });
    console.log(ok ? '✅' : '❌', name, detail ?? '');
  };

  // Jira cần started dạng 2026-08-19T09:00:00.000+0700
  const startedNow = () => {
    const d = new Date();
    const p = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.000` +
      `${sign}${p(Math.floor(Math.abs(off) / 60))}${p(Math.abs(off) % 60)}`;
  };

  const call = async (method, path, body, extraHeaders = {}) => {
    const res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: res.status, json, text: text.slice(0, 400) };
  };

  // 1. Đọc danh tính — xác nhận cookie session dùng được cho REST
  const me = await call('GET', '/rest/api/3/myself');
  log('GET /myself', me.status === 200,
    me.status === 200
      ? `${me.json.displayName} | tz=${me.json.timeZone} | accountId=${me.json.accountId}`
      : `HTTP ${me.status} ${me.text}`);
  if (me.status !== 200) {
    console.log('DỪNG: cookie session không đọc được REST API. Phải dùng API token.');
    return { verdict: 'cookie-read-failed', out };
  }

  // 2. Đọc worklog
  const wl = await call('GET', `/rest/api/3/issue/${SCRATCH}/worklog`);
  log(`GET worklog ${SCRATCH}`, wl.status === 200,
    wl.status === 200 ? `${wl.json.total} worklog hiện có` : `HTTP ${wl.status} ${wl.text}`);

  // 3. Ghi thử — không header đặc biệt
  const payload = {
    timeSpentSeconds: 60,
    started: startedNow(),
    comment: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'worklog-ext auth spike — xoá tự động' }] }] },
  };
  let created = null;
  const plain = await call('POST', `/rest/api/3/issue/${SCRATCH}/worklog?notifyUsers=false`, payload);
  log('POST worklog (không header)', plain.status === 201,
    plain.status === 201 ? `id=${plain.json.id}` : `HTTP ${plain.status} ${plain.text}`);
  if (plain.status === 201) created = plain.json.id;

  // 4. Nếu fail → thử lại với X-Atlassian-Token: no-check (bypass XSRF)
  if (!created) {
    const noCheck = await call('POST', `/rest/api/3/issue/${SCRATCH}/worklog?notifyUsers=false`,
      payload, { 'X-Atlassian-Token': 'no-check' });
    log('POST worklog (X-Atlassian-Token: no-check)', noCheck.status === 201,
      noCheck.status === 201 ? `id=${noCheck.json.id}` : `HTTP ${noCheck.status} ${noCheck.text}`);
    if (noCheck.status === 201) created = noCheck.json.id;
  }

  // 5. Dọn dẹp
  if (created) {
    const del = await call('DELETE',
      `/rest/api/3/issue/${SCRATCH}/worklog/${created}?notifyUsers=false`);
    log('DELETE worklog', del.status === 204,
      del.status === 204 ? 'đã xoá' : `HTTP ${del.status} — XOÁ TAY worklog id ${created}`);
  }

  const verdict = created
    ? 'cookie-write-ok — extension không cần API token'
    : 'cookie-write-blocked — cần API token cho việc ghi';
  console.log('\n=== KẾT LUẬN:', verdict, '===');
  return { verdict, out };
})();
