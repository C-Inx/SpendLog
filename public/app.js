// app.js - the single-page frontend (no framework, no build step).

const $ = (id) => document.getElementById(id);
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const MONTHS = ['January','February','March','April','May','June','July','August',
                'September','October','November','December'];
const PAGE_SIZE = 10;
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Education', 'Other'];

// Escape text before putting it in innerHTML so descriptions can't inject HTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "2026-11-26" -> "Nov 26, 2026" (parsed manually to avoid timezone shifts).
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}
// "2026-11" -> "November 2026"
function fmtMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// The current filter. Empty string = no limit on that side.
let range = { start: '', end: '' };
let page = 1;

function qs() {
  const p = new URLSearchParams();
  if (range.start) p.set('start', range.start);
  if (range.end) p.set('end', range.end);
  const s = p.toString();
  return s ? '?' + s : '';
}

function expensesUrl() {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (range.start) params.set('start', range.start);
  if (range.end) params.set('end', range.end);
  return `/api/expenses?${params.toString()}`;
}

async function api(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

// ---------- rendering ----------
function fillReport(tbodyId, rows, labelFn) {
  $(tbodyId).innerHTML = rows.length
    ? rows.map((r) => `<tr><td>${esc(labelFn(r.label))}</td><td class="num">${peso.format(r.total)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">No data</td></tr>';
}

function renderExpenses(result) {
  const { items, total, page: currentPage, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  $('exp-count').textContent = `(${total})`;
  $('exp-body').innerHTML = items.length
    ? items.map((expense) => `
        <tr>
          <td>${fmtDate(expense.date)}</td>
          <td>${esc(expense.description)}</td>
          <td>${esc(expense.category)}</td>
          <td class="num">${peso.format(expense.amount)}</td>
          <td><button class="del" data-id="${esc(expense.id)}" aria-label="Delete expense: ${esc(expense.description)}">Delete</button></td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="empty">No expenses in this range.</td></tr>';
  $('page-indicator').textContent = `Page ${currentPage} of ${totalPages}`;
  $('prev-page').disabled = currentPage <= 1;
  $('next-page').disabled = currentPage >= totalPages;
  $('expense-pagination').hidden = totalPages <= 1;
}

function renderCategories(categories) {
  const select = $('f-cat');
  const selected = select.value;
  const unique = new Map();
  for (const value of [...DEFAULT_CATEGORIES, ...categories]) {
    const category = String(value).trim();
    const key = category.toLocaleLowerCase('en-PH');
    if (category && !unique.has(key)) unique.set(key, category);
  }
  const options = [...unique.values()];
  select.innerHTML = '<option value="" selected disabled>Select a category</option>'
    + options.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
  if (options.includes(selected)) select.value = selected;
}

function renderNote() {
  const { start, end } = range;
  $('range-note').textContent =
    start && end ? `Showing ${fmtDate(start)} to ${fmtDate(end)} (both included).`
    : start ? `Showing ${fmtDate(start)} onward.`
    : end ? `Showing everything up to ${fmtDate(end)}.`
    : 'Showing all expenses.';
}

async function refresh() {
  const [expensePage, rep, cats] = await Promise.all([
    api(expensesUrl()),
    api('/api/reports' + qs()),
    api('/api/categories'),
  ]);
  const lastPage = Math.max(1, Math.ceil(expensePage.total / PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    return refresh();
  }
  renderExpenses(expensePage);
  fillReport('rep-category', rep.category, (x) => x);
  fillReport('rep-daily', rep.daily, fmtDate);
  fillReport('rep-monthly', rep.monthly, fmtMonth);
  $('grand').textContent = peso.format(rep.grandTotal);
  renderCategories(cats);
  renderNote();
}

// ---------- events ----------
$('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('form-msg');
  msg.className = 'msg'; msg.textContent = '';
  try {
    await api('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: $('f-date').value,
        description: $('f-desc').value,
        category: $('f-cat').value,
        amount: $('f-amt').value,
      }),
    });
    page = 1;
    $('f-desc').value = ''; $('f-amt').value = '';   // keep date + category for fast entry
    $('f-desc').focus();
    msg.className = 'msg ok'; msg.textContent = 'Expense added.';
    await refresh();
  } catch (err) { msg.textContent = err.message; }
});

$('filter-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const start = $('r-start').value, end = $('r-end').value;
  if (start && end && start >= end) {
    $('range-msg').textContent = 'Start date must be earlier than end date.';
    return;
  }
  $('range-msg').textContent = '';
  range = { start, end };
  page = 1;
  try { await refresh(); } catch (err) { $('range-msg').textContent = err.message; }
});

$('r-clear').addEventListener('click', async () => {
  $('r-start').value = ''; $('r-end').value = ''; $('range-msg').textContent = '';
  range = { start: '', end: '' };
  page = 1;
  await refresh();
});

$('prev-page').addEventListener('click', async () => {
  if (page <= 1) return;
  page -= 1;
  try { await refresh(); } catch (err) { $('range-msg').textContent = err.message; }
});

$('next-page').addEventListener('click', async () => {
  page += 1;
  try { await refresh(); } catch (err) { $('range-msg').textContent = err.message; }
});

$('exp-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button.del');
  if (!btn) return;
  if (!confirm('Delete this expense?')) return;
  btn.disabled = true;
  try {
    const result = await api('/api/expenses/' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' });
    await refresh();
    if (!result.deleted) $('form-msg').textContent = 'This expense was already removed.';
  } catch (err) {
    btn.disabled = false;
    $('form-msg').textContent = err.message;
  }
});

// Default the date field to today (local time).
const t = new Date();
$('f-date').value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

refresh().catch((err) => { $('form-msg').textContent = err.message; });
