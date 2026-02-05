/**
 * Standalone test for Token Generation Utilities
 * Run with: npx tsx scripts/test-token-generation.ts
 */

import {
    generateNextToken,
    getCurrentTokenDate,
    calculatePickupTime,
    formatPickupTime,
    formatTokenDisplay,
    isTokenToday
} from '../src/utils/tokenGenerator';

console.log('🧪 Testing Token Generation Utilities\n');
console.log('='.repeat(60));

// Test 1: Token Generation with Empty List
console.log('\n📝 Test 1: First token of the day (empty list)');
const firstToken = generateNextToken([]);
console.log(`Generated: ${firstToken}`);
console.log(`Expected: T001`);
console.log(`✅ Pass: ${firstToken === 'T001'}`);

// Test 2: Token Generation with Existing Tokens
console.log('\n📝 Test 2: Next token after existing tokens');
const existingTokens = ['T001', 'T002', 'T005', 'T010'];
const nextToken = generateNextToken(existingTokens);
console.log(`Existing tokens: ${existingTokens.join(', ')}`);
console.log(`Generated: ${nextToken}`);
console.log(`Expected: T011 (max + 1)`);
console.log(`✅ Pass: ${nextToken === 'T011'}`);

// Test 3: Token Generation Sequence
console.log('\n📝 Test 3: Sequential token generation');
let tokenSequence: string[] = [];
for (let i = 0; i < 5; i++) {
    const token = generateNextToken(tokenSequence);
    tokenSequence.push(token);
}
console.log(`Generated sequence: ${tokenSequence.join(', ')}`);
console.log(`Expected: T001, T002, T003, T004, T005`);
const expectedSequence = ['T001', 'T002', 'T003', 'T004', 'T005'];
console.log(`✅ Pass: ${JSON.stringify(tokenSequence) === JSON.stringify(expectedSequence)}`);

// Test 4: Token with Leading Zeros
console.log('\n📝 Test 4: Token formatting with leading zeros');
const token99 = generateNextToken(Array.from({ length: 99 }, (_, i) => `T${String(i + 1).padStart(3, '0')}`));
console.log(`Token after T099: ${token99}`);
console.log(`Expected: T100`);
console.log(`✅ Pass: ${token99 === 'T100'}`);

// Test 5: Current Token Date
console.log('\n📝 Test 5: Get current token date');
const tokenDate = getCurrentTokenDate();
const today = new Date().toISOString().split('T')[0];
console.log(`Generated date: ${tokenDate}`);
console.log(`Today's date: ${today}`);
console.log(`✅ Pass: ${tokenDate === today}`);

// Test 6: isTokenToday Check
console.log('\n📝 Test 6: Check if token is for today');
const isTodayToken = isTokenToday(tokenDate);
const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const isYesterdayToken = isTokenToday(yesterdayDate);
console.log(`Is today's token valid: ${isTodayToken}`);
console.log(`Is yesterday's token valid: ${isYesterdayToken}`);
console.log(`✅ Pass: ${isTodayToken === true && isYesterdayToken === false}`);

// Test 7: Pickup Time Calculation
console.log('\n📝 Test 7: Calculate pickup time');
const itemCounts = [1, 3, 5, 10, 20];
console.log('Item Count | Estimated Minutes | Max Minutes');
console.log('-'.repeat(50));
itemCounts.forEach(count => {
    const pickupTime = calculatePickupTime(count);
    const minutesDiff = Math.round((pickupTime.getTime() - Date.now()) / 1000 / 60);
    const baseMinutes = 10;
    const perItemMinutes = 2;
    const expectedMinutes = Math.min(baseMinutes + (count * perItemMinutes), 30);
    console.log(`${String(count).padStart(10)} | ${String(minutesDiff).padStart(17)} | ${String(expectedMinutes).padStart(11)}`);
    console.log(`✅ Pass: ${minutesDiff === expectedMinutes}`);
});

// Test 8: Pickup Time Formatting
console.log('\n📝 Test 8: Format pickup time for display');
const testTime = new Date();
testTime.setHours(15, 45, 0, 0); // 3:45 PM
const formattedTime = formatPickupTime(testTime);
console.log(`Time object: ${testTime.toISOString()}`);
console.log(`Formatted: ${formattedTime}`);
console.log(`Expected: Contains "3:45" and "PM"`);
console.log(`✅ Pass: ${formattedTime.includes('3:45') && formattedTime.includes('PM')}`);

// Test 9: Token Display Formatting
console.log('\n📝 Test 9: Format token for large display');
const tokensToFormat = ['T001', 'T042', 'T153'];
console.log('Token  | Display Format');
console.log('-'.repeat(40));
tokensToFormat.forEach(token => {
    const display = formatTokenDisplay(token);
    const expected = `T ${token.substring(1).split('').join(' ')}`;
    console.log(`${token.padEnd(7)} | ${display}`);
    console.log(`✅ Pass: ${display === expected}`);
});

// Test 10: Edge Cases
console.log('\n📝 Test 10: Edge cases and error handling');

// Empty token in list (should be filtered)
const tokensWithEmpty = ['T001', '', 'T003'];
const nextAfterEmpty = generateNextToken(tokensWithEmpty.filter(Boolean));
console.log(`Tokens with empty: ['T001', '', 'T003']`);
console.log(`Generated (filtered): ${nextAfterEmpty}`);
console.log(`Expected: T004`);
console.log(`✅ Pass: ${nextAfterEmpty === 'T004'}`);

// Malformed tokens (should default to 0)
const malformedTokens = ['T001', 'INVALID', 'T002'];
const nextAfterMalformed = generateNextToken(malformedTokens);
console.log(`Tokens with malformed: ['T001', 'INVALID', 'T002']`);
console.log(`Generated: ${nextAfterMalformed}`);
console.log(`Expected: T003 (ignores malformed)`);
console.log(`✅ Pass: ${nextAfterMalformed === 'T003'}`);

console.log('\n' + '='.repeat(60));
console.log('✅ All Token Generation Utility Tests Completed!');
console.log('='.repeat(60));
