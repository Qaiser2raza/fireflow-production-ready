import { prisma } from '../src/shared/lib/prisma';

const RESTAURANT_ID = 'b1972d7d-8374-4b55-9580-95a15f18f656';

const categories = [
  { name: 'Mutton Karahi',    name_urdu: 'مٹن کڑاہی',      priority: 1  },
  { name: 'Mutton Handi',     name_urdu: 'مٹن ہانڈی',      priority: 2  },
  { name: 'Chicken Karahi',   name_urdu: 'چکن کڑاہی',      priority: 3  },
  { name: 'Chicken Handi',    name_urdu: 'چکن ہانڈی',      priority: 4  },
  { name: 'BBQ',              name_urdu: 'بی بی کیو',       priority: 5  },
  { name: 'BBQ Platters',     name_urdu: 'بی بی کیو پلیٹر', priority: 6  },
  { name: 'Tandoor',          name_urdu: 'تندور',           priority: 7  },
  { name: 'Rice',             name_urdu: 'چاول',            priority: 8  },
  { name: 'Soups',            name_urdu: 'سوپ',             priority: 9  },
  { name: 'Chinese',          name_urdu: 'چائنیز',          priority: 10 },
  { name: 'Dry & Fry',        name_urdu: 'ڈرائی فرائی',    priority: 11 },
  { name: 'Salad Bar',        name_urdu: 'سلاد بار',        priority: 12 },
  { name: 'Hot & Cold',       name_urdu: 'گرم سرد',         priority: 13 },
  { name: 'Shake Bar',        name_urdu: 'شیک بار',         priority: 14 },
  { name: 'Deals',            name_urdu: 'ڈیلز',            priority: 15 },
  { name: 'Special',          name_urdu: 'اسپیشل',          priority: 16 },
  { name: 'Vegetable & Dal',   name_urdu: 'سبزیاں اور دال',    priority: 17 },
];

