// ═══════════════════════════════════════════════════════════
//  SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://njwzfbstfyfdztujafjo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qd3pmYnN0ZnlmZHp0dWphZmpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MDIzNjEsImV4cCI6MjA5MTQ3ODM2MX0.XMLCLK5C6ZbI9syTeAB4lEpwUSPZzSip4ARLcv-Cxz0';

function getCreateClient() {
  if (window.supabase && typeof window.supabase.createClient === 'function') return window.supabase.createClient;
  if (window.supabase && window.supabase.default && typeof window.supabase.default.createClient === 'function') return window.supabase.default.createClient;
  if (typeof window.createClient === 'function') return window.createClient;
  return null;
}
const createClient = getCreateClient();
const db = createClient ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let currentUser    = null;
let currentProfile = null;
let currentRole    = 'buyer';
let cart           = [];
let trackingMap    = null;
let selectedPayment = 'upi';
let _pickerItem    = null;
let _pickerQty     = 1;

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════
function formatDate(ts) {
  if (!ts) return '—';
  const utcStr = ts.endsWith('Z') || ts.includes('+') ? ts : ts + 'Z';
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}
function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escA(s)    { return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function showToast(msg, type) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.className = 'toast show ' + (type||'');
  clearTimeout(t._t); t._t = setTimeout(() => { t.className = 'toast'; }, 3500);
}
function haversineKm(lat1,lng1,lat2,lng2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// ═══════════════════════════════════════════════════════════
//  FUZZY SEARCH — handles typos like "chciken" → "chicken"
// ═══════════════════════════════════════════════════════════
function fuzzyMatch(query, text) {
  if (!query || !text) return false;
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase().trim();
  if (t.includes(q)) return true;           // exact substring
  const words = q.split(/\s+/);
  return words.every(w => wordMatch(w, t));  // every word must match
}
function wordMatch(w, t) {
  if (t.includes(w)) return true;
  if (w.length < 3) return false;
  // Try each substring of t same length as w, allow 1-2 edits
  const maxEdits = w.length <= 4 ? 1 : w.length <= 7 ? 2 : 3;
  for (let i = 0; i <= t.length - w.length + maxEdits; i++) {
    const sub = t.substring(i, i + w.length);
    if (sub.length > 0 && editDist(w, sub) <= maxEdits) return true;
  }
  return false;
}
function editDist(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m-n) > 3) return 99;
  const dp = Array.from({length:m+1}, (_,i) => Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

// ═══════════════════════════════════════════════════════════
//  GEOCODING — offline dictionary first, then Nominatim
// ═══════════════════════════════════════════════════════════
const HYD_LOCS = {
  'kandlakoya':{lat:17.5715,lng:78.5480},'kandlakoya':{lat:17.5715,lng:78.5480},
  'medchal':{lat:17.6290,lng:78.4820},'ghatkesar':{lat:17.4478,lng:78.6842},
  'gatkeshar':{lat:17.4478,lng:78.6842},'kompally':{lat:17.5430,lng:78.4860},
  'secunderabad':{lat:17.4399,lng:78.4983},'secundrabad':{lat:17.4399,lng:78.4983},
  'hitech city':{lat:17.4486,lng:78.3908},'madhapur':{lat:17.4478,lng:78.3916},
  'gachibowli':{lat:17.4401,lng:78.3489},'kukatpally':{lat:17.4849,lng:78.3998},
  'miyapur':{lat:17.4960,lng:78.3534},'ameerpet':{lat:17.4374,lng:78.4484},
  'banjara hills':{lat:17.4156,lng:78.4347},'jubilee hills':{lat:17.4239,lng:78.4079},
  'kondapur':{lat:17.4604,lng:78.3669},'manikonda':{lat:17.4039,lng:78.3928},
  'shamshabad':{lat:17.2543,lng:78.4292},'lb nagar':{lat:17.3491,lng:78.5494},
  'dilsukhnagar':{lat:17.3688,lng:78.5256},'uppal':{lat:17.4052,lng:78.5594},
  'ecil':{lat:17.4724,lng:78.5572},'malkajgiri':{lat:17.4569,lng:78.5273},
  'boduppal':{lat:17.4282,lng:78.5960},'kapra':{lat:17.4800,lng:78.5620},
  'alwal':{lat:17.5040,lng:78.5080},'bowenpally':{lat:17.4900,lng:78.4860},
  'begumpet':{lat:17.4435,lng:78.4681},'panjagutta':{lat:17.4249,lng:78.4504},
  'narayanguda':{lat:17.3894,lng:78.4856},'nampally':{lat:17.3829,lng:78.4726},
  'charminar':{lat:17.3616,lng:78.4747},'tolichowki':{lat:17.4078,lng:78.4125},
  'mehdipatnam':{lat:17.3948,lng:78.4369},'shamirpet':{lat:17.6053,lng:78.5529},
  'dundigal':{lat:17.6438,lng:78.4680},'bachupally':{lat:17.5440,lng:78.4000},
  'nizampet':{lat:17.5186,lng:78.3921},'balanagar':{lat:17.4877,lng:78.4344},
  'hyderabad':{lat:17.3850,lng:78.4867},
};
const _geoCache = {};
function localityFromText(txt) {
  if (!txt) return null;
  const lo = txt.toLowerCase();
  for (const [k,v] of Object.entries(HYD_LOCS).sort((a,b)=>b[0].length-a[0].length))
    if (lo.includes(k)) return {...v, display:k};
  return null;
}
async function geocode(txt) {
  if (!txt) return {lat:17.385,lng:78.4867,approximate:true};
  const key = txt.trim();
  if (_geoCache[key]) return _geoCache[key];
  const local = localityFromText(key);
  if (local) { _geoCache[key]=local; return local; }
  try {
    const q = key.toLowerCase().includes('hyderabad')||key.toLowerCase().includes('telangana') ? key : key+', Hyderabad, Telangana, India';
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=3&countrycodes=in`, {headers:{'Accept-Language':'en'}});
    const d = await r.json();
    if (d && d.length) {
      const best = d.find(x=>(x.display_name||'').toLowerCase().includes('telangana'))||d[0];
      const res = {lat:parseFloat(best.lat),lng:parseFloat(best.lon)};
      _geoCache[key]=res; return res;
    }
  } catch(e) {}
  const fb = {lat:17.385,lng:78.4867,approximate:true};
  _geoCache[key]=fb; return fb;
}
async function getRoute(fLat,fLng,tLat,tLng) {
  const d = haversineKm(fLat,fLng,tLat,tLng);
  if (d < 0.05) return {distanceKm:d,durationMin:1,geometry:[[fLat,fLng],[tLat,tLng]],sameLocation:true};
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?overview=full&geometries=geojson`);
    const data = await r.json();
    if (data.code==='Ok' && data.routes?.[0]) {
      const rt = data.routes[0];
      if (rt.distance/1000 > 0.01) return {distanceKm:rt.distance/1000, durationMin:Math.ceil(rt.duration/60), geometry:rt.geometry.coordinates.map(c=>[c[1],c[0]])};
    }
  } catch(e) {}
  return {distanceKm:d,durationMin:Math.ceil(d/25*60),geometry:[[fLat,fLng],[tLat,tLng]],isFallback:true};
}

