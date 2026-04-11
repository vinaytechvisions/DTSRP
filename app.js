import { 
  login, signup, logout, getCurrentUser, 
  createOrder, createDonation, createDeliveryPartner, createContact,
  getUserOrders, getUserDonations, supabase
} from './supabase.js';
import { showToast, setLoading, formatDate, generateEmptyState } from './utils.js';

let currentUser = null;

// DOM Elements
const authView = document.getElementById('auth-view');
const mainAppView = document.getElementById('main-app-view');
const navLinks = document.querySelectorAll('[data-route]');
const views = document.querySelectorAll('.view');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileNavGroup = document.getElementById('main-nav');

// Init App
async function init() {
  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    await updateAppView();
  });

  currentUser = await getCurrentUser();
  await updateAppView();
  setupEventListeners();
}

async function updateAppView() {
  if (currentUser) {
    authView.style.display = 'none';
    mainAppView.style.display = 'block';
    
    // Default to dashboard when logging in
    const activeRoute = document.querySelector('.view.active')?.id.replace('view-', '') || 'dashboard';
    navigateTo(activeRoute);
  } else {
    authView.style.display = 'flex';
    mainAppView.style.display = 'none';
  }
}

function setupEventListeners() {
  // Navigation
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = e.target.getAttribute('data-route');
      if(route === 'logout') {
        handleLogout();
      } else {
        navigateTo(route);
        // collapse mobile nav if open
        if(mobileNavGroup) mobileNavGroup.classList.remove('active');
      }
    });
  });

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileNavGroup.classList.toggle('active');
    });
  }

  // Auth Submit
  const authForm = document.getElementById('auth-form');
  if(authForm) {
    authForm.addEventListener('submit', handleAuthSubmit);
  }

  const toggleAuthLink = document.getElementById('toggle-auth');
  if(toggleAuthLink) {
    toggleAuthLink.addEventListener('click', (e) => {
      e.preventDefault();
      toggleAuthMode();
    });
  }

  // Feature Forms
  const forms = {
    'order-form': handleOrderSubmit,
    'donate-form': handleDonateSubmit,
    'partner-form': handlePartnerSubmit,
    'contact-form': handleContactSubmit
  };

  for (const [id, handler] of Object.entries(forms)) {
    const formEl = document.getElementById(id);
    if(formEl) formEl.addEventListener('submit', handler);
  }

  const dFilter = document.getElementById('dashboard-filter');
  if(dFilter) dFilter.addEventListener('change', applyDashboardFilter);
}

function navigateTo(route) {
  // If not logged in, ignore
  if (!currentUser) return;

  // Update nav UI
  navLinks.forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`[data-route="${route}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Update Views
  views.forEach(v => {
    v.classList.remove('active');
    if (v.id === `view-${route}`) {
      v.classList.add('active');
    }
  });

  // Execute route specific scripts
  if (route === 'dashboard') {
    loadDashboard();
  }
}

// --- Route Specific Logic ---

let currentOrders = [];
let currentDonations = [];

async function loadDashboard() {
  const ordersListEl = document.getElementById('user-orders-list');
  const donationsListEl = document.getElementById('user-donations-list');
  
  if(ordersListEl) ordersListEl.innerHTML = '<div class="spinner"></div> Loading...';
  if(donationsListEl) donationsListEl.innerHTML = '<div class="spinner"></div> Loading...';

  try {
    const [ordersResponse, donationsResponse] = await Promise.all([
      getUserOrders(),
      getUserDonations()
    ]);

    if (ordersResponse.error) throw ordersResponse.error;
    if (donationsResponse.error) throw donationsResponse.error;

    currentOrders = ordersResponse.data;
    currentDonations = donationsResponse.data;

    applyDashboardFilter();
  } catch (error) {
    showToast(error.message || "Failed to load dashboard data.", 'error');
  }
}

function applyDashboardFilter() {
  const filter = document.getElementById('dashboard-filter')?.value || 'all';
  const ordersListEl = document.getElementById('user-orders-list');
  const donationsListEl = document.getElementById('user-donations-list');
  
  const isCompleted = (s) => ['delivered', 'collected'].includes(s?.toLowerCase());

  const fOrders = currentOrders.filter(o => 
    filter === 'all' ? true :
    filter === 'completed' ? isCompleted(o.status) : !isCompleted(o.status)
  );

  const fDonations = currentDonations.filter(d => 
    filter === 'all' ? true :
    filter === 'completed' ? isCompleted(d.status) : !isCompleted(d.status)
  );

  renderList(ordersListEl, fOrders, 'orders');
  renderList(donationsListEl, fDonations, 'donations');
}

function renderList(container, items, type) {
  if (!items || items.length === 0) {
    const ctaText = type === 'orders' ? 'Order Now' : 'Donate Now';
    const ctaRoute = type === 'orders' ? 'order' : 'donate';
    container.innerHTML = generateEmptyState(`No ${type} yet`, `You haven't made any ${type} yet.`, ctaText, ctaRoute);
    return;
  }

  container.innerHTML = items.map(item => {
    const title = type === 'orders' ? item.food_item : item.food_details;
    const qty = item.quantity;
    const desc = type === 'orders' ? item.address : item.location;
    const status = item.status || (type === 'orders' ? 'Placed' : 'Pending');
    const date = formatDate(item.created_at);

    return `
      <div class="list-item">
        <div style="flex: 1; padding-right: 12px;">
          <div class="item-title">${title} (x${qty})</div>
          <div class="item-meta" style="margin-bottom: 4px; line-height: 1.4;">📍 ${desc}</div>
          <div class="item-meta">${date}</div>
        </div>
        <div>
          <span class="item-status">${status}</span>
        </div>
      </div>
    `;
  }).join('');
}

