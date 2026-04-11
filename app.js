import { 
    login, signup, logout, getCurrentUser, createOrder, createDonation, 
    createDeliveryPartner, createContact, getUserOrders, getUserDonations, supabase 
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
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const route = e.currentTarget.getAttribute('data-route');
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

    // Order Form - COMPLETE WORKING FIX
    const orderForm = document.getElementById('order-form');
    const checkoutBtn = document.getElementById('order-submit-btn');
    const foodItemInput = document.getElementById('order-food-item');
    const orderQtyInput = document.getElementById('order-quantity');

    if (orderForm) {
        // Watch all form fields to enable checkout
        const formFields = orderForm.querySelectorAll('input, textarea, select');
        formFields.forEach(field => {
            field.addEventListener('input', checkFormReady);
        });
    }

    function checkFormReady() {
        const address = document.querySelector('#order-address')?.value.trim();
        const contact = document.querySelector('#order-contact')?.value.trim();
        const payment = document.querySelector('#order-payment')?.value;
        
        const isReady = address && contact && payment;
        if (checkoutBtn) {
            checkoutBtn.disabled = !isReady;
            checkoutBtn.style.opacity = isReady ? '1' : '0.6';
        }
    }

    if (foodItemInput) {
        foodItemInput.addEventListener('input', updateCostBreakdown);
    }
    if (orderQtyInput) {
        orderQtyInput.addEventListener('input', updateCostBreakdown);
    }

    // Autocomplete setup
    const autocompleteList = document.getElementById('food-autocomplete-list');
    if (foodItemInput && autocompleteList) {
        foodItemInput.addEventListener('input', function() {
            const val = this.value.toLowerCase().trim();
            autocompleteList.innerHTML = '';
            
            if (!val) {
                autocompleteList.style.display = 'none';
                return;
            }

            const matches = Object.keys(FOOD_PRICES).filter(item => item.includes(val));
            
            if (matches.length > 0) {
                autocompleteList.style.display = 'block';
                matches.forEach(match => {
                    const li = document.createElement('li');
                    li.className = 'autocomplete-item';
                    const displayString = match.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    li.innerHTML = displayString.replace(new RegExp(`(${val})`, "gi"), "<strong>$1</strong>") + `<span style="float: right; color: var(--text-muted);">₹${FOOD_PRICES[match]}</span>`;
                    li.addEventListener('click', () => {
                        foodItemInput.value = displayString;
                        autocompleteList.style.display = 'none';
                        updateCostBreakdown();
                    });
                    autocompleteList.appendChild(li);
                });
            } else {
                autocompleteList.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== foodItemInput) autocompleteList.style.display = 'none';
        });
    }

    // Initialize checkout button state
    setTimeout(() => {
        checkFormReady();
        updateCostBreakdown();
    }, 100);

    setupPaymentTrackingModals();
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

window.navigateTo = navigateTo; // Expose globally for dashboard buttons

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
        container.innerHTML = generateEmptyState(
            `No ${type} yet`, 
            `You haven't made any ${type} yet.`, 
            ctaText, 
            ctaRoute
        );
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
        console.error("Auth Error: - app.js:350", err);
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

// FIXED ORDER SUBMIT - WORKS PERFECTLY
async function handleOrderSubmit(e) {
    e.preventDefault();
    
    if(!currentUser) {
        showToast('Please login first', 'error');
        return;
    }
    
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);
    
    // Get form data - SAFE VERSION
    const foodItem = document.getElementById('order-food-item')?.value?.trim() || '';
    const quantity = parseInt(document.getElementById('order-quantity')?.value) || 1;
    const address = e.target.address?.value?.trim() || '';
    const contact = e.target.contact?.value?.trim() || '';
    const paymentMethod = e.target.payment_method?.value || '';
    
    if(!foodItem) {
        showToast('Please enter food item first', 'error');
        setLoading(btn, false);
        return;
    }
    
    if(!address || !contact) {
        showToast('Please fill address and contact', 'error');
        setLoading(btn, false);
        return;
    }
    
    const orderData = {
        food_item: foodItem,
        quantity: quantity,
        address: address,
        contact: contact,
        payment_method: paymentMethod,
        status: 'placed'
    };
    
    try {
        if (paymentMethod === 'Online') {
            pendingOrderData = orderData;
            pendingTargetForm = e.target;
            document.getElementById('payment-modal').style.display = 'flex';
            document.getElementById('payment-total-amount').innerText = `₹${currentOrderTotal.toFixed(2) || '0.00'}`;
        } else {
            await processOrderSave(orderData, e.target);
        }
    } catch (err) {
        console.error("Order Error: - app.js:437", err);
        showToast(err.message || 'Order failed', 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function processOrderSave(orderData, formEl) {
    const btn = formEl.querySelector('button[type="submit"]');
    try {
        const { error } = await createOrder(orderData);
        if(error) throw error;

        showToast('Order placed successfully! 🍛 Tracking started...', 'success');
        formEl.reset();
        document.getElementById('order-food-item').value = '';
        document.getElementById('order-quantity').value = '1';
        document.getElementById('cart-breakdown')?.style.setProperty('display', 'none');
        navigateTo('dashboard');

        // SHOW TRACKING MODAL
        setTimeout(() => showTrackingModal('order'), 1000);

    } catch (err) {
        console.error("Order Save Error: - app.js:461", err);
        showToast(err.message || 'Failed to save order', 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function handleDonateSubmit(e) {
    e.preventDefault();

    if(!currentUser) {
        showToast('Please login first', 'error');
        return;
    }

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

        showToast('Donation registered! 🥗 Partner assigned...', 'success');
        e.target.reset();
        navigateTo('dashboard');

        // SHOW TRACKING MODAL FOR DONATION PICKUP
        setTimeout(() => showTrackingModal('donate'), 1000);

    } catch (err) {
        console.error("Donation Submit Error: - app.js:499", err);
        showToast(err.message || 'Failed to register donation', 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function handlePartnerSubmit(e) {
    e.preventDefault();

    if(!currentUser) {
        showToast('Please login first', 'error');
        return;
    }

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

        showToast('Registered as Delivery Partner! 🚀', 'success');
        e.target.reset();
        navigateTo('dashboard');
    } catch (err) {
        console.error("Delivery Partner Submit Error: - app.js:532", err);
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

        showToast('Message sent successfully! 📧', 'success');
        e.target.reset();
    } catch (err) {
        showToast(err.message || 'Failed to send message', 'error');
    } finally {
        setLoading(btn, false);
    }
}

// --- Cost Breakdown, Payment & Map Logic ---
const FOOD_PRICES = {
    // Indian - HALVED PRICES
    "biryani": 90,
    "chicken biryani": 110,
    "veg biryani": 80,
    "dosa": 25,
    "masala dosa": 35,
    "idli": 20,
    "vada": 22,
    "paneer butter masala": 100,
    "roti": 10,
    "naan": 17,
    "dal": 60,
    "fried rice": 75,
    // Fast Food - HALVED
    "burger": 60,
    "pizza": 125,
    "fries": 45,
    "sandwich": 50,
    "hot dog": 65,
    // Chinese - HALVED
    "noodles": 70,
    "hakka noodles": 80,
    "manchurian": 85,
    "spring rolls": 75,
    // Desserts - HALVED
    "ice cream": 40,
    "cake": 150,
    "gulab jamun": 30,
    "brownie": 60,
    // Drinks - HALVED
    "coffee": 30,
    "tea": 15,
    "juice": 45,
    "milkshake": 60,
    "soft drink": 25
};

let currentOrderTotal = 0;
const ORG_FEE_PCT = 0.05;

function updateCostBreakdown() {
    const qtyInput = document.getElementById('order-quantity');
    const foodInput = document.getElementById('order-food-item');

    if(!qtyInput || !foodInput) return;

    const qty = parseInt(qtyInput.value) || 0;
    const itemName = foodInput.value.trim();

    // Only show breakdown when food is entered and quantity > 0
    if(qty < 1 || itemName === '') {
        const breakdown = document.getElementById('cart-breakdown');
        if(breakdown) breakdown.style.display = 'none';
        return;
    }

    const lowerName = itemName.toLowerCase();
    let basePrice = 100;
    let isUnknown = true;

    if (FOOD_PRICES[lowerName]) {
        basePrice = FOOD_PRICES[lowerName];
        isUnknown = false;
    } else {
        // Check partial string matching
        const partialKey = Object.keys(FOOD_PRICES).find(k => lowerName.includes(k) || k.includes(lowerName));
        if (partialKey) {
            basePrice = FOOD_PRICES[partialKey];
            isUnknown = false;
        }
    }

    // Distance simulation
    let hash = 0;
    for(let i = 0; i < lowerName.length; i++) hash = lowerName.charCodeAt(i) + ((hash << 5) - hash);
    let distance = Math.abs(hash) % 9 + 2;
    if (isNaN(distance)) distance = 5;

    let ratePerKm = Math.abs(hash >> 2) % 6 + 5;
    if (isNaN(ratePerKm)) ratePerKm = 8;

    const deliveryFee = distance * ratePerKm;
    const totalCost = qty * basePrice;
    const orgFee = totalCost * ORG_FEE_PCT;

    const userPays = totalCost;
    currentOrderTotal = userPays;

    // Safe element updates
    const elements = {
        'cb-subtotal': totalCost.toFixed(2),
        'cb-org-fee': orgFee.toFixed(2),
        'cb-distance': distance.toFixed(1),
        'cb-delivery-fee': deliveryFee.toFixed(2),
        'cb-total-cost': userPays.toFixed(2)
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if(el) el.innerText = `₹${value}`;
    });

    const paymentAmount = document.getElementById('payment-total-amount');
    if(paymentAmount) paymentAmount.innerText = `₹${userPays.toFixed(2)}`;

    const breakdown = document.getElementById('cart-breakdown');
    if(breakdown) breakdown.style.display = 'block';
}

let pendingOrderData = null;
let pendingTargetForm = null;
let leafletMap = null;

function setupPaymentTrackingModals() {
    const cancelBtn = document.getElementById('cancel-payment-btn');
    const confirmBtn = document.getElementById('confirm-payment-btn');
    const closeTrackBtn = document.getElementById('close-tracking-btn');
    const pOpts = document.querySelectorAll('.payment-option');

    if(pOpts) {
        pOpts.forEach(opt => {
            opt.addEventListener('click', function() {
                pOpts.forEach(o => o.classList.remove('border-active'));
                this.classList.add('border-active');
            });
        });
    }

    if(cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('payment-modal').style.display = 'none';
            if(pendingTargetForm) {
                setLoading(pendingTargetForm.querySelector('button[type="submit"]'), false);
            }
            pendingOrderData = null;
            pendingTargetForm = null;
        });
    }

    if(confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const processingDiv = document.getElementById('payment-processing');
            const actionDiv = document.getElementById('payment-actions');

            processingDiv.style.display = 'block';
            actionDiv.style.display = 'none';

            // Simulate payment delay
            await new Promise(r => setTimeout(r, 2000));

            document.getElementById('payment-modal').style.display = 'none';
            processingDiv.style.display = 'none';
            actionDiv.style.display = 'flex';

            if(pendingOrderData && pendingTargetForm) {
                await processOrderSave(pendingOrderData, pendingTargetForm);
                pendingOrderData = null;
                pendingTargetForm = null;
            }
        });
    }

    if(closeTrackBtn) {
        closeTrackBtn.addEventListener('click', () => {
            document.getElementById('tracking-modal').style.display = 'none';
        });
    }
}

function showTrackingModal(type) {
    document.getElementById('tracking-modal').style.display = 'flex';

    const isOrder = type === 'order';
    document.getElementById('tracking-title').innerText = isOrder ? '🍛 Out for Delivery' : '🚚 Pickup En Route';

    // Dynamic tracking data
    const etaMinutes = Math.floor(Math.random() * 10) + 10; // 10-20 mins
    const distanceKm = (Math.random() * 3 + 1).toFixed(1); // 1-4 km

    document.getElementById('track-eta').innerText = `${etaMinutes} mins`;
    document.getElementById('track-distance').innerText = `${distanceKm} km`;

    // Realistic delivery partners (Hyderabad based)
    const partners = [
        { name: 'Raju Bike Service', phone: '+91 93474 38360', vehicle: 'Activa - TS09 EB 1234' },
        { name: 'Vikram Quick Delivery', phone: '+91 99887 76655', vehicle: 'Pulsar - TS07 AB 5678' },
        { name: 'Anil Express', phone: '+91 88776 65544', vehicle: 'Honda - TS12 CD 9999' },
        { name: 'Suresh Fast Food Runner', phone: '+91 90000 12345', vehicle: 'Scooty - TS15 EF 4321' }
    ];

    const assignedPartner = partners[Math.floor(Math.random() * partners.length)];

    // Phase 1: Assigning (2 sec)
    document.getElementById('track-partner-name').innerText = '🔄 Assigning Partner...';
    document.getElementById('track-partner-vehicle').innerText = 'Finding nearest rider';

    const callBtn = document.getElementById('track-call-btn');
    if (callBtn) {
        callBtn.style.pointerEvents = 'none';
        callBtn.style.opacity = '0.5';
        callBtn.removeAttribute('href');
    }

    setTimeout(() => {
        // Phase 2: Assigned (show details)
        document.getElementById('track-partner-name').innerText = assignedPartner.name;
        document.getElementById('track-partner-vehicle').innerText = `${assignedPartner.vehicle} • 📞 ${assignedPartner.phone}`;

        if (callBtn) {
            callBtn.href = `tel:${assignedPartner.phone}`;
            callBtn.style.pointerEvents = 'auto';
            callBtn.style.opacity = '1';
        }
    }, 2000);

    // Update map with partner location
    setTimeout(() => {
        initTrackingMap(17.3850, 78.4867, assignedPartner, isOrder);
    }, 2500);
}

// NEW MAP FUNCTION - Ultra Realistic Tracking
function initTrackingMap(userLat, userLng, partner, isOrder) {
    const mapContainer = document.getElementById('tracking-map');
    if (!leafletMap && mapContainer) {
        const mapOptions = {
            center: [userLat, userLng],
            zoom: 15,
            zoomControl: true,
            attributionControl: false,
            scrollWheelZoom: false
        };

        leafletMap = L.map('tracking-map', mapOptions);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(leafletMap);

        // User marker (food destination)
        const userIcon = L.divIcon({
            className: 'custom-map-marker user-location',
            html: isOrder ? '🏠' : '🍽️',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });
        L.marker([userLat, userLng], { icon: userIcon }).addTo(leafletMap)
            .bindPopup(isOrder ? 'Your Location' : 'Donor Location');

        // Animate partner approaching
        startPartnerAnimation(mapContainer, userLat, userLng, partner);
    }
}

// REALISTIC PARTNER ANIMATION - Partner moves toward user
function startPartnerAnimation(mapContainer, userLat, userLng, partner) {
    const startLat = userLat + (Math.random() - 0.5) * 0.015; // ~1-2km away
    const startLng = userLng + (Math.random() - 0.5) * 0.015;

    const partnerIcon = L.divIcon({
        className: 'custom-map-marker delivery-bike',
        html: '🛵',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });

    const partnerMarker = L.marker([startLat, startLng], { icon: partnerIcon }).addTo(leafletMap)
        .bindPopup(`${partner.name}<br>${partner.vehicle}`);

    let progress = 0;
    const totalSteps = 120; // Smooth animation

    const animate = () => {
        progress += 1 / totalSteps;
        if (progress >= 1) {
            partnerMarker.setLatLng([userLat, userLng]);
            partnerMarker.bindPopup(`✅ ${partner.name}<br>`).openPopup();
            showToast('✅ Delivery Completed!', 'success');
            return;
        }

        const currentLat = startLat + (userLat - startLat) * progress;
        const currentLng = startLng + (userLng - startLng) * progress;
        partnerMarker.setLatLng([currentLat, currentLng]);

        leafletMap.panTo([currentLat, currentLng], { animate: false });
        requestAnimationFrame(animate);
    };

    animate();
}

// Distance calculation (Haversine formula)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Start
document.addEventListener('DOMContentLoaded', init);
