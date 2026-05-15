// ============================================
// mobile.js - Mobile App Logic
// ============================================

// Authentication Check (Allow Foreman, SA, Umum, QC, Koordinator, Admin BP, Admin)
const session = Auth.requireAuth(['foreman', 'sa', 'umum', 'qc', 'koordinator', 'admin_bp', 'admin']);

let units = [];
let logs = {};
let currentDivData = []; // Store current division units for filtering
let currentDivTitle = ""; // Store current division title
let currentDivFilter = "all"; // all, working, queue
let saList = [];
const steps = Store.steps;
let activeFilterStatus = 'all';
let chartInstance = null;
let vChartType = 'line';
let lastBackPress = 0;
let unitsUnsubscribe = null;
let modalStack = []; // Track open modals in order for reliable back-button handling

// --- TOAST NOTIFICATION (Slide dari kanan atas dengan animasi menarik) ---
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    if (!toast || !toastMsg) return;
    
    // Set pesan
    toastMsg.innerText = msg;
    
    // Set warna dan icon berdasarkan type
    const toastIcon = toast.querySelector('.toast-icon');
    if (toastIcon) {
        if (type === 'success') {
            toast.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            toastIcon.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i>';
        } else if (type === 'error') {
            toast.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
            toastIcon.innerHTML = '<i data-lucide="x-circle" class="w-5 h-5"></i>';
        } else if (type === 'warning') {
            toast.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            toastIcon.innerHTML = '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
        } else if (type === 'info') {
            toast.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
            toastIcon.innerHTML = '<i data-lucide="info" class="w-5 h-5"></i>';
        }
    }
    
    // Tampilkan toast dengan animasi
    toast.classList.add('show');
    
    // Update icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // Play sound untuk success
    if (type === 'success') {
        playSuccessSound();
    }
    
    // Auto hide setelah 3 detik
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// --- PLAY SUCCESS SOUND ---
function playSuccessSound() {
    try {
        // Gunakan Web Audio API untuk membuat suara ding yang menarik
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        // Nada C (523 Hz) untuk suara ding yang menyenangkan
        oscillator.frequency.setValueAtTime(523, audioCtx.currentTime);
        oscillator.type = 'sine';
        
        // Fade out untuk suara yang smooth
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
        console.warn('Audio not supported:', e);
    }
}

// --- REALTIME ENGINE ---
function initUnitsRealtime() {
    if (unitsUnsubscribe) unitsUnsubscribe(); // Clean up if exists

    const db = window.fbDB;
    if (!db) return;

    console.log("🔥 Initializing Realtime Units Listener...");
    const uRef = window.fbCollection(db, "units");
    
    // Matikan listener lama jika ganti akun
    unitsUnsubscribe = window.fbOnSnapshot(uRef, (snap) => {
        console.log("🔄 Realtime Update Detected: " + snap.size + " units");
        
        // Update data lokal Store (Biar view lain dapet data fresh)
        const freshUnits = [];
        snap.forEach(doc => {
            freshUnits.push({ id: doc.id, ...doc.data() });
        });
        
        // Simpan ke memory lokal dan Store
        units = freshUnits;
        if (typeof Store !== 'undefined') {
            Store.saveUnits(freshUnits);
        }
        
        // Trigger UI Update (Tanpa Refresh)
        if (document.getElementById('view-home').classList.contains('active')) renderHome();
        if (document.getElementById('view-monitor').classList.contains('active')) renderDashboard();
        if (document.getElementById('view-chart').classList.contains('active')) loadChartData();
    });
}


let rolePermissions = {
    can_add: false,
    can_edit: false,
    can_delete: false,
    can_status: false
};

// --- APP CONFIGURATION & REALTIME SETTINGS ---
let CURRENT_VERSION = '1.5.7';
let appConfig = {
    version: '1.5.8',
    roles: {},
    greeting_schedule: { pagi: 5, siang: 11, sore: 15, malam: 18 },
    notif_template_pindah: 'Unit [PLATE] telah pindah posisi ke [POSISI]',
    notif_template_selesai: 'Hore! Unit [PLATE] sudah selesai dikerjakan'
};

function initAppConfigListener() {
    const db = window.fbDB;
    if (!db) return;

    console.log("🔥 Initializing Realtime App Config Listener...");
    window.fbOnSnapshot(window.fbDoc(db, "settings", "app_config"), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            
            // Sync Version and Config without Reload
            if (data.version && data.version !== CURRENT_VERSION) {
                console.log("🔄 Real-time Config Version Update: " + CURRENT_VERSION + " -> " + data.version);
                CURRENT_VERSION = data.version;
            }

            appConfig = data;
            
            // Trigger UI Updates Instantly
            updateProfileLabels();
            updateGreetingDisplay();
            
            // Sync Branding (Powered By)
            const poweredByFooter = document.getElementById('powered-by-footer');
            if (poweredByFooter) {
                poweredByFooter.style.display = (appConfig.show_powered_by === false) ? 'none' : 'block';
            }
            
            // If settings view is open, re-render it
            const settingsView = document.getElementById('view-settings');
            if (settingsView && settingsView.classList.contains('active')) {
                // Assuming there's a render function for settings or we just update specific labels
                const labelEl = document.getElementById('current-sound-label');
                if (labelEl) {
                    const mode = localStorage.getItem('notif_mode') || 'voice_normal';
                    const labels = { 'off': 'Mati (Hening)', 'voice_normal': 'Suara', 'ding': 'Bunyi Burung', 'bell': 'Bunyi Bel' };
                    labelEl.innerText = labels[mode] || 'Mati (Hening)';
                }
            }
        }
    });
}

function updateProfileLabels() {
    const pRoleEl = document.getElementById('profile-role');
    if (pRoleEl && session) {
        const roleId = session.role;
        const customName = (appConfig.roles && appConfig.roles[roleId]) ? appConfig.roles[roleId] : roleId.toUpperCase();
        pRoleEl.innerText = customName;
    }
}

function updateGreetingDisplay() {
    const greetEl = document.getElementById('header-greeting');
    if (!greetEl || !session) return;
    
    const name = (session.fullname || session.username || "User").split(' ')[0];
    greetEl.innerHTML = `Selamat ${getGreeting()}, <span id="user-fname" class="text-indigo-500">${name}</span> 👋`;
}

function getGreeting() {
    const hour = new Date().getHours();
    const s = appConfig.greeting_schedule || { pagi: 5, siang: 11, sore: 15, malam: 18 };
    if (hour >= s.malam || hour < s.pagi) return "malam";
    if (hour >= s.sore) return "sore";
    if (hour >= s.siang) return "siang";
    return "pagi";
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. IMMEDIATE UI SETUP
        if (typeof lucide !== 'undefined') lucide.createIcons();
        initCapacitor();

        if (!session) {
            console.warn("No session found, redirecting to login...");
            window.location.href = './login-apps.html';
            return;
        }

        // Set Profile Namen & Role Segera
        updateProfileLabels();
        updateGreetingDisplay();

        // 2. LOAD DATA ASYNC
        await Store.init();
        
        // Load & Listen to App Config
        initAppConfigListener();
        
        // Use cached permissions first
        const cachedPerms = localStorage.getItem('user_permissions');
        if (cachedPerms) {
            try {
                rolePermissions = JSON.parse(cachedPerms);
                updateUIByPermissions();
            } catch (e) {}
        }
        
        // Load Fresh Permissions from Firestore in background
        const permPromise = loadPermissions();
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000, 'timeout'));
        await Promise.race([permPromise, timeoutPromise]);

        // Update UI lagi setelah permissions & data lokal siap
        updateUIByPermissions();

        units = Store.getUnits();
        if (session.role === 'sa') {
            const uName = (session.fullname || session.username || "").toLowerCase();
            units = units.filter(u => (u.sa_name || "").toLowerCase() === uName);
        }
        logs = Store.getLogs();

        // Sort units: belum selesai di atas, lalu estimasi terdekat
        units.sort((a, b) => {
            if (a.status_idx === (steps.length - 1) && b.status_idx !== (steps.length - 1)) return 1;
            if (a.status_idx !== (steps.length - 1) && b.status_idx === (steps.length - 1)) return -1;
            return new Date(a.est_date) - new Date(b.est_date);
        });

        // Load SA List from Master Data
        try {
            const saSnap = await window.fbGetDocs(window.fbQuery(window.fbCollection(window.fbDB, "service_advisors"), window.fbOrderBy("fullname", "asc")));
            saList = saSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localStorage.setItem('tracking_sa_cache', JSON.stringify(saList));
        } catch (e) {
            saList = JSON.parse(localStorage.getItem('tracking_sa_cache')) || [];
        }

        initNotifsBadge();
        initSettings();
        populateSASelects(); 
        renderHome();
        renderDashboard();

        // 3. AKTIFKAN REALTIME UNITS (PENTING!)
        initUnitsRealtime();
        
        // 4. AKTIFKAN MOBILE BACK BUTTON SUPPORT & CAPACITOR
        initCapacitor();
        
        // Langsung tampilkan dashboard home
        switchView('home');
    } catch (err) {
        console.error("Critical error during initialization:", err);
        renderHome();
    }
});

async function loadPermissions() {
    if (!session || !window.fbDB) return;
    try {
        const db = window.fbDB;
        const q = window.fbQuery(window.fbCollection(db, "permissions"), window.fbWhere("role", "==", session.role));
        const snap = await window.fbGetDocs(q);
        if (!snap.empty) {
            rolePermissions = snap.docs[0].data();
            localStorage.setItem('user_permissions', JSON.stringify(rolePermissions));
        } else {
            // Default Fallback
            const r = session.role;
            // Hanya Admin BP, GH, Umum, dan Paujan/Admin yang punya izin LENGKAP (Paham ya!)
            const rLower = r ? r.toLowerCase() : '';
            const uLower = session.username.toLowerCase();
            const isAdmin = ['admin_bp', 'umum', 'gh'].includes(rLower) || uLower === 'paujan' || uLower === 'admin';
            
            if (isAdmin) {
                // Admin/GH bisa semua
                rolePermissions = { can_add: true, can_edit: true, can_delete: true, can_status: true };
            } else if (rLower === 'sa') {
                // SA bisa edit estimasi (lewat logic toggleEditMode) tapi GAK BISA TAMBAH
                rolePermissions = { can_add: false, can_edit: true, can_delete: false, can_status: false };
            } else {
                // Roles lainnya (QC, Koordinator, Foreman baru, dll) - Hanya Pantau & Status
                rolePermissions = { can_add: false, can_edit: false, can_delete: false, can_status: true };
            }
        }
    } catch (e) { console.error("Error load permissions:", e); }
}