// ═══════════════════════════════════════════════════════════
//  PARTNER CHECK — keyword location match (always works)
// ═══════════════════════════════════════════════════════════
async function checkPartner(orderAddress) {
  if (!orderAddress || !db) return null;
  try {
    const {data, error} = await db.from('delivery_partners').select('*').eq('is_active', true);
    if (error || !data || !data.length) return null;
    const addrLow = orderAddress.toLowerCase();
    // Keyword match: any word from partner location in order address or vice versa
    for (const p of data) {
      const pLoc = (p.location||'').toLowerCase().trim();
      if (!pLoc) continue;
      const pWords = pLoc.split(/[\s,]+/).filter(w=>w.length>2);
      const oWords = addrLow.split(/[\s,]+/).filter(w=>w.length>2);
      const match = pWords.some(pw => oWords.some(ow => pw===ow || pw.includes(ow) || ow.includes(pw)));
      if (match) return p;
    }
    // Distance fallback with timeout
    const oCoords = await Promise.race([geocode(orderAddress), new Promise(r=>setTimeout(()=>r(null),4000))]);
    if (!oCoords) return null;
    for (const p of data) {
      const pCoords = await geocode(p.location||'');
      if (haversineKm(pCoords.lat,pCoords.lng,oCoords.lat,oCoords.lng) <= 12) return p;
    }
  } catch(e) { console.warn('checkPartner error - app.js:178',e); }
  return null;
}

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  if (!db) { setAuthMsg('⚠️ Database not loaded. Put supabase-local.js in project folder.','error'); return; }
  loadLandingStats();
  try {
    const {data:{session}} = await db.auth.getSession();
    if (session?.user) { currentUser = session.user; await loadProfile(); }
  } catch(e) { console.warn('Session error: - app.js:191', e.message); }
  renderView();
  db.auth.onAuthStateChange(async (_e,session) => {
    currentUser = session?.user||null;
    if (currentUser) await loadProfile(); else currentProfile = null;
    renderView();
  });
});

// ═══════════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════════
async function loadLandingStats() {
  if (!db) return;
  try {
    const [r1,r2,r3] = await Promise.all([
      db.from('donations').select('*',{count:'exact',head:true}),
      db.from('orders').select('*',{count:'exact',head:true}),
      db.from('delivery_partners').select('*',{count:'exact',head:true}),
    ]);
    animateCount('statMeals',   r1.count||0);
    animateCount('statOrders',  r2.count||0);
    animateCount('statPartners',r3.count||0);
  } catch(e) {
    ['statMeals','statOrders','statPartners'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='0';});
  }
}
function animateCount(id,target) {
  const el=document.getElementById(id); if(!el) return;
  const start=performance.now(), dur=1200;
  (function step(now){
    const p=Math.min((now-start)/dur,1);
    el.textContent=Math.floor((1-Math.pow(1-p,3))*target);
    if(p<1) requestAnimationFrame(step); else el.textContent=target;
  })(performance.now());
}

// ═══════════════════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════════════════
async function loadProfile() {
  if (!currentUser||!db) return;
  const {data,error} = await db.from('user_profiles').select('*').eq('user_id',currentUser.id);
  if (error||!data?.length) { currentProfile=null; return; }
  currentProfile = data.find(p=>p.role===currentRole) || data[0];
}
function renderView() {
  const landing=document.getElementById('landingPage'), app=document.getElementById('mainApp');
  if (!currentUser||!currentProfile) {
    landing.style.display='block'; app.style.display='none';
    if (currentUser&&!currentProfile) {
      setAuthMsg('⚠️ Profile not found. Please sign up.','error');
      document.getElementById('authModal').style.display='flex';
      switchAuthMode('signup');
    }
  } else { landing.style.display='none'; app.style.display='block'; setupApp(); }
}

// ═══════════════════════════════════════════════════════════
//  APP SETUP
// ═══════════════════════════════════════════════════════════
function setupApp() {
  const role=currentProfile?.role; if(!role){handleLogout();return;}
  document.getElementById('headerUserAvatar').textContent={buyer:'🛒',seller:'🍱',delivery:'🛵'}[role]||'👤';
  document.getElementById('headerUserName').textContent=(currentProfile.full_name||'').split(' ')[0]||'';
  ['buyerApp','sellerApp','deliveryApp'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById(role==='buyer'?'buyerApp':role==='seller'?'sellerApp':'deliveryApp').style.display='block';
  buildNav(role);
  if(role==='buyer')    { populateBuyerProfile();    injectContact('contactFormHolder','buyer');       }
  if(role==='seller')   { populateSellerProfile();   injectContact('sellerContactHolder','seller');    }
  if(role==='delivery') { populateDeliveryProfile(); injectContact('deliveryContactHolder','delivery'); loadDeliveryQueue(); }
}
function buildNav(role) {
  const pages={
    buyer:    [{id:'buyerDashboard',label:'🏠 Home'},{id:'buyerOrder',label:'🔍 Order Food'},{id:'buyerProfile',label:'👤 Profile'},{id:'buyerContact',label:'✉️ Contact'}],
    seller:   [{id:'sellerDashboard',label:'🏠 Home'},{id:'sellerSell',label:'🍱 Sell Food'},{id:'sellerProfile',label:'👤 Profile'},{id:'sellerContact',label:'✉️ Contact'}],
    delivery: [{id:'deliveryDashboard',label:'📦 My Queue'},{id:'deliveryProfile',label:'👤 Profile'},{id:'deliveryContact',label:'✉️ Contact'}],
  };
  document.getElementById('appNav').innerHTML=(pages[role]||[]).map(p=>`<button class="nav-btn" data-page="${p.id}" onclick="showPage('${p.id}')">${p.label}</button>`).join('');
  const first=(pages[role]||[])[0]; if(first) showPage(first.id);
}
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  const t=document.getElementById(id); if(t) t.style.display='block';
  activateNav(id);
  if(id==='buyerOrder')        setTimeout(renderPaymentPanel,100);
  if(id==='deliveryDashboard') loadDeliveryQueue();
  if(id==='buyerProfile')      populateBuyerProfile();
  if(id==='sellerProfile')     populateSellerProfile();
}
function activateNav(id) { document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===id)); }

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════
function openAuthModal(role,mode){ currentRole=role||'buyer'; document.getElementById('authModal').style.display='flex'; switchRole(currentRole); switchAuthMode(mode||'login'); }
function closeAuthModal(){ document.getElementById('authModal').style.display='none'; clearAuthMsg(); }
function switchRole(role){ currentRole=role; document.querySelectorAll('.role-tab').forEach(t=>t.classList.toggle('active',t.dataset.role===role)); document.getElementById('deliveryFields').style.display=role==='delivery'?'block':'none'; }
function switchAuthMode(mode){ document.getElementById('loginToggle').classList.toggle('active',mode==='login'); document.getElementById('signupToggle').classList.toggle('active',mode==='signup'); document.getElementById('loginForm').style.display=mode==='login'?'block':'none'; document.getElementById('signupForm').style.display=mode==='signup'?'block':'none'; clearAuthMsg(); }
function setAuthMsg(msg,type){ const el=document.getElementById('authMsg'); if(!el)return; el.innerHTML=msg; el.className='auth-msg '+(type||''); }
function clearAuthMsg(){ setAuthMsg('',''); }
function setBtn(id,loading,label){ const b=document.getElementById(id); if(!b)return; b.disabled=loading; b.textContent=loading?'Please wait…':label; }

