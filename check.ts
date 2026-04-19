import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const items = await p.menu_items.count({where:{restaurant_id:'b1972d7d-8374-4b55-9580-95a15f18f656'}});
  const variants = await p.menu_item_variants.count();
  const cats = await p.menu_categories.count({where:{restaurant_id:'b1972d7d-8374-4b55-9580-95a15f18f656'}});
  console.log('Items:', items, '| Variants:', variants, '| Categories:', cats);
  const karahi = await p.menu_items.findFirst({
    where:{name:'Mutton Karahi', restaurant_id:'b1972d7d-8374-4b55-9580-95a15f18f656'},
    include:{menu_item_variants:true}
  });
  console.log('Karahi variants:', JSON.stringify(karahi?.menu_item_variants));
  const noPrep = await p.menu_items.findMany({
    where:{restaurant_id:'b1972d7d-8374-4b55-9580-95a15f18f656', requires_prep:false},
    select:{name:true, station:true}
  });
  console.log('No-prep items:', noPrep.length, JSON.stringify(noPrep.map(i=>i.name)));
  await p.$disconnect();
}
main().catch(console.error);