const menuData = [
  {
    category: 'Mutton Karahi',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Mutton Karahi',             name_urdu: 'مٹن کڑاہی',              price: 3990, variants: [{ name: 'Full', name_urdu: 'فل', price: 3990 }, { name: 'Half', name_urdu: 'ہاف', price: 2200 }] },
      { name: 'Mutton Karahi Black Pepper', name_urdu: 'مٹن کڑاہی کالی مرچ',    price: 3990, variants: [{ name: 'Full', name_urdu: 'فل', price: 3990 }, { name: 'Half', name_urdu: 'ہاف', price: 2200 }] },
      { name: 'Mutton Karahi Green Chilli', name_urdu: 'مٹن کڑاہی سبز مرچ',     price: 3990, variants: [{ name: 'Full', name_urdu: 'فل', price: 3990 }, { name: 'Half', name_urdu: 'ہاف', price: 2200 }] },
      { name: 'Mutton Shanwari Karahi',     name_urdu: 'مٹن شنواری کڑاہی',      price: 3990, variants: [{ name: 'Full', name_urdu: 'فل', price: 3990 }, { name: 'Half', name_urdu: 'ہاف', price: 2200 }] },
      { name: 'Mutton Sulemani Karahi',     name_urdu: 'مٹن سلیمانی کڑاہی',     price: 3990, variants: [{ name: 'Full', name_urdu: 'فل', price: 3990 }, { name: 'Half', name_urdu: 'ہاف', price: 2200 }] },
      { name: 'Mutton Punjabi Karahi',      name_urdu: 'مٹن پنجابی کڑاہی',      price: 3990, variants: [{ name: 'Full', name_urdu: 'فل', price: 3990 }, { name: 'Half', name_urdu: 'ہاف', price: 2200 }] },
      { name: 'Mutton Namkeen Karahi',      name_urdu: 'مٹن نمکین کڑاہی',       price: 3990, variants: [{ name: 'Full', name_urdu: 'فل', price: 3990 }, { name: 'Half', name_urdu: 'ہاف', price: 2200 }] },
      { name: 'Mutton Achari Karahi',       name_urdu: 'مٹن اچاری کڑاہی',       price: 4190, variants: [{ name: 'Full', name_urdu: 'فل', price: 4190 }, { name: 'Half', name_urdu: 'ہاف', price: 2250 }] },
      { name: 'FG Special Mutton Karahi',   name_urdu: 'فائرگرل اسپیشل مٹن کڑاہی', price: 4500, variants: [{ name: 'Full', name_urdu: 'فل', price: 4500 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton Karahi White',        name_urdu: 'مٹن کڑاہی وائٹ',        price: 4500, variants: [{ name: 'Full', name_urdu: 'فل', price: 4500 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton Karahi Desi Ghee',    name_urdu: 'مٹن کڑاہی دیسی گھی',    price: 4500, variants: [{ name: 'Full', name_urdu: 'فل', price: 4500 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton Karahi Olive Oil',    name_urdu: 'مٹن کڑاہی زیتون آئل',   price: 4500, variants: [{ name: 'Full', name_urdu: 'فل', price: 4500 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton Karahi Makhni',       name_urdu: 'مٹن کڑاہی مکھنی',       price: 4800, variants: [{ name: 'Full', name_urdu: 'فل', price: 4800 }, { name: 'Half', name_urdu: 'ہاف', price: 2600 }] },
    ]
  },
  {
    category: 'Mutton Handi',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Mutton Handi Bone Less',       name_urdu: 'مٹن ہانڈی بون لیس',      price: 3990, variants: [{ name: 'Full', name_urdu: 'فل', price: 3990 }, { name: 'Half', name_urdu: 'ہاف', price: 2200 }] },
      { name: 'Mutton Achari Handi Bone Less', name_urdu: 'مٹن اچاری ہانڈی بون لیس', price: 4190, variants: [{ name: 'Full', name_urdu: 'فل', price: 4190 }, { name: 'Half', name_urdu: 'ہاف', price: 2250 }] },
      { name: 'Mutton Madrasi Handi',          name_urdu: 'مٹن مدراسی ہانڈی',        price: 4600, variants: [{ name: 'Full', name_urdu: 'فل', price: 4600 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton Zeera Handi',            name_urdu: 'مٹن زیرہ ہانڈی',          price: 4600, variants: [{ name: 'Full', name_urdu: 'فل', price: 4600 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton White Handi',            name_urdu: 'مٹن وائٹ ہانڈی',          price: 4600, variants: [{ name: 'Full', name_urdu: 'فل', price: 4600 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton Makhni Handi',           name_urdu: 'مٹن مکھنی ہانڈی',         price: 4800, variants: [{ name: 'Full', name_urdu: 'فل', price: 4800 }, { name: 'Half', name_urdu: 'ہاف', price: 2600 }] },
      { name: 'Mutton Olive Oil Handi',        name_urdu: 'مٹن زیتون آئل ہانڈی',     price: 4700, variants: [{ name: 'Full', name_urdu: 'فل', price: 4700 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton Desi Ghee Handi',        name_urdu: 'مٹن دیسی گھی ہانڈی',      price: 4700, variants: [{ name: 'Full', name_urdu: 'فل', price: 4700 }, { name: 'Half', name_urdu: 'ہاف', price: 2500 }] },
      { name: 'Mutton Kebab Masala',           name_urdu: 'مٹن کباب مسالہ',           price: 3000, variants: [{ name: 'Full', name_urdu: 'فل', price: 3000 }, { name: 'Half', name_urdu: 'ہاف', price: 1700 }] },
    ]
  },
  {
    category: 'Chicken Karahi',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Chicken Karahi',             name_urdu: 'چکن کڑاہی',              price: 1900, variants: [{ name: 'Full', name_urdu: 'فل', price: 1900 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
      { name: 'Chicken Karahi Black Pepper', name_urdu: 'چکن کڑاہی کالی مرچ',    price: 1900, variants: [{ name: 'Full', name_urdu: 'فل', price: 1900 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
      { name: 'Chicken Karahi Green Chilli', name_urdu: 'چکن کڑاہی سبز مرچ',     price: 1900, variants: [{ name: 'Full', name_urdu: 'فل', price: 1900 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
      { name: 'Chicken Shanwari Karahi',     name_urdu: 'چکن شنواری کڑاہی',      price: 1900, variants: [{ name: 'Full', name_urdu: 'فل', price: 1900 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
      { name: 'Chicken Sulemani Karahi',     name_urdu: 'چکن سلیمانی کڑاہی',     price: 1900, variants: [{ name: 'Full', name_urdu: 'فل', price: 1900 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
      { name: 'Chicken Punjabi Karahi',      name_urdu: 'چکن پنجابی کڑاہی',      price: 1900, variants: [{ name: 'Full', name_urdu: 'فل', price: 1900 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
      { name: 'Chicken Namkeen Karahi',      name_urdu: 'چکن نمکین کڑاہی',       price: 1900, variants: [{ name: 'Full', name_urdu: 'فل', price: 1900 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
      { name: 'Chicken Achari Karahi',       name_urdu: 'چکن اچاری کڑاہی',       price: 2000, variants: [{ name: 'Full', name_urdu: 'فل', price: 2000 }, { name: 'Half', name_urdu: 'ہاف', price: 1100 }] },
      { name: 'Chicken Tikka Karahi',        name_urdu: 'چکن ٹکہ کڑاہی',         price: 2000, variants: [{ name: 'Full', name_urdu: 'فل', price: 2000 }, { name: 'Half', name_urdu: 'ہاف', price: 1100 }] },
      { name: 'FG Special Chicken Karahi',   name_urdu: 'فائرگرل اسپیشل چکن کڑاہی', price: 2000, variants: [{ name: 'Full', name_urdu: 'فل', price: 2000 }, { name: 'Half', name_urdu: 'ہاف', price: 1100 }] },
      { name: 'Chicken Karahi Desi Ghee',    name_urdu: 'چکن کڑاہی دیسی گھی',    price: 2500, variants: [{ name: 'Full', name_urdu: 'فل', price: 2500 }, { name: 'Half', name_urdu: 'ہاف', price: 1300 }] },
      { name: 'Chicken Karahi Olive Oil',    name_urdu: 'چکن کڑاہی زیتون آئل',   price: 2500, variants: [{ name: 'Full', name_urdu: 'فل', price: 2500 }, { name: 'Half', name_urdu: 'ہاف', price: 1300 }] },
      { name: 'Chicken Karahi White',        name_urdu: 'چکن وائٹ کڑاہی',        price: 2200, variants: [{ name: 'Full', name_urdu: 'فل', price: 2200 }, { name: 'Half', name_urdu: 'ہاف', price: 1200 }] },
      { name: 'Chicken Karahi Makhni',       name_urdu: 'چکن کڑاہی مکھنی',       price: 2500, variants: [{ name: 'Full', name_urdu: 'فل', price: 2500 }, { name: 'Half', name_urdu: 'ہاف', price: 1300 }] },
      { name: 'Desi Murg Karahi',            name_urdu: 'دیسی مرغ کڑاہی (زندہ کل)', price: 2600, is_available: false, description: 'Per KG - market rate, order in advance' },
    ]
  },
  {
    category: 'Chicken Handi',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Chicken Handi',          name_urdu: 'چکن ہانڈی',          price: 1900, variants: [{ name: 'Full', name_urdu: 'فل', price: 1900 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
      { name: 'Chicken Achari Handi',   name_urdu: 'چکن اچاری ہانڈی',    price: 2000, variants: [{ name: 'Full', name_urdu: 'فل', price: 2000 }, { name: 'Half', name_urdu: 'ہاف', price: 1100 }] },
      { name: 'Chicken Madrasi Handi',  name_urdu: 'چکن مدراسی ہانڈی',   price: 2100, variants: [{ name: 'Full', name_urdu: 'فل', price: 2100 }, { name: 'Half', name_urdu: 'ہاف', price: 1150 }] },
      { name: 'Chicken Zeera Handi',    name_urdu: 'چکن زیرہ ہانڈی',     price: 2100, variants: [{ name: 'Full', name_urdu: 'فل', price: 2100 }, { name: 'Half', name_urdu: 'ہاف', price: 1150 }] },
      { name: 'Chicken White Handi',    name_urdu: 'چکن وائٹ ہانڈی',     price: 2200, variants: [{ name: 'Full', name_urdu: 'فل', price: 2200 }, { name: 'Half', name_urdu: 'ہاف', price: 1200 }] },
      { name: 'Chicken Makhni Handi',   name_urdu: 'چکن مکھنی ہانڈی',    price: 2500, variants: [{ name: 'Full', name_urdu: 'فل', price: 2500 }, { name: 'Half', name_urdu: 'ہاف', price: 1300 }] },
      { name: 'Chicken Olive Oil Handi', name_urdu: 'چکن زیتون آئل ہانڈی', price: 2500, variants: [{ name: 'Full', name_urdu: 'فل', price: 2500 }, { name: 'Half', name_urdu: 'ہاف', price: 1300 }] },
      { name: 'Chicken Desi Ghee Handi', name_urdu: 'چکن دیسی گھی ہانڈی', price: 2500, variants: [{ name: 'Full', name_urdu: 'فل', price: 2500 }, { name: 'Half', name_urdu: 'ہاف', price: 1300 }] },
      { name: 'Chicken Qeema Handi',    name_urdu: 'چکن قیمہ ہانڈی',     price: 2200, variants: [{ name: 'Full', name_urdu: 'فل', price: 2200 }, { name: 'Half', name_urdu: 'ہاف', price: 1200 }] },
      { name: 'Chicken Jalfarazi',      name_urdu: 'چکن جلفریزی',         price: 1500 },
      { name: 'Chicken Ginger',         name_urdu: 'چکن جنجر',            price: 1500 },
      { name: 'Chicken Kebab Masala',   name_urdu: 'چکن کباب مسالہ',      price: 1600, variants: [{ name: 'Full', name_urdu: 'فل', price: 1600 }, { name: 'Half', name_urdu: 'ہاف', price: 900 }] },
      { name: 'Beef Kebab Masala',      name_urdu: 'بیف کباب مسالہ',      price: 2000, variants: [{ name: 'Full', name_urdu: 'فل', price: 2000 }, { name: 'Half', name_urdu: 'ہاف', price: 1000 }] },
    ]
  },
  {
    category: 'BBQ',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Mutton Namkeen BBQ',          name_urdu: 'مٹن نمکین BBQ',          price: 4500, description: 'Per KG' },
      { name: 'Chicken Namkeen BBQ',         name_urdu: 'چکن نمکین BBQ',          price: 2000, description: 'Per KG' },
      { name: 'Malai Boti',                  name_urdu: 'ملائی بوٹی',             price: 1190, description: '12 Piece' },
      { name: 'Kastoori Boti',               name_urdu: 'کستوری بوٹی',            price: 1290, description: '12 Piece' },
      { name: 'Chatkhara Boti',              name_urdu: 'چٹخارہ بوٹی',            price: 1290, description: '12 Piece' },
      { name: 'Chicken Tikka Boti',          name_urdu: 'چکن ٹکہ بوٹی',          price: 800,  description: '12 Piece' },
      { name: 'Chicken Leg Piece',           name_urdu: 'چکن لیگ پیس',            price: 400  },
      { name: 'Chicken Malai Leg Piece',     name_urdu: 'چکن ملائی لیگ پیس',     price: 450  },
      { name: 'Makhani Leg Piece',           name_urdu: 'مکھنی لیگ پیس',          price: 600  },
      { name: 'Chicken Kabab',               name_urdu: 'چکن کباب',               price: 800,  description: '4 Piece' },
      { name: 'Beef Kabab',                  name_urdu: 'بیف کباب',               price: 920,  description: '4 Piece' },
      { name: 'Mutton Kabab',                name_urdu: 'مٹن کباب',               price: 1600, description: '4 Piece' },
      { name: 'Chicken Raishami Kabab',      name_urdu: 'چکن ریشمی کباب',         price: 1000, description: '4 Piece' },
      { name: 'Beef Raishami Kabab',         name_urdu: 'بیف ریشمی کباب',         price: 1100, description: '4 Piece' },
      { name: 'Mutton Raishami Kabab',       name_urdu: 'مٹن ریشمی کباب',         price: 1800, description: '4 Piece' },
      { name: 'Chicken Gola Kebab',          name_urdu: 'چکن گولہ کباب',          price: 1000, description: '10 Piece' },
      { name: 'Beef Gola Kebab',             name_urdu: 'بیف گولہ کباب',          price: 1200, description: '10 Piece' },
      { name: 'Mutton Gola Kebab',           name_urdu: 'مٹن گولہ کباب',          price: 1500, description: '10 Piece' },
      { name: 'Special Chicken Kebab',       name_urdu: 'سپیشل چکن کباب',         price: 1500, description: '4 Piece' },
      { name: 'Turkish Kebab',               name_urdu: 'ترکش کباب',              price: 1600, description: '4 Piece' },
      { name: 'Matka Boti',                  name_urdu: 'مٹکا بوٹی',              price: 1500 },
    ]
  },
  {
    category: 'BBQ Platters',
    station: 'KITCHEN', requires_prep: true,
    items: [
      {
        name: 'BBQ Platter Large',
        name_urdu: 'بی بی کیو پلیٹر لارج',
        price: 5500,
        description: 'Mutton Kabab 2, Beef Kabab 2, Chicken Kabab 2, Chicken Leg Piece 2, Malai Boti 8, Chicken Boti 8, Kastori Boti 8, Mint Raita, Fresh Salad, Baryani H, Roghni Nan 2, Cold Drink 1.5'
      },
      {
        name: 'BBQ Platter Small',
        name_urdu: 'بی بی کیو پلیٹر سمال',
        price: 3150,
        description: 'Beef Kabab 2, Chicken Kabab 2, Chicken Leg Piece 2, Malai Boti 4, Chicken Boti 4, Mint Raita, Fresh Salad, Roghni Nan 2, Chicken Baryani, Cold Drink'
      },
    ]
  },
  {
    category: 'Tandoor',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Roti Govt',     name_urdu: 'روٹی گورنمنٹ', price: 0,   description: 'As Per Govt Rate' },
      { name: 'Roti Per Head', name_urdu: 'روٹی پر ہیڈ',  price: 120  },
      { name: 'Rogni Nan',     name_urdu: 'روغنی نان',     price: 100  },
      { name: 'Garlic Nan',    name_urdu: 'گارلک نان',     price: 150  },
      { name: 'Kalvanji Nan',  name_urdu: 'کلونجی نان',    price: 150  },
      { name: 'Cheez Nan',     name_urdu: 'چیز نان',       price: 400  },
      { name: 'Chicken Nan',   name_urdu: 'چکن نان',       price: 500  },
      { name: 'Beef Nan',      name_urdu: 'بیف نان',       price: 600  },
      { name: 'Mutton Nan',    name_urdu: 'مٹن نان',       price: 800  },
    ]
  },
  {
    category: 'Rice',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Special Rice',       name_urdu: 'اسپیشل رائس',    price: 1000, variants: [{ name: 'Full', name_urdu: 'فل', price: 1000 }, { name: 'Half', name_urdu: 'ہاف', price: 600 }] },
      { name: 'Chicken Fried Rice', name_urdu: 'چکن فرائیڈ رائس', price: 800,  variants: [{ name: 'Full', name_urdu: 'فل', price: 800  }, { name: 'Half', name_urdu: 'ہاف', price: 500 }] },
      { name: 'Egg Fried Rice',     name_urdu: 'ایگ فرائیڈ رائس', price: 700,  variants: [{ name: 'Full', name_urdu: 'فل', price: 700  }, { name: 'Half', name_urdu: 'ہاف', price: 450 }] },
      { name: 'Plane Rice',         name_urdu: 'پلین رائس',        price: 500  },
      { name: 'Chicken Baryani',    name_urdu: 'چکن بریانی',       price: 800,  variants: [{ name: 'Full', name_urdu: 'فل', price: 800  }, { name: 'Half', name_urdu: 'ہاف', price: 500 }] },
      { name: 'Chicken Plao',       name_urdu: 'چکن پلاؤ',         price: 800,  variants: [{ name: 'Full', name_urdu: 'فل', price: 800  }, { name: 'Half', name_urdu: 'ہاف', price: 500 }] },
      { name: 'Matka Baryani',      name_urdu: 'مٹکا بریانی',      price: 1200 },
      { name: 'Mutton Baryani',     name_urdu: 'مٹن بریانی',       price: 1600 },
      { name: 'Mutton Plao',        name_urdu: 'مٹن پلاؤ',         price: 1500 },
    ]
  },
  {
    category: 'Vegetable & Dal',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Daal Maash',               name_urdu: 'دال ماش',              price: 400 },
      { name: 'Shahi Daal',               name_urdu: 'شاہی دال',              price: 500 },
      { name: 'Daal Makhani',             name_urdu: 'دال مکھنی',             price: 600 },
      { name: 'Mix Vegetable',            name_urdu: 'مکس سبزی',             price: 400 },
      { name: 'Chicken Vegetable',        name_urdu: 'چکن سبزی',             price: 500 },
      { name: 'Chicken Makhani Vegetable', name_urdu: 'چکن مکھنی سبزی',     price: 600 },
    ]
  },
  {
    category: 'Soups',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Special Soup',          name_urdu: 'اسپیشل سوپ',        price: 1500, variants: [{ name: 'Large', name_urdu: 'لارج', price: 1500 }, { name: 'Small', name_urdu: 'سمال', price: 800 }] },
      { name: 'Chicken Corn Soup',     name_urdu: 'چکن کارن سوپ',      price: 1200, variants: [{ name: 'Large', name_urdu: 'لارج', price: 1200 }, { name: 'Small', name_urdu: 'سمال', price: 700 }] },
      { name: 'Chicken Hot Sour Soup', name_urdu: 'چکن ہاٹ اینڈ ساور سوپ', price: 1300, variants: [{ name: 'Large', name_urdu: 'لارج', price: 1300 }, { name: 'Small', name_urdu: 'سمال', price: 800 }] },
      { name: 'Vegetable Soup',        name_urdu: 'سبزیوں کا سوپ',     price: 1000, variants: [{ name: 'Large', name_urdu: 'لارج', price: 1000 }, { name: 'Small', name_urdu: 'سمال', price: 500 }] },
    ]
  },
  {
    category: 'Chinese',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Chicken Manchurian',        name_urdu: 'چکن منچورین',            price: 1500 },
      { name: 'Chicken Garlic',            name_urdu: 'چکن گارلک',              price: 1500 },
      { name: 'Chicken Shashlik With Rice', name_urdu: 'چکن شاشلک (دو رائس)',   price: 1600 },
      { name: 'Chicken Chow Mein',         name_urdu: 'چکن چاؤمین',             price: 1500 },
    ]
  },
  {
    category: 'Dry & Fry',
    station: 'KITCHEN', requires_prep: true,
    items: [
      { name: 'Chicken Dhaka',     name_urdu: 'چکن ڈھاکہ',    price: 1700 },
      { name: 'Chicken Adabo Bone', name_urdu: 'چکن آڈابون',  price: 1800 },
      { name: 'Fries',             name_urdu: 'فرائیز',        price: 500  },
    ]
  },
  {
    category: 'Salad Bar',
    station: 'COLD', requires_prep: false,
    items: [
      { name: 'Russian Salad', name_urdu: 'رشین سلاد', price: 1500, variants: [{ name: 'Large', name_urdu: 'لارج', price: 1500 }, { name: 'Medium', name_urdu: 'میڈیم', price: 1000 }, { name: 'Small', name_urdu: 'سمال', price: 700 }] },
      { name: 'Kachomer Salad', name_urdu: 'کچومر سلاد', price: 400 },
      { name: 'Fresh Salad',   name_urdu: 'فریش سلاد',  price: 150 },
      { name: 'Raita',         name_urdu: 'رائتہ',       price: 150 },
      { name: 'Mint Raita',    name_urdu: 'منٹ رائتہ',   price: 150 },
    ]
  },
  {
    category: 'Hot & Cold',
    station: 'BAR', requires_prep: false,
    items: [
      { name: 'Tea Gurr Wali',        name_urdu: 'چائے گڑ والی',     price: 150 },
      { name: 'Tea',                  name_urdu: 'چائے',              price: 120 },
      { name: 'Green Tea',            name_urdu: 'گرین ٹی',           price: 90  },
      { name: 'Tin Pack',             name_urdu: 'ٹن پیک',            price: 150 },
      { name: 'Cold Drink 1 Litre',   name_urdu: 'کولڈ ڈرنک 1 لیٹر', price: 200 },
      { name: 'Mineral Water 1.5 Liter', name_urdu: 'منرل واٹر 1.5 لیٹر', price: 120 },
      { name: 'Mineral Water Small',  name_urdu: 'منرل واٹر سمال',   price: 70  },
      { name: 'Cold Drink 1.5 Litre', name_urdu: 'کولڈ ڈرنک 1.5 لیٹر', price: 220 },
      { name: 'Fresh Lime 7up',       name_urdu: 'فریش لائم 7up',    price: 200 },
      { name: 'Mint Margarita',       name_urdu: 'منٹ مارگریٹا',     price: 300 },
      { name: 'Diet Tin Pack',        name_urdu: 'ڈائٹ ٹن پیک',      price: 150 },
    ]
  },
  {
    category: 'Shake Bar',
    station: 'BAR', requires_prep: false,
    items: [
      { name: 'Milk Shake',                name_urdu: 'ملک شیک',             price: 350, description: 'Banana, Apple, Strawberry, Mango' },
      { name: 'Milk Shake with Ice Cream', name_urdu: 'ملک شیک ودآئس کریم', price: 450, description: 'Mango, Vanilla, Qulfa, Chocolate' },
      { name: 'Ice Cream Scoop',           name_urdu: 'آئس کریم سکوپ',       price: 300, description: 'Mango, Vanilla, Qulfa, Chocolate' },
    ]
  },
  {
    category: 'Deals',
    station: 'KITCHEN', requires_prep: true,
    items: [
      {
        name: 'Friends Family Deal Chicken',
        name_urdu: 'فرینڈز فیملی ڈیل چکن',
        price: 6000,
        description: 'Chicken Karahi F, Special Rice F, Malai Boti 12pc, Chicken Kebab 4pc, Raita, Salad, Roti 4 Person, Cold Drink 1.5, Mineral Water 1.5'
      },
      {
        name: 'Friends Family Deal Mutton',
        name_urdu: 'فرینڈز فیملی ڈیل مٹن',
        price: 9000,
        description: 'Mutton Karahi F, Special Rice F, Malai Boti 12pc, Chicken Kebab 4pc, Raita, Salad, Roti 4 Person, Cold Drink 1.5, Mineral Water 1.5'
      },
    ]
  },
  {
    category: 'Special',
    station: 'KITCHEN', requires_prep: true,
    items: [
      {
        name: 'Salam Bakra Full Steam',
        name_urdu: 'سلام بکرا فل سٹیم',
        price: 50000,
        is_available: false,
        description: 'Full Steam Bakra With Rice 8kg/9kg. Order 1 day in advance. Minimum 50% advance required.'
      },
      { name: 'Finger Fish Fri',   name_urdu: 'فنگر فش فرائی',  price: 0, is_available: false, description: 'Market rate - seasonal' },
      { name: 'Finger Fish Tikka', name_urdu: 'فنگر فش ٹکہ',    price: 0, is_available: false, description: 'Market rate - seasonal' },
      { name: 'Raho Grill Fish',   name_urdu: 'رہو گرل فش',     price: 0, is_available: false, description: 'Market rate - seasonal' },
      { name: 'Raho Fri Fish',     name_urdu: 'رہو فرائی فش',   price: 0, is_available: false, description: 'Market rate - seasonal' },
      { name: 'Chira Fri Fish',    name_urdu: 'چیڑا فرائی فش',  price: 0, is_available: false, description: 'Market rate - seasonal' },
      { name: 'Chira Grill Fish',  name_urdu: 'چیڑا گرل فش',   price: 0, is_available: false, description: 'Market rate - seasonal' },
      { name: 'Desi Murgh Zinda',  name_urdu: 'دیسی مرغ زندہ', price: 2600, is_available: false, description: 'Per KG - order in advance' },
    ]
  },
];

async function main() {
    let catUpserted = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;
    let variantsCreated = 0;

    console.log('🚀 Starting Fire Grill Seeding...');

    // 1. Get Categories mapping
    const catMap = new Map();
    for (const cat of categories) {
        const result = await prisma.menu_categories.upsert({
            where: { restaurant_id_name: { restaurant_id: RESTAURANT_ID, name: cat.name } },
            update: { name_urdu: cat.name_urdu, priority: cat.priority },
            create: { restaurant_id: RESTAURANT_ID, ...cat }
        });
        catMap.set(cat.name, result.id);
        catUpserted++;
    }

    // 2. Process Menu Items
    for (const section of menuData) {
        const categoryId = catMap.get(section.category);
        if (!categoryId) {
            console.error(`❌ Category not found: ${section.category}`);
            continue;
        }

        for (const itemData of section.items) {
            const { variants, ...baseItem } = itemData as any;
            
            const existing = await prisma.menu_items.findFirst({
                where: { restaurant_id: RESTAURANT_ID, name: baseItem.name }
            });

            let itemId: string;
            if (existing) {
                const result = await prisma.menu_items.update({
                    where: { id: existing.id },
                    data: {
                        name_urdu: baseItem.name_urdu,
                        price: baseItem.price,
                        is_available: baseItem.is_available ?? true,
                        description: baseItem.description,
                        category_id: categoryId,
                        category: section.category,
                        station: section.station,
                        requires_prep: section.requires_prep
                    }
                });
                itemId = result.id;
                itemsUpdated++;
            } else {
                const result = await prisma.menu_items.create({
                    data: {
                        restaurant_id: RESTAURANT_ID,
                        name: baseItem.name,
                        name_urdu: baseItem.name_urdu,
                        price: baseItem.price,
                        category: section.category,
                        description: baseItem.description,
                        is_available: baseItem.is_available ?? true,
                        category_id: categoryId,
                        station: section.station,
                        requires_prep: section.requires_prep
                    }
                });
                itemId = result.id;
                itemsCreated++;
            }

            // 3. Process Variants
            if (variants && variants.length > 0) {
                // Delete existing variants for this item
                await prisma.menu_item_variants.deleteMany({
                    where: { menu_item_id: itemId }
                });

                // Create new variants
                for (const v of variants) {
                    await prisma.menu_item_variants.create({
                        data: {
                            menu_item_id: itemId,
                            name: v.name,
                            name_urdu: v.name_urdu,
                            price: v.price
                        }
                    });
                    variantsCreated++;
                }
            }
        }
    }

    console.log('\n✅ SEEDING SUMMARY:');
    console.log(`- Categories created/updated: ${catUpserted}`);
    console.log(`- Items created: ${itemsCreated}`);
    console.log(`- Items updated: ${itemsUpdated}`);
    console.log(`- Variants created: ${variantsCreated}`);
}

main()
    .catch(e => {
        console.error('❌ SEEDING FAILED:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
