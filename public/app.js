// app.js - the single-page frontend (no framework, no build step).

const $ = (id) => document.getElementById(id);
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const MONTHS = ['January','February','March','April','May','June','July','August',
                'September','October','November','December'];

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

function qs() {
  const p = new URLSearchParams();
  if (range.start) p.set('start', range.start);
  if (range.end) p.set('end', range.end);
  const s = p.toString();
  return s ? '?' + s : '';
}

const API_BASE = (window.SPENDLOG_API || '').replace(/\/$/, '');

async function api(url, options) {
  const res = await fetch(API_BASE + url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// ---------- rendering ----------
function fillReport(tbodyId, rows, labelFn) {
  $(tbodyId).innerHTML = rows.length
    ? rows.map((r) => `<tr><td>${esc(labelFn(r.label))}</td><td class="num">${peso.format(r.total)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">No data</td></tr>';
}

const PAGE_SIZE = 10;
let expenses = [];
let page = 1;

function renderExpenses() {
  const list = expenses;
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (page > pages) page = pages;
  const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  $('exp-count').textContent = `(${list.length})`;
  $('pager').hidden = list.length <= PAGE_SIZE;
  $('pg-info').textContent = `Page ${page} of ${pages}`;
  $('pg-prev').disabled = page <= 1;
  $('pg-next').disabled = page >= pages;

  $('exp-body').innerHTML = slice.length
    ? slice.map((e) => `
        <tr>
          <td>${fmtDate(e.date)}</td>
          <td>${esc(e.description)}</td>
          <td>${esc(e.category)}</td>
          <td class="num">${peso.format(e.amount)}</td>
          <td><button class="del" data-id="${e.id}" aria-label="Delete expense">Delete</button></td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="empty">No expenses in this range.</td></tr>';
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
  const [list, rep] = await Promise.all([
    api('/api/expenses' + qs()),
    api('/api/reports' + qs()),
  ]);
  expenses = list;
  renderExpenses();
  fillReport('rep-category', rep.category, (x) => x);
  fillReport('rep-daily', rep.daily, fmtDate);
  fillReport('rep-monthly', rep.monthly, fmtMonth);
  $('grand').textContent = peso.format(rep.grandTotal);
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
    $('f-desc').value = ''; $('f-amt').value = '';   // keep date + category for fast entry
    $('f-desc').focus();
    msg.className = 'msg ok'; msg.textContent = 'Expense added.';
    page = 1;
    await refresh();
  } catch (err) { msg.textContent = err.message; }
});

$('filter-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const start = $('r-start').value, end = $('r-end').value;
  if (start && end && start > end) {
    $('range-msg').textContent = 'Start date must not be after end date.';
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
  syncDateLimits();
  page = 1;
  await refresh();
});

$('exp-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button.del');
  if (!btn) return;
  if (!confirm('Delete this expense?')) return;
  await api('/api/expenses/' + btn.dataset.id, { method: 'DELETE' });
  await refresh();
});

// Amount: whole numbers only, never negative (blocks typing AND pasting).
const amt = $('f-amt');
amt.addEventListener('keydown', (e) => {
  if (['-', '+', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault();
});
amt.addEventListener('input', () => {
  const clean = amt.value.split('.')[0].replace(/\D/g, '');
  if (clean !== amt.value) amt.value = clean;
});

// Date range: the end picker can't go before the start picker, and vice versa.
function syncDateLimits() {
  $('r-end').min = $('r-start').value || '';
  $('r-start').max = $('r-end').value || '';
}
$('r-start').addEventListener('change', syncDateLimits);
$('r-end').addEventListener('change', syncDateLimits);

// Pagination
$('pg-prev').addEventListener('click', () => { if (page > 1) { page--; renderExpenses(); } });
$('pg-next').addEventListener('click', () => { page++; renderExpenses(); });

// Default the date field to today (local time).
const t = new Date();
$('f-date').value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

refresh().catch((err) => { $('form-msg').textContent = err.message; });
