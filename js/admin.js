// ============================================
// admin.js - Admin Dashboard Logic
// ============================================

// Authentication Check (Admin & Admin BP)
const session = Auth.requireAuth(['admin', 'admin_bp']);

let units = [];
let users = [];
const steps = Store.steps;

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    if (!session) return;

    // Auto-close sidebar on mobile on page load
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('aside-overlay');
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }

    // Load Data
    await Store.init();
    
    // Aktifkan Realtime Sync
    if (typeof Firebase !== 'undefined' && Firebase.initRealtime) {
        Firebase.initRealtime();
    }

    units = Store.getUnits();
    users = await Store.getUsers();

    // Sort units DESC
    units.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Profile Setup
    document.getElementById('admin-name').innerText = session.fullname;

    // Mobile Profile Setup
    const mName = document.getElementById('mobile-admin-name');
    if (mName) mName.innerText = session.fullname.split(' ')[0];

    // Default Tab based on URL Hash
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['dashboard', 'users', 'report', 'notifs', 'permissions', 'settings'];
    if (validTabs.includes(hash)) {
        switchTab(hash, false);
    } else {
        switchTab('dashboard', false);
    }

    // Load & Listen to App Config
    initAppConfigListener();
});

// --- SIDEBAR TOGGLE ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('aside-overlay');
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}

// --- CUSTOM MODALS HELPERS ---
let confirmCallback = null;