async function handleLogin(){
  if(!db) return setAuthMsg('⚠️ Supabase not loaded.','error');
  const email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPassword').value;
  if(!email||!pass) return setAuthMsg('Please fill all fields.','error');
  setBtn('loginBtn',true,'Login →'); setAuthMsg('Logging in…');
  const {data:profiles}=await db.from('user_profiles').select('role').eq('email',email);
  if(profiles?.length>0){
    const roles=profiles.map(p=>p.role);
    if(!roles.includes(currentRole)){
      setBtn('loginBtn',false,'Login →');
      const rl={buyer:'Buyer 🛒',seller:'Seller 🍱',delivery:'Delivery Partner 🛵'};
      return setAuthMsg(`⚠️ Email registered as <strong>${roles.map(r=>rl[r]||r).join(' & ')}</strong>. Switch tab.`,'error');
    }
  }
  const {error}=await db.auth.signInWithPassword({email,password:pass});
  setBtn('loginBtn',false,'Login →');
  if(error) return setAuthMsg(error.message,'error');
  setAuthMsg('Login successful! ✓','success');
  setTimeout(closeAuthModal,800);
}

async function handleSignup(){
  if(!db) return setAuthMsg('⚠️ Supabase not loaded.','error');
  const name=document.getElementById('signupName').value.trim();
  const email=document.getElementById('signupEmail').value.trim();
  const phone=document.getElementById('signupPhone').value.trim();
  const location=document.getElementById('signupLocation').value.trim();
  const pass=document.getElementById('signupPassword').value;
  const vehicle=document.getElementById('signupVehicle')?.value||'';
  const vNum=document.getElementById('signupVehicleNumber')?.value.trim()||'';
  if(!name||!email||!location||!pass) return setAuthMsg('Please fill all required (*) fields.','error');
  if(pass.length<6) return setAuthMsg('Password must be at least 6 characters.','error');
  // Check duplicate role
  const {data:existing}=await db.from('user_profiles').select('role').eq('email',email).eq('role',currentRole).maybeSingle();
  if(existing){ const rl={buyer:'Buyer',seller:'Seller',delivery:'Delivery Partner'}; return setAuthMsg(`⚠️ Already have a <strong>${rl[currentRole]}</strong> account. Login instead.`,'error'); }
  setBtn('signupBtn',true,'Create Account →'); setAuthMsg('Creating account…');
  let userId=null, authUser=null;
  const {data:authData,error:authErr}=await db.auth.signUp({email,password:pass});
  if(authErr){
    if(authErr.message?.toLowerCase().includes('already registered')){
      const {data:sd,error:se}=await db.auth.signInWithPassword({email,password:pass});
      if(se){ setBtn('signupBtn',false,'Create Account →'); return setAuthMsg('Wrong password for existing account.','error'); }
      userId=sd?.user?.id; authUser=sd?.user;
    } else { setBtn('signupBtn',false,'Create Account →'); return setAuthMsg(authErr.message,'error'); }
  } else { userId=authData?.user?.id; authUser=authData?.user; }
  if(!userId){ setBtn('signupBtn',false,'Create Account →'); return setAuthMsg('Account created! Check email to verify, then login.','success'); }
  // Save profile
  const {error:pErr}=await db.from('user_profiles').insert({user_id:userId,full_name:name,email,phone,role:currentRole,location,vehicle_type:vehicle,vehicle_number:vNum});
  if(pErr){
    if(pErr.code==='23505') await db.from('user_profiles').update({full_name:name,phone,role:currentRole,location,vehicle_type:vehicle,vehicle_number:vNum}).eq('user_id',userId).eq('email',email);
    else { setBtn('signupBtn',false,'Create Account →'); return setAuthMsg('Profile save failed: '+pErr.message,'error'); }
  }
  // Save delivery partner — matches EXACT DB columns: id,name,phone,location,vehicle,created_at,email,vehicle_number,is_active
  if(currentRole==='delivery'){
    const dpData={name,phone,location,vehicle:vehicle||'Bicycle',email,vehicle_number:vNum,is_active:true};
    const {error:dpErr}=await db.from('delivery_partners').upsert(dpData,{onConflict:'email'});
    if(dpErr) console.warn('Delivery partner save warning: - app.js:351',dpErr.message);
  }
  setBtn('signupBtn',false,'Create Account →');
  setAuthMsg('Welcome to FeedForward! ✓','success');
  currentUser=authUser; await loadProfile();
  setTimeout(closeAuthModal,900);
}
async function handleLogout(){ if(db) await db.auth.signOut(); currentUser=null; currentProfile=null; cart=[]; window.location.reload(); }

// ═══════════════════════════════════════════════════════════
//  FOOD SEARCH — fuzzy match on food_name AND food_details
//  DB schema: donations.food_name (text), donations.food_details (text)
// ═══════════════════════════════════════════════════════════
async function searchFood(){
  const query=document.getElementById('foodSearch').value.trim();
  const res=document.getElementById('searchResults');
  const qtyArea=document.getElementById('qtyPickerArea');
  if(!query||query.length<2){ res.innerHTML=''; if(qtyArea) qtyArea.innerHTML=''; return; }
  res.innerHTML='<p style="color:var(--text2);padding:12px 0">🔍 Searching…</p>';
  try {
    const {data,error}=await db.from('donations').select('*').eq('status','pending').gt('quantity',0);
    if(error){ res.innerHTML=`<p style="color:var(--danger)">Search error: ${error.message}</p>`; return; }
    // Match against BOTH food_name and food_details columns
    const matched=(data||[]).filter(item=>{
      const nameText = (item.food_name||'') + ' ' + (item.food_details||'');
      return fuzzyMatch(query, nameText);
    });
    if(!matched.length){
      res.innerHTML=`<div class="not-available"><div class="na-icon">❌</div><h4>Item not available</h4><p>No one has listed "<strong>${esc(query)}</strong>" yet.</p></div>`;
      if(qtyArea) qtyArea.innerHTML='';
      document.getElementById('cartSection').style.display='none';
      return;
    }
    res.innerHTML=matched.map((item,i)=>{
      // Use food_name if available, else food_details
      const displayName=esc(item.food_name||item.food_details||'Food');
      const price=parseFloat(item.price_per_unit)||0;
      const qty=item.quantity||1;
      const loc=esc(item.location||'—');
      return `<div class="food-result-card" style="animation-delay:${i*.06}s">
        <div class="food-result-info">
          <h4>${displayName}</h4><p>📍 ${loc}</p>
          <p>📦 ${qty} serving${qty!==1?'s':''} available</p>
          ${price>0?`<p style="color:var(--accent);font-weight:600">₹${price.toFixed(2)}/serving</p>`:'<p style="color:var(--accent)">💚 Free</p>'}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px">
          ${price>0?`<div class="food-result-price">₹${price.toFixed(2)}</div>`:''}
          <button class="add-to-cart-btn" data-id="${item.id}">Select →</button>
        </div>
      </div>`;
    }).join('');
    matched.forEach(item=>{
      const b=res.querySelector(`[data-id="${item.id}"]`);
      if(b) b.addEventListener('click',()=>openQtyPicker(item));
    });
  } catch(e){ res.innerHTML=`<p style="color:var(--danger)">Search failed. Check connection.</p>`; }
}

