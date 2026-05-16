// ============================================
// auth.js - Authentication Module (Firestore-based)
// ============================================

const Auth = {
    // Gunakan key berbeda untuk admin dan apps agar tidak saling logout
    get SESSION_KEY() {
        const path = window.location.pathname;
        return (path.includes('admin') || path.includes('admin-login')) 
            ? 'tracking_admin_byd' 
            : 'tracking_user_byd';
    },

    _getRedirectPage(target) {
        const path = window.location.pathname;
        const parts = path.split('/');
        
        let newParts = [];
        for (const p of parts) {
            // Berhenti jika menemukan folder khusus atau file .html
            if (p === 'admin' || p === 'mobile' || p === 'admin-login' || p === 'login-apps' || p.includes('.html')) {
                break;
            }
            if (p) newParts.push(p);
        }
        
        const base = (newParts.length > 0) ? '/' + newParts.join('/') : '';
        return base + '/' + target + '/';
    },

    async loadUsers() {
        try {
            if (!window.fbDB) return [];
            const db = window.fbDB;
            const q = window.fbQuery(window.fbCollection(db, "user"));
            const querySnapshot = await window.fbGetDocs(q);
            if (querySnapshot.empty) {
                console.warn("⚠️ Koleksi 'user' di Firestore kosong.");
            }
            const users = [];
            querySnapshot.forEach((doc) => {
                users.push({ id: doc.id, ...doc.data() });
            });
            return users;
        } catch (e) {
            console.error('❌ Gagal memuat data user dari Firebase:', e);
            return [];
        }
    },

    async login(username, password) {
        try {
            // Tunggu hingga Firebase siap (max 5 detik)
            let retries = 10;
            while (!window.fbDB && retries > 0) {
                console.log("⏳ Menunggu Firebase untuk login...");
                await new Promise(resolve => setTimeout(resolve, 500));
                retries--;
            }

            if (!window.fbDB) {
                console.error("Firebase tidak merespon.");
                return null;
            }
            
            const db = window.fbDB;
            
            // Load all users to perform case-insensitive match (since Firestore query is case-sensitive)
            const users = await this.loadUsers();
            console.log("👥 Total users loaded from Firebase:", users.length);

            const userDoc = users.find(u => 
                u.username && u.username.toLowerCase() === username.trim().toLowerCase() && 
                u.password && u.password === password // Password harus case-sensitive
            );
            
            if (!userDoc) {
                console.warn("❌ Login gagal: Username atau Password tidak cocok.");
                return null;
            }

            console.log("✅ Login Berhasil untuk:", userDoc.username);
            const userData = userDoc;
            const userId = userDoc.id;
                // Fetch Permissions for this role
                let permissions = { can_add: false, can_edit: false, can_delete: false, can_status: false };
                try {
                    const pQ = window.fbQuery(window.fbCollection(db, "permissions"), window.fbWhere("role", "==", userData.role));
                    const pSnap = await window.fbGetDocs(pQ);
                    if (!pSnap.empty) {
                        const pData = pSnap.docs[0].data();
                        permissions = {
                            can_add: pData.can_add || false,
                            can_edit: pData.can_edit || false,
                            can_delete: pData.can_delete || false,
                            can_status: pData.can_status || false
                        };
                    }
                } catch (pe) {
                    console.error("Gagal load permissions:", pe);
                }

                const session = {
                    id: userId,
                    username: userData.username,
                    fullname: userData.fullname,
                    role: userData.role,
                    permissions: permissions
                };
                localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
            return session;
        } catch (e) {
            console.error("Login error:", e);
        }
        return null;
    },

    getSession() {
        const raw = localStorage.getItem(this.SESSION_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    },

    logout() {
        // Hanya hapus session yang aktif di halaman ini
        localStorage.removeItem(this.SESSION_KEY);
        
        // Show "Proses..." indicator
        if (typeof showToast === 'function') {
            showToast("Proses Logout...");
        } else {
            console.log("Proses Logout...");
        }
        
        setTimeout(() => {
            // Cek jika sedang di halaman admin, arahkan ke admin-login
            const isAdminPage = window.location.pathname.includes('admin');
            window.location.href = this._getRedirectPage(isAdminPage ? 'admin-login' : 'login-apps');
        }, 800);
    },

    requireAuth(allowedRoles) {
        const session = this.getSession();
        const isAdminPage = window.location.pathname.includes('admin');
        const loginPage = this._getRedirectPage(isAdminPage ? 'admin-login' : 'login-apps');

        if (!session) {
            window.location.href = loginPage;
            return null;
        }
        if (allowedRoles && !allowedRoles.includes(session.role)) {
            window.location.href = loginPage;
            return null;
        }
        return session;
    }
};
