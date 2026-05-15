const CONFIG = {
    // URL Web App Google Apps Script lama
    GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbweEtOBh5c9Cj090PPLZlllEuxlLdZ1gWEoXxxEPbMS8CFAVL5o5felPTjfeuAIxkCe/exec'
};

const Firebase = {
    // KONEKSI FIREBASE (Firestore)
    async syncUnit(data, action = 'add') {
        if (!window.fbDB) {
            console.error('Firebase belum siap.');
            return;
        }

        try {
            const db = window.fbDB;
            const unitsRef = window.fbCollection(db, "units");
            
            // Map status text to index if status_idx is missing
            let statusIdx = data.status_idx;
            if (statusIdx === undefined || statusIdx === null) {
                const steps = (typeof Store !== 'undefined') ? Store.steps : [];
                statusIdx = steps.indexOf(data.posisi_unit);
                if (statusIdx === -1) statusIdx = 0; // Default to first step
            }

            const posisiUnitText = (typeof Store !== 'undefined' && Store.steps) ? Store.steps[statusIdx] : (data.posisi_unit || '');
            
            const payload = {
                plate: data.plate.toUpperCase(),
                updated_at: new Date().toISOString()
            };

            // Only update fields that are present in data
            if (data.model !== undefined) payload.model = data.model;
            if (data.sa_name !== undefined) payload.sa_name = data.sa_name;
            if (data.color !== undefined) payload.color = data.color;
            if (data.date_in !== undefined) payload.date_in = data.date_in;
            if (data.est_date !== undefined) payload.est_date = data.est_date;
            if (data.keterangan !== undefined) payload.keterangan = data.keterangan;
            if (data.status_idx !== undefined) payload.status_idx = parseInt(data.status_idx);
            if (posisiUnitText) payload.posisi_unit = posisiUnitText;
            if (data.ket_progres !== undefined) payload.ket_progres = data.ket_progres;
            if (data.is_waiting_sparepart !== undefined) payload.is_waiting_sparepart = data.is_waiting_sparepart;
            if (data.is_working !== undefined) payload.is_working = data.is_working;
            if (data.late_reason !== undefined) payload.late_reason = data.late_reason;

            console.log("📤 Syncing to Firebase [ " + action + " ] : " + payload.plate);

            // CARI BERDASARKAN PLAT (Primary Key)
            const searchPlate = data.old_plate || payload.plate; // Jika plat berubah, cari pake plat lama
            const q = window.fbQuery(unitsRef, window.fbWhere("plate", "==", searchPlate));
            const querySnapshot = await window.fbGetDocs(q);

            if (action === 'delete') {
                if (!querySnapshot.empty) {
                    const docRef = window.fbDoc(db, "units", querySnapshot.docs[0].id);
                    await window.fbDeleteDoc(docRef);
                    console.log("Firebase: Data deleted for " + searchPlate);
                }
                return;
            }

            if (!querySnapshot.empty) {
                // UPDATE RECORD YANG SUDAH ADA 
                const docRef = window.fbDoc(db, "units", querySnapshot.docs[0].id);
                await window.fbUpdateDoc(docRef, payload);
            } else {
                // TAMBAH DATA BARU
                payload.created_at = new Date().toISOString();
                await window.fbAddDoc(unitsRef, payload);
            }
        } catch (error) {
            console.error('Firebase syncUnit error:', error);
        }
    },

    // Inisialisasi Realtime Listener (Digunakan di main.js)
    initRealtime() {
        if (!window.fbDB) return;
        console.log("📡 Mengaktifkan Realtime Sync Firebase...");
        
        const unitsRef = window.fbCollection(window.fbDB, "units");
        const q = window.fbQuery(unitsRef);

        window.fbOnSnapshot(q, (snapshot) => {
            const allData = [];
            snapshot.forEach(doc => {
                const unit = doc.data();
                unit.id = doc.id; // Gunakan Firestore ID sebagai backup
                // Pastikan ID unik numerik tetap ada jika dibutuhkan logika lama
                if (!unit.id_num) {
                    unit.id_num = Math.floor(Math.random() * 1000000);
                }
                // Halaman detail butuh id numerik
                if(!unit.id) unit.id = unit.id_num;
                
                allData.push(unit);
            });

            console.log("🔥 Realtime Update: " + allData.length + " unit.");
            if (typeof Store !== 'undefined') {
                Store.saveUnits(allData);
                // Trigger refresh UI di halaman yang aktif
                if (typeof renderHome === 'function') renderHome();
                if (typeof renderDashboard === 'function') renderDashboard();
            }
        });

        // Monitor Notifications Realtime
        const notifsRef = window.fbCollection(window.fbDB, "notifications");
        const qNotif = window.fbQuery(notifsRef, window.fbOrderBy("created_at", "desc"), window.fbLimit(20));
        
        window.fbOnSnapshot(qNotif, (snapshot) => {
            if (typeof Store === 'undefined') return;
            
            const existingNotifs = Store.getNotifs();
            const prevUnread = existingNotifs.filter(n => !n.is_read).length;
            const sessionKey = (window.location.pathname.includes('admin')) ? 'tracking_admin_byd' : 'tracking_user_byd';
            const sessionRaw = localStorage.getItem(sessionKey);
            let currentUser = "";
            if (sessionRaw) {
                try {
                    const sessionObj = JSON.parse(sessionRaw);
                    currentUser = sessionObj.fullname || sessionObj.username || "";
                } catch(e) {}
            }
            
            const cloudNotifsRaw = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                
                // Targeted Notification Filter:
                // Jika notif memiliki target_sa, maka hanya SA tersebut (atau Admin) yang bisa lihat.
                if (data.target_sa && currentUser) {
                    const userRole = localStorage.getItem('user_role') || (sessionRaw ? JSON.parse(sessionRaw).role : "");
                    const isAdmin = (userRole === 'admin_bp' || userRole === 'umum' || userRole === 'admin');
                    
                    if (!isAdmin && data.target_sa.trim().toLowerCase() !== currentUser.trim().toLowerCase()) {
                        return; // Skip if not the target and not an admin
                    }
                }

                if (data.sender && currentUser && data.sender.trim().toLowerCase() === currentUser.trim().toLowerCase()) return;

                const localMatch = existingNotifs.find(n => n.id === doc.id);
                cloudNotifsRaw.push({
                    id: doc.id,
                    text: data.keterangan || "",
                    sender: data.sender || "",
                    time: data.time || data.created_at || new Date().toISOString(),
                    is_read: localMatch ? localMatch.is_read : false
                });
            });
            
            Store.saveNotifs(cloudNotifsRaw);
            const currentUnread = cloudNotifsRaw.filter(n => !n.is_read).length;

            if (currentUnread > prevUnread) {
                console.log("🔊 Ada notif baru! Mainkan suara...");
                if (typeof playNotifSound === 'function' && cloudNotifsRaw.length > 0) {
                    playNotifSound(cloudNotifsRaw[0].text);
                }
            }

            if (typeof initNotifsBadge === 'function') initNotifsBadge();
            
            // Realtime refresh daftar modal jika sedang terbuka
            const notifModal = document.getElementById('notif-modal');
            if (typeof renderNotifs === 'function' && notifModal && notifModal.classList.contains('open')) {
                renderNotifs();
            }
        });
    },

    // Kirim notifikasi ke Firebase agar sinkron realtime ke semua HP
    async syncNotification(notifData) {
        if (!window.fbDB) return;
        try {
            const db = window.fbDB;
            const notifsRef = window.fbCollection(db, "notifications");
            const payload = {
                keterangan: notifData.text,
                sender: notifData.sender || "System", 
                target_sa: notifData.target_sa || "", // Targeted SA
                time: notifData.time || new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            await window.fbAddDoc(notifsRef, payload);
            console.log("Firebase: Notifikasi terkirim oleh " + payload.sender);
        } catch (e) {
            console.error("Firebase syncNotification error:", e);
        }
    },

    // Sapu Bersih Riwayat Notifikasi
    async clearNotifications() {
        if (!window.fbDB) return;
        try {
            const db = window.fbDB;
            const notifsRef = window.fbCollection(db, "notifications");
            const snapshot = await window.fbGetDocs(notifsRef);
            
            if (snapshot.empty) return;
            
            console.log("Menghapus " + snapshot.size + " riwayat notifikasi secara global...");
            
            const promises = snapshot.docs.map(d => {
                const docRef = window.fbDoc(db, "notifications", d.id);
                return window.fbDeleteDoc(docRef);
            });
            
            await Promise.all(promises);
            console.log("Firebase: Notifikasi BERHASIL dibersihkan untuk semua user.");
        } catch (e) {
            console.error("Firebase clearNotifications error:", e);
        }
    },

    // Hapus satu pesan notifikasi (Global)
    async deleteNotification(id) {
        if (!window.fbDB || !id) return;
        try {
            const db = window.fbDB;
            const docRef = window.fbDoc(db, "notifications", id);
            await window.fbDeleteDoc(docRef);
            console.log("Firebase: Notifikasi [" + id + "] dihapus secara global.");
        } catch (e) {
            console.error("Firebase deleteNotification error:", e);
        }
    }
};

// Jalankan Realtime Sync setiap kali aplikasi dibuka
document.addEventListener('DOMContentLoaded', () => {
    const tryInit = (retries = 10) => {
        if (window.fbDB) {
            console.log("✅ Firebase detected, initializing realtime...");
            Firebase.initRealtime();
        } else if (retries > 0) {
            console.log("⏳ Firebase not ready, retrying... (" + retries + ")");
            setTimeout(() => tryInit(retries - 1), 500);
        } else {
            console.warn("❌ Firebase failed to load after multiple attempts.");
        }
    };
    
    tryInit();
});