function customAlert(msg, type = 'success') {
    showToast(msg, type);
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        info: 'bg-indigo-600'
    };
    const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info'
    };

    toast.className = `pointer-events-auto flex items-center gap-3 ${colors[type] || colors.success} text-white px-5 py-4 rounded-2xl shadow-xl toast-active min-w-[280px]`;
    toast.innerHTML = `
        <i data-lucide="${icons[type] || icons.success}" class="w-5 h-5 shrink-0"></i>
        <p class="text-sm font-bold">${msg}</p>
    `;

    container.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => {
        toast.classList.remove('toast-active');
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function closeAlert() {
    // Legacy function, no longer needed but kept for compatibility
}

function customConfirm(msg, callback) {
    const modal = document.getElementById('custom-confirm');
    const msgEl = document.getElementById('confirm-message');
    if (modal && msgEl) {
        msgEl.innerText = msg;
        confirmCallback = callback;
        modal.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function closeConfirm(result) {
    document.getElementById('custom-confirm').classList.add('hidden');
    if (confirmCallback) {
        confirmCallback(result);
        confirmCallback = null;
    }
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

// --- TAB SWITCHER ---
function switchTab(tabId, updateHash = true) {
    if (updateHash) {
        window.location.hash = tabId;
    }
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // Reset Nav
    ['dashboard', 'users', 'report', 'notifs', 'permissions', 'settings'].forEach(id => {
        const btn = document.getElementById(`nav-${id}`);
        if (btn) btn.className = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition text-slate-500 hover:bg-slate-50';
        
        const mBtn = document.getElementById(`mobile-nav-${id === 'report' ? 'report' : (id === 'dashboard' ? 'dashboard' : (id === 'users' ? 'users' : ''))}`);
        if (mBtn) mBtn.className = 'flex flex-col items-center gap-1 text-slate-400';
    });

    // Active Nav
    if (document.getElementById(`nav-${tabId}`)) {
        document.getElementById(`nav-${tabId}`).className = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition bg-indigo-50 text-indigo-700';
    }
    
    // Active Mobile Nav
    const mActiveBtn = document.getElementById(`mobile-nav-${tabId}`);
    if (mActiveBtn) {
        mActiveBtn.className = 'flex flex-col items-center gap-1 text-indigo-600';
    }

    // Title Mapping
    const titles = {
        'dashboard': 'Ringkasan Bengkel',
        'users': 'Manajemen User',
        'report': 'UNIT SA',
        'notifs': 'Pusat Notifikasi',
        'permissions': 'Izin Akses Role',
        'settings': 'Pengaturan Aplikasi',
        'report_detail': 'Detail Kinerja SA'
    };

    const title = titles[tabId] || 'Dashboard';
    const titleEl = document.getElementById('page-title');
    const mTitleEl = document.getElementById('mobile-page-title');
    if (titleEl) titleEl.innerText = title;
    if (mTitleEl) mTitleEl.innerText = title;

    // Special Case: Dashboard shows Greeting
    if (tabId === 'dashboard') {
        updateGreetingDisplay();
        renderDashboard();
    } else if (tabId === 'users') {
        renderUsers();
    } else if (tabId === 'report') {
        renderReport();
    } else if (tabId === 'notifs') {
        renderNotifs();
    } else if (tabId === 'permissions') {
        renderPermissions();
    } else if (tabId === 'settings') {
        renderSettings();
    }

    // Auto close sidebar on mobile after switch
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    }
}

// --- MOBILE UI HELPERS ---
function toggleSASettingsMobile() {
    const overlay = document.getElementById('sa-setting-mobile-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function closeSASettingsMobile(e) {
    const overlay = document.getElementById('sa-setting-mobile-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// --- DASHBOARD FILTERS ---
let currentDashboardPeriod = 'today';

function handleHardRefresh(btn) {
    if (btn) {
        const icon = btn.querySelector('i') || btn.querySelector('svg');
        if (icon) icon.classList.add('animate-spin');
    }
    setTimeout(() => {
        window.location.href = window.location.pathname + "?v=" + Date.now();
    }, 800);
}

function setDashboardPeriod(period) {
    currentDashboardPeriod = period;
    
    // Sync Select Dropdown
    const select = document.getElementById('dash-period-select');
    if (select) select.value = period;

    // Show/Hide Date Range based on period
    const rangeDiv = document.getElementById('dash-date-range');
    if (rangeDiv) {
        if (period === 'custom') {
            rangeDiv.classList.remove('hidden');
        } else {
            rangeDiv.classList.add('hidden');
        }
    }

    renderDashboard();
}

// --- TAB: DASHBOARD ---
function renderDashboard() {
    units = Store.getUnits();
    
    // Sort units DESC
    units.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Filter units based on period
    let filteredUnits = [...units];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    if (currentDashboardPeriod === 'today') {
        filteredUnits = units.filter(u => u.date_in && u.date_in.startsWith(todayStr));
    } else if (currentDashboardPeriod === 'month') {
        const monthPrefix = now.toISOString().slice(0, 7); // "YYYY-MM"
        filteredUnits = units.filter(u => u.date_in && u.date_in.startsWith(monthPrefix));
    } else if (currentDashboardPeriod === 'year') {
        const yearPrefix = now.getFullYear().toString();
        filteredUnits = units.filter(u => u.date_in && u.date_in.startsWith(yearPrefix));
    } else if (currentDashboardPeriod === 'custom') {
        const start = document.getElementById('dash-filter-start').value;
        const end = document.getElementById('dash-filter-end').value;
        if (start && end) {
            filteredUnits = units.filter(u => {
                const uDate = u.date_in ? u.date_in.split('T')[0] : '';
                return uDate >= start && uDate <= end;
            });
        }
    }

    // APPLY SEARCH LOGIC (Plat atau No WO)
    const searchQuery = document.getElementById('dash-search-input')?.value.toLowerCase() || '';
    if (searchQuery) {
        filteredUnits = filteredUnits.filter(u => 
            (u.plate && u.plate.toLowerCase().includes(searchQuery)) || 
            (u.no_wo && u.no_wo.toLowerCase().includes(searchQuery)) ||
            (u.model && u.model.toLowerCase().includes(searchQuery))
        );
    }

    const totalEl = document.getElementById('d-total');
    const inEl = document.getElementById('d-in');
    const processEl = document.getElementById('d-process');
    const lateEl = document.getElementById('d-late');
    const doneEl = document.getElementById('d-done');
    const tbody = document.getElementById('d-units-tbody');

    if (!tbody) return;

    // Stats
    const totalCount = filteredUnits.length;
    const inCount = filteredUnits.filter(u => u.status_idx === 0).length;
    const processCount = filteredUnits.filter(u => u.status_idx > 0 && u.status_idx < (steps.length - 1)).length;
    const doneCount = filteredUnits.filter(u => u.status_idx === (steps.length - 1)).length;
    
    // Late Logic: if not done AND today > est_date
    const lateCount = filteredUnits.filter(u => {
        if (u.status_idx === (steps.length - 1)) return false;
        if (!u.est_date) return false;
        return todayStr > u.est_date;
    }).length;

    if (totalEl) totalEl.innerText = totalCount;
    if (inEl) inEl.innerText = inCount;
    if (processEl) processEl.innerText = processCount;
    if (lateEl) lateEl.innerText = lateCount;
    if (doneEl) doneEl.innerText = doneCount;

    // Table Rendering
    tbody.innerHTML = '';
    if (filteredUnits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 italic">Tidak ada data unit untuk periode ini.</td></tr>';
        return;
    }

    filteredUnits.forEach(u => {
        const isDone = u.status_idx === (steps.length - 1);
        const isLate = !isDone && u.est_date && todayStr > u.est_date;
        
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-50 cursor-pointer';
        tr.onclick = () => openDetailModal(u);
        
        tr.innerHTML = `
            <td class="px-6 py-4 font-bold text-slate-800 tracking-tight">${u.plate}</td>
            <td class="px-6 py-4">
                <p class="font-bold text-slate-700">${u.model}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase">${u.color || '-'}</p>
            </td>
            <td class="px-6 py-4">
                <p class="text-xs font-bold ${isLate ? 'text-red-600' : 'text-slate-600'}">${new Date(u.date_in).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
                <p class="text-[9px] text-slate-400 font-bold uppercase">Tgl Masuk</p>
            </td>
            <td class="px-6 py-4">
                <span class="inline-block text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase ${isDone ? 'bg-green-100 text-green-700' : (isLate ? 'bg-red-100 text-red-700' : 'bg-indigo-50 text-indigo-700')}">
                    ${steps[u.status_idx]}
                </span>
            </td>
            <td class="px-6 py-4 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button class="text-slate-400 hover:text-indigo-600 transition">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteUnit('${u.id}', event)" class="text-slate-400 hover:text-red-500 transition">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function deleteUnit(id, event) {
    event.stopPropagation();
    customConfirm('Hapus unit kendaraan ini?', (ok) => {
        if (ok) {
            Store.deleteUnit(id);
            renderDashboard();
        }
    });
}

// --- TAB: USERS ---
function renderUsers() {
    const tbody = document.getElementById('u-users-tbody');
    const totalCount = document.getElementById('u-total-count');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (totalCount) totalCount.innerText = users.length;

    users.sort((a, b) => a.role.localeCompare(b.role) || a.username.localeCompare(b.username));

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        const roleObj = availableRoles.find(r => r.id === u.role) || { name: u.role, icon: 'shield' };
        
        tr.innerHTML = `
            <td class="px-6 py-4 font-bold text-slate-800">${u.username}</td>
            <td class="px-6 py-4">${u.fullname}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <i data-lucide="${roleObj.icon || 'shield'}" class="w-3.5 h-3.5 text-indigo-500"></i>
                    <span class="bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">${roleObj.name}</span>
                </div>
            </td>
            <td class="px-6 py-4 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button onclick="editUser('${u.id}')" title="Edit User" class="p-2 text-slate-400 hover:text-indigo-600 transition">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="openPermissionsModal('${u.role}')" title="Role Permissions" class="p-2 text-slate-400 hover:text-indigo-600 transition">
                        <i data-lucide="shield-check" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteUser('${u.id}', '${u.username}')" title="Hapus User" class="p-2 text-slate-400 hover:text-red-500 transition">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

async function populateRoleSelect(currentRole = "") {
    const select = document.getElementById('u-role');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Pilih Role Akses</option>';
    
    try {
        const db = window.fbDB;
        const permSnap = await window.fbGetDocs(window.fbCollection(db, "permissions"));
        
        const rolesFromDB = [];
        permSnap.forEach(doc => {
            const p = doc.data();
            if (!availableRoles.find(r => r.id === p.role)) {
                rolesFromDB.push({ id: p.role, name: p.role_name || p.role });
            }
        });

        const allRoles = [...availableRoles, ...rolesFromDB];
        allRoles.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.innerText = r.name;
            select.appendChild(opt);
        });

        if (currentRole) select.value = currentRole;
    } catch (e) {
        console.error("Gagal load roles:", e);
    }
}

// --- USER MODAL LOGIC ---
function openUserModal() {
    document.getElementById('user-modal-title').innerText = "Tambah User Baru";
    document.getElementById('user-id').value = "";
    document.getElementById('user-form').reset();
    document.getElementById('u-username').disabled = false;
    populateRoleSelect();
    document.getElementById('user-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
}

function toggleUserPassword() {
    const input = document.getElementById('u-password');
    const icon = document.getElementById('u-eye-icon');
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);

    if (type === 'text') {
        icon.setAttribute('data-lucide', 'eye-off');
    } else {
        icon.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons();
}

async function editUser(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;

    document.getElementById('user-modal-title').innerText = "Edit Pengguna";
    document.getElementById('user-id').value = user.id;
    document.getElementById('u-fullname').value = user.fullname;
    document.getElementById('u-username').value = user.username;
    document.getElementById('u-username').disabled = false; 
    document.getElementById('u-password').value = user.password;
    
    await populateRoleSelect(user.role);

    document.getElementById('user-modal').classList.remove('hidden');
    lucide.createIcons();
}

// Handle Form Submit
document.getElementById('user-form')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-user');
    const origText = btn.innerText;

    const id = document.getElementById('user-id').value;
    const payload = {
        fullname: document.getElementById('u-fullname').value,
        username: document.getElementById('u-username').value,
        password: document.getElementById('u-password').value,
        role: document.getElementById('u-role').value,
        updated_at: new Date().toISOString()
    };

    btn.innerText = "Memproses...";
    btn.disabled = true;

    try {
        const db = window.fbDB;
        const colRef = window.fbCollection(db, "user");

        if (id) {
            // Update
            // Cek jika username diubah, pastikan username baru tidak duplikat
            const oldUser = users.find(u => u.id === id);
            if (oldUser && oldUser.username !== payload.username) {
                const q = window.fbQuery(colRef, window.fbWhere("username", "==", payload.username));
                const snap = await window.fbGetDocs(q);
                if (!snap.empty) {
                    customAlert("Gagal: Username sudah digunakan oleh akun lain!", 'error');
                    btn.innerText = origText;
                    btn.disabled = false;
                    return;
                }
            }

            const docRef = window.fbDoc(db, "user", id);
            await window.fbUpdateDoc(docRef, payload);
            customAlert("Data user berhasil diperbarui!");
        } else {
            // Check if username already exists
            const q = window.fbQuery(colRef, window.fbWhere("username", "==", payload.username));
            const snap = await window.fbGetDocs(q);
            if (!snap.empty) {
                customAlert("Gagal: Username sudah digunakan!");
                btn.innerText = origText;
                btn.disabled = false;
                return;
            }
            // Add New
            payload.created_at = new Date().toISOString();
            await window.fbAddDoc(colRef, payload);
            customAlert("User baru berhasil ditambahkan!");
        }

        closeUserModal();
        // Refresh local data
        users = await Store.getUsers();
        renderUsers();
    } catch (e) {
        console.error(e);
        customAlert("Gagal menyimpan data user: " + e.message);
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
});

function deleteUser(id, username) {
    customConfirm(`Hapus user "${username}"? Akses login user ini akan hilang selamanya.`, async (ok) => {
        if (ok) {
            try {
                const db = window.fbDB;
                const docRef = window.fbDoc(db, "user", id);
                await window.fbDeleteDoc(docRef);
                customAlert("User berhasil dihapus.");
                // Refresh local data
                users = await Store.getUsers();
                renderUsers();
            } catch (e) {
                console.error(e);
                customAlert("Gagal menghapus user.");
            }
        }
    });
}

// --- PERMISSIONS MANAGEMENT ---
let currentTargetRole = "";
let currentTargetRoleName = "";

async function openPermissionsModal(role, roleName) {
    currentTargetRole = role;
    currentTargetRoleName = roleName || role;
    document.getElementById('target-role-name').innerText = "Role: " + currentTargetRoleName;

    // Reset & Loading State
    const checkboxes = ['perm-can_add', 'perm-can_edit', 'perm-can_delete', 'perm-can_status'];
    checkboxes.forEach(id => document.getElementById(id).checked = false);

    document.getElementById('permissions-modal').classList.remove('hidden');

    // Default Perms (Jika Database Kosong)
    const roleLower = role.toLowerCase();
    if (roleLower.includes('admin') || roleLower.includes('koordinator')) {
        checkboxes.forEach(id => document.getElementById(id).checked = true);
    } else if (roleLower === 'foreman') {
        document.getElementById('perm-can_add').checked = true;
        document.getElementById('perm-can_edit').checked = true;
        document.getElementById('perm-can_status').checked = true;
    } else if (roleLower === 'sa') {
        document.getElementById('perm-can_edit').checked = true;
        document.getElementById('perm-can_status').checked = true;
    } else if (roleLower === 'gh' || roleLower === 'umum') {
        document.getElementById('perm-can_edit').checked = true;
    } else if (roleLower === 'qc') {
        document.getElementById('perm-can_status').checked = true;
    }

    // Fetch from Firebase for actual settings (Override data di atas jika ada)
    try {
        if (!window.fbDB) return;
        const db = window.fbDB;
        const q = window.fbQuery(window.fbCollection(db, "permissions"), window.fbWhere("role", "==", role));
        const snap = await window.fbGetDocs(q);

        if (!snap.empty) {
            const data = snap.docs[0].data();
            document.getElementById('perm-can_add').checked = data.can_add === true;
            document.getElementById('perm-can_edit').checked = data.can_edit === true;
            document.getElementById('perm-can_delete').checked = data.can_delete === true;
            document.getElementById('perm-can_status').checked = data.can_status === true;
        }
    } catch (e) {
        console.error("Gagal load permission:", e);
    }

    lucide.createIcons();
}

function closePermissionsModal() {
    document.getElementById('permissions-modal').classList.add('hidden');
}

async function savePermissions() {
    const btn = document.getElementById('btn-save-perm');
    const origText = btn.innerText;
    btn.innerText = "Menyimpan...";
    btn.disabled = true;

    const payload = {
        role: currentTargetRole,
        role_name: currentTargetRoleName,
        can_add: document.getElementById('perm-can_add').checked,
        can_edit: document.getElementById('perm-can_edit').checked,
        can_delete: document.getElementById('perm-can_delete').checked,
        can_status: document.getElementById('perm-can_status').checked,
        updated_at: new Date().toISOString()
    };

    try {
        const db = window.fbDB;
        const colRef = window.fbCollection(db, "permissions");
        const q = window.fbQuery(colRef, window.fbWhere("role", "==", currentTargetRole));
        const snap = await window.fbGetDocs(q);

        if (!snap.empty) {
            // Update
            const docRef = window.fbDoc(db, "permissions", snap.docs[0].id);
            await window.fbUpdateDoc(docRef, payload);
        } else {
            // Add
            await window.fbAddDoc(colRef, payload);
        }

        customAlert("Izin akses role " + currentTargetRole + " berhasil diperbarui!");
        closePermissionsModal();
        if (typeof renderPermissions === 'function') renderPermissions();
    } catch (e) {
        console.error(e);
        customAlert("Gagal menyimpan izin akses.");
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
}

// --- TAB: REPORT ---
let currentReportView = 'cards'; // 'cards' atau 'table'

function toggleReportView(view) {
    currentReportView = view;
    renderReport();
}

function handleSASelect(saName) {
    if (!saName) {
        renderReport();
    } else {
        renderReportDetail(saName);
    }
}

let reportSearchQuery = '';
function handleReportSearch(query) {
    reportSearchQuery = query.toLowerCase();
    renderReport();
}

function renderReport() {
    units = Store.getUnits();
    
    // Filter by search query if any
    let filteredUnits = units;
    if (reportSearchQuery) {
        filteredUnits = units.filter(u => 
            u.plate.toLowerCase().includes(reportSearchQuery) || 
            u.model.toLowerCase().includes(reportSearchQuery) ||
            (u.sa_name && u.sa_name.toLowerCase().includes(reportSearchQuery))
        );
    }

    const select = document.getElementById('report-sa-select');
    const saSet = new Set();
    units.forEach(u => { if (u.sa_name) saSet.add(u.sa_name); });

    // Populate Select
    if (select) {
        const currentVal = select.value;
        select.innerHTML = '<option value="">Semua Service Advisor</option>';
        [...saSet].sort().forEach(sa => {
            const opt = document.createElement('option');
            opt.value = sa;
            opt.innerText = sa;
            select.appendChild(opt);
        });
        select.value = currentVal;
    }

    // Aggregate by SA
    const saStats = {};
    filteredUnits.forEach(u => {
        if (!u.sa_name) return;
        if (!saStats[u.sa_name]) {
            saStats[u.sa_name] = { name: u.sa_name, total: 0, done: 0, process: 0 };
        }
        saStats[u.sa_name].total++;
        if (u.status_idx === 10) saStats[u.sa_name].done++;
        else saStats[u.sa_name].process++;
    });

    const arrStats = Object.values(saStats);
    const container = document.getElementById('sa-report-container');
    const tableBox = document.getElementById('master-report-table-box');
    const emptyBox = document.getElementById('empty-report');

    // UI Toggle
    const btnCards = document.getElementById('btn-view-cards');
    const btnTable = document.getElementById('btn-view-table');

    if (currentReportView === 'cards') {
        if (container) container.classList.remove('hidden');
        if (tableBox) tableBox.classList.add('hidden');
        if (btnCards) btnCards.className = 'flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition bg-white text-indigo-600 shadow-sm';
        if (btnTable) btnTable.className = 'flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition text-slate-500 hover:bg-white/50';
    } else {
        if (container) container.classList.add('hidden');
        if (tableBox) tableBox.classList.remove('hidden');
        if (btnCards) btnCards.className = 'flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition text-slate-500 hover:bg-white/50';
        if (btnTable) btnTable.className = 'flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition bg-white text-indigo-600 shadow-sm';
    }

    if (arrStats.length === 0) {
        if (container) container.innerHTML = '';
        if (emptyBox) emptyBox.classList.remove('hidden');
        return;
    }

    emptyBox.classList.add('hidden');

    if (currentReportView === 'cards') {
        container.innerHTML = '';
        arrStats.forEach(stat => {
            const card = document.createElement('div');
            card.className = 'bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer group';
            card.onclick = () => renderReportDetail(stat.name);
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase">Service Advisor</p>
                        <h3 class="text-xl font-bold text-slate-800 mt-1">${stat.name}</h3>
                    </div>
                    <div class="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                        <i data-lucide="chevron-right" class="w-5 h-5"></i>
                    </div>
                </div>
                <div class="flex gap-4 border-t border-slate-100 pt-4">
                    <div class="flex-1"><span class="block text-2xl font-bold text-slate-800">${stat.total}</span><span class="text-[10px] text-slate-400 uppercase font-bold whitespace-nowrap">Unit Masuk</span></div>
                    <div class="flex-1"><span class="block text-2xl font-bold text-indigo-600">${stat.process}</span><span class="text-[10px] text-slate-400 uppercase font-bold whitespace-nowrap">Progres</span></div>
                    <div class="flex-1"><span class="block text-2xl font-bold text-green-600">${stat.done}</span><span class="text-[10px] text-slate-400 uppercase font-bold whitespace-nowrap">Selesai</span></div>
                </div>
            `;
            container.appendChild(card);
        });
    } else {
        // --- MASTER TABLE VIEW ---
        // 1. Distribution
        const stepCounts = new Array(steps.length).fill(0);
        filteredUnits.forEach(u => stepCounts[u.status_idx]++);

        const distBox = document.getElementById('master-distribution');
        distBox.innerHTML = '';
        steps.forEach((stepName, idx) => {
            if (stepCounts[idx] > 0) {
                const pct = (stepCounts[idx] / filteredUnits.length) * 100;
                const div = document.createElement('div');
                div.className = 'min-w-[140px] bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between';
                div.innerHTML = `
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${stepName}</span>
                    <div class="flex justify-between items-end mt-2">
                        <span class="text-2xl font-bold text-indigo-600">${stepCounts[idx]}</span>
                        <span class="text-xs font-bold text-slate-400">Unit</span>
                    </div>
                    <div class="w-full bg-slate-200 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div class="bg-indigo-500 h-full rounded-full" style="width: ${pct}%"></div>
                    </div>
                `;
                distBox.appendChild(div);
            }
        });

        // 2. Unit Table Listing
        const tbody = document.getElementById('master-report-tbody');
        tbody.innerHTML = '';

        // Use filtered units and sort by date or status
        const allSorted = [...filteredUnits].sort((a, b) => (new Date(b.date_in) - new Date(a.date_in)));

        allSorted.forEach(u => {
            const isDone = u.status_idx === 10;
            const dIn = new Date(u.date_in).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            const dEst = new Date(u.est_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 cursor-pointer transition border-b border-slate-50';
            tr.onclick = () => openDetailModal(u);
            tr.innerHTML = `
                <td class="px-6 py-4 font-bold text-slate-800 tracking-tight">${u.plate}</td>
                <td class="px-6 py-4">
                    <p class="font-bold text-slate-700">${u.model}</p>
                    <p class="text-[10px] text-slate-400 font-bold uppercase">${u.color || '-'}</p>
                </td>
                <td class="px-6 py-4 font-bold text-indigo-600">${u.sa_name || '-'}</td>
                <td class="px-6 py-4">
                    <span class="inline-block text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase ${isDone ? 'bg-green-100 text-green-700' : 'bg-indigo-50 text-indigo-700'}">
                        ${steps[u.status_idx]}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <p class="text-xs font-bold text-slate-700">${dIn} <span class="text-slate-300 mx-1">/</span> <span class="text-indigo-600">${dEst}</span></p>
                    <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Masuk vs Estimasi</p>
                </td>
                <td class="px-6 py-4 text-center">
                    <button class="text-slate-400 hover:text-indigo-600 transition active:scale-90">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    lucide.createIcons();
}

// --- TAB: REPORT DETAIL ---
let currentSAFilter = -1;

function renderReportDetail(saName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-report_detail').classList.add('active');

    document.getElementById('page-title').innerText = 'Detail Unit SA';
    document.getElementById('rd-sa-name').innerText = saName;

    const saUnits = units.filter(u => u.sa_name === saName).sort((a, b) => a.status_idx - b.status_idx);
    const stepCounts = new Array(steps.length).fill(0);
    saUnits.forEach(u => stepCounts[u.status_idx]++);

    // Distribution
    const distBox = document.getElementById('rd-distribution');
    distBox.innerHTML = '';

    currentSAFilter = -1; // reset filter

    steps.forEach((stepName, idx) => {
        if (stepCounts[idx] > 0) {
            const pct = (stepCounts[idx] / saUnits.length) * 100;
            const div = document.createElement('div');
            div.className = 'filter-card min-w-[140px] bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-indigo-500 hover:shadow-md transition';
            div.dataset.idx = idx;
            div.onclick = () => filterSAUnits(idx, div);
            div.innerHTML = `
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${stepName}</span>
                <div class="flex justify-between items-end mt-2">
                    <span class="text-2xl font-bold text-indigo-600">${stepCounts[idx]}</span>
                    <span class="text-xs font-bold text-slate-400">Unit</span>
                </div>
                <div class="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div class="bg-indigo-500 h-full rounded-full" style="width: ${pct}%"></div>
                </div>
            `;
            distBox.appendChild(div);
        }
    });

    // Sub-render grid
    renderSADetailGrid(saUnits);
}

function renderSADetailGrid(saUnits) {
    const tbody = document.getElementById('rd-unit-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (saUnits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-12 bg-white"><p class="text-slate-500 font-bold italic text-xs">Tidak ada unit untuk SA ini.</p></td></tr>`;
        return;
    }

    saUnits.forEach(u => {
        const isDone = u.status_idx === 10;
        const dIn = new Date(u.date_in).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const dEst = new Date(u.est_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 cursor-pointer transition border-b border-slate-50';
        tr.onclick = () => openDetailModal(u);

        tr.innerHTML = `
            <td class="px-6 py-4 font-bold text-slate-800 tracking-tight">${u.plate}</td>
            <td class="px-6 py-4">
                <p class="font-bold text-slate-700">${u.model}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase">${u.color || '-'}</p>
            </td>
            <td class="px-6 py-4">
                <span class="inline-block text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase ${isDone ? 'bg-green-100 text-green-700' : 'bg-indigo-50 text-indigo-700'}">
                    ${steps[u.status_idx]}
                </span>
            </td>
            <td class="px-6 py-4">
                <p class="text-xs font-bold text-slate-700">${dIn} <span class="text-slate-300 mx-1">/</span> <span class="text-indigo-600">${dEst}</span></p>
                <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Masuk vs Estimasi</p>
            </td>
            <td class="px-6 py-4 text-center">
                <button class="text-slate-400 hover:text-indigo-600 transition active:scale-90">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function filterSAUnits(stepIdx, cardEl) {
    const cards = document.querySelectorAll('.unit-card');
    const filterCards = document.querySelectorAll('.filter-card');

    if (currentSAFilter === stepIdx) {
        currentSAFilter = -1;
        cards.forEach(c => c.style.display = 'block');
        filterCards.forEach(fc => {
            fc.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50');
            fc.classList.add('bg-white');
        });
    } else {
        currentSAFilter = stepIdx;
        filterCards.forEach(fc => {
            fc.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50');
            fc.classList.add('bg-white');
        });
        cardEl.classList.remove('bg-white');
        cardEl.classList.add('bg-indigo-50', 'ring-2', 'ring-indigo-500');

        cards.forEach(c => {
            if (parseInt(c.dataset.idx) === stepIdx) c.style.display = 'block';
            else c.style.display = 'none';
        });
    }
}

// --- MAIN DETAIL MODAL (ADMIN) ---
function openDetailModal(u) {
    document.getElementById('m-plate').innerText = u.plate;
    document.getElementById('m-model').innerText = u.model + ' (' + (u.color || '-') + ')';
    document.getElementById('m-status').innerText = steps[u.status_idx];
    document.getElementById('m-sa').innerText = u.sa_name || '-';

    document.getElementById('m-in').innerText = new Date(u.date_in).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    document.getElementById('m-est').innerText = new Date(u.est_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    if (document.getElementById('m-updated')) {
        document.getElementById('m-updated').innerText = formatDateTime(u.updated_at || u.created_at);
    }

    let pct = (u.status_idx / 10) * 100;
    document.getElementById('m-progress').style.width = pct + '%';
    document.getElementById('detail-modal').classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.add('hidden');
}

// --- TAB: NOTIFIKASI ---
async function renderNotifs() {
    const tbody = document.getElementById('notif-tbody');
    const emptyBox = document.getElementById('empty-notifs');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-8">Memuat data...</td></tr>';

    try {
        const db = window.fbDB;
        const nRef = window.fbCollection(db, "notifications");
        const q = window.fbQuery(nRef, window.fbOrderBy("created_at", "desc"), window.fbLimit(50));
        const snap = await window.fbGetDocs(q);

        tbody.innerHTML = '';
        if (snap.empty) {
            if (emptyBox) emptyBox.classList.remove('hidden');
            return;
        }

        if (emptyBox) emptyBox.classList.add('hidden');

        const countHeader = document.getElementById('notif-total-count-header');
        if (countHeader) countHeader.innerText = snap.size;

        snap.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50';

            let timeStr = data.created_at || data.time;
            try {
                const d = new Date(timeStr);
                timeStr = d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            } catch (e) { }

            tr.innerHTML = `
                <td class="px-6 py-4 text-xs font-bold text-slate-400">${timeStr}</td>
                <td class="px-6 py-4 font-bold text-indigo-600">${data.sender || "System"}</td>
                <td class="px-6 py-4 text-slate-700">${data.keterangan || data.text || "-"}</td>
            `;
            tbody.appendChild(tr);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-red-500">Gagal memuat notifikasi. Mungkin belum ada data atau akses terbatas.</td></tr>';
    }
}

async function clearAllNotifications() {
    customConfirm("Hapus semua riwayat notifikasi di Firebase? Langkah ini tidak bisa dibatalkan.", async (ok) => {
        if (!ok) return;

        const btn = document.getElementById('btn-clear-notifs');
        const origText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Menghapus...';
        btn.disabled = true;

        try {
            const db = window.fbDB;
            const nRef = window.fbCollection(db, "notifications");
            const snap = await window.fbGetDocs(nRef);

            const promises = snap.docs.map(d => window.fbDeleteDoc(window.fbDoc(db, "notifications", d.id)));
            await Promise.all(promises);

            customAlert(`Berhasil menghapus ${snap.size} notifikasi.`);
            renderNotifs();
        } catch (e) {
            console.error(e);
            customAlert("Gagal menghapus notifikasi: " + e.message);
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    });
}

// --- TAB: PERMISSIONS ---
let availableRoles = [
    { id: 'sa', name: 'Service Advisor (SA)', icon: 'user' },
    { id: 'teknisi', name: 'Teknisi / Workshop', icon: 'wrench' },
    { id: 'qc', name: 'Quality Control (QC)', icon: 'clipboard-check' },
    { id: 'foreman', name: 'Foreman', icon: 'hard-hat' },
    { id: 'koordinator', name: 'Koordinator', icon: 'users' },
    { id: 'admin_bp', name: 'Admin BP', icon: 'shield' },
    { id: 'umum', name: 'Staff Umum / Guest', icon: 'user' }
];

async function renderPermissions() {
    const tbody = document.getElementById('perm-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-12"><div class="flex flex-col items-center gap-2"><i data-lucide="loader-2" class="w-6 h-6 animate-spin text-indigo-600"></i><span class="text-xs font-bold text-slate-400">Memuat Izin Akses...</span></div></td></tr>';
    lucide.createIcons();

    try {
        const db = window.fbDB;
        
        // 1. Fetch Fresh Users to count them per role
        const userSnap = await window.fbGetDocs(window.fbCollection(db, "user"));
        const roleCounts = {};
        userSnap.forEach(doc => {
            const u = doc.data();
            roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
        });

        // 2. Fetch Permissions (to check which roles exist in DB)
        const permSnap = await window.fbGetDocs(window.fbCollection(db, "permissions"));
        
        // Merge hardcoded roles with roles from DB
        const rolesFromDB = [];
        permSnap.forEach(doc => {
            const p = doc.data();
            if (!availableRoles.find(r => r.id === p.role)) {
                rolesFromDB.push({ id: p.role, name: p.role_name || p.role });
            }
        });
        
        const finalRoles = [...availableRoles, ...rolesFromDB];

        tbody.innerHTML = '';
        finalRoles.forEach((role, idx) => {
            const count = roleCounts[role.id] || 0;
            const icon = role.icon || 'shield';
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition group";
            tr.innerHTML = `
                <td class="px-8 py-5 w-16 text-slate-400 font-bold">${idx + 1}.</td>
                <td class="px-6 py-5">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                            <i data-lucide="${icon}" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="font-black text-slate-800">${role.name}</p>
                            <p class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5">${role.id}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-5 text-center">
                    <span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-black">${count} User</span>
                </td>
                <td class="px-8 py-5 text-right">
                    <button onclick="openPermissionsModal('${role.id}', '${role.name}')" 
                        class="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition shadow-sm">
                        Edit Izin
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-500 font-bold">Gagal memuat data izin akses.</td></tr>';
    }
}

// --- ADD ROLE LOGIC ---
function openAddRoleModal() {
    document.getElementById('role-form').reset();
    document.getElementById('role-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeAddRoleModal() {
    document.getElementById('role-modal').classList.add('hidden');
}

document.getElementById('role-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const roleId = document.getElementById('role-id-input').value.trim().toLowerCase().replace(/\s+/g, '_');
    const roleName = document.getElementById('role-name-input').value.trim();

    if (!roleId || !roleName) return;

    try {
        const db = window.fbDB;
        // Check if exists
        const q = window.fbQuery(window.fbCollection(db, "permissions"), window.fbWhere("role", "==", roleId));
        const snap = await window.fbGetDocs(q);

        if (!snap.empty) {
            customAlert("Role ID ini sudah ada!");
            return;
        }

        // Add new role record with default permissions
        await window.fbAddDoc(window.fbCollection(db, "permissions"), {
            role: roleId,
            role_name: roleName,
            can_add: false,
            can_edit: false,
            can_delete: false,
            can_status: true,
            created_at: new Date().toISOString()
        });

        customAlert("Role Baru Berhasil ditambahkan!");
        closeAddRoleModal();
        renderPermissions();
    } catch (e) {
        console.error(e);
        customAlert("Gagal menambah role baru.");
    }
});

// --- APP CONFIGURATION & REALTIME SETTINGS ---
let CURRENT_VERSION = '1.5.0'; 
let settingsEditMode = false;
let appConfig = {
    version: '1.5.0',
    roles: {},
    greeting_schedule: {
        pagi: 5,
        siang: 11,
        sore: 15,
        malam: 18
    },
    notif_template_pindah: 'Unit [PLATE] telah pindah posisi ke [POSISI]',
    notif_template_selesai: 'Hore! Unit [PLATE] sudah selesai dikerjakan',
    notif_template_baru: 'Unit baru [PLATE] telah didaftarkan untuk Service Advisor [SA]',
    notif_template_update_sa: 'Halo [SA], unit [PLATE] Anda telah diperbarui ke posisi [POSISI]'
};

function toggleSettingsEditMode() {
    settingsEditMode = !settingsEditMode;
    const btnToggle = document.getElementById('btn-toggle-edit-settings');
    const actions = document.getElementById('settings-edit-actions');
    
    if (settingsEditMode) {
        if(btnToggle) btnToggle.classList.add('hidden');
        if(actions) actions.classList.remove('hidden');
    } else {
        if(btnToggle) btnToggle.classList.remove('hidden');
        if(actions) actions.classList.add('hidden');
        renderSettings();
    }
    
    // Enable/Disable all inputs in settings forms
    const inputs = document.querySelectorAll('#tab-settings input');
    inputs.forEach(i => i.disabled = !settingsEditMode);
    
    lucide.createIcons();
}

function initAppConfigListener() {
    const db = window.fbDB;
    if (!db) return;

    window.fbOnSnapshot(window.fbDoc(db, "settings", "app_config"), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            
            // Sync Version and Config without Reload
            if (data.version && data.version !== CURRENT_VERSION) {
                console.log("🔄 Real-time Config Version Update: " + CURRENT_VERSION + " -> " + data.version);
                CURRENT_VERSION = data.version;
            }

            appConfig = data;
            
            // Sync Role Labels
            if (appConfig.roles) {
                availableRoles.forEach(r => {
                    if (appConfig.roles[r.id]) {
                        r.name = appConfig.roles[r.id];
                    }
                });
            }

            if (window.location.hash === '#settings') {
                renderSettings();
            }
            updateGreetingDisplay();
        }
    });
}

function updateGreetingDisplay() {
    const titleEl = document.getElementById('page-title');
    const mTitleEl = document.getElementById('mobile-page-title');
    if (!titleEl) return;

    const hash = window.location.hash.replace('#', '') || 'dashboard';
    
    if (hash === 'dashboard') {
        const name = (session && session.fullname) ? session.fullname.split(' ')[0] : 'Admin';
        const greeting = `Halo, ${name} selamat ${getGreeting()}`;
        titleEl.innerText = greeting;
        if (mTitleEl) mTitleEl.innerText = greeting;
    }
}

function getGreeting() {
    const hour = new Date().getHours();
    const s = appConfig.greeting_schedule || { pagi: 5, siang: 11, sore: 15, malam: 18 };
    if (hour >= s.malam || hour < s.pagi) return "malam";
    if (hour >= s.sore) return "sore";
    if (hour >= s.siang) return "siang";
    return "pagi";
}

function renderSettings() {
    const tbody = document.getElementById('settings-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const settingsItems = [
        { id: 'roles', name: 'Label Jabatan (Role)', icon: 'tags', desc: 'Nama tampilan Service Advisor, Teknisi, dll.' },
        { id: 'schedule', name: 'Jadwal Ucapan Salam', icon: 'clock', desc: 'Jam pergantian Pagi, Siang, Sore, Malam.' },
        { id: 'voice', name: 'Templat Suara Notifikasi', icon: 'mic', desc: 'Sesuaikan teks yang diucapkan bot suara.' },
        { id: 'branding', name: 'Branding & Tampilan', icon: 'layout', desc: 'Tampilkan footer pengembang di aplikasi.' }
    ];

    settingsItems.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition group";
        tr.innerHTML = `
            <td class="px-8 py-5 w-16 text-slate-400 font-bold">${idx + 1}.</td>
            <td class="px-6 py-5">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                        <i data-lucide="${item.icon}" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <p class="font-black text-slate-800">${item.name}</p>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${item.desc}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-5">
                <span class="text-xs font-bold text-slate-500 italic">Terakhir diupdate: v${CURRENT_VERSION}</span>
            </td>
            <td class="px-8 py-5 text-center">
                <button onclick="openSettingModal('${item.id}', '${item.name}')" 
                    class="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition shadow-sm mx-auto active:scale-90">
                    <i data-lucide="settings" class="w-5 h-5"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

let currentEditingSettingId = '';

function openSettingModal(id, name) {
    currentEditingSettingId = id;
    document.getElementById('setting-modal-title').innerText = name;
    const content = document.getElementById('setting-edit-content');
    content.innerHTML = '';

    if (id === 'roles') {
        availableRoles.forEach(role => {
            const label = (appConfig.roles && appConfig.roles[role.id]) ? appConfig.roles[role.id] : role.name;
            content.innerHTML += `
                <div class="space-y-1.5">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Role: ${role.id}</label>
                    <input type="text" id="role_${role.id}" value="${label}" 
                        class="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition font-bold text-slate-700">
                </div>`;
        });
    } else if (id === 'schedule') {
        const s = appConfig.greeting_schedule || { pagi: 5, siang: 11, sore: 15, malam: 18 };
        const times = [
            { id: 'time-pagi', label: 'Mulai Pagi (Jam)', val: s.pagi },
            { id: 'time-siang', label: 'Mulai Siang (Jam)', val: s.siang },
            { id: 'time-sore', label: 'Mulai Sore (Jam)', val: s.sore },
            { id: 'time-malam', label: 'Mulai Malam (Jam)', val: s.malam }
        ];
        content.innerHTML = '<div class="grid grid-cols-2 gap-4"></div>';
        const grid = content.querySelector('div');
        times.forEach(t => {
            grid.innerHTML += `
                <div class="space-y-1.5">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">${t.label}</label>
                    <input type="number" id="${t.id}" min="0" max="23" value="${t.val}" 
                        class="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-indigo-500 transition font-bold">
                </div>`;
        });
    } else if (id === 'voice') {
        const temps = [
            { id: 'notif-pindah-template', label: 'Templat: Unit Pindah Posisi', val: appConfig.notif_template_pindah, hint: '*Gunakan [PLATE] dan [POSISI]' },
            { id: 'notif-selesai-template', label: 'Templat: Unit Selesai', val: appConfig.notif_template_selesai, hint: '' },
            { id: 'notif-baru-template', label: 'Templat: Unit Baru (SA)', val: appConfig.notif_template_baru, hint: '*Gunakan [PLATE] dan [SA]' },
            { id: 'notif-update-sa-template', label: 'Templat: Update untuk SA', val: appConfig.notif_template_update_sa, hint: '*Gunakan [SA], [PLATE], dan [POSISI]' }
        ];
        temps.forEach(t => {
            content.innerHTML += `
                <div class="space-y-1.5">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">${t.label}</label>
                    <input type="text" id="${t.id}" value="${t.val || ''}" 
                        class="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-indigo-500 transition font-bold">
                    <p class="text-[9px] text-slate-400 font-bold ml-1">${t.hint}</p>
                </div>`;
        });
    } else if (id === 'branding') {
        content.innerHTML = `
            <div class="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <div>
                    <h4 class="font-black text-slate-800 text-sm">Tampilkan Footer</h4>
                    <p class="text-[10px] text-slate-400 font-bold uppercase mt-1">Muncul di Aplikasi Mobile</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="show-powered-by" class="sr-only peer" ${appConfig.show_powered_by !== false ? 'checked' : ''}>
                    <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
            </div>`;
    }

    document.getElementById('setting-edit-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeSettingModal() {
    document.getElementById('setting-edit-modal').classList.add('hidden');
}

async function saveIndividualSetting() {
    const btn = document.getElementById('btn-save-setting');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerText = "Menyimpan...";

    const updates = {};
    if (currentEditingSettingId === 'roles') {
        updates.roles = {};
        availableRoles.forEach(r => {
            const input = document.getElementById(`role_${r.id}`);
            if (input) updates.roles[r.id] = input.value;
        });
    } else if (currentEditingSettingId === 'schedule') {
        updates.greeting_schedule = {
            pagi: parseInt(document.getElementById('time-pagi').value),
            siang: parseInt(document.getElementById('time-siang').value),
            sore: parseInt(document.getElementById('time-sore').value),
            malam: parseInt(document.getElementById('time-malam').value)
        };
    } else if (currentEditingSettingId === 'voice') {
        updates.notif_template_pindah = document.getElementById('notif-pindah-template').value;
        updates.notif_template_selesai = document.getElementById('notif-selesai-template').value;
        updates.notif_template_baru = document.getElementById('notif-baru-template').value;
        updates.notif_template_update_sa = document.getElementById('notif-update-sa-template').value;
    } else if (currentEditingSettingId === 'branding') {
        updates.show_powered_by = document.getElementById('show-powered-by').checked;
    }

    updates.version = CURRENT_VERSION;

    try {
        const db = window.fbDB;
        await window.fbSetDoc(window.fbDoc(db, "settings", "app_config"), updates, { merge: true });
        showToast("Pengaturan berhasil disimpan!", 'success');
        closeSettingModal();
        renderSettings();
    } catch (e) {
        console.error(e);
        showToast("Gagal menyimpan pengaturan.", 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
        lucide.createIcons();
    }
}