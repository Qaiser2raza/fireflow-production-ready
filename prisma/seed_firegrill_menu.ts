
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RESTAURANT_ID = process.env.RESTAURANT_ID || 'b1972d7d-8374-4b55-9580-95a15f18f656';

const DATA = {
  categories: [
    { name: 'Mutton Specialties', name_urdu: 'مٹن کڑاہی اور ہانڈی', priority: 1, source: ['Mutton Karahi', 'Mutton Handi'] },
    { name: 'Chicken Specialties', name_urdu: 'چکن کڑاہی اور ہانڈی', priority: 2, source: ['Chicken Karahi', 'Chicken Handi', 'Desi Murgh'] },
    { name: 'Fire Grill BBQ', name_urdu: 'باربی کیو', priority: 3, source: ['Fire Grill BBQ'] },
    { name: 'BBQ Platters', name_urdu: 'بی بی کیو پلیٹرز', priority: 4, source: ['BBQ Platters'] },
    { name: 'Chinese & Soups', name_urdu: 'چائنیز اور سوپ', priority: 5, source: ['Soups', 'Chinese Gravy', 'Dry & Fry'] },
    { name: 'Rice & Biryani', name_urdu: 'چاول اور بریانی', priority: 6, source: ['Rice'] },
    { name: 'Vegetable & Dal', name_urdu: 'سبزی اور دال', priority: 7, source: ['Vegetable & Dal'] },
    { name: 'Fish (Marine)', name_urdu: 'مچھلی', priority: 8, source: ['Fish'] },
    { name: 'Tandoor & Breads', name_urdu: 'تندور اور نان', priority: 9, source: ['Tandoor'] },
    { name: 'Salads & Sides', name_urdu: 'سلاد اور رائتہ', priority: 10, source: ['Salad Bar'] },
    { name: 'Bar: Drinks', name_urdu: 'مشروبات', priority: 11, source: ['Hot & Cold Drinks'] },
    { name: 'Bar: Shakes', name_urdu: 'ملک شیک اور آئس کریم', priority: 12, source: ['Shake Bar'] },
    { name: 'Special Deals', name_urdu: 'خصوصی ڈیلز', priority: 13, source: ['Special Deals', 'Salam Bakra'] }
  ],
  items: [
    { category: 'Mutton Karahi', name: 'Mutton Karahi (White)', price_full: 2600, price_half: 1350, urdu: 'مٹن وائٹ کڑاہی' },
    { category: 'Mutton Karahi', name: 'Mutton Karahi (Red / Namkeen)', price_full: 2400, price_half: 1250, urdu: 'مٹن ریڈ / نمکین کڑاہی' },
    { category: 'Mutton Karahi', name: 'Mutton Achari Karahi', price_full: 2450, price_half: 1280, urdu: 'مٹن اچاری کڑاہی' },
    { category: 'Mutton Karahi', name: 'Mutton Peshawari Karahi', price_full: 2500, price_half: 1300, urdu: 'مٹن پشاوری کڑاہی' },
    { category: 'Mutton Karahi', name: 'Mutton Koyla Karahi', price_full: 2450, price_half: 1280, urdu: 'مٹن کوئلہ کڑاہی' },
    { category: 'Mutton Handi', name: 'Mutton Madni Handi', price_full: 2800, price_half: 1450, urdu: 'مٹن مدنی ہانڈی' },
    { category: 'Mutton Handi', name: 'Mutton Paneer Reshmi Handi', price_full: 2850, price_half: 1480, urdu: 'مٹن پنیر ریشمی ہانڈی' },
    { category: 'Mutton Handi', name: 'Mutton Makhni Handi', price_full: 2700, price_half: 1400, urdu: 'مٹن مکھنی ہانڈی' },
    { category: 'Mutton Handi', name: 'Mutton Achari Handi', price_full: 2650, price_half: 1380, urdu: 'مٹن اچاری ہانڈی' },
    { category: 'Mutton Handi', name: 'Mutton Rajasthani Handi', price_full: 2750, price_half: 1430, urdu: 'مٹن راجستھانی ہانڈی' },
    { category: 'Chicken Karahi', name: 'Chicken Karahi (White)', price_full: 1800, price_half: 950, urdu: 'چکن وائٹ کڑاہی' },
    { category: 'Chicken Karahi', name: 'Chicken Karahi (Red / Namkeen)', price_full: 1650, price_half: 880, urdu: 'چکن ریڈ / نمکین کڑاہی' },
    { category: 'Chicken Karahi', name: 'Chicken Achari Karahi', price_full: 1700, price_half: 900, urdu: 'چکن اچاری کڑاہی' },
    { category: 'Chicken Karahi', name: 'Chicken Peshawari Karahi', price_full: 1750, price_half: 920, urdu: 'چکن پشاوری کڑاہی' },
    { category: 'Chicken Karahi', name: 'Chicken Koyla Karahi', price_full: 1700, price_half: 900, urdu: 'چکن کوئلہ کڑاہی' },
    { category: 'Chicken Handi', name: 'Chicken Madni Handi', price_full: 1950, price_half: 1050, urdu: 'چکن مدنی ہانڈی' },
    { category: 'Chicken Handi', name: 'Chicken Paneer Reshmi Handi', price_full: 2100, price_half: 1100, urdu: 'چکن پنیر ریشمی ہانڈی' },
    { category: 'Chicken Handi', name: 'Chicken Makhni Handi', price_full: 2000, price_half: 1050, urdu: 'چکن مکھنی ہانڈی' },
    { category: 'Chicken Handi', name: 'Chicken Achari Handi', price_full: 1900, price_half: 1000, urdu: 'چکن اچاری ہانڈی' },
    { category: 'Chicken Handi', name: 'Chicken Rajasthani Handi', price_full: 2050, price_half: 1080, urdu: 'چکن راجستھانی ہانڈی' },
    { category: 'Chicken Handi', name: 'Chicken Kabab Masala Handi', price_full: 1850, price_half: 980, urdu: 'چکن کباب مصالحہ ہانڈی' },
    { category: 'Fire Grill BBQ', name: 'Chicken Tikka Piece (Leg)', price_full: 380, urdu: 'چکن تکہ لیگ' },
    { category: 'Fire Grill BBQ', name: 'Chicken Tikka Piece (Chest)', price_full: 420, urdu: 'چکن تکہ چیسٹ' },
    { category: 'Fire Grill BBQ', name: 'Chicken Malai Boti (10 pcs)', price_full: 850, urdu: 'چکن ملائی بوٹی' },
    { category: 'Fire Grill BBQ', name: 'Chicken Achari Boti (10 pcs)', price_full: 800, urdu: 'چکن اچاری بوٹی' },
    { category: 'Fire Grill BBQ', name: 'Chicken Seekh Kabab (4 pcs)', price_full: 750, urdu: 'چکن سیخ کباب' },
    { category: 'Fire Grill BBQ', name: 'Mutton Seekh Kabab (4 pcs)', price_full: 1200, urdu: 'مٹن سیخ کباب' },
    { category: 'Fire Grill BBQ', name: 'Beef Seekh Kabab (4 pcs)', price_full: 1100, urdu: 'بیف سیخ کباب' },
    { category: 'Fire Grill BBQ', name: 'Chicken Reshmi Kabab (4 pcs)', price_full: 850, urdu: 'چکن ریشمی کباب' },
    { category: 'Fire Grill BBQ', name: 'Chicken Kasturi Boti (10 pcs)', price_full: 950, urdu: 'چکن کستوری بوٹی' },
    { category: 'Fire Grill BBQ', name: 'Fish Tikka (10 pcs)', price_full: 1250, urdu: 'فش تکہ' },
    { category: 'BBQ Platters', name: 'Fire Grill Special Platter (Small)', price_full: 2800, urdu: 'فائر گرل اسپیشل پلیٹر (چھوٹا)' },
    { category: 'BBQ Platters', name: 'Fire Grill Special Platter (Large)', price_full: 4500, urdu: 'فائر گرل اسپیشل پلیٹر (بڑا)' },
    { category: 'BBQ Platters', name: 'Mixed BBQ Platter', price_full: 3200, urdu: 'مکس بی بی کیو پلیٹر' },
    { category: 'Vegetable & Dal', name: 'Mix Vegetable', price_full: 450, urdu: 'مکس سبزی' },
    { category: 'Vegetable & Dal', name: 'Dal Mash (Makhni)', price_full: 480, urdu: 'دال ماش مکھنی' },
    { category: 'Vegetable & Dal', name: 'Dal Chana (Special)', price_full: 400, urdu: 'دال چنا اسپیشل' },
    { category: 'Vegetable & Dal', name: 'Palak Paneer', price_full: 550, urdu: 'پالک پنیر' },
    { category: 'Vegetable & Dal', name: 'Bhindi Fry', price_full: 420, urdu: 'بھنڈی فرائی' },
    { category: 'Rice', name: 'Chicken Biryani (Full)', price_full: 450, urdu: 'چکن بریانی (فل)' },
    { category: 'Rice', name: 'Chicken Biryani (Single)', price_full: 280, urdu: 'چکن بریانی (سنگل)' },
    { category: 'Rice', name: 'Mutton Pulao (Full)', price_full: 850, urdu: 'مٹن پلاؤ (فل)' },
    { category: 'Rice', name: 'Egg Fried Rice', price_full: 650, urdu: 'ایگ فرائیڈ رائس' },
    { category: 'Rice', name: 'Chicken Fried Rice', price_full: 750, urdu: 'چکن فرائیڈ رائس' },
    { category: 'Rice', name: 'Vegetable Fried Rice', price_full: 600, urdu: 'سبزی فرائیڈ رائس' },
    { category: 'Rice', name: 'Masala Rice', price_full: 550, urdu: 'مصالحہ رائس' },
    { category: 'Soups', name: 'Hot & Sour Soup', price_full: 450, urdu: 'ہاٹ اینڈ سور سوپ' },
    { category: 'Soups', name: 'Chicken Corn Soup', price_full: 400, urdu: 'چکن کارن سوپ' },
    { category: 'Soups', name: 'Vegetable Soup', price_full: 350, urdu: 'سبزی سوپ' },
    { category: 'Chinese Gravy', name: 'Chicken Manchurian', price_full: 950, urdu: 'چکن منچورین' },
    { category: 'Chinese Gravy', name: 'Chicken Shashlik', price_full: 980, urdu: 'چکن شاشلک' },
    { category: 'Chinese Gravy', name: 'Chicken Black Pepper', price_full: 1050, urdu: 'چکن بلیک پیپر' },
    { category: 'Chinese Gravy', name: 'Chicken Jalfrezi', price_full: 1000, urdu: 'چکن جلفریزی' },
    { category: 'Chinese Gravy', name: 'Chicken Chilli Dry', price_full: 1100, urdu: 'چکن چلی ڈرائی' },
    { category: 'Chinese Gravy', name: 'Beef Chilli Dry', price_full: 1350, urdu: 'بیف چلی ڈرائی' },
    { category: 'Chinese Gravy', name: 'Beef Black Pepper', price_full: 1400, urdu: 'بیف بلیک پیپر' },
    { category: 'Dry & Fry', name: 'Finger Fish', price_full: 1450, urdu: 'فنگر فش' },
    { category: 'Dry & Fry', name: 'Chicken Wings (8 pcs)', price_full: 650, urdu: 'چکن ونگز' },
    { category: 'Dry & Fry', name: 'Chicken Nuggets (10 pcs)', price_full: 700, urdu: 'چکن نگٹس' },
    { category: 'Dry & Fry', name: 'French Fries (Large)', price_full: 350, urdu: 'فرنچ فرائز' },
    { category: 'Dry & Fry', name: 'Masala Fries', price_full: 380, urdu: 'مصالحہ فرائز' },
    { category: 'Tandoor', name: 'Roghni Nan', price_full: 60, urdu: 'روغنی نان' },
    { category: 'Tandoor', name: 'Garlic Nan', price_full: 90, urdu: 'گارلک نان' },
    { category: 'Tandoor', name: 'Kalonji Nan', price_full: 70, urdu: 'کلونجی نان' },
    { category: 'Tandoor', name: 'Cheese Nan', price_full: 250, urdu: 'چیز نان' },
    { category: 'Tandoor', name: 'Khamiri Roti', price_full: 25, urdu: 'خمیری روٹی' },
    { category: 'Tandoor', name: 'Tandoori Paratha', price_full: 80, urdu: 'تندوری پراٹھہ' },
    { category: 'Salad Bar', name: 'Fresh Salad', price_full: 150, urdu: 'تازہ سلاد' },
    { category: 'Salad Bar', name: 'Russian Salad', price_full: 450, urdu: 'روسی سلاد' },
    { category: 'Salad Bar', name: 'Mint Raita', price_full: 100, urdu: 'پودینہ رائتہ' },
    { category: 'Salad Bar', name: 'Zeera Raita', price_full: 80, urdu: 'زیرہ رائتہ' },
    { category: 'Hot & Cold Drinks', name: 'Soft Drink (Regular)', price_full: 80, urdu: 'سوفٹ ڈرنک (ریگولر)' },
    { category: 'Hot & Cold Drinks', name: 'Fresh Lime', price_full: 120, urdu: 'فریش لائم' },
    { category: 'Hot & Cold Drinks', name: 'Mineral Water (Small)', price_full: 70, urdu: 'منرل واٹر (چھوٹا)' },
    { category: 'Hot & Cold Drinks', name: 'Mineral Water (Large)', price_full: 120, urdu: 'منرل واٹر (بڑا)' },
    { category: 'Hot & Cold Drinks', name: 'Tea (Mixed)', price_full: 120, urdu: 'مکس چائے' },
    { category: 'Hot & Cold Drinks', name: 'Green Tea', price_full: 80, urdu: 'سبز چائے' },
    { category: 'Hot & Cold Drinks', name: 'Doodh Patti', price_full: 150, urdu: 'دودھ پتی' },
    { category: 'Shake Bar', name: 'Mango Shake', price_full: 250, urdu: 'مینگو شیک' },
    { category: 'Shake Bar', name: 'Banana Shake', price_full: 220, urdu: 'بنائی شیک' },
    { category: 'Shake Bar', name: 'Apple Shake', price_full: 240, urdu: 'ایپل شیک' },
    { category: 'Shake Bar', name: 'Chocolate Shake', price_full: 300, urdu: 'چاکلیٹ شیک' },
    { category: 'Shake Bar', name: 'Vanilla Ice Cream (2 scoops)', price_full: 200, urdu: 'وینیلا آئس کریم' },
    { category: 'Shake Bar', name: 'Chocolate Ice Cream (2 scoops)', price_full: 250, urdu: 'چاکلیٹ آئس کریم' },
    { category: 'Shake Bar', name: 'Kulfa Ice Cream', price_full: 300, urdu: 'کلفہ آئس کریم' },
    { category: 'Special Deals', name: 'Special Family Deal 1', price_full: 3500, urdu: 'اسپیشل فیملی ڈیل 1' },
    { category: 'Special Deals', name: 'Special Family Deal 2', price_full: 5500, urdu: 'اسپیشل فیملی ڈیل 2' },
    { category: 'Fish', name: 'Grilled Fish (Kg)', price_full: 1800, urdu: 'گرلڈ فش' },
    { category: 'Desi Murgh', name: 'Desi Murgh Karahi', price_full: 2800, price_half: 1450, urdu: 'دیسی مرغ کڑاہی' },
    { category: 'Salam Bakra', name: 'Full Bakra Roast (Market Price)', price_full: 0, urdu: 'فل بکرا روسٹ' }
  ]
};

