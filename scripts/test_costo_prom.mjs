import assert from 'assert';
import { computeNewCostoProm } from '../public/js/compras-utils.js';

function approx(a,b,eps=1e-9){ return Math.abs(a-b) < eps; }

// Test 1: oldStock 0
let res = computeNewCostoProm(0,0,10,5); // receive 10 at cost 5
assert(approx(res,5), 'Test1 failed: expected 5 got ' + res);
console.log('Test1 passed');

// Test 2: oldStock 10 at cost 4, receive 5 at cost 6
res = computeNewCostoProm(10,4,5,6);
// expected = ((10*4)+(5*6))/15 = (40+30)/15 = 70/15 = 4.666...
assert(approx(res,70/15), 'Test2 failed: expected ' + (70/15) + ' got ' + res);
console.log('Test2 passed');

// Test 3: partial receive where receivedQty is 0
res = computeNewCostoProm(5,3,0,10);
assert(approx(res,3), 'Test3 failed: expected 3 got ' + res);
console.log('Test3 passed');

// Test 4: include transportation in unit cost (transport cost is added outside)
res = computeNewCostoProm(2,2.5,3, (10 + (6/3)) ); // simulate unit cost including transport proration
console.log('Test4 result', res);
assert(res > 2.5, 'Test4 unexpected result');
console.log('Test4 passed');

console.log('\nAll tests passed');
