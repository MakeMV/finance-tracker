import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount, findTotal, findDate, guessCategory, findMerchant, parseReceiptText,
} from '../public/receipt-parser.js';

// A typical Kazakh supermarket receipt, with OCR noise: "ИТОГ0" with a zero, Latin "O".
const MAGNUM = `ТОО «Magnum Cash&Carry»
БИН 060140007445
г. Усть-Каменогорск, пр. Абая 12
КАССОВЫЙ ЧЕК
Продажа
1. Молоко 2.5% 1л     2 x 520,00   1 040,00
2. Хлеб белый                       180,00
3. Сыр Российский                 3 370,00
ИТОГ0:                            4 590,00
Наличные:                         5 000,00
Сдача:                              410,00
в т.ч. НДС 12%:                     491,79
Дата: 20.11.2026 14:32`;

test('parses a typical supermarket receipt', () => {
  assert.deepEqual(parseReceiptText(MAGNUM), {
    amount: 4590,
    date: '2026-11-20',
    category: 'Food',
    merchant: 'Magnum Cash&Carry',
    description: 'Magnum Cash&Carry',
    currency: 'KZT',
  });
});

test('amounts: spaces in thousands, comma or dot decimals', () => {
  assert.equal(parseAmount('4 590,50'), 4590.5);
  assert.equal(parseAmount('12500.00'), 12500);
  assert.equal(parseAmount('180'), 180);
});

test('total: prefers "К ОПЛАТЕ" over a subtotal and reads the next line on narrow receipts', () => {
  assert.equal(findTotal(['ИТОГО 5 000,00', 'Скидка 500,00', 'К ОПЛАТЕ 4 500,00']), 4500);
  assert.equal(findTotal(['БАРЛЫҒЫ:', '7 250,00']), 7250);
  assert.equal(findTotal(['Хлеб 180,00', 'Наличные 1 000,00']), null);
});

test('total: ignores change and cash lines', () => {
  assert.equal(findTotal(['Итого 900,00', 'Сдача с суммы 1000 100,00']), 900);
});

test('date: several formats, invalid dates skipped', () => {
  assert.equal(findDate('Дата 20/11/26 14:00'), '2026-11-20');
  assert.equal(findDate('2026-11-05T10:00'), '2026-11-05');
  assert.equal(findDate('31.02.2026 и 01.03.2026'), '2026-03-01');
  assert.equal(findDate('без даты'), null);
});

test('category guessed from keywords', () => {
  assert.equal(guessCategory('АЗС Helios\nАИ-95 30 л'), 'Transport');
  assert.equal(guessCategory('Аптека Europharma\nПарацетамол'), 'Health');
  assert.equal(guessCategory('Магазин у дома'), 'Other'); // "магазин" alone must not match anything
});

test('merchant: skips legal form, quotes and service lines', () => {
  assert.equal(findMerchant(['КАССОВЫЙ ЧЕК', 'ИП "Аптека Здоровье"']), 'Аптека Здоровье');
  assert.equal(findMerchant(['12345', '***']), '');
});