function populateSASelects() {
    const sList = Store.getSAList();
    const dropdowns = [
        { id: 'add-sa', defaultLabel: 'Pilih SA...', defaultValue: '' },
        { id: 'edit-sa-select', defaultLabel: 'Pilih SA...', defaultValue: '' },
        { id: 'home-filter-sa', defaultLabel: 'Filter SA...', defaultValue: 'all' },
        { id: 'filter-sa', defaultLabel: 'Filter SA...', defaultValue: 'all' }
    ];
    
    dropdowns.forEach(d => {
        const el = document.getElementById(d.id);
        if (!el) return;
        
        let html = `<option value="${d.defaultValue}">${d.defaultLabel}</option>`;
        sList.forEach(sa => {
            const name = sa.fullname || sa.username;
            html += `<option value="${name}">${name}</option>`;
        });
        el.innerHTML = html;

        // Auto-select jika role adalah SA
        if (session.role === 'sa') {
            const myName = session.fullname || session.username;
            if (d.id === 'add-sa' || d.id === 'edit-sa-select') {
                el.value = myName;
            } else if (d.id === 'home-filter-sa' || d.id === 'filter-sa') {
                el.value = myName;
            }
        }
    });
}

window.setFilterStatus = function(status) {
    console.log("Setting home filter to:", status);
    showToast("Memfilter...");
    activeFilterStatus = status;
    const ids = ['all', 'process', 'done', 'late'];
    
    // Legacy Small Buttons (if any)
    ids.forEach(id => {
        const btn = document.getElementById('fs-' + id);
        if (btn) {
            if (id === status) {
                btn.className = (id === 'late') ? "flex-1 py-2 rounded-xl text-xs font-bold bg-red-600 text-white shadow-md active:scale-95 transition" : "flex-1 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md active:scale-95 transition";
            } else {
                btn.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 active:scale-95 transition";
            }
        }
    });

    // New Summary Cards Styling
    ids.forEach(id => {
        const card = document.getElementById('card-filter-' + id);
        if (card) {
            const p = card.querySelector('p');
            const h2 = card.querySelector('h2');
            
            if (id === status) {
                // ACTIVE: Indigo background, solid white text
                card.className = "bg-indigo-600 dark:bg-indigo-700 p-4 rounded-[22px] text-white shadow-lg relative h-24 flex flex-col justify-between overflow-hidden cursor-pointer active:scale-[0.98] transition-all z-10";
                if (p) p.className = "text-[10px] font-bold text-white/80 uppercase tracking-wider";
                if (h2) h2.className = "text-3xl font-black mt-1 text-white";
            } else {
                // INACTIVE: Clean white background, clear slate text
                card.className = "bg-white dark:bg-slate-800 p-4 rounded-[22px] border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all h-24 relative overflow-hidden";
                if (p) p.className = "text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider";
                if (h2) h2.className = "text-3xl font-black text-slate-800 dark:text-white mt-1";
            }
        }
    });

    applyHomeFilter();
};


function applyHomeFilter() {
    const btn = document.getElementById('btn-filter-apply');
    if (btn) {
        const orig = btn.innerText;
        btn.innerText = "Menerapkan...";
        btn.disabled = true;
        setTimeout(() => {
            renderHome();
            closeModal('filter-modal');
            btn.innerText = orig;
            btn.disabled = false;
        }, 600);
    } else {
        renderHome();
        closeModal('filter-modal');
    }
}

function resetHomeFilter() {
    const start = document.getElementById('home-filter-start');
    const end = document.getElementById('home-filter-end');
    const sa = document.getElementById('home-filter-sa');
    const search = document.getElementById('search-input');
    
    if (start) start.value = '';
    if (end) end.value = '';
    if (sa) sa.value = 'all';
    if (search) search.value = '';
    
    activeFilterStatus = 'all';
    setFilterStatus('all');
    renderHome();
    closeModal('filter-modal');
    showToast("? Filter berhasil direset!", 'success');
}


function updateUIByPermissions() {
    // FAB / TAMBAH UNIT
    if (rolePermissions.can_add) {
        if (document.getElementById('nav-fab-container')) document.getElementById('nav-fab-container').style.display = 'flex';
        if (document.getElementById('btn-floating-add')) document.getElementById('btn-floating-add').style.display = 'flex';
        if (document.getElementById('nav-monitor-center')) document.getElementById('nav-monitor-center').style.display = 'none';
        if (document.getElementById('nav-monitor-left')) document.getElementById('nav-monitor-left').style.display = 'flex';
        // Sembunyikan filter di nav biar gak kepenuhan (sudah ada di header)
        if (document.getElementById('nav-filter-umum')) document.getElementById('nav-filter-umum').style.display = 'none';
    } else {
        if (document.getElementById('nav-fab-container')) document.getElementById('nav-fab-container').style.display = 'none';
        if (document.getElementById('btn-floating-add')) document.getElementById('btn-floating-add').style.display = 'none';
        if (document.getElementById('nav-monitor-center')) document.getElementById('nav-monitor-center').style.display = 'flex';
        if (document.getElementById('nav-monitor-left')) document.getElementById('nav-monitor-left').style.display = 'none';
        if (document.getElementById('nav-filter-umum')) document.getElementById('nav-filter-umum').style.display = 'flex';
    }

    // SEMBUNYIKAN FILTER SA UNTUK ROLE SA (Paham ya!)
    if (session.role === 'sa') {
        const hideIds = ['home-filter-sa-container', 'add-sa-container', 'edit-sa-container'];
        hideIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }
}

// --- UTILS ---
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

function formatDateIndo(dStr) {
    if (!dStr) return '-';
    try {
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return dStr;
        const mNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        return `${d.getDate()} ${mNames[d.getMonth()]} ${d.getFullYear()}`;
    } catch (e) { return dStr; }
}

function getDuration(dStr) {
    try {
        const s = new Date(dStr); s.setHours(0, 0, 0, 0);
        const n = new Date(); n.setHours(0, 0, 0, 0);
        if (isNaN(s.getTime())) return 0;
        const diff = Math.floor((n - s) / 86400000);
        return diff < 0 ? 0 : diff;
    } catch (e) { return 0; }
}

function openExternal(url) {
    window.open(url, '_system');
}

function formatDateTime(dStr) {
    if (!dStr) return '-';
    try {
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return dStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) { return dStr; }
}

function handleRefresh(btn) {
    if (!btn) { 
        window.location.href = window.location.pathname + "?v=" + Date.now();
        return; 
    }
    const icon = btn.querySelector('svg') || btn.querySelector('i');
    if (icon) {
        icon.classList.add('animate-spin');
        // Force hard refresh after animation
        setTimeout(() => {
            window.location.href = window.location.pathname + "?v=" + Date.now();
        }, 1000);
    } else {
        window.location.href = window.location.pathname + "?v=" + Date.now();
    }
}

// removed duplicate showToast

function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('open');
        document.body.classList.add('noscroll');

        // Track modal in our stack
        if (!modalStack.includes(id)) {
            modalStack.push(id);
        }

        // Pastikan tombol filter chart selalu punya teks "Terapkan"
        if (id === 'chart-filter-modal') {
            setTimeout(() => {
                const btn = document.querySelector('#chart-filter-modal button.bg-indigo-600');
                if (btn && (!btn.innerText || btn.innerText.trim() === '')) {
                    btn.innerText = 'Terapkan';
                }
            }, 50);
        }

        // Android Back Button Support via History API
        if (window.history && window.history.pushState) {
            window.history.pushState({ modalId: id }, "", "#modal-" + id);
        }
    } else {
        console.error('Modal not found:', id);
    }
}

let isBackActive = false; // Flag to prevent double-back

function closeModal(id, fromHistory = false) {
    const el = document.getElementById(id);
    if (!el || !el.classList.contains('open')) return;

    // Remove from stack
    modalStack = modalStack.filter(m => m !== id);

    // If NOT triggered by history (user clicked X or overlay), navigate back in history
    if (!fromHistory && window.location.hash === '#modal-' + id) {
        window.history.back();
        // The actual removal of 'open' class will happen via popstate
        return;
    }

    el.classList.remove('open');

    // Only remove noscroll if NO other modals are open
    if (document.querySelectorAll('.overlay.open').length === 0) {
        document.body.classList.remove('noscroll');
    }
}

