// Frontend: talks to the REST API with fetch and renders the page.
// Text from the server is always inserted with textContent (no innerHTML → no XSS).

const CURRENCY = '₸';
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const money = (n) => `${numberFormat.format(n)} ${CURRENCY}`;

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- Dates (local time, not UTC) ---

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11" + 1 → "2026-12"; Date handles the year rollover. */
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dayLabel(date) {
  return new Date(`${date}T12:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

// --- API ---

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.errors?.join('. ') ?? data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

// --- State ---

const state = {
  month: today().slice(0, 7),
  typeFilter: '',
  categories: { income: [], expense: [] },
  transactions: [],
  editingId: null,
};

// --- Rendering ---

function setStatus(message = '', isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('status--error', isError);
}

function renderSummary(summary) {
  $('sum-income').textContent = money(summary.income);
  $('sum-expense').textContent = money(summary.expense);
  $('sum-balance').textContent = money(summary.balance);
  $('sum-balance').style.color = summary.balance < 0 ? 'var(--expense)' : '';
}

function renderCategoryBars(byCategory) {
  const list = $('by-category');
  if (byCategory.length === 0) {
    list.replaceChildren(el('p', 'empty', 'No expenses this month.'));
    return;
  }
  const max = byCategory[0].total; // already sorted by the API, largest first
  list.replaceChildren(...byCategory.map(({ category, total }) => {
    const row = el('div', 'bar__row');
    row.append(el('span', '', category), el('span', '', money(total)));
    const fill = el('div', 'bar__fill');
    fill.style.width = `${(total / max) * 100}%`;
    const track = el('div', 'bar__track');
    track.append(fill);
    const li = el('li');
    li.append(row, track);
    return li;
  }));
}

function renderTransactions() {
  const list = $('tx-list');
  if (state.transactions.length === 0) {
    list.replaceChildren(el('p', 'empty', 'No transactions yet. Add your first one above.'));
    return;
  }

  list.replaceChildren(...state.transactions.map((tx) => {
    const main = el('div', 'tx__main');
    main.append(
      el('div', 'tx__title', tx.description || tx.category),
      el('div', 'tx__meta', `${tx.category} · ${dayLabel(tx.date)}`),
    );

    const sign = tx.type === 'income' ? '+' : '−';
    const amount = el('div', `tx__amount tx__amount--${tx.type}`, `${sign}${money(tx.amount)}`);

    const edit = el('button', '', '✏️');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit ${tx.description || tx.category}`);
    edit.addEventListener('click', () => startEdit(tx));

    const del = el('button', '', '🗑️');
    del.type = 'button';
    del.setAttribute('aria-label', `Delete ${tx.description || tx.category}`);
    del.addEventListener('click', () => deleteTransaction(tx));

    const actions = el('div', 'tx__actions');
    actions.append(edit, del);

    const li = el('li', 'tx');
    li.append(main, amount, actions);
    return li;
  }));
}

function renderCategoryOptions(type, selected) {
  $('category').replaceChildren(...state.categories[type].map((name) => {
    const option = el('option', '', name);
    option.value = name;
    option.selected = name === selected;
    return option;
  }));
}

// --- Loading data ---

async function load() {
  $('month-label').textContent = monthLabel(state.month);
  const query = new URLSearchParams({ month: state.month });
  if (state.typeFilter) query.set('type', state.typeFilter);

  try {
    const [transactions, summary] = await Promise.all([
      api(`/transactions?${query}`),
      api(`/summary?month=${state.month}`),
    ]);
    state.transactions = transactions;
    renderSummary(summary);
    renderCategoryBars(summary.byCategory);
    renderTransactions();
    setStatus('');
  } catch (err) {
    console.error(err);
    setStatus('Could not load data. Is the server running?', true);
  }
}

// --- Form: add & edit ---

const form = $('tx-form');

function resetForm() {
  state.editingId = null;
  form.reset();
  form.elements.date.value = today();
  renderCategoryOptions('expense');
  $('form-title').textContent = 'Add transaction';
  $('submit-btn').textContent = 'Add';
  $('cancel-edit').hidden = true;
  $('form-error').textContent = '';
}

function startEdit(tx) {
  state.editingId = tx.id;
  form.elements.type.value = tx.type;
  renderCategoryOptions(tx.type, tx.category);
  form.elements.amount.value = tx.amount;
  form.elements.date.value = tx.date;
  form.elements.description.value = tx.description;
  $('form-title').textContent = 'Edit transaction';
  $('submit-btn').textContent = 'Save';
  $('cancel-edit').hidden = false;
  $('form-error').textContent = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.elements.amount.focus({ preventScroll: true });
}

async function handleSubmit(event) {
  event.preventDefault();
  const data = new FormData(form);
  const payload = {
    type: data.get('type'),
    amount: Number(data.get('amount')),
    category: data.get('category'),
    description: data.get('description'),
    date: data.get('date'),
  };

  try {
    const saved = state.editingId
      ? await api(`/transactions/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/transactions', { method: 'POST', body: JSON.stringify(payload) });

    resetForm();
    // Jump to the month of the saved transaction, so the user sees it.
    state.month = saved.date.slice(0, 7);
    await load();
  } catch (err) {
    // The server validates everything; show its message right under the form.
    $('form-error').textContent = err.message;
  }
}

async function deleteTransaction(tx) {
  if (!confirm(`Delete "${tx.description || tx.category}" (${money(tx.amount)})?`)) return;
  try {
    await api(`/transactions/${tx.id}`, { method: 'DELETE' });
    if (state.editingId === tx.id) resetForm();
    await load();
  } catch (err) {
    setStatus(err.message, true);
  }
}

// --- Start ---

async function init() {
  form.addEventListener('submit', handleSubmit);
  $('cancel-edit').addEventListener('click', resetForm);
  for (const radio of form.elements.type) {
    radio.addEventListener('change', () => renderCategoryOptions(radio.value));
  }
  $('prev-month').addEventListener('click', () => { state.month = shiftMonth(state.month, -1); load(); });
  $('next-month').addEventListener('click', () => { state.month = shiftMonth(state.month, 1); load(); });
  $('type-filter').addEventListener('change', (e) => { state.typeFilter = e.target.value; load(); });

  try {
    state.categories = await api('/categories');
  } catch {
    setStatus('Could not reach the server.', true);
    return;
  }
  resetForm();
  load();
}

init();