async function purgeOldMenu() {
  console.log('🗑️ Purging old menu items...');
  
  // 1. Get all current items for this restaurant
  const currentItems = await prisma.menu_items.findMany({
    where: { restaurant_id: RESTAURANT_ID }
  });

  const newItemNames = new Set(DATA.items.map(i => i.name));
  let deletedCount = 0;
  let hiddenCount = 0;

  // 2. Process each item
  for (const item of currentItems) {
    if (!newItemNames.has(item.name)) {
      try {
        // Try atomic delete (will fail if relations like order_items exist)
        await prisma.menu_items.delete({ where: { id: item.id } });
        deletedCount++;
      } catch (e) {
        // Fallback: Archive if it has order history
        await prisma.menu_items.update({
          where: { id: item.id },
          data: { 
            is_available: false, 
            category: 'Archived',
            category_id: null // Unlink from active categories
          }
        });
        hiddenCount++;
      }
    }
  }

  // 3. Cleanup unused empty categories
  const currentCats = await prisma.menu_categories.findMany({
    where: { restaurant_id: RESTAURANT_ID }
  });
  
  const activeCatNames = new Set(DATA.categories.map(c => c.name));
  for (const cat of currentCats) {
    if (!activeCatNames.has(cat.name)) {
      try {
        await prisma.menu_categories.delete({ where: { id: cat.id } });
      } catch (e) {
        // Ignore if still linked to archived items
      }
    }
  }

  console.log(`✅ Purge complete: ${deletedCount} deleted, ${hiddenCount} hidden (archived).`);
}

