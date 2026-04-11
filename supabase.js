// supabase.js

// IMPORTANT: Replace these placeholders with your actual Supabase project URL and Anon Key
const SUPABASE_URL = 'https://njwzfbstfyfdztujafjo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CQhz2yjwFfbafQyICxi8AQ_TscbwPfv';

// Initialize Supabase client
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth Functions
export async function login(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signup(email, password) {
  return await supabase.auth.signUp({ email, password });
}

export async function logout() {
  return await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error("Error getting session:", error);
  return session?.user || null;
}

// Database Functions (Using Auth UID implicitly via RLS but explicitly passing where needed)
export async function createOrder(orderData) {
  const user = await getCurrentUser();
  if (!user) return { error: { message: "Not authenticated" } };
  
  return await supabase.from('orders').insert([{ ...orderData, user_id: user.id }]);
}

export async function createDonation(donationData) {
  const user = await getCurrentUser();
  if (!user) return { error: { message: "Not authenticated" } };
  
  return await supabase.from('donations').insert([{ ...donationData, user_id: user.id }]);
}

export async function createDeliveryPartner(partnerData) {
  // Assuming delivery_partners doesn't strictly need user_id, but good practice if it's tied.
  // Using auth uid for completeness.
  const user = await getCurrentUser();
  if (!user) return { error: { message: "Not authenticated" } };

  return await supabase.from('delivery_partners').insert([{ ...partnerData, id: user.id }]);
}

export async function createContact(contactData) {
  return await supabase.from('contacts').insert([contactData]);
}

// Analytics / Dashboard functions
export async function getUserOrders() {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: { message: "Not authenticated" } };
  
  return await supabase
    .from('orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
}

export async function getUserDonations() {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: { message: "Not authenticated" } };
  
  return await supabase
    .from('donations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
}
