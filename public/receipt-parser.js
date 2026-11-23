// Turns raw OCR text of a receipt into form fields, with plain rules (no AI).
// Pure functions without DOM, so they are tested in Node (test/receipt-parser.test.js).
// OCR text is noisy: "ИТОГ0" with a zero, Latin "O" instead of Cyrillic "О", spaces inside numbers.

// Keywords that mark the line with the final amount, strongest first.
// [оo0] covers OCR mixing Cyrillic о, Latin o and zero.
const TOTAL_KEYWORDS = [
  /к\s*[оo0]плат/i, // К ОПЛАТЕ
  /ит[оo0]г/i, // ИТОГО / ИТОГ
  /барлы/i, // БАРЛЫҒЫ (kk)
  /всег[оo0]/i, // ВСЕГО
  /t[оo0]tal/i, // TOTAL
  /сумма/i, // СУММА (weakest: also used per item)
];
// Lines that hold other money amounts, not the total.
const NOT_TOTAL = /сдач|налич|получ|ндс|change|cash/i;

// A money amount: "4 590,00", "4590.00", "4590". Spaces inside thousands are allowed.
const AMOUNT = /\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;

/** "4 590,50" → 4590.5 */
export function parseAmount(raw) {
  const n = Number(raw.replace(/[  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function amountsIn(line) {
  return (line.match(AMOUNT) ?? [])
    .map(parseAmount)
    .filter((n) => n !== null && n > 0 && n < 100_000_000);
}

export function findTotal(lines) {
  for (const keyword of TOTAL_KEYWORDS) {
    // Bottom-up: the final total is printed after subtotals.
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (!keyword.test(lines[i]) || NOT_TOTAL.test(lines[i])) continue;
      // The amount is on the same line or, on narrow receipts, on the next one.
      const found = amountsIn(lines[i]).at(-1) ?? amountsIn(lines[i + 1] ?? '').at(-1);
      if (found) return found;
    }
  }
  return null;
}

/** First valid date in the text: 20.11.2026, 20/11/26, 2026-11-20 → "2026-11-20". */
export function findDate(text) {
  const candidates = [
    ...[...text.matchAll(/(?<!\d)(\d{4})[-.\/](\d{2})[-.\/](\d{2})(?!\d)/g)].map(([, y, m, d]) => [y, m, d]),
    ...[...text.matchAll(/(?<!\d)(\d{2})[.\/-](\d{2})[.\/-](\d{4}|\d{2})(?!\d)/g)].map(([, d, m, y]) => [
      y.length === 2 ? `20${y}` : y, m, d,
    ]),
  ];
  for (const [y, m, d] of candidates) {
    const iso = `${y}-${m}-${d}`;
    const date = new Date(`${iso}T12:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) && Number(y) >= 2000) return iso;
  }
  return null;
}

// Keyword → category. Stores common in Kazakhstan plus generic words.
const CATEGORY_KEYWORDS = {
  Food: ['magnum', 'small', 'galmart', 'анвар', 'ainur', 'интерфуд', 'продукт', 'супермаркет', 'маркет', 'market',
    'кафе', 'cafe', 'coffee', 'кофе', 'пицц', 'pizza', 'burger', 'бургер', 'kfc', 'ресторан', 'хлеб', 'молоко',
    'мясо', 'сыр', 'вода', 'сок', 'чай', 'glovo', 'wolt'],
  Transport: ['азс', 'бензин', 'аи-92', 'аи-95', 'аи92', 'аи95', 'дизель', 'helios', 'sinooil', 'qazaq oil',
    'газпром', 'такси', 'taxi', 'yandex go', 'парковк', 'автобус', 'onay'],
  Health: ['аптек', 'pharm', 'фарм', 'клиник', 'биосфер', 'europharma', 'медицин', 'стоматолог', 'анализ'],
  Shopping: ['одежд', 'обув', 'technodom', 'mechta', 'sulpak', 'dns', 'waikiki', 'zara', 'wildberries',
    'ozon', 'flip'],
  Utilities: ['коммунал', 'алсеко', 'электроэнерг', 'водоканал', 'интернет', 'kazakhtelecom',
    'казахтелеком', 'tele2', 'beeline', 'kcell', 'activ', 'altel'],
  Entertainment: ['кино', 'cinema', 'kinopark', 'chaplin', 'боулинг', 'концерт', 'билет', 'steam', 'playstation'],
  Education: ['курс', 'книг', 'meloman', 'меломан', 'школ', 'универ', 'обучени', 'канцтовар'],
  Housing: ['аренд', 'ремонт', 'leroy', 'строй', 'мебел', 'ikea', 'хоз'],
};

export function guessCategory(text) {
  const lower = text.toLowerCase();
  let best = 'Other';
  let bestHits = 0;
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter((word) => lower.includes(word)).length;
    if (hits > bestHits) {
      best = category;
      bestHits = hits;
    }
  }
  return best;
}

/** The store name is usually one of the first lines with real words. */
export function findMerchant(lines) {
  for (const line of lines.slice(0, 6)) {
    const name = line
      .replace(/^\s*(тоо|ип|ао|too|llp)(?=[\s.]|$)\.?/i, '') // legal form: ТОО, ИП, АО (\b doesn't work for Cyrillic)
      .replace(/[«»"'*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const letters = name.match(/\p{L}/gu)?.length ?? 0;
    if (letters >= 3 && letters / name.length > 0.5 && !/чек|бин|иин|кассов|фискал/i.test(name)) {
      return name.slice(0, 60);
    }
  }
  return '';
}

export function findCurrency(text) {
  if (/руб|rub|₽/i.test(text)) return 'RUB';
  if (/usd|\$/i.test(text)) return 'USD';
  if (/eur|€/i.test(text)) return 'EUR';
  return 'KZT';
}

/** Raw OCR text → the same fields the server's AI scanner returns. */
export function parseReceiptText(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const merchant = findMerchant(lines);
  const category = guessCategory(text);
  return {
    amount: findTotal(lines),
    date: findDate(text),
    category,
    merchant,
    description: merchant || category,
    currency: findCurrency(text),
  };
}