// ═══════════════════════════════════════════════════════════
//  QUANTITY PICKER
// ═══════════════════════════════════════════════════════════
function openQtyPicker(item){
  _pickerItem=item; _pickerQty=1;
  const area=document.getElementById('qtyPickerArea');
  const price=parseFloat(item.price_per_unit)||0;
  const maxQ=item.quantity||1;
  const displayName=esc(item.food_name||item.food_details||'Food');
  area.innerHTML=`<div class="qty-picker-card">
    <div class="qty-picker-header">
      <div><h3 class="qty-picker-name">${displayName}</h3><p class="qty-picker-loc">📍 ${esc(item.location||'—')}</p></div>
      <button class="qty-picker-close" onclick="closeQtyPicker()">✕</button>
    </div>
    <div class="qty-picker-avail"><span>📦 Available</span><strong>${maxQ} serving${maxQ!==1?'s':''}</strong></div>
    <div class="qty-picker-row">
      <span class="qty-picker-label">How many servings?</span>
      <div class="qty-stepper">
        <button class="qty-step-btn" onclick="stepQty(-1,${maxQ},${price})">−</button>
        <span class="qty-step-val" id="qtyVal">1</span>
        <button class="qty-step-btn" onclick="stepQty(1,${maxQ},${price})">+</button>
      </div>
    </div>
    <div class="qty-cost-breakdown" id="qtyCostBreakdown">${buildCostRows(1,price)}</div>
    <button class="btn-full" style="margin-top:0" onclick="confirmAddToCart()">Add to Cart 🛒</button>
  </div>`;
  area.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function closeQtyPicker(){ const a=document.getElementById('qtyPickerArea'); if(a) a.innerHTML=''; _pickerItem=null; _pickerQty=1; }
function stepQty(delta,maxQ,price){ _pickerQty=Math.max(1,Math.min(maxQ,_pickerQty+delta)); document.getElementById('qtyVal').textContent=_pickerQty; document.getElementById('qtyCostBreakdown').innerHTML=buildCostRows(_pickerQty,price); }
function buildCostRows(qty,price){
  if(price===0) return `<div class="cost-row total"><span>💚 Free item</span><span>+ ₹40 delivery</span></div>`;
  const sub=qty*price, pf=Math.round(sub*0.05*100)/100, df=40, tot=sub+pf+df;
  return `<div class="cost-row"><span>Subtotal (${qty} × ₹${price.toFixed(2)})</span><span>₹${sub.toFixed(2)}</span></div>
    <div class="cost-row"><span>Platform fee (5%)</span><span>₹${pf.toFixed(2)}</span></div>
    <div class="cost-row"><span>Delivery fee</span><span>₹${df.toFixed(2)}</span></div>
    <div class="cost-row total"><span>Total</span><span>₹${tot.toFixed(2)}</span></div>`;
}
function confirmAddToCart(){
  if(!_pickerItem) return;
  const ex=cart.find(c=>c.listing.id===_pickerItem.id);
  if(ex) ex.qty=_pickerQty; else cart.push({listing:_pickerItem,qty:_pickerQty});
  renderCart(); document.getElementById('cartSection').style.display='block';
  showToast(`✓ ${_pickerItem.food_name||_pickerItem.food_details||'Item'} × ${_pickerQty} added!`,'success');
  closeQtyPicker();
}

// ═══════════════════════════════════════════════════════════
//  CART
// ═══════════════════════════════════════════════════════════
function removeFromCart(id){ cart=cart.filter(c=>c.listing.id!==id); renderCart(); if(!cart.length) document.getElementById('cartSection').style.display='none'; }
function renderCart(){
  const el=document.getElementById('cartItems'); if(!cart.length){el.innerHTML='';return;}
  el.innerHTML=cart.map(c=>{
    const name=esc(c.listing.food_name||c.listing.food_details||'Food');
    const unit=parseFloat(c.listing.price_per_unit)||0;
    return `<div class="cart-item">
      <div><div class="cart-item-name">${name}</div><div class="cart-item-meta">${c.qty} × ₹${unit.toFixed(2)}</div></div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="cart-item-price">₹${(unit*c.qty).toFixed(2)}</div>
        <button class="cart-item-remove" data-rid="${c.listing.id}">✕</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-rid]').forEach(b=>b.addEventListener('click',()=>removeFromCart(b.dataset.rid)));
  const sub=cart.reduce((s,c)=>s+(parseFloat(c.listing.price_per_unit)||0)*c.qty,0);
  const pf=Math.round(sub*0.05*100)/100, df=40, tot=sub+pf+df;
  document.getElementById('cartSubtotal').textContent='₹'+sub.toFixed(2);
  document.getElementById('cartPlatform').textContent='₹'+pf.toFixed(2);
  document.getElementById('cartDelivery').textContent='₹'+df.toFixed(2);
  document.getElementById('cartTotal').textContent='₹'+tot.toFixed(2);
}

// ═══════════════════════════════════════════════════════════
//  PAYMENT PANEL
// ═══════════════════════════════════════════════════════════
function renderPaymentPanel(){
  const el=document.getElementById('paymentPanel'); if(!el) return;
  el.innerHTML=`<div class="pay-panel">
    <h4 class="pay-title">💳 Choose Payment Method</h4>
    <div class="pay-tabs" id="payTabs">
      <button class="pay-tab active" data-pt="upi" onclick="selectPayTab('upi')">📱 UPI</button>
      <button class="pay-tab" data-pt="card" onclick="selectPayTab('card')">💳 Card</button>
      <button class="pay-tab" data-pt="nb" onclick="selectPayTab('nb')">🏦 Net Banking</button>
      <button class="pay-tab" data-pt="cod" onclick="selectPayTab('cod')">💵 Cash</button>
    </div>
    <div class="pay-body" id="payBody">${getPayBody('upi')}</div>
  </div>`;
}
function selectPayTab(tab){ selectedPayment=tab; document.querySelectorAll('#payTabs .pay-tab').forEach(b=>b.classList.toggle('active',b.dataset.pt===tab)); document.getElementById('payBody').innerHTML=getPayBody(tab); }
function getPayBody(tab){
  if(tab==='upi') return `<div class="pay-section"><div class="pay-upi-options">
    <label class="pay-upi-chip active" onclick="selectUPIApp(this)"><span class="upi-logo gpay-logo">G</span><span>Google Pay</span></label>
    <label class="pay-upi-chip" onclick="selectUPIApp(this)"><span class="upi-logo phonepe-logo">P</span><span>PhonePe</span></label>
    <label class="pay-upi-chip" onclick="selectUPIApp(this)"><span class="upi-logo paytm-logo">₹</span><span>Paytm</span></label>
    <label class="pay-upi-chip" onclick="selectUPIApp(this)"><span class="upi-logo other-logo">↗</span><span>Other UPI</span></label>
    </div><div class="pay-divider">or enter UPI ID</div>
    <div class="pay-input-row"><input type="text" id="upiId" class="pay-input" placeholder="yourname@upi">
    <button class="pay-verify-btn" onclick="showToast('✓ UPI verified!','success')">Verify</button></div></div>`;
  if(tab==='card') return `<div class="pay-section"><div class="card-preview">
    <div class="card-chip">▬▬</div><div class="card-num-preview" id="cardNumPreview">•••• •••• •••• ••••</div>
    <div class="card-footer-row"><div><div class="card-field-label">CARDHOLDER</div><div class="card-field-val" id="cardNamePv">YOUR NAME</div></div>
    <div><div class="card-field-label">EXPIRES</div><div class="card-field-val" id="cardExpPv">MM/YY</div></div><div class="card-network">VISA</div></div></div>
    <div class="form-group" style="margin-top:16px"><label>Card Number</label>
    <input type="text" class="pay-input" maxlength="19" placeholder="1234 5678 9012 3456" oninput="fmtCard(this)" onkeyup="document.getElementById('cardNumPreview').textContent=this.value||'•••• •••• •••• ••••'"></div>
    <div class="form-group"><label>Cardholder Name</label><input type="text" class="pay-input" placeholder="As on card" oninput="document.getElementById('cardNamePv').textContent=this.value.toUpperCase()||'YOUR NAME'"></div>
    <div class="form-row"><div class="form-group"><label>Expiry</label><input type="text" class="pay-input" maxlength="5" placeholder="MM/YY" oninput="fmtExpiry(this)"></div>
    <div class="form-group"><label>CVV</label><input type="password" class="pay-input" maxlength="4" placeholder="•••"></div></div>
    <label class="pay-save-row"><input type="checkbox"> <span>Save card</span></label></div>`;
  if(tab==='nb') return `<div class="pay-section"><div class="nb-grid">${['SBI','HDFC','ICICI','Axis','Kotak','Yes Bank','PNB','Canara'].map(b=>`<button class="nb-bank-btn" onclick="this.classList.toggle('selected')">${b}</button>`).join('')}</div>
    <div class="pay-divider">or search bank</div><div class="form-group"><input type="text" class="pay-input" placeholder="Type bank name…"></div></div>`;
  if(tab==='cod') return `<div class="pay-section cod-section"><div class="cod-icon">💵</div><h4>Pay with Cash</h4><p>Pay when your order arrives.</p><div class="cod-note">⚡ No extra charges</div></div>`;
  return '';
}
function selectUPIApp(el){ document.querySelectorAll('.pay-upi-chip').forEach(c=>c.classList.remove('active')); el.classList.add('active'); }
function fmtCard(el){ let v=el.value.replace(/\D/g,'').substring(0,16); el.value=v.match(/.{1,4}/g)?.join(' ')||v; }
function fmtExpiry(el){ let v=el.value.replace(/\D/g,'').substring(0,4); if(v.length>2)v=v.slice(0,2)+'/'+v.slice(2); el.value=v; }
function getSelectedPaymentMethod(){ return {upi:'UPI',card:'Card',nb:'Net Banking',cod:'Cash on Delivery'}[selectedPayment]||'UPI'; }

// ═══════════════════════════════════════════════════════════
//  PLACE ORDER
//  orders table columns (CONFIRMED from DB): 
//  user_id, food_item, quantity, address, contact,
//  payment_method, status, total_amount
//  NO buyer_location, seller_location, platform_fee, etc.
// ═══════════════════════════════════════════════════════════
async function placeOrder(){
  if(!cart.length) return showToast('Cart is empty!','error');
  const address=document.getElementById('orderAddress').value.trim();
  const contact=document.getElementById('orderContact').value.trim();
  if(!address||!contact) return showToast('Please fill address and contact.','error');
  const btn=document.querySelector('#cartSection .btn-full');
  if(btn){btn.disabled=true;btn.textContent='Checking availability…';}

  // Check delivery partner
  const partner=await checkPartner(address);
  if(!partner){
    if(btn){btn.disabled=false;btn.textContent='Place Order 🎉';}
    document.getElementById('noPartnerWarn').style.display='block';
    return showToast('❌ No delivery partner in your area right now.','error');
  }
  document.getElementById('noPartnerWarn').style.display='none';
  if(btn) btn.textContent='Placing order…';

  const sub=cart.reduce((s,c)=>s+(parseFloat(c.listing.price_per_unit)||0)*c.qty,0);
  const tot=Math.round((sub*1.05+40)*100)/100;

  // ONLY insert columns that EXIST in the orders table
  const orderRow={
    user_id:   currentUser.id,
    food_item: cart.map(c=>c.listing.food_name||c.listing.food_details||'Food').join(', '),
    quantity:  cart.reduce((s,c)=>s+c.qty,0),
    address,
    contact,
    payment_method: getSelectedPaymentMethod(),
    status:    'placed',
    total_amount: tot,
  };

  const {error:orderErr}=await db.from('orders').insert(orderRow);
  if(btn){btn.disabled=false;btn.textContent='Place Order 🎉';}
  if(orderErr){
    console.error('Order insert error: - app.js:571', orderErr);
    // Try without total_amount in case that column also doesn't exist
    const {error:orderErr2}=await db.from('orders').insert({
      user_id:currentUser.id, food_item:orderRow.food_item,
      quantity:orderRow.quantity, address, contact,
      payment_method:orderRow.payment_method, status:'placed'
    });
    if(orderErr2){
      console.error('Minimal order insert error: - app.js:579', orderErr2);
      return showToast('Order failed: '+orderErr2.message,'error');
    }
  }

  showToast('🎉 Order placed successfully!','success');
  const savedPartner={...partner}, savedAddress=address;
  cart=[];
  document.getElementById('cartSection').style.display='none';
  document.getElementById('searchResults').innerHTML='';
  const qa=document.getElementById('qtyPickerArea'); if(qa) qa.innerHTML='';
  document.getElementById('foodSearch').value='';
  // Decrement donation quantities
  // (optional: could update qty here)
  setTimeout(()=>showTrackingModal({
    title:'🍛 Out for Delivery',
    fromLabel:'Partner Location', toLabel:'Your Delivery Address',
    fromLoc:savedPartner.location||'Hyderabad', toLoc:savedAddress,
    partner:savedPartner, animate:true
  }),1200);
}

// ═══════════════════════════════════════════════════════════
//  SELL FOOD
//  donations table CONFIRMED columns:
//  user_id, food_details, food_name, quantity, location,
//  contact, status, price_per_unit, seller_name,
//  bank_account_holder, bank_account_number, bank_ifsc, upi_id
// ═══════════════════════════════════════════════════════════
function updateSellCost(){
  const qty=parseInt(document.getElementById('sellQuantity').value)||0;
  const price=parseFloat(document.getElementById('sellPricePerUnit').value)||0;
  const prev=document.getElementById('sellCostPreview');
  if(qty>0&&price>0){ prev.style.display='block'; document.getElementById('previewUnit').textContent='₹'+price.toFixed(2); document.getElementById('previewTotal').textContent='₹'+(qty*price).toFixed(2); }
  else prev.style.display='none';
}
async function submitSellFood(){
  const fn=document.getElementById('sellFoodName').value.trim();
  const qty=parseInt(document.getElementById('sellQuantity').value)||0;
  const loc=document.getElementById('sellLocation').value.trim();
  const con=document.getElementById('sellContact').value.trim();
  if(!fn||!qty||!loc||!con) return showToast('Please fill required fields.','error');
  const partner=await checkPartner(loc);
  document.getElementById('noPartnerSellWarn').style.display=partner?'none':'block';
  // Insert with CONFIRMED columns from DB screenshot
  const {error}=await db.from('donations').insert({
    user_id:       currentUser.id,
    food_name:     fn,
    food_details:  document.getElementById('sellFoodDetails').value.trim()||fn,
    quantity:      qty,
    price_per_unit: parseFloat(document.getElementById('sellPricePerUnit').value)||0,
    location:      loc,
    contact:       con,
    status:        'pending',
    seller_name:   currentProfile?.full_name||'',
    bank_account_holder: document.getElementById('sellBankHolder').value.trim(),
    bank_account_number: document.getElementById('sellBankAccount').value.trim(),
    bank_ifsc:     document.getElementById('sellBankIFSC').value.trim(),
    upi_id:        document.getElementById('sellUPI').value.trim(),
  });
  if(error) return showToast('Failed: '+error.message,'error');
  showToast('🍱 Food listed successfully!','success');
  ['sellFoodName','sellFoodDetails','sellPricePerUnit','sellLocation','sellContact','sellBankHolder','sellBankAccount','sellBankIFSC','sellUPI'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('sellQuantity').value='1';
  document.getElementById('sellCostPreview').style.display='none';
  populateSellerProfile();
}

// ═══════════════════════════════════════════════════════════
//  TRACKING MODAL
// ═══════════════════════════════════════════════════════════
async function showTrackingModal({title,fromLabel,toLabel,fromLoc,toLoc,partner,animate}){
  const modal=document.getElementById('trackingModal');
  modal.style.display='flex';
  document.getElementById('trackingTitle').textContent=title||'🗺️ Route';
  document.getElementById('trackingEta').textContent='⏱ Calculating route…';
  document.getElementById('partnerInfo').innerHTML='<p style="color:var(--text2)">Loading…</p>';
  try {
    const [fC,tC]=await Promise.all([geocode(fromLoc),geocode(toLoc)]);
    const route=await getRoute(fC.lat,fC.lng,tC.lat,tC.lng);
    let etaTxt;
    if(route.sameLocation) etaTxt='📍 Same location (< 50m)';
    else if(route.isFallback) etaTxt=`📏 ~${route.distanceKm.toFixed(2)} km straight · ⏱ ~${route.durationMin} min (est.)`;
    else etaTxt=`📏 ${route.distanceKm.toFixed(2)} km by road · ⏱ ~${route.durationMin} min`;
    if(fC.approximate||tC.approximate) etaTxt+=' ⚠️ approx';
    document.getElementById('trackingEta').textContent=etaTxt;
    let info='';
    if(partner){
      const veh=[partner.vehicle,partner.vehicle_number].filter(Boolean).join(' · ')||'—';
      info=`<div class="partner-info-grid">
        <div class="pi-row"><span class="pi-label">🛵 Partner</span><span class="pi-val">${esc(partner.name||'—')}</span></div>
        <div class="pi-row"><span class="pi-label">🚗 Vehicle</span><span class="pi-val">${esc(veh)}</span></div>
        <div class="pi-row"><span class="pi-label">📞 Phone</span><a href="tel:${escA(partner.phone||'')}" class="pi-phone">${esc(partner.phone||'N/A')}</a></div>
        <div class="pi-row"><span class="pi-label">📍 Area</span><span class="pi-val">${esc(partner.location||'—')}</span></div>
      </div>`;
    }
    info+=`<div class="route-info-pills">
      <div class="rip"><span class="rip-icon">📍</span><span class="rip-label">${esc(fromLabel||'From')}</span><span class="rip-val">${esc(fromLoc)}</span></div>
      <div class="rip-arrow">→</div>
      <div class="rip"><span class="rip-icon">🏠</span><span class="rip-label">${esc(toLabel||'To')}</span><span class="rip-val">${esc(toLoc)}</span></div>
    </div>`;
    document.getElementById('partnerInfo').innerHTML=info;
    setTimeout(()=>initMapWithRoute(fC,tC,route,animate),400);
  } catch(e) {
    document.getElementById('trackingEta').textContent='Could not load route.';
    document.getElementById('partnerInfo').innerHTML='';
  }
}
function closeTracking(){ document.getElementById('trackingModal').style.display='none'; if(trackingMap){trackingMap.remove();trackingMap=null;} }
function initMapWithRoute(fC,tC,route,animate){
  const el=document.getElementById('trackingMap');
  if(trackingMap){trackingMap.remove();trackingMap=null;}
  if(typeof L==='undefined') return;
  trackingMap=L.map(el,{zoomControl:true}).setView([fC.lat,fC.lng],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(trackingMap);
  const mkIcon=emoji=>L.divIcon({className:'',html:`<div style="font-size:28px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))">${emoji}</div>`,iconSize:[36,36],iconAnchor:[18,18]});
  L.marker([fC.lat,fC.lng],{icon:mkIcon('📍')}).addTo(trackingMap).bindPopup('<b>Pickup / Partner</b>');
  L.marker([tC.lat,tC.lng],{icon:mkIcon('🏠')}).addTo(trackingMap).bindPopup('<b>Delivery Address</b>').openPopup();
  const pts=(route.geometry?.length>1)?route.geometry:[[fC.lat,fC.lng],[tC.lat,tC.lng]];
  L.polyline(pts,{color:'#5df07a',weight:5,opacity:.85}).addTo(trackingMap);
  try { trackingMap.fitBounds(L.latLngBounds([[fC.lat,fC.lng],[tC.lat,tC.lng]]),{padding:[50,50],maxZoom:15}); } catch(e){}
  if(animate&&pts.length>1&&!route.sameLocation){
    const bike=L.marker([fC.lat,fC.lng],{icon:mkIcon('🛵'),zIndexOffset:1000}).addTo(trackingMap);
    const dur=Math.min((route.durationMin||5)*800,18000);
    const st=performance.now();
    (function step(now){
      const prog=Math.min((now-st)/dur,1);
      const e=prog<.5?2*prog*prog:1-Math.pow(-2*prog+2,2)/2;
      const idx=e*(pts.length-1), i=Math.floor(idx), fr=idx-i;
      if(i<pts.length-1){ const lat=pts[i][0]+(pts[i+1][0]-pts[i][0])*fr; const lng=pts[i][1]+(pts[i+1][1]-pts[i][1])*fr; bike.setLatLng([lat,lng]); }
      if(prog<1) requestAnimationFrame(step); else { bike.setLatLng([tC.lat,tC.lng]); showToast('🎉 Partner arrived!','success'); }
    })(performance.now());
  }
}
async function trackOrder(fromLoc,toLoc,title){
  const partner=await checkPartner(toLoc);
  await showTrackingModal({title:title||'🗺️ Order Tracking',fromLabel:'Seller / Pickup',toLabel:'Delivery Address',fromLoc,toLoc,partner:partner||null,animate:!!partner});
}
async function showDeliveryRoute(fromLoc,toLoc){
  await showTrackingModal({title:'🗺️ Your Delivery Route',fromLabel:'Your Location',toLabel:'Destination',fromLoc,toLoc,partner:null,animate:false});
}

// ═══════════════════════════════════════════════════════════
//  DELIVERY QUEUE
// ═══════════════════════════════════════════════════════════
async function loadDeliveryQueue(){
  const qEl=document.getElementById('deliveryQueue');
  const myLoc=currentProfile?.location||'';
  document.getElementById('deliveryAreaLabel').textContent=myLoc?`Near: ${myLoc}`:'All areas';
  if(!myLoc){ qEl.innerHTML=`<div class="no-queue"><div class="no-queue-icon">📍</div><h3>No location set</h3><p>Update your profile to see nearby deliveries.</p></div>`; return; }
  qEl.innerHTML='<p style="color:var(--text2);padding:20px">🔍 Finding deliveries near you…</p>';
  try {
    const [{data:orders},{data:donations}]=await Promise.all([
      db.from('orders').select('*').in('status',['placed','out_for_delivery']),
      db.from('donations').select('*').in('status',['pending','pickup_accepted']),
    ]);
    // Filter by location keyword match
    const myWords=myLoc.toLowerCase().split(/[\s,]+/).filter(w=>w.length>2);
    const nearOrders=(orders||[]).filter(o=>{
      const oLoc=(o.address||'').toLowerCase();
      return myWords.some(w=>oLoc.includes(w));
    });
    const nearDonations=(donations||[]).filter(d=>{
      const dLoc=(d.location||'').toLowerCase();
      return myWords.some(w=>dLoc.includes(w));
    });
    if(!nearOrders.length&&!nearDonations.length){
      qEl.innerHTML=`<div class="no-queue"><div class="no-queue-icon">🛵</div><h3>No deliveries near you</h3><p>No orders near ${esc(myLoc)} right now.</p></div>`; return;
    }
    qEl.innerHTML=[
      ...nearOrders.map(o=>{
        const isAccepted=o.status==='out_for_delivery';
        const fL=escA(myLoc), tL=escA(o.address||'');
        return `<div class="queue-card ${isAccepted?'queue-card-accepted':''}">
          <div class="queue-card-header">
            <span class="queue-type order">🛒 Order</span>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${isAccepted?'<span class="status-badge accepted">🚚 In Progress</span>':''}
              <span style="font-size:12px;color:var(--text2)">${formatDate(o.created_at)}</span>
            </div>
          </div>
          <h4>${esc(o.food_item||'Food Order')}</h4>
          <p>📍 <strong>Deliver to:</strong> ${esc(o.address)}</p>
          <p>📱 ${esc(o.contact)}</p>
          <p>📦 Qty: ${o.quantity}${o.total_amount?` · ₹${parseFloat(o.total_amount).toFixed(2)}`:''}</p>
          <div class="queue-actions">
            ${!isAccepted
              ?`<button class="btn-accept" onclick="acceptDelivery('${o.id}','order','${fL}','${tL}')">Accept 🛵</button>`
              :`<button class="btn-route" onclick="showDeliveryRoute('${fL}','${tL}')">🗺️ Show Route</button>
                <button class="btn-complete" onclick="completeOrder('${o.id}','order')">✅ Mark Delivered</button>`
            }
          </div>
        </div>`;
      }),
      ...nearDonations.filter(d=>d.status==='pending').map(d=>{
        const fL=escA(myLoc), tL=escA(d.location||'');
        return `<div class="queue-card">
          <div class="queue-card-header"><span class="queue-type pickup">🍱 Pickup</span><span style="font-size:12px;color:var(--text2)">${formatDate(d.created_at)}</span></div>
          <h4>${esc(d.food_name||d.food_details||'Food')}</h4>
          <p>📍 ${esc(d.location)}</p><p>📱 ${esc(d.contact)}</p>
          <p>📦 ${d.quantity} serving${d.quantity!==1?'s':''}${d.price_per_unit>0?` · ₹${d.price_per_unit}/serving`:''}</p>
          <div class="queue-actions"><button class="btn-accept" onclick="acceptDelivery('${d.id}','pickup','${fL}','${tL}')">Accept 🍱</button></div>
        </div>`;
      }),
      ...nearDonations.filter(d=>d.status==='pickup_accepted').map(d=>{
        const fL=escA(myLoc), tL=escA(d.location||'');
        return `<div class="queue-card queue-card-accepted">
          <div class="queue-card-header"><span class="queue-type pickup">🍱 Pickup</span><span class="status-badge accepted">🚚 In Progress</span></div>
          <h4>${esc(d.food_name||d.food_details||'Food')}</h4>
          <p>📍 ${esc(d.location)}</p><p>📱 ${esc(d.contact)}</p>
          <div class="queue-actions">
            <button class="btn-route" onclick="showDeliveryRoute('${fL}','${tL}')">🗺️ Show Route</button>
            <button class="btn-complete" onclick="completeOrder('${d.id}','pickup')">✅ Mark Completed</button>
          </div>
        </div>`;
      })
    ].join('');
  } catch(e){ qEl.innerHTML=`<p style="color:var(--danger);padding:20px">Error loading queue: ${e.message}</p>`; }
}
async function acceptDelivery(id,type,fromLoc,toLoc){
  if(type==='order') await db.from('orders').update({status:'out_for_delivery'}).eq('id',id);
  else               await db.from('donations').update({status:'pickup_accepted'}).eq('id',id);
  showToast('Accepted! 🛵','success');
  await showDeliveryRoute(fromLoc,toLoc);
  setTimeout(loadDeliveryQueue,800);
}
async function completeOrder(id,type){
  if(!confirm('Mark this delivery as completed?')) return;
  if(type==='order') await db.from('orders').update({status:'delivered'}).eq('id',id);
  else               await db.from('donations').update({status:'delivered'}).eq('id',id);
  showToast('✅ Delivery completed!','success');
  setTimeout(loadDeliveryQueue,500);
}

// ═══════════════════════════════════════════════════════════
//  STATUS LABELS & CLASSES
// ═══════════════════════════════════════════════════════════
const STATUS_LABEL={placed:'🕐 Pending',out_for_delivery:'🚚 On the Way',delivered:'✅ Completed',cancelled:'❌ Cancelled',pending:'🕐 Pending',pickup_accepted:'🚚 Pickup In Progress'};
const STATUS_CLS={placed:'status-pending',out_for_delivery:'status-transit',delivered:'status-delivered',cancelled:'status-cancelled',pending:'status-pending',pickup_accepted:'status-transit'};

// ═══════════════════════════════════════════════════════════
//  BUYER PROFILE
// ═══════════════════════════════════════════════════════════
function populateBuyerProfile(){
  if(!currentProfile) return;
  const name=currentProfile.full_name||'Friend';
  const el=document.getElementById('buyerName'); if(el) el.textContent=name.split(' ')[0];
  document.getElementById('profileBuyerName').textContent=name;
  document.getElementById('profileBuyerEmail').textContent=currentProfile.email||'-';
  document.getElementById('profileBuyerPhone').textContent=currentProfile.phone||'-';
  document.getElementById('profileBuyerLocation').textContent=currentProfile.location||'-';
  db.from('orders').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(20)
    .then(({data})=>{
      const el=document.getElementById('buyerOrderHistory');
      if(!data?.length){el.innerHTML='<p style="color:var(--text2)">No orders yet.</p>';return;}
      el.innerHTML=data.map(o=>{
        const sellerLoc=currentProfile.location||'Hyderabad';
        const canTrack=o.status==='placed'||o.status==='out_for_delivery';
        const isDone=o.status==='delivered';
        return `<div class="history-card">
          <div style="flex:1;min-width:0">
            <h4>${esc(o.food_item||'Food Order')}</h4>
            <p>Qty: ${o.quantity}${o.total_amount?' · ₹'+parseFloat(o.total_amount).toFixed(2):''} · ${formatDate(o.created_at)}</p>
            <p style="word-break:break-word">📍 ${esc(o.address)}</p>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
            <span class="history-status ${STATUS_CLS[o.status]||''}">${STATUS_LABEL[o.status]||o.status}</span>
            ${canTrack?`<button class="btn-track-order" onclick="trackOrder('${escA(sellerLoc)}','${escA(o.address)}','🍛 Tracking: ${escA(o.food_item||'Order')}')">🗺️ Track</button>`:''}
            ${isDone?`<button class="btn-track-order btn-track-view" onclick="trackOrder('${escA(sellerLoc)}','${escA(o.address)}','✅ Delivered')">🗺️ View Route</button>`:''}
          </div>
        </div>`;
      }).join('');
    });
}

// ═══════════════════════════════════════════════════════════
//  SELLER PROFILE
// ═══════════════════════════════════════════════════════════
function populateSellerProfile(){
  if(!currentProfile) return;
  document.getElementById('profileSellerName').textContent=currentProfile.full_name||'-';
  document.getElementById('profileSellerEmail').textContent=currentProfile.email||'-';
  document.getElementById('profileSellerPhone').textContent=currentProfile.phone||'-';
  document.getElementById('profileSellerLocation').textContent=currentProfile.location||'-';
  db.from('donations').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(20)
    .then(({data})=>{
      const el=document.getElementById('sellerListings');
      if(!data?.length){el.innerHTML='<p style="color:var(--text2)">No listings yet.</p>';return;}
      el.innerHTML=data.map(d=>{
        const canTrack=d.status==='pickup_accepted';
        const isDone=d.status==='delivered';
        const bLoc=currentProfile.location||'Hyderabad';
        const dName=d.food_name||d.food_details||'Food';
        return `<div class="history-card">
          <div style="flex:1;min-width:0">
            <h4>${esc(dName)}</h4>
            <p>Qty: ${d.quantity} · ₹${d.price_per_unit||0}/serving · ${formatDate(d.created_at)}</p>
            <p style="word-break:break-word">📍 ${esc(d.location)}</p>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
            <span class="history-status ${STATUS_CLS[d.status]||''}">${STATUS_LABEL[d.status]||d.status}</span>
            ${canTrack?`<button class="btn-track-order" onclick="trackOrder('${escA(d.location)}','${escA(bLoc)}','🍱 Pickup: ${escA(dName)}')">🗺️ Track Pickup</button>`:''}
            ${isDone?`<button class="btn-track-order btn-track-view" onclick="trackOrder('${escA(d.location)}','${escA(bLoc)}','✅ ${escA(dName)}')">🗺️ View Route</button>`:''}
          </div>
        </div>`;
      }).join('');
    });
}

// ═══════════════════════════════════════════════════════════
//  DELIVERY PROFILE
// ═══════════════════════════════════════════════════════════
function populateDeliveryProfile(){
  if(!currentProfile) return;
  document.getElementById('profileDeliveryName').textContent=currentProfile.full_name||'-';
  document.getElementById('profileDeliveryEmail').textContent=currentProfile.email||'-';
  document.getElementById('profileDeliveryPhone').textContent=currentProfile.phone||'-';
  document.getElementById('profileDeliveryLocation').textContent=currentProfile.location||'-';
  document.getElementById('profileDeliveryVehicle').textContent=[currentProfile.vehicle_type,currentProfile.vehicle_number].filter(Boolean).join(' · ')||'-';
}

// ═══════════════════════════════════════════════════════════
//  CONTACT
// ═══════════════════════════════════════════════════════════
function injectContact(holderId,role){
  const el=document.getElementById(holderId); if(!el) return;
  el.innerHTML=`<div class="contact-form"><h2>✉️ Contact Us</h2><p>Have a question or feedback?</p>
    <div class="form-group"><label>Name</label><input type="text" id="cName_${role}" value="${escA(currentProfile?.full_name||'')}"></div>
    <div class="form-group"><label>Email</label><input type="email" id="cEmail_${role}" value="${escA(currentProfile?.email||'')}"></div>
    <div class="form-group"><label>Message</label><textarea id="cMsg_${role}" rows="5" style="resize:vertical" placeholder="Your message…"></textarea></div>
    <button class="btn-full" onclick="submitContact('${role}')">Send Message ✉️</button></div>`;
}
async function submitContact(role){
  const name=document.getElementById('cName_'+role).value.trim();
  const email=document.getElementById('cEmail_'+role).value.trim();
  const msg=document.getElementById('cMsg_'+role).value.trim();
  if(!name||!email||!msg) return showToast('Please fill all fields.','error');
  const {error}=await db.from('contacts').insert({name,email,message:msg});
  if(error) return showToast('Failed to send: '+error.message,'error');
  showToast('Message sent! ✉️','success');
  document.getElementById('cMsg_'+role).value='';
}