// Deep integration for Android Back Button via Capacitor (if available)
function initCapacitor() {
    try {
        // Push an initial safe state so the WebView never runs out of history entries
        if (window.history && window.history.replaceState) {
            window.history.replaceState({ view: 'home', root: true }, '', window.location.pathname);
        }

        // Cek apakah plugin App tersedia (Standard Capacitor)
        const App = window.Capacitor?.Plugins?.App;
        if (App) {
            console.log("✅ Capacitor App plugin detected, registering back button handler");
            App.addListener('backButton', (evt) => {
                console.log("🔙 Hardware Back Button Captured (Capacitor)");

                // Jika sudah ditangani oleh popstate, abaikan
                if (isBackActive) return;
                isBackActive = true;
                setTimeout(() => { isBackActive = false; }, 300);

                // 1. First Priority: Close open modals/popups (top-most first)
                const openedModals = document.querySelectorAll('.overlay.open');
                if (openedModals.length > 0) {
                    const lastModal = openedModals[openedModals.length - 1];
                    // Directly close the modal UI
                    lastModal.classList.remove('open');
                    modalStack = modalStack.filter(m => m !== lastModal.id);
                    if (document.querySelectorAll('.overlay.open').length === 0) {
                        document.body.classList.remove('noscroll');
                    }
                    // Clean up the history hash
                    if (window.location.hash.includes('modal-')) {
                        window.history.back();
                    }
                    return;
                }

                // 2. Second Priority: Close Active Sub-Views (to Dashboard/Home)
                const currentView = document.querySelector('.view-section.active');
                if (currentView && currentView.id !== 'view-home') {
                    const vid = currentView.id;
                    if (vid === 'view-division-detail') {
                        switchView('monitor');
                    } else if (vid === 'view-settings') {
                        switchView('profile');
                    } else {
                        switchView('home');
                    }
                    return;
                }

                // 3. Exit App (Double click to confirm)
                const now = Date.now();
                if (now - lastBackPress < 2000) {
                    try { App.exitApp(); } catch(e) { }
                } else {
                    lastBackPress = now;
                    showToast("Klik sekali lagi untuk keluar");
                }
            });
        } else {
            console.log("ℹ️ Capacitor App plugin not available, using popstate-only fallback");
        }
    } catch (e) {
        console.warn("Capacitor init error:", e);
    }
}

window.addEventListener('popstate', function (event) {
    // Prevent double-handling with Capacitor
    if (isBackActive) return;
    isBackActive = true;
    setTimeout(() => { isBackActive = false; }, 300);

    // 1. Tangani Modal (close top-most open modal)
    const modals = document.querySelectorAll('.overlay.open');
    if (modals.length > 0) {
        const lastModal = modals[modals.length - 1];
        // Directly close modal UI (fromHistory=true so it doesn't call history.back again)
        lastModal.classList.remove('open');
        modalStack = modalStack.filter(m => m !== lastModal.id);
        if (document.querySelectorAll('.overlay.open').length === 0) {
            document.body.classList.remove('noscroll');
        }
        return;
    }

    // 2. Tangani View (Jika ada state)
    if (event.state && event.state.view) {
        switchView(event.state.view, true); // true agar tidak pushState lagi
    } else if (event.state && event.state.root) {
        // We hit the root state, stay on home - don't let the app exit
        switchView('home', true);
    } else {
        // Safety net: push back a state so the app doesn't exit
        const currentView = document.querySelector('.view-section.active');
        if (currentView && currentView.id !== 'view-home') {
            switchView('home', true);
        } else {
            // Already on home, push a safe state to prevent app close
            window.history.pushState({ view: 'home', root: true }, '', window.location.pathname);
            showToast("Klik sekali lagi untuk keluar");
        }
    }
});

function switchView(v, fromHistory = false) {
    if (!v) return;
    if (v === 'home' && !fromHistory) {
        // Reset stack when going home
        window.history.replaceState({ view: 'home' }, "", "#home");
    } else if (!fromHistory) {
        window.history.pushState({ view: v }, "", "#view-" + v);
    }
    console.log("🏙️ Switching view to: " + v);

    // 1. Reset all views
    const views = document.querySelectorAll('.view-section');
    views.forEach(view => {
        view.classList.remove('active');
        view.style.display = 'none';
    });

    // 2. Activate target view
    const target = document.getElementById('view-' + v);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    // 2.5 Update Header Title Dinamis
    const headerTitle = document.getElementById('header-title');
    const headerGreeting = document.getElementById('header-greeting');
    if (headerTitle) {
        const tMap = {
            'home': 'Dashboard',
            'monitor': 'Pantau Unit',
            'chart': 'Statistik',
            'profile': 'Profil Saya',
            'settings': 'Pengaturan App',
            'division-detail': 'Detail Unit'
        };
        headerTitle.innerText = tMap[v] || 'Dashboard';
        
        // Selalu tampilkan header (Tugas sebelumnya menyembunyikan header di settings)
        headerTitle.parentElement.parentElement.style.opacity = '1';
        headerTitle.parentElement.parentElement.style.pointerEvents = 'auto';

        // Tampilkan greeting HANYA di Home
        if (headerGreeting) {
            headerGreeting.style.display = (v === 'home') ? 'block' : 'none';
        }
    }

    // 3. Update Bottom Nav
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.target === v) {
            item.classList.add('active');
        }
    });

    // 4. Trigger specific rendering
    if (v === 'home') renderHome();
    else if (v === 'monitor') renderDashboard();
    else if (v === 'chart') loadChartData();
    else if (v === 'profile') {
        const pName = document.getElementById('profile-name');
        if (pName && session) pName.innerText = session.fullname || session.username || "User";
    }
    else if (v === 'settings') {
        const labelEl = document.getElementById('current-sound-label');
        const mode = localStorage.getItem('notif_mode') || 'voice_normal';
        const labels = { 'off': 'Mati (Hening)', 'voice_normal': 'Suara', 'ding': 'Bunyi Burung', 'bell': 'Bunyi Bel' };
        if (labelEl) labelEl.innerText = labels[mode] || 'Mati (Hening)';
    }

    window.scrollTo(0, 0);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- NOTIFICATIONS ---
function initNotifsBadge() {
    const notifs = Store.getNotifs();
    const unread = notifs.filter(n => !n.is_read).length;
    let badge = document.getElementById('notif-badge');

    if (!badge && unread > 0) {
        // Create it if doesn't exist
        const bellBtn = document.getElementById('notif-btn-wrapper');
        if (bellBtn) {
            badge = document.createElement('span');
            badge.id = 'notif-badge';
            badge.className = 'absolute -top-1 -right-0.5 bg-red-600 text-white text-[10px] font-extrabold min-w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-lg px-1 transition-all z-10';
            bellBtn.appendChild(badge);
        }
    }

    if (badge) {
        if (unread > 0) {
            badge.style.display = 'flex';
            badge.innerText = unread > 99 ? '99' : unread;
            // Pulse animation once when unread increases
            badge.classList.add('animate-bounce');
            setTimeout(() => badge.classList.remove('animate-bounce'), 1000);
        } else {
            badge.style.display = 'none';
        }
    }

    // UPDATE ALERT BAR HOME
    const alertBar = document.getElementById('unread-notif-alert');
    const alertCount = document.getElementById('unread-count-alert');
    if (alertBar) {
        if (unread > 0) {
            alertBar.style.display = 'flex';
            if (alertCount) alertCount.innerText = unread;
        } else {
            alertBar.style.display = 'none';
        }
    }

    // Tampilkan tombol BERSERSIHKAN hanya untuk Admin/GH (umum)
    const clearBtn = document.getElementById('btn-clear-notifs');
    if (clearBtn) {
        const notifs = Store.getNotifs();
        const isAdmin = (session.role === 'admin_bp' || session.role === 'umum');
        clearBtn.style.display = (isAdmin && notifs.length > 0) ? 'block' : 'none';
    }
}

function clearNotifHistory() {
    openModal('notif-confirm-modal');
    document.getElementById('notif-confirm-title').innerText = "Hapus Semua?";
    document.getElementById('notif-confirm-msg').innerText = "Tindakan ini akan menghapus seluruh riwayat notifikasi secara permanen untuk semua role. Lanjutkan?";
    
    // Set temp function for execution
    window._executeConfirm = async () => {
         closeModal('notif-confirm-modal');
         // Langsung panggil clear
         if (typeof Store !== 'undefined' && Store.clearAllNotifications) {
              await Store.clearAllNotifications();
         }
         showToast("? Riwayat notifikasi berhasil dikosongkan!", 'success');
         renderNotifs();
         initNotifsBadge();
    };
}

function executeToggleSound() {
    if (window._executeConfirm) {
        window._executeConfirm();
        window._executeConfirm = null;
    }
}

function cancelToggleSound() {
    closeModal('notif-confirm-modal');
    // Revert switch position if it was a toggle action
    const toggler = document.getElementById('toggle-notif-sound');
    if (toggler && window._toggleRevertState !== undefined) {
        toggler.checked = window._toggleRevertState;
    }
}

function confirmToggleSound(isActive) {
    const mode = isActive ? 'voice_normal' : 'off';
    localStorage.setItem('notif_mode', mode);
    
    // Show success modal (Pop-up Scroll) immediately
    openModal('notif-success-modal');
    const successTitle = document.querySelector('#notif-success-modal h3');
    const successMsg = document.querySelector('#notif-success-modal p');
    
    if (isActive) {
        if (successTitle) successTitle.innerText = "Suara Aktif";
        if (successMsg) successMsg.innerText = "Suara notifikasi berhasil diaktifkan.";
        playNotifSound("Suara notifikasi diaktifkan");
    } else {
        if (successTitle) successTitle.innerText = "Suara Nonaktif";
        if (successMsg) successMsg.innerText = "Mode suara notifikasi dinonaktifkan.";
    }
}

function initSettings() {
    const mode = localStorage.getItem('notif_mode') || 'voice_normal';
    const toggler = document.getElementById('toggle-notif-sound');
    if (toggler) {
        toggler.checked = (mode === 'voice_normal');
    }
}

function openNotifs() {
    renderNotifs();
    openModal('notif-modal');
    // Disabled automatic mark as read, let user manually mark them
    // Store.markNotifsAsRead();
    // setTimeout(initNotifsBadge, 500);
}

function openNotifModal() {
    openNotifs();
}

function markAllAsRead() {
    Store.markNotifsAsRead();
    showToast("? Semua notifikasi ditandai dibaca!", 'success');
    renderNotifs();
    initNotifsBadge();
}

function markNotifAsRead(id) {
    Store.markNotifAsRead(id);
    renderNotifs();
    initNotifsBadge();
}

function deleteNotif(id) {
    Store.deleteNotification(id);
    showToast("? Notifikasi berhasil dihapus!", 'success');
    renderNotifs();
    initNotifsBadge();
}



// Pilihan Suara (Pop Up Scroll)
function openSoundPicker() {
    openModal('sound-modal');
}