// --- Form Handlers ---

let isSignupMode = false;

function toggleAuthMode() {
  isSignupMode = !isSignupMode;
  document.getElementById('auth-title').innerText = isSignupMode ? 'Create Account' : 'Welcome Back';
  document.getElementById('auth-submit-btn').innerText = isSignupMode ? 'Sign Up' : 'Log In';
  document.getElementById('auth-toggle-text').innerText = isSignupMode ? 'Already have an account?' : 'Need an account?';
  const a = document.getElementById('toggle-auth');
  a.innerText = isSignupMode ? 'Log In' : 'Sign Up';

  const signupFields = document.getElementById('signup-fields');
  if(signupFields) {
    signupFields.style.display = isSignupMode ? 'block' : 'none';
    const extraInputs = signupFields.querySelectorAll('input, select');
    extraInputs.forEach(input => input.required = isSignupMode);
  }
}

let isAuthCooldown = false;

async function handleAuthSubmit(e) {
  e.preventDefault();

  if (isSignupMode && isAuthCooldown) {
    showToast('Please wait before trying again', 'warning');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);

  const email = e.target.email.value;
  const password = e.target.password.value;
  
  let userData = {};
  if (isSignupMode) {
    userData = {
      first_name: e.target.first_name.value,
      last_name: e.target.last_name.value,
      mobile_number: e.target.mobile_number.value,
      country: e.target.country.value
    };
  }

  try {
    const { data, error } = isSignupMode 
      ? await signup(email, password, userData)
      : await login(email, password);
    
    if (error) throw error;

    if (isSignupMode) {
      if (data?.session) {
        showToast('Account created and logged in directly!', 'success');
      } else {
        showToast('Account created! Please check your email to verify.', 'success');
      }
      setLoading(btn, false);
    } else {
      showToast('Logged in successfully', 'success');
      setLoading(btn, false);
    }
  } catch (err) {
    console.error("Auth Error:", err);
    let errMsg = err.message || 'Authentication error';
    
    if (isSignupMode) {
      const lowerErr = errMsg.toLowerCase();
      if (err.status === 429 || lowerErr.includes('rate limit')) {
        errMsg = 'Too many signup attempts. Please login or try again later.';
      } else if (lowerErr.includes('already registered') || lowerErr.includes('exists') || lowerErr.includes('registered')) {
        errMsg = 'Use Login if already registered';
      }
    }
    
    showToast(errMsg, 'error');
    
    if (isSignupMode) {
      isAuthCooldown = true;
      btn.innerHTML = 'Please wait...';
      
      setTimeout(() => {
        isAuthCooldown = false;
        setLoading(btn, false);
      }, 5000);
    } else {
      setLoading(btn, false);
    }
  }
}

async function handleLogout() {
  try {
    const { error } = await logout();
    if(error) throw error;
    showToast('Logged out successfully', 'success');
  } catch(err) {
    showToast(err.message, 'error');
  }
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  if(!currentUser) { showToast('Please login first', 'error'); return; }

  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);

  const orderData = {
    food_item: e.target.food_item.value,
    quantity: parseInt(e.target.quantity.value, 10),
    address: e.target.address.value,
    contact: e.target.contact.value,
    payment_method: e.target.payment_method.value,
    status: 'placed'
  };

  try {
    const { error } = await createOrder(orderData);
    if(error) throw error;

    showToast('Order placed successfully!', 'success');
    e.target.reset();
    navigateTo('dashboard');
  } catch (err) {
    console.error("Order Submit Error:", err);
    showToast(err.message || 'Failed to place order', 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function handleDonateSubmit(e) {
  e.preventDefault();
  if(!currentUser) { showToast('Please login first', 'error'); return; }

  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);

  const donationData = {
    food_details: e.target.food_details.value,
    quantity: parseInt(e.target.quantity.value, 10),
    location: e.target.location.value,
    contact: e.target.contact.value,
    status: 'pending'
  };

  try {
    const { error } = await createDonation(donationData);
    if(error) throw error;

    showToast('Donation registered! Thank you!', 'success');
    e.target.reset();
    navigateTo('dashboard');
  } catch (err) {
    console.error("Donation Submit Error:", err);
    showToast(err.message || 'Failed to register donation', 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function handlePartnerSubmit(e) {
  e.preventDefault();
  if(!currentUser) { showToast('Please login first', 'error'); return; }

  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);

  const partnerData = {
    name: e.target.name.value,
    phone: e.target.phone.value,
    location: e.target.location.value,
    vehicle: e.target.vehicle.value
  };

  try {
    const { error } = await createDeliveryPartner(partnerData);
    if(error) throw error;

    showToast('Registered as Delivery Partner!', 'success');
    e.target.reset();
    navigateTo('dashboard');
  } catch (err) {
    console.error("Delivery Partner Submit Error:", err);
    showToast(err.message || 'Failed to register', 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function handleContactSubmit(e) {
  e.preventDefault();

  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);

  const contactData = {
    name: e.target.name.value,
    email: e.target.email.value,
    message: e.target.message.value
  };

  try {
    const { error } = await createContact(contactData);
    if(error) throw error;

    showToast('Message sent successfully!', 'success');
    e.target.reset();
  } catch (err) {
    showToast(err.message || 'Failed to send message', 'error');
  } finally {
    setLoading(btn, false);
  }
}

// Start
document.addEventListener('DOMContentLoaded', init);
