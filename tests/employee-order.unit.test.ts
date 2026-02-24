import assert from 'node:assert/strict';
import test from 'node:test';
import { addItemToOrder } from '../lib/employee-order';

test('addItemToOrder adds new menu item with quantity 1', () => {
  const result = addItemToOrder([], {
    id: '10',
    name: 'Cola',
    price: 4,
    category: 'Soft Drink',
    quantity: 5,
  });

  assert.equal(result.message, null);
  assert.equal(result.nextItems.length, 1);
  assert.equal(result.nextItems[0].id, '10');
  assert.equal(result.nextItems[0].quantity, 1);
});

test('addItemToOrder blocks out-of-stock item', () => {
  const initial = [{ id: '10', name: 'Cola', price: 4, quantity: 1 }];
  const result = addItemToOrder(initial, {
    id: '11',
    name: 'Lime Soda',
    price: 5,
    category: 'Soft Drink',
    quantity: 0,
  });

  assert.equal(result.nextItems, initial);
  assert.equal(result.message, 'Lime Soda is out of stock.');
});

test('addItemToOrder blocks quantity above stock', () => {
  const initial = [{ id: '10', name: 'Cola', price: 4, quantity: 2 }];
  const result = addItemToOrder(initial, {
    id: '10',
    name: 'Cola',
    price: 4,
    category: 'Soft Drink',
    quantity: 2,
  });

  assert.equal(result.nextItems, initial);
  assert.equal(result.message, 'Only 2 Cola available.');
});

test('addItemToOrder increments quantity when stock allows', () => {
  const initial = [{ id: '10', name: 'Cola', price: 4, quantity: 1 }];
  const result = addItemToOrder(initial, {
    id: '10',
    name: 'Cola',
    price: 4,
    category: 'Soft Drink',
    quantity: 3,
  });

  assert.equal(result.message, null);
  assert.equal(result.nextItems[0].quantity, 2);
});