async function seed() {
  console.log('🚀 Starting Fire Grill Menu Seeding...');
  
  await purgeOldMenu();
  
  const categoryMap = new Map();

  for (const cat of DATA.categories) {
    const created = await prisma.menu_categories.upsert({
      where: { restaurant_id_name: { restaurant_id: RESTAURANT_ID, name: cat.name } },
      update: { name_urdu: cat.name_urdu, priority: cat.priority },
      create: { 
        restaurant_id: RESTAURANT_ID, 
        name: cat.name, 
        name_urdu: cat.name_urdu, 
        priority: cat.priority 
      }
    });
    
    for (const sourceName of cat.source) {
      categoryMap.set(sourceName, created);
    }
  }

  console.log('✅ Categories seeded.');

  let itemsCount = 0;
  let variantsCount = 0;

  for (const item of DATA.items) {
    const refinedCat = categoryMap.get(item.category);
    if (!refinedCat) {
      console.warn(`⚠️ Skipping item ${item.name}: Category mapping not found for ${item.category}`);
      continue;
    }

    // Manual Upsert to avoid UUID issues with custom IDs
    let menuItem = await prisma.menu_items.findFirst({
      where: {
        restaurant_id: RESTAURANT_ID,
        name: item.name
      }
    });

    if (menuItem) {
      menuItem = await prisma.menu_items.update({
        where: { id: menuItem.id },
        data: {
          price: item.price_full,
          name_urdu: item.urdu,
          is_available: true,
          category: refinedCat.name,
          category_id: refinedCat.id
        }
      });
    } else {
      menuItem = await prisma.menu_items.create({
        data: {
          restaurant_id: RESTAURANT_ID,
          category_id: refinedCat.id,
          category: refinedCat.name,
          name: item.name,
          name_urdu: item.urdu,
          price: item.price_full,
          is_available: true,
          station: 'KITCHEN'
        }
      });
    }

    itemsCount++;

    if (item.price_half !== undefined) {
      // Full Variant
      const existingFull = await prisma.menu_item_variants.findFirst({
        where: { menu_item_id: menuItem.id, name: 'Full' }
      });
      if (existingFull) {
        await prisma.menu_item_variants.update({
          where: { id: existingFull.id },
          data: { price: item.price_full, name_urdu: 'فل' }
        });
      } else {
        await prisma.menu_item_variants.create({
          data: {
            menu_item_id: menuItem.id,
            name: 'Full',
            name_urdu: 'فل',
            price: item.price_full
          }
        });
      }

      // Half Variant
      const existingHalf = await prisma.menu_item_variants.findFirst({
        where: { menu_item_id: menuItem.id, name: 'Half' }
      });
      if (existingHalf) {
        await prisma.menu_item_variants.update({
          where: { id: existingHalf.id },
          data: { price: item.price_half, name_urdu: 'ہاف' }
        });
      } else {
        await prisma.menu_item_variants.create({
          data: {
            menu_item_id: menuItem.id,
            name: 'Half',
            name_urdu: 'ہاف',
            price: item.price_half
          }
        });
      }
      variantsCount += 2;
    }
  }

  console.log(`✅ Items seeded: ${itemsCount}`);
  console.log(`✅ Variants seeded: ${variantsCount}`);
  console.log('🏁 Fire Grill Seeding Complete!');
}

seed()
  .catch(e => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
