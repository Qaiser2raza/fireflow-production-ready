import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fyuxpkbsjjuunfqldeey.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXhwa2Jzamp1dW5mcWxkZWV5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwODUxMywiZXhwIjoyMDg3Mjg0NTEzfQ.tFOJhuptaUKEpNA0WYlC_FlvRP4ZGB-HGNeqPr-MpMQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- SUPABASE SaaS SCHEMA INQUIRY ---');
  
  // 1. Query restaurants_cloud
  console.log('Querying restaurants_cloud...');
  const { data: cloudData, error: cloudError } = await supabase
    .from('restaurants_cloud')
    .select('*')
    .order('created_at', { ascending: false });

  if (cloudError) {
    console.error('Error fetching restaurants_cloud:', cloudError);
  } else {
    console.log('Restaurants Cloud result:');
    console.log(JSON.stringify(cloudData, null, 2));
  }

  // 2. Query restaurants
  console.log('\nQuerying restaurants...');
  const { data: restData, error: restError } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false });

  if (restError) {
    console.error('Error fetching restaurants:', restError);
  } else {
    console.log('Restaurants result:');
    console.log(JSON.stringify(restData, null, 2));
  }
}

run();
