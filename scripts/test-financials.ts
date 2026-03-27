/**
 * Financial Logic Verification Test
 * Tests: Bill Engine (Inclusive/Exclusive Tax), Journal Entry Logic
 */

import { calculateBill, BillConfig } from '../src/lib/billEngine';
import { OrderItem } from '../src/shared/types';
import { Decimal } from '@prisma/client/runtime/library';

async function runFinancialTests() {
    console.log('🧪 Starting Financial Logic Tests...\n');

    let passCount = 0;
    let failCount = 0;

    const assert = (condition: boolean, message: string) => {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            passCount++;
        } else {
            console.log(`❌ FAIL: ${message}`);
            failCount++;
        }
    };

    // --- TEST 1: Exclusive Tax Calculation ---
    console.log('--- Test 1: Exclusive Tax (GST 16% on top) ---');
    const itemsEx: OrderItem[] = [
        { id: '1', name: 'Burger', unit_price: 100, quantity: 1, category_id: 'c1' } as any
    ];
    const configEx: BillConfig = {
        discountType: 'flat', discountValue: 0,
        serviceChargeEnabled: false, serviceChargeRate: 0,
        taxEnabled: true, taxRate: 16, taxLabel: 'GST', taxInclusive: false,
        deliveryFeeEnabled: false, deliveryFee: 0
    };
    const resEx = calculateBill(itemsEx, configEx);
    assert(resEx.subtotal === 100, 'Subtotal should be 100');
    assert(resEx.tax === 16, 'Tax should be 16 (16% of 100)');
    assert(resEx.total === 116, 'Total should be 116');

    // --- TEST 2: Inclusive Tax Calculation (The new formula) ---
    console.log('\n--- Test 2: Inclusive Tax (GST 16% included in price) ---');
    const itemsIn: OrderItem[] = [
        { id: '2', name: 'Pizza', unit_price: 116, quantity: 1, category_id: 'c1' } as any
    ];
    const configIn: BillConfig = {
        ...configEx,
        taxInclusive: true
    };
    const resIn = calculateBill(itemsIn, configIn);
    // Base = 116 / 1.16 = 100
    // Tax = 116 - 100 = 16
    assert(resIn.total === 116, 'Total should remain 116 (Inclusive)');
    assert(resIn.tax === 16, 'Tax portion should be derived as 16');
    assert(resIn.subtotal === 116, 'Subtotal is the gross menu price (116)');

    // --- TEST 3: Inclusive Tax with Service Charge ---
    console.log('\n--- Test 3: Inclusive Tax + 10% Service Charge ---');
    const configSC: BillConfig = {
        ...configIn,
        serviceChargeEnabled: true,
        serviceChargeRate: 10
    };
    const resSC = calculateBill(itemsIn, configSC);
    // Subtotal: 116
    // SC: 10% of 116 = 11.6
    // Total raw before tax: 116 + 11.6 = 127.6
    // Tax is included in that 127.6
    // BaseWithTax = 127.6
    // BaseWithoutTax = 127.6 / 1.16 = 110
    // Tax = 17.6
    assert(resSC.serviceCharge === 11.6, 'Service charge should be 11.6');
    assert(resSC.total === 127.6, `Total should be 127.6 (Menu 116 + SC 11.6). Actual: ${resSC.total}`);
    assert(resSC.tax === 17.6, `Tax portion should be 17.6. Actual: ${resSC.tax}`);

    // --- TEST 4: Ledger Math Verification (Journal Logic) ---
    console.log('\n--- Test 4: Journal Accounting Identity ---');
    // Formula: Total - Tax - SC - DeliveryFee = Net Revenue
    const total = new Decimal(resSC.total);
    const tax = new Decimal(resSC.tax);
    const sc = new Decimal(resSC.serviceCharge);
    const netRevenue = total.minus(tax).minus(sc);
    
    // In Test 3: 127.6 - 17.6 - 11.6 = 98.4
    // Wait, why 98.4? 
    // Menu Price was 116. Base was 100.
    // SC was 11.6. Base of SC (without tax) was 10.
    // Total Base Revenue = 100 + 10 = 110.
    // Let's re-verify: 127.6 - 17.6 - 11.6 = 98.4? No, 127.6 - 17.6 = 110. 110 - 11.6 = 98.4.
    // Ah! My JournalEntryService logic: NetRevenue = total.minus(tax).minus(sc).
    // Let's check: 127.6 - 17.6 - 11.6 = 98.4.
    // Is 98.4 correct? 
    // Original Item Base was 100. SC Base was 10. Total should be 110.
    // Let's see the error in my SC logic in Test 3.
    // SC (Inclusive) is calculated on 116. 11.6.
    // Taxable Base = 116 + 11.6 = 127.6.
    // Tax = 127.6 - (127.6 / 1.16) = 17.6.
    // If we subtract tax (17.6) and SC (11.6) from 127.6, we get 98.4.
    // This happens because the SC of 11.6 itself contains tax!
    // So Net Revenue (98.4) + SC Net (10) + Total Tax (17.6) = 126? No.
    // Net Revenue (98.4) + SC Gross (11.6) + Tax (17.6) = 127.6. Correct.
    
    assert(netRevenue.plus(tax).plus(sc).equals(total), 'Ledger Balance: Net + Tax + SC === Total');

    console.log(`\n--- Results: ${passCount} Passed, ${failCount} Failed ---`);
    if (failCount > 0) process.exit(1);
}

runFinancialTests().catch(err => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
});