function selectSound(mode, label) {
    localStorage.setItem('notif_mode', mode);
    // document.getElementById('current-sound-label').innerText = label;
    // const iconEl = document.getElementById('current-sound-icon');
    // if (iconEl) iconEl.style.display = 'none';

    closeModal('sound-modal');
    showToast("Suara: " + label);

    // Test Sound
    if (mode === 'voice_normal') {
        playNotifSound("Testing suara berhasil.");
    }
}

// Helper untuk bunyi Tanpa File (Biar gak berat)
function playTone(freq, type, duration) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        setTimeout(() => oscillator.stop(), duration * 1000);
    } catch (e) { }
}

function renderNotifs() {
    const list = document.getElementById('notif-list');
    if (!list) return;

    // Ambil data fresh dari Store
    const notifs = Store.getNotifs();
    console.log("Rendering " + notifs.length + " notifs");
    list.innerHTML = '';

    // Update total badge
    const countBadge = document.getElementById('notif-count-badge');
    if (countBadge) {
        const unreadCount = notifs.filter(n => !n.is_read).length;
        countBadge.innerText = unreadCount > 0 ? unreadCount : notifs.length;
        countBadge.className = unreadCount > 0
            ? 'text-[10px] font-black text-white bg-red-500 rounded-full w-6 h-6 flex items-center justify-center animate-pulse'
            : 'text-[10px] font-black text-white bg-slate-400 rounded-full w-6 h-6 flex items-center justify-center';
    }

    // Tampilkan tombol "Bersihkan" hanya untuk Admin/GH dan Jika ada data
    const btnClear = document.getElementById('btn-clear-notifs');
    if (btnClear) {
        const isAdmin = (session.role === 'admin_bp' || session.role === 'umum');
        btnClear.style.display = (isAdmin && notifs.length > 0) ? 'flex' : 'none';
    }

    if (notifs.length === 0) {
        list.innerHTML = `<div class="text-center py-20 opacity-50">
            <div class="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-[24px] flex items-center justify-center mx-auto mb-4 text-slate-400">
                <i data-lucide="bell" class="w-8 h-8"></i>
            </div>
            <p class="text-xs font-bold text-slate-500 italic">Belum ada notifikasi.</p>
        </div>`;
    } else {
        notifs.forEach(n => {
            let displayTime = n.time;
            try {
                const d = new Date(n.time);
                if (!isNaN(d.getTime())) {
                    displayTime = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ', ' + formatDateIndo(n.time);
                }
            } catch (e) { }

            const isAdmin = (session.role === 'admin_bp' || session.role === 'umum');

            list.innerHTML += `<div class="group flex gap-3.5 p-4 rounded-2xl border border-slate-50 dark:border-slate-800 transition-all ${n.is_read ? 'bg-white opacity-60' : 'bg-indigo-50/40 border-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-900/50 shadow-sm'}">
                <div class="w-10 h-10 rounded-xl ${n.is_read ? 'bg-slate-50 dark:bg-slate-700 text-slate-400' : 'bg-indigo-100 dark:bg-indigo-400/20 text-indigo-600'} flex items-center justify-center shrink-0">
                    <i data-lucide="${n.is_read ? 'bell' : 'bell-ring'}" class="w-5 h-5 ${!n.is_read ? 'animate-pulse' : ''}"></i>
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start gap-2">
                        <p class="text-[13px] font-bold text-slate-800 dark:text-slate-100 leading-tight">${n.text}</p>
                        <div class="flex gap-1 shrink-0">
                            ${!n.is_read ? `<button onclick="markNotifAsRead('${n.id}')" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md active:scale-90 transition"><i data-lucide="check" class="w-3.5 h-3.5"></i></button>` : ''}
                            ${isAdmin ? `<button onclick="deleteNotif('${n.id}')" class="w-7 h-7 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg flex items-center justify-center active:scale-90 transition border border-red-200 dark:border-red-900/50"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 mt-2">
                         <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">${displayTime}</span>
                         ${!n.is_read ? `<span class="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse"></span>` : ''}
                    </div>
                </div>
            </div>`;
        });
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openSparepartDetail() {
    const listData = units.filter(u => u.is_waiting_sparepart && u.status_idx < (steps.length - 1));
    renderDivisionGrid(listData, "Tunggu Sparepart");
    switchView('division-detail');
}

function renderDivisionGrid(data, title) {
    const container = document.getElementById('div-detail-list');
    if (!container) return;
    
    currentDivData = data;
    currentDivFilter = 'all'; // Reset filter when opening new division
    
    if (title) {
        currentDivTitle = title;
        document.getElementById('div-detail-title').innerText = title;
    }

    // RESET SEARCH INPUT
    const searchInput = document.getElementById('div-detail-search');
    if (searchInput) searchInput.value = '';

    // UPDATE SUMMARY CARDS COUNTS
    const total = data.length;
    const working = data.filter(u => u.is_working).length;
    const queue = total - working;

    if (document.getElementById('div-total-c')) document.getElementById('div-total-c').innerText = total;
    if (document.getElementById('div-working-c')) document.getElementById('div-working-c').innerText = working;
    if (document.getElementById('div-queue-c')) document.getElementById('div-queue-c').innerText = queue;

    handleDivSearch(); // This will also handle the UI styling
}

window.setDivFilter = function(mode) {
    console.log("Setting div filter to:", mode);
    currentDivFilter = mode;
    handleDivSearch();
};

window.handleDivSearch = function() {
    const queryEl = document.getElementById('div-detail-search');
    const query = queryEl ? queryEl.value.toLowerCase() : "";
    
    if (query || currentDivFilter !== 'all') {
        showToast("Memfilter...");
    }

    // APPLY CARD FILTER FIRST
    let filtered = currentDivData || [];
    if (currentDivFilter === 'working') {
        filtered = filtered.filter(u => u.is_working === true);
    } else if (currentDivFilter === 'queue') {
        filtered = filtered.filter(u => u.is_working !== true);
    }

    // THEN APPLY SEARCH TEXT
    if (query) {
        filtered = filtered.filter(u => 
            (u.plate && u.plate.toLowerCase().includes(query)) || 
            (u.sa_name && u.sa_name.toLowerCase().includes(query)) ||
            (u.model && u.model.toLowerCase().includes(query))
        );
    }

    console.log(`🔍 Filtering Div [${currentDivFilter}] - Units Before: ${currentDivData.length}, Units After: ${filtered.length}`);

    // UPDATE CARD UI STYLING
    const cardMap = {
        'all': document.getElementById('card-div-total'),
        'working': document.getElementById('card-div-working'),
        'queue': document.getElementById('card-div-queue')
    };

    Object.keys(cardMap).forEach(key => {
        const card = cardMap[key];
        if (!card) return;
        const pTag = card.querySelector('p');
        const hTag = card.querySelector('h4');

        if (key === currentDivFilter) {
            card.className = "bg-indigo-600 p-3.5 rounded-[22px] text-white shadow-lg shadow-indigo-100 dark:shadow-none transition-all cursor-pointer scale-[1.02]";
            if (pTag) pTag.className = "text-[8px] font-bold opacity-70 uppercase mb-1 tracking-wider leading-none";
            if (hTag) hTag.className = "text-xl font-black";
        } else {
            card.className = "bg-white dark:bg-slate-800 p-3.5 rounded-[22px] border border-slate-100 dark:border-slate-700 shadow-sm transition-all cursor-pointer opacity-60";
            if (pTag) pTag.className = "text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1 tracking-wider leading-none";
            if (hTag) hTag.className = "text-xl font-black text-slate-800 dark:text-white";
        }
    });

    renderDivList(filtered);
};

function renderDivList(data) {
    const container = document.getElementById('div-detail-list');
    if (!container) return;
    container.innerHTML = '';
    
    if (data.length === 0) {
        container.innerHTML = `<div class="text-center py-12 text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            <i data-lucide="info" class="w-8 h-8 mx-auto mb-2 opacity-20"></i>
            <p class="text-xs">Tidak ada unit ditemukan.</p>
        </div>`;
    } else {
        data.forEach(u => container.innerHTML += createUnitCard(u, steps));
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleSoundSetting() {
    const el = document.getElementById('setting-sound-mode');
    if (el) {
        const mode = el.value;
        localStorage.setItem('notif_sound_mode', mode);

        let testMsg = "Halo Pak, Suara diaktifkan.";
        if (mode === 'voice_slow') testMsg = "Halo Pak, suara pelan diaktifkan.";

        if (mode !== 'off') playNotifSound(testMsg);
    }
}

// Mengeja angka satu per satu (misal: 1234 -> satu dua tiga empat)
function spellPlateNumber(plate) {
    if (!plate) return "";
    return plate.split('').map(char => {
        if (/\d/.test(char)) return char + " "; // Kasih spasi biar dieja satu-satu
        return char;
    }).join('');
}

function playNotifSound(message) {
    const mode = localStorage.getItem('notif_mode') || 'voice_normal';
    if (mode === 'off' || !message) return;

    // 1. Sound Alert (Bunyi pendek sebelum suara)
    if (mode === 'voice_normal') {
        try {
            const audio = new Audio('https://www.soundjay.com/buttons/sounds/button-3.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.warn("Audio play blocked", e));
        } catch (e) { }
    } else if (mode === 'ding') {
        playTone(880, "sine", 0.5); return;
    } else if (mode === 'bell') {
        playTone(660, "triangle", 0.5);
        setTimeout(() => playTone(880, "triangle", 0.8), 300); return;
    }

    // 2. Proses teks plat nomor agar dieja satu per satu
    let processedMessage = message;
    
    // Custom Template Logic:
    // Pindah posisi: "[PLATE] telah pindah ke [POSISI]"
    // Selesai: "Hore! Unit [PLATE] sudah selesai"
    if (message.includes('pindah ke')) {
        const template = appConfig.notif_template_pindah || 'Unit [PLATE] telah pindah posisi ke [POSISI]';
        const plateMatch = message.match(/Unit ([A-Z0-9\s]+) pindah ke/);
        const posisiMatch = message.match(/pindah ke ([^,]+)/);
        if (plateMatch && posisiMatch) {
            processedMessage = template.replace('[PLATE]', plateMatch[1].trim())
                                       .replace('[POSISI]', posisiMatch[1].trim());
        }
    } else if (message.includes('sudah selesai')) {
        const template = appConfig.notif_template_selesai || 'Hore! Unit [PLATE] sudah selesai dikerjakan';
        const plateMatch = message.match(/Unit ([A-Z0-9\s]+) sudah selesai/);
        if (plateMatch) {
            processedMessage = template.replace('[PLATE]', plateMatch[1].trim());
        }
    } else if (message.includes('telah ditugaskan')) {
        const template = appConfig.notif_template_baru || 'Unit baru [PLATE] telah didaftarkan untuk Service Advisor [SA]';
        const plateMatch = message.match(/Unit Baru ([A-Z0-9\s]+) telah ditugaskan/);
        const saMatch = message.match(/kepada ([^,]+)/);
        if (plateMatch && saMatch) {
            processedMessage = template.replace('[PLATE]', plateMatch[1].trim())
                                       .replace('[SA]', saMatch[1].trim());
        }
    } else if (message.includes('update data')) {
        const template = appConfig.notif_template_update_sa || 'Halo [SA], unit [PLATE] Anda telah diperbarui ke posisi [POSISI]';
        const plateMatch = message.match(/Unit ([A-Z0-9\s]+) update data/);
        const saMatch = message.match(/target: ([^,]+)/);
        const posisiMatch = message.match(/posisi: ([^,]+)/);
        if (plateMatch && saMatch) {
            processedMessage = template.replace('[SA]', saMatch[1].trim())
                                       .replace('[PLATE]', plateMatch[1].trim())
                                       .replace('[POSISI]', posisiMatch ? posisiMatch[1].trim() : '-');
        }
    }

    processedMessage = processedMessage.replace(/[A-Z0-9]{3,}/g, m => spellPlateNumber(m));

    // ============================================================
    // PRIORITAS 1: Gunakan Android Native TTS (Untuk APK/WebView)
    // Bridge "AndroidTTS" di-inject dari MainActivity.java
    // ============================================================
    if (typeof AndroidTTS !== 'undefined') {
        try {
            const rate = (mode === 'voice_slow') ? 0.7 : 1.0;
            const pitch = 1.35; // Suara feminine
            AndroidTTS.speakWithRate(processedMessage, rate, pitch);
            console.log("🔊 TTS Android Native: " + processedMessage);
            return; // Selesai, tidak perlu fallback
        } catch (e) {
            console.warn("Android TTS error, falling back to browser:", e);
        }
    }

    // ============================================================
    // PRIORITAS 2: Browser SpeechSynthesis (Untuk akses via browser biasa)
    // ============================================================
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 

        let spoken = false;
        const speakAction = () => {
            if (spoken) return;
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) return;

            const utterance = new SpeechSynthesisUtterance(processedMessage);
            utterance.lang = 'id-ID';
            utterance.rate = (mode === 'voice_slow') ? 0.7 : 1.1;
            
            // Set Pitch to sound more feminine (1.2 - 1.5)
            utterance.pitch = 1.35;

            // 1. Get Indonesian voices
            const idVoices = voices.filter(v => v.lang.toLowerCase().startsWith('id') || v.lang.toLowerCase().startsWith('in'));
            
            // 2. Prioritize GOOGLE Indonesian Female Voice
            let selectedVoice = null;
            const femaleKeywords = ['female', 'perempuan', 'wanita', 'dfz', 'wati', 'siti', 'gadis', 'putri', 'yasmin'];
            const maleKeywords = ['male', 'laki', 'pria', 'adam', 'budi', 'bagus', 'david', 'mark'];

            // Priority 1: Indonesian Google Voice with female characteristics (most common on Android)
            selectedVoice = idVoices.find(v => v.name.toLowerCase().includes('google') && !maleKeywords.some(kw => v.name.toLowerCase().includes(kw)));
            
            // Priority 2: Any Indonesian voice with female keywords
            if (!selectedVoice) selectedVoice = idVoices.find(v => femaleKeywords.some(kw => v.name.toLowerCase().includes(kw)));
            
            // Priority 3: Any Indonesian voice that doesn't mention 'male'
            if (!selectedVoice) selectedVoice = idVoices.find(v => !maleKeywords.some(kw => v.name.toLowerCase().includes(kw)));

            // Priority 4: Fallback to the first Indonesian voice
            if (!selectedVoice) selectedVoice = idVoices[0];
            
            if (selectedVoice) utterance.voice = selectedVoice;
            
            spoken = true;
            window.speechSynthesis.speak(utterance);
        };

        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
            const voiceListener = () => {
                speakAction();
                window.speechSynthesis.onvoiceschanged = null;
            };
            window.speechSynthesis.onvoiceschanged = voiceListener;
            setTimeout(() => { if (!spoken) speakAction(); window.speechSynthesis.onvoiceschanged = null; }, 2000);
        } else {
            speakAction();
        }
    }
}

// Unlock AudioContext di WebView (butuh interaksi user pertama kali)
(function unlockAudioForWebView() {
    const unlock = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
            console.log("🔓 AudioContext unlocked for WebView");
        } catch (e) { }
        document.removeEventListener('touchstart', unlock, true);
        document.removeEventListener('click', unlock, true);
    };
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('click', unlock, true);
})();

function renderHome() {
    let allUnits = Store.getUnits();
    if (session && session.role === 'sa') {
        const uName = (session.fullname || session.username || "").toLowerCase();
        allUnits = allUnits.filter(u => (u.sa_name || "").toLowerCase() === uName);
    }
    // Update global units for other views to be consistent
    units = allUnits; 

    const query = document.getElementById('search-input')?.value.toLowerCase() || '';
    const startVal = document.getElementById('home-filter-start')?.value;
    const endVal = document.getElementById('home-filter-end')?.value;
    const filterSA = document.getElementById('home-filter-sa')?.value || 'all';

    const startDate = startVal ? new Date(startVal) : null;
    const endDate = endVal ? new Date(endVal) : null;
    if (endDate) endDate.setHours(23, 59, 59);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let total = 0, process = 0, done = 0, late = 0;
    const listContainer = document.getElementById('unit-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const baseList = allUnits.filter(u => {
        const p = u.plate || '';
        const m = u.model || '';
        const matchSearch = p.toLowerCase().includes(query) || m.toLowerCase().includes(query);
        const dIn = new Date(u.date_in);
        const matchDate = (!startDate || dIn >= startDate) && (!endDate || dIn <= endDate);
        const matchSA = filterSA === 'all' || u.sa_name === filterSA;
        return matchSearch && matchDate && matchSA;
    });

    baseList.forEach(u => {
        total++;
        const sIdx = parseInt(u.status_idx || 0);
        const isDone = sIdx === (steps.length - 1);
        const isLate = !isDone && u.est_date && new Date(u.est_date) < today;

        if (isDone) done++;
        else process++;

        if (isLate) late++;
    });

    const filtered = baseList.filter(u => {
        const sIdx = parseInt(u.status_idx || 0);
        const isDone = sIdx === (steps.length - 1);
        const isLate = !isDone && u.est_date && new Date(u.est_date) < today;

        if (activeFilterStatus === 'process') return !isDone;
        if (activeFilterStatus === 'done') return isDone;
        if (activeFilterStatus === 'late') return isLate;
        return true;
    });

    if (filtered.length === 0) {
        let emptyMsg = query ? "Hasil pencarian tidak ada." : "Belum ada unit yang terdaftar.";
        if (activeFilterStatus === 'late') emptyMsg = "Bagus! Tidak ada unit yang terlambat.";
        
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 opacity-40">
                <div class="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-4">
                    <i data-lucide="inbox" class="w-10 h-10"></i>
                </div>
                <p class="text-xs font-bold">${emptyMsg}</p>
            </div>
        `;
    } else {
        const htmlList = filtered.sort((a, b) => {
            const valA = isNaN(a.id) ? new Date(a.date_in).getTime() : parseInt(a.id);
            const valB = isNaN(b.id) ? new Date(b.date_in).getTime() : parseInt(b.id);
            return valB - valA;
        }).map(u => createUnitCard(u, steps));
        listContainer.innerHTML = htmlList.join('');
    }

    // Update Card Counters Dinamis (Sesuai Filter)
    const cardTotal = document.getElementById('card-total');
    const cardProcess = document.getElementById('card-process');
    const cardDone = document.getElementById('card-done');
    const cardLate = document.getElementById('card-late');
    const labelTotal = document.getElementById('label-total');

    if (cardTotal) cardTotal.innerText = total;
    if (cardProcess) cardProcess.innerText = process;
    if (cardDone) cardDone.innerText = done;
    if (cardLate) cardLate.innerText = late;

    // Update Label Kartu Utama
    if (labelTotal) {
        if (filterSA !== 'all') {
            labelTotal.innerText = "UNIT " + filterSA.split(' ')[0].toUpperCase();
        } else if (activeFilterStatus === 'all') {
            labelTotal.innerText = "TOTAL UNIT";
        } else if (activeFilterStatus === 'process') {
            labelTotal.innerText = "TOTAL PROSES";
        } else if (activeFilterStatus === 'done') {
            labelTotal.innerText = "TOTAL SELESAI";
        } else if (activeFilterStatus === 'late') {
            labelTotal.innerText = "TOTAL TELAT";
        } else {
            labelTotal.innerText = "TOTAL UNIT";
        }
    }
    lucide.createIcons();

    // Refresh Monitor data too
    renderDashboard();
}

function createUnitCard(u, steps) {
    const isDone = u.status_idx == (steps.length - 1);
    const pct = ((parseInt(u.status_idx) + 1) / steps.length) * 100;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isLate = new Date(u.est_date) < today && !isDone;
    
    const plate = u.plate || 'No Plate';
    const model = u.model || 'Unknown Model';
    
    let badgeClass = isDone ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : (isLate ? 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20' : (!u.is_working && u.status_idx > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-slate-50 text-slate-600 dark:bg-slate-700 dark:text-slate-300'));
    let badgeText = isDone ? 'SELESAI' : (isLate ? 'TERLAMBAT' : (!u.is_working && u.status_idx > 0 ? 'ANTRIAN ' : '') + steps[u.status_idx]);
    let barColor = isDone ? 'bg-green-500' : (isLate ? 'bg-red-500' : 'bg-indigo-600');

    let durationText = `${getDuration(u.date_in)} Hari`;
    let durationClass = "font-bold text-slate-700 dark:text-slate-200";
    if (isLate) {
        const estD = new Date(u.est_date); estD.setHours(0, 0, 0, 0);
        const diff = Math.floor((today - estD) / 86400000);
        durationText = `Telat ${diff} Hari`;
        durationClass = "font-bold text-red-600 dark:text-red-400";
    }

    let sparepartBadge = u.is_waiting_sparepart ? `<span class="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wide whitespace-nowrap"><i data-lucide="package" class="w-2.5 h-2.5"></i>Tunggu Sparepart</span>` : '';
    
    let isAdminRole = session.role === 'umum' || session.role === 'gh' || session.role === 'admin_bp';
    
    return `<div class="bg-white dark:bg-slate-800 p-5 rounded-[20px] shadow-sm border border-slate-100 dark:border-slate-700 active:scale-[0.98] transition-all cursor-pointer group" onclick="openDetail('${u.id}')">
    <div class="flex justify-between items-start mb-3">
        <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-300 transition-colors group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600">
                <i data-lucide="car-front" class="w-6 h-6"></i>
            </div>
            <div>
                <h3 class="font-bold text-slate-900 dark:text-white text-base leading-tight">${model}</h3>
                <span class="tracking-tight font-bold text-slate-500 text-xs bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-600">${plate}</span>
                <span class="font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-[9px] uppercase px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 ml-1 whitespace-nowrap">${u.sa_name || '-'}</span>
            </div>
        </div>
        <div class="flex flex-col items-end gap-1">
            <span class="text-[9px] font-bold px-2 py-1 rounded-lg ${badgeClass} uppercase tracking-wide border border-slate-100 dark:border-slate-600 shadow-sm whitespace-nowrap">${badgeText}</span>
            ${sparepartBadge}
        </div>
    </div>
    <div class="flex gap-2 text-[10px] text-slate-500 mb-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
        <div class="flex-1 text-center border-r border-slate-200 dark:border-slate-700">
            <span class="block text-slate-400 font-bold uppercase text-[8px] mb-0.5">Masuk</span>
            <span class="font-bold text-slate-700 dark:text-slate-200">${formatDateIndo(u.date_in)}</span>
        </div>
        <div class="flex-1 text-center border-r border-slate-200 dark:border-slate-700">
            <span class="block text-slate-400 font-bold uppercase text-[8px] mb-0.5">Estimasi</span>
            <span class="font-bold text-indigo-600 dark:text-indigo-400">${formatDateIndo(u.est_date)}</span>
        </div>
        <div class="flex-1 text-center">
            <span class="block text-slate-400 font-bold uppercase text-[8px] mb-0.5">Durasi</span>
            <span class="${durationClass}">${durationText}</span>
        </div>
    </div>
    <div class="mt-2">
        <div class="flex items-center gap-3 px-1">
            <div class="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div class="h-full ${barColor} rounded-full transition-all duration-700 ease-out shadow-sm" style="width:${pct}%"></div>
            </div>
            <span class="text-[9px] font-bold text-slate-400 w-6 text-right">${Math.round(pct)}%</span>
        </div>
        <div class="mt-2 flex justify-between items-center px-1">
            <div class="flex items-center gap-1.5">
                <i data-lucide="clock" class="w-2.5 h-2.5 text-slate-400"></i>
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Update : ${formatDateTime(u.updated_at || u.created_at)}</span>
            </div>
        </div>

        ${u.late_reason ? `
        <div class="mt-2.5 p-3.5 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-2xl">
            <div class="flex items-center gap-2 mb-1.5">
                <div class="w-5 h-5 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center text-red-600 dark:text-red-400">
                    <i data-lucide="alert-circle" class="w-3 h-3"></i>
                </div>
                <span class="text-[10px] font-black uppercase text-red-600 dark:text-red-400 tracking-wider">Alasan Keterlambatan:</span>
            </div>
            <p class="text-[12px] font-extrabold text-red-800 dark:text-red-300 leading-relaxed pl-1">"${u.late_reason}"</p>
        </div>` : ''}
    </div>
    </div>`;
}

// --- DETAIL MODAL ---
let currentDetailUnitId = null;

function openDetail(unitId) {
    try {
        currentDetailUnitId = unitId;
        const u = Store.getUnits().find(x => x.id == unitId);
        if (!u) {
            showToast("?? Unit tidak ditemukan", 'warning');
            return;
        }
        document.getElementById('detail-model').innerText = u.model || '-';
        document.getElementById('detail-plate').innerText = u.plate || '-';
        document.getElementById('detail-sa').innerText = u.sa_name || '-';
        document.getElementById('detail-color').innerText = u.color || '-';
        document.getElementById('detail-in').innerText = formatDateIndo(u.date_in);
        document.getElementById('detail-est').innerText = formatDateIndo(u.est_date);
        document.getElementById('detail-ket').innerText = u.keterangan || '-';
        renderTimeline(u);

        // Permissions dynamic UI
        const adminActions = document.getElementById('admin-actions-container');
        if (adminActions) {
            adminActions.style.display = rolePermissions.can_delete ? 'block' : 'none';
        }

        const btnEdit = document.getElementById('btn-edit-mode');
        if (btnEdit) {
            btnEdit.style.display = rolePermissions.can_edit ? 'inline-flex' : 'none';
        }

        // Show Late Reason in Detail if Any
        const detailKet = document.getElementById('detail-ket');
        const lateBadge = document.getElementById('detail-late-badge');
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const isDoneStep = parseInt(u.status_idx) === (steps.length - 1);
        const isLate = !isDoneStep && u.est_date && new Date(u.est_date) < today;
        
        if (lateBadge) lateBadge.style.display = isLate ? 'block' : 'none';

        if (u.late_reason) {
            detailKet.innerHTML = `${u.keterangan || '-'}<div class="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-100 dark:border-red-800/50 rounded-2xl shadow-sm"><div class="flex items-center gap-2 mb-2"><i data-lucide="info" class="w-4 h-4 text-red-500"></i><p class="text-[10px] font-black text-red-600 uppercase tracking-wider">Alasan Keterlambatan:</p></div><p class="text-sm text-red-700 dark:text-red-400 font-bold leading-relaxed">"${u.late_reason}"</p></div>`;
        } else {
            detailKet.innerText = u.keterangan || '-';
        }

        lucide.createIcons();
        openModal('detail-modal');
    } catch (err) {
        console.error("Error opening detail:", err);
        showToast("? Gagal membuka detail", 'error');
    }
}

function renderTimeline(u) {
    const container = document.getElementById('timeline-container');
    if (!container) return;
    container.innerHTML = '';
    const unitLogs = logs[u.id] || {};
    steps.forEach((step, idx) => {
        const isDone = idx <= u.status_idx;
        const isCur = idx == u.status_idx;
        const note = unitLogs[idx] || null;
        let iconClass = isDone ? 'done' : (isCur ? 'active' : '');
        let iconContent = isDone ? `<i data-lucide="check" class="w-4 h-4 stroke-[3px]"></i>` : '';
        let textClass = isDone ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-400 font-medium';
        const item = document.createElement('div');
        item.className = 'timeline-item';

        // CAN UPDATE STATUS CHECK
        if (rolePermissions.can_status) item.onclick = () => initUpdate(u.id, idx, step, note);

        item.innerHTML = `<div class="timeline-line"></div><div class="t-icon ${iconClass}">${iconContent}</div><div class="flex-1 pt-1"><p class="text-sm ${textClass}">${step}</p>${note ? `<div class="mt-1 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700">"${note}"</div>` : ''}${isCur && idx > 0 && idx < (steps.length - 1) ? `<span class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded mt-1 inline-block">${u.is_working ? 'Sedang Dikerjakan' : 'Dalam Antrian'}</span>` : ''}</div>`;
        container.appendChild(item);
    });
    lucide.createIcons();
}

// --- UPDATES & CRUD ---
function initUpdate(uid, idx, name, note) {
    document.getElementById('conf-unit-id').value = uid;
    document.getElementById('conf-step-idx').value = idx;
    document.getElementById('conf-step-name').innerText = name;
    document.getElementById('conf-note').value = note || '';
    const u = Store.getUnits().find(x => x.id == uid);
    
    if (u) {
        document.getElementById('conf-waiting-sparepart').checked = u.is_waiting_sparepart || false;
        
        // SEMBUNYIKAN JIKA UNIT MASUK ATAU UNIT SELESAI
        const isSpecialStep = (parseInt(idx) === 0 || parseInt(idx) === (steps.length - 1));
        const workingContainer = document.getElementById('conf-working-container');
        if (workingContainer) workingContainer.style.display = isSpecialStep ? 'none' : 'flex';

        // JIKA POSISI BERBEDA DARI SEBELUMNYA, DEFAULT OFF (ANTRIAN)
        const isDifferentStep = parseInt(u.status_idx) !== parseInt(idx);
        const isWorkingToggle = document.getElementById('conf-is-working');
        if (isWorkingToggle) {
            isWorkingToggle.checked = isDifferentStep ? false : (u.is_working || false);
            toggleWorkingLabel(isWorkingToggle.checked);
        }
    }
    openModal('confirm-modal');
}

function toggleWorkingLabel(isChecked) {
    const el = document.getElementById('label-working');
    if (el) {
        el.innerText = isChecked ? "ON: Sedang dikerjakan" : "OFF: Dalam Antrian";
        el.className = isChecked ? "text-[10px] text-indigo-600/70" : "text-[10px] font-bold text-indigo-600";
    }
}

function showSuccessModal(msg) {
    const elMsg = document.getElementById('action-success-msg');
    if (elMsg) elMsg.innerText = msg;
    openModal('action-success-modal');
}

function submitUpdate() {
    const btn = document.getElementById('btn-submit-update');
    const uid = document.getElementById('conf-unit-id').value;
    const idx = document.getElementById('conf-step-idx').value;
    const note = document.getElementById('conf-note').value;
    const isWaiting = document.getElementById('conf-waiting-sparepart').checked;
    const isWorking = document.getElementById('conf-is-working') ? document.getElementById('conf-is-working').checked : false;
    const orig = btn.innerText;

    btn.innerText = "Menyimpan...";
    btn.disabled = true;

    setTimeout(() => {
        const success = Store.updateStatus(uid, idx, note, {
            is_waiting_sparepart: isWaiting,
            is_working: isWorking
        }, session.role, session.fullname);
        if (success) {
            logs = Store.getLogs();
            renderHome();
            openDetail(uid);
            closeModal('confirm-modal');
            showToast("✓ Status unit berhasil diperbarui!", 'success');
        } else {
            showToast("? Gagal update status!", 'error');
        }
        btn.innerText = orig; btn.disabled = false;
    }, 600);
}
function deleteUnit(id, event) {
    if (event) event.stopPropagation();
    if (confirm('Hapus unit kendaraan ini?')) {
        Store.deleteUnit(id);
        renderHome();
        closeModal('detail-modal');
        showToast("? Unit berhasil dihapus!", 'success');
    }
}

function saveNewUnit(e) {
    e.preventDefault();
    const btn = e.submitter || document.querySelector('#form-add button[type="submit"]');
    const originalText = btn ? btn.innerText : "Simpan Data";

    if (btn) {
        btn.innerText = "Menyimpan...";
        btn.disabled = true;
    }

    const plate = document.getElementById('add-plate').value;
    const model = document.getElementById('add-model').value;
    const sa_name = document.getElementById('add-sa').value;
    const color = document.getElementById('add-color').value;
    const date_in = document.getElementById('add-in').value;
    const est_date = document.getElementById('add-est').value;
    const keterangan = document.getElementById('add-ket').value;

    Store.addUnit({ plate, model, color, sa_name, date_in, est_date, keterangan });
    
    setTimeout(() => {
        document.getElementById('form-add').reset();
        closeModal('add-modal');
        renderHome();

        // Show Toast Success dengan suara
        showToast("✓ Unit baru berhasil ditambahkan!", 'success');

        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }, 800);
}

function toggleEditMode() {
    const u = units.find(x => x.id == currentDetailUnitId);
    if (!u) return;
    document.getElementById('edit-id').value = u.id;
    document.getElementById('edit-plate').value = u.plate;
    document.getElementById('edit-model').value = u.model;
    document.getElementById('edit-sa-select').value = u.sa_name;
    document.getElementById('edit-color').value = u.color;
    document.getElementById('edit-in').value = u.date_in;
    document.getElementById('edit-est').value = u.est_date;
    document.getElementById('edit-ket').value = u.keterangan || '';
    document.getElementById('edit-waiting-sparepart').checked = u.is_waiting_sparepart || false;
    
    const isSpecialStep = (parseInt(u.status_idx) === 0 || parseInt(u.status_idx) === (steps.length - 1));
    const workingContainer = document.getElementById('edit-working-container');
    if (workingContainer) workingContainer.style.display = isSpecialStep ? 'none' : 'flex';

    if (document.getElementById('edit-is-working')) {
        document.getElementById('edit-is-working').checked = u.is_working || false;
    }
    
    // RESTRICTION UNTUK SA: Cuma bisa edit estimasi (Sesuai permintaan!)
    const isSA = session.role === 'sa';
    const fields = ['edit-plate', 'edit-model', 'edit-sa-select', 'edit-color', 'edit-in', 'edit-ket', 'edit-waiting-sparepart'];
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.disabled = isSA;
    });
    // Pastikan Estimasi Tetap Aktif untuk SA
    const fieldLate = document.getElementById('edit-late-reason');
    if (fieldLate) {
        fieldLate.value = u.late_reason || '';
        // Sembunyikan field alasan jika unit belum telat
        const today = new Date(); today.setHours(0,0,0,0);
        const isLate = new Date(u.est_date) < today && u.status_idx < (steps.length - 1);
        document.getElementById('edit-late-reason-container').style.display = isLate ? 'block' : 'none';
    }

    const estEl = document.getElementById('edit-est');
    if (estEl) estEl.disabled = false;

    closeModal('detail-modal');
    setTimeout(() => openModal('edit-data-modal'), 100);
}

// --- FUNGSI HAPUS ---
function confirmDeleteUnit() {
    const u = units.find(x => x.id == currentDetailUnitId);
    if (!u) return;
    document.getElementById('delete-unit-plate').innerText = u.plate;
    openModal('delete-confirm-modal');
}

function executeDeleteUnit() {
    if (!currentDetailUnitId) return;
    const u = units.find(x => x.id == currentDetailUnitId);
    if (!u) return;

    const btn = document.querySelector('#delete-confirm-modal button.bg-red-600');
    const origText = btn ? btn.innerText : "Hapus";
    if (btn) {
        btn.innerText = "Proses...";
        btn.disabled = true;
    }

    setTimeout(() => {
        // Kirim lapor ke Firebase/Firebase action delete
        if (typeof Firebase !== 'undefined') {
            Firebase.syncUnit(u, 'delete');
        }

        Store.deleteUnit(currentDetailUnitId);
        closeModal('delete-confirm-modal');
        closeModal('detail-modal');
        renderHome();
        showToast("? Data unit berhasil dihapus!", 'success');
        
        if (btn) {
            btn.innerText = origText;
            btn.disabled = false;
        }
    }, 800);
}

function saveEditData(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const data = {
        plate: document.getElementById('edit-plate').value,
        model: document.getElementById('edit-model').value,
        sa_name: document.getElementById('edit-sa-select').value,
        color: document.getElementById('edit-color').value,
        date_in: document.getElementById('edit-in').value,
        est_date: document.getElementById('edit-est').value,
        keterangan: document.getElementById('edit-ket').value,
        is_waiting_sparepart: document.getElementById('edit-waiting-sparepart').checked,
        is_working: document.getElementById('edit-is-working') ? document.getElementById('edit-is-working').checked : false,
        late_reason: document.getElementById('edit-late-reason') ? document.getElementById('edit-late-reason').value : ''
    };

    const btn = document.getElementById('btn-save-edit');
    const orig = btn.innerText;
    btn.innerText = "Menyimpan...";
    btn.disabled = true;

    setTimeout(() => {
        try {
            const updated = Store.updateUnit(id, data, session.role, session.fullname);
            if (updated) {
                // Keep local state in sync to prevent overwrite by pending snapshots
                units = Store.getUnits();
                renderHome();
                closeModal('edit-data-modal');
                setTimeout(() => {
                    openDetail(id);
                    setTimeout(() => showToast("✓ Perubahan berhasil disimpan!", 'success'), 100);
                }, 150);
            }
        } catch (error) {
            console.error("Edit failed:", error);
            showToast("? Bugs terdeteksi saat menyimpan data", 'error');
        } finally {
            btn.innerText = orig;
            btn.disabled = false;
        }
    }, 500);
}

function openLateReasonModal(unitId, event) {
    if (event) event.stopPropagation();
    const u = Store.getUnits().find(x => x.id == unitId);
    if (!u) return;

    document.getElementById('late-reason-id').value = unitId;
    document.getElementById('late-reason-text').value = u.late_reason || '';
    openModal('late-reason-modal');
}

function saveLateReason() {
    const id = document.getElementById('late-reason-id').value;
    const reason = document.getElementById('late-reason-text').value;

    const btn = document.getElementById('btn-save-late-reason');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Menyimpan...';
    lucide.createIcons();

    setTimeout(() => {
        const u = Store.getUnits().find(x => x.id == id);
        if (u) {
            // Optimistic sync - ensure local memory is updated before re-rendering
            const updated = Store.updateUnit(id, { ...u, late_reason: reason }, session.role, session.fullname);
            if (updated) {
                showToast("? Alasan telat berhasil disimpan!", 'success');
                closeModal('late-reason-modal');
                // Force global units variable update to prevent snapshot overwrite before Firebase sync
                units = Store.getUnits();
                renderHome();
                if (currentDetailUnitId == id) openDetail(id);
            }
        }
        btn.disabled = false;
        btn.innerHTML = 'Simpan';
        lucide.createIcons();
    }, 500);
}

function renderDashboard() {
    const totalEl = document.getElementById('monitor-total-count');
    const activeUnits = units.filter(u => u.status_idx < (steps.length - 1));

    if (totalEl) {
        totalEl.innerText = activeUnits.length;
        
        // Count Waiting Spareparts
        const sparepartEl = document.getElementById('monitor-sparepart-count');
        const waiting = activeUnits.filter(u => u.is_waiting_sparepart).length;
        if (sparepartEl) sparepartEl.innerText = waiting;

        // Count Late Units
        const lateMonitorEl = document.getElementById('monitor-late-count');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const lateUnitsCount = activeUnits.filter(u => u.est_date && new Date(u.est_date) < today).length;
        if (lateMonitorEl) lateMonitorEl.innerText = lateUnitsCount;
    }

    const cardTotal = document.getElementById('card-total');
    if (cardTotal) cardTotal.innerText = units.length;

    const cardProcess = document.getElementById('card-process');
    if (cardProcess) cardProcess.innerText = activeUnits.length;

    const cardDone = document.getElementById('card-done');
    const totalDoneCount = units.filter(u => u.status_idx === (steps.length - 1)).length;
    if (cardDone) cardDone.innerText = totalDoneCount;

    // Render Division Grid di Menu Pantau
    const grid = document.getElementById('division-grid');
    if (grid) {
        grid.innerHTML = '';
        steps.forEach((stepName, idx) => {
            // Tampilkan Selesai juga jika di Monitor
            const isFinished = idx === (steps.length - 1);
            const stepUnits = isFinished ? units.filter(u => u.status_idx === idx) : activeUnits.filter(u => u.status_idx === idx);
            const count = stepUnits.length;

            const card = document.createElement('div');
            card.className = isFinished ? "bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30 p-4 rounded-[20px] shadow-sm active:scale-95 transition cursor-pointer flex flex-col justify-center items-center text-center h-24 overflow-hidden" 
                                      : "bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-[20px] shadow-sm active:scale-95 transition cursor-pointer flex flex-col justify-center items-center text-center h-24 overflow-hidden";
            
            card.onclick = () => {
                if (isFinished) {
                    switchView('home');
                    setFilterStatus('done');
                    renderHome();
                } else {
                    if (typeof renderDivisionGrid === 'function') {
                        renderDivisionGrid(stepUnits, stepName);
                    }
                    if (typeof switchView === 'function') {
                        switchView('division-detail');
                    }
                }
            };

            const workingCount = stepUnits.filter(u => u.is_working).length;
            const queueCount = count - workingCount;

            card.innerHTML = `
                <h3 class="text-3xl font-black ${isFinished ? 'text-green-600' : 'text-slate-800 dark:text-white'} mb-0.5 leading-none">${count}</h3>
                <p class="text-[10px] font-bold ${isFinished ? 'text-green-700/60' : 'text-slate-400'} uppercase leading-tight">${stepName}</p>
            `;
            grid.appendChild(card);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function openLateDetail() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lateData = units.filter(u => u.status_idx < (steps.length - 1) && u.est_date && new Date(u.est_date) < today);
    renderDivisionGrid(lateData, "Unit Terlambat");
    switchView('division-detail');
}


// --- CHARTS & STATISTICS ---

function switchChartType(type) {
    vChartType = type;
    document.getElementById('btn-chart-line').classList.remove('active', 'text-slate-500', 'bg-white', 'shadow-sm', 'dark:bg-slate-700', 'dark:text-white');
    document.getElementById('btn-chart-bar').classList.remove('active', 'text-slate-500', 'bg-white', 'shadow-sm', 'dark:bg-slate-700', 'dark:text-white');
    document.getElementById('btn-chart-' + type).classList.add('active', 'text-slate-500', 'bg-white', 'shadow-sm', 'dark:bg-slate-700', 'dark:text-white');
    loadChartData();
}

function loadChartData() {
    const mSelect = document.getElementById('chart-month');
    const ySelect = document.getElementById('chart-year');
    const btn = document.querySelector('#chart-filter-modal button.bg-indigo-600');
    if (!mSelect || !ySelect) return;

    // Force default to current month and year on first load
    const monthNow = new Date().getMonth() + 1;
    if (!window.chartDefaultSet) {
        mSelect.value = monthNow;
        window.chartDefaultSet = true;
    }

    if(!ySelect.value || ySelect.innerHTML === "") {
        ySelect.innerHTML = '';
        const currentYear = new Date().getFullYear();
        for(let i=2026; i<=2030; i++) ySelect.innerHTML += `<option value="${i}">${i}</option>`;
        ySelect.value = currentYear;
    }

    if (btn) {
        // Pastikan tombol selalu punya teks "Terapkan" jika kosong
        if (!btn.innerText || btn.innerText.trim() === '') {
            btn.innerText = 'Terapkan';
        }
        const orig = btn.innerText;
        btn.innerText = "Menerapkan...";
        btn.disabled = true;
        setTimeout(() => {
            const m = parseInt(mSelect.value);
            const y = parseInt(ySelect.value);
            const mName = mSelect.options[mSelect.selectedIndex].text;
            const labelEl = document.getElementById('chart-period-label');
            if (labelEl) labelEl.innerText = `${mName} ${y}`;
            renderChart(m, y, vChartType);
            closeModal('chart-filter-modal');
            showToast("✓ Filter berhasil diterapkan!", 'success');
            btn.innerText = orig;
            btn.disabled = false;
        }, 600);
    } else {
        const m = parseInt(mSelect.value);
        const y = parseInt(ySelect.value);
        renderChart(m, y, vChartType);
        closeModal('chart-filter-modal');
    }
}
function renderChart(m, y, type) {
    const filteredIn = units.filter(u => {
        const d = new Date(u.date_in);
        return (d.getMonth() + 1) === m && d.getFullYear() === y;
    });
    
    let wIn = [0,0,0,0];
    filteredIn.forEach(u => {
        const dt = new Date(u.date_in).getDate();
        if(dt <= 7) wIn[0]++; else if (dt <= 14) wIn[1]++; else if (dt <= 21) wIn[2]++; else wIn[3]++;
    });
    
    const filteredOut = units.filter(u => {
        if(u.status_idx !== (steps.length - 1)) return false;
        const d = new Date(u.est_date || u.date_in);
        return (d.getMonth() + 1) === m && d.getFullYear() === y;
    });
    let wOut = [0,0,0,0];
    filteredOut.forEach(u => {
        const dt = new Date(u.est_date || u.date_in).getDate();
        if(dt <= 7) wOut[0]++; else if (dt <= 14) wOut[1]++; else if (dt <= 21) wOut[2]++; else wOut[3]++;
    });

    const cIn = document.getElementById('stat-in');
    const cOut = document.getElementById('stat-out');
    const cSi = document.getElementById('stat-active');
    
    if (cIn) cIn.innerText = filteredIn.length;
    if (cOut) cOut.innerText = filteredOut.length;
    
    const activeUnits = units.filter(u => u.status_idx < (steps.length - 1)).length;
    if (cSi) cSi.innerText = activeUnits;

    // --- SA Performance Section ---
    const saStatsEl = document.getElementById('chart-sa-stats');
    const saStatsContainer = document.getElementById('sa-stats-container');
    if (saStatsEl && saStatsContainer) {
        if (session.role !== 'sa') {
            saStatsEl.style.display = 'block';
            saStatsContainer.innerHTML = '';
            
            // Menggunakan saList global yang diisi di init
            saList.forEach(sa => {
                const saName = sa.fullname || sa.username;
                const saNameLower = saName.toLowerCase();
                
                // Filtered by month/year for entrance/done
                const allUnits = Store.getUnits();
                const mUnits = allUnits.filter(u => {
                    const d = new Date(u.date_in);
                    const matchSA = (u.sa_name || "").toLowerCase() === saNameLower;
                    return matchSA && (d.getMonth() + 1) === m && d.getFullYear() === y;
                });
                
                const inCount = mUnits.length;
                const doneCount = mUnits.filter(u => parseInt(u.status_idx) === (steps.length - 1)).length;
                const isProcessCount = allUnits.filter(u => {
                    const matchSA = (u.sa_name || "").toLowerCase() === saNameLower;
                    return matchSA && parseInt(u.status_idx) < (steps.length - 1);
                }).length;

                saStatsContainer.innerHTML += `
                    <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition active:scale-[0.98]">
                        <p class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase mb-3 truncate border-b border-slate-50 dark:border-slate-700 pb-1.5">${saName}</p>
                        <div class="grid grid-cols-3 gap-1 text-center">
                             <div>
                                <p class="text-[7px] font-bold text-slate-400 uppercase leading-none mb-1">Masuk</p>
                                <p class="text-xs font-black text-slate-800 dark:text-white">${inCount}</p>
                             </div>
                             <div>
                                <p class="text-[7px] font-bold text-slate-400 uppercase leading-none mb-1">Progres</p>
                                <p class="text-xs font-black text-blue-600">${isProcessCount}</p>
                             </div>
                             <div>
                                <p class="text-[7px] font-bold text-slate-400 uppercase leading-none mb-1">Selesai</p>
                                <p class="text-xs font-black text-green-600">${doneCount}</p>
                             </div>
                        </div>
                    </div>
                `;
            });
        } else {
            saStatsEl.style.display = 'none';
        }

        // --- NEW SECTION: LATE REASONS SUMMARY ---
        const lateSummaryEl = document.getElementById('late-reasons-summary');
        if (lateSummaryEl) {
            const allUnits = Store.getUnits();
            const lateUnitsWithReason = allUnits.filter(u => u.late_reason && u.late_reason.trim() !== '');
            
            if (lateUnitsWithReason.length > 0) {
                lateSummaryEl.style.display = 'block';
                const container = document.getElementById('late-reasons-container');
                if (container) {
                    container.innerHTML = '';
                    lateUnitsWithReason.slice(0, 5).forEach(u => { // Show last 5
                        container.innerHTML += `
                            <div class="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-xl mb-2">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-[9px] font-black text-red-600 uppercase">${u.plate}</span>
                                    <span class="text-[8px] font-bold text-slate-400 capitalize">${u.sa_name || '-'}</span>
                                </div>
                                <p class="text-[11px] text-slate-700 dark:text-slate-300">"${u.late_reason}"</p>
                            </div>
                        `;
                    });
                }
            } else {
                lateSummaryEl.style.display = 'none';
            }
        }
    }

    const canvas = document.getElementById('mainChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (chartInstance) chartInstance.destroy();
    
    const ctx = canvas.getContext('2d');
    chartInstance = new Chart(ctx, {
        type: vChartType,
        data: {
            labels: ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'],
            datasets: [
                { label: 'Masuk', data: wIn, borderColor: '#4f46e5', backgroundColor: type === 'line' ? 'rgba(79, 70, 229, 0.1)' : '#4f46e5', borderWidth: type === 'line' ? 3 : 0, fill: type === 'line', tension: 0.4 },
                { label: 'Selesai', data: wOut, borderColor: '#10b981', backgroundColor: type === 'line' ? 'rgba(16, 185, 129, 0.1)' : '#10b981', borderWidth: type === 'line' ? 3 : 0, fill: type === 'line', tension: 0.4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });
}

function confirmLogout(event) {
    const btn = event ? (event.currentTarget || event.target) : document.getElementById('btn-logout-confirm');
    if (!btn) {
        Auth.logout();
        return;
    }
    
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Proses...';
    btn.disabled = true;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => {
        Auth.logout();
    }, 800);
}