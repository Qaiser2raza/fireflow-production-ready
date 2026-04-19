
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('Opening http://localhost:3000/...');
    await page.goto('http://localhost:3000/');
    
    console.log('Waiting for login screen...');
    await page.waitForSelector('input[placeholder*="PIN"]', { timeout: 10000 });
    
    console.log('Entering PIN 1111...');
    await page.fill('input[placeholder*="PIN"]', '1111');
    await page.keyboard.press('Enter');
    
    console.log('Waiting for POS/Dashboard...');
    await page.waitForURL('**/pos**', { timeout: 10000 }).catch(() => console.log('Current URL:', page.url()));
    
    // Check if we are on Dashboard or POS. The user said log in as cashier.
    // Usually cashiers go to POS.
    
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'artifacts/login_success.png' });
    
    // Test Dine-in
    console.log('Testing Dine-in order...');
    // Add logic to select dine-in, table, and items...
    // But first let's see where we are.
    
  } catch (e) {
    console.error('Test failed:', e);
    await page.screenshot({ path: 'artifacts/test_error.png' });
  } finally {
    await browser.close();
  }
})();
