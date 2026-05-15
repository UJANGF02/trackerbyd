// ============================================
// store.js - Data Store Module (JSON-based)
// Menyimpan data di localStorage, load awal dari JSON
// ============================================

const Store = {
    UNITS_KEY: 'byd_tracking_units',
    LOGS_KEY: 'byd_tracking_logs',
    NOTIFS_KEY: 'byd_tracking_notifs',

    // Daftar Tahapan Pengerjaan (Global)
    steps: ["Unit Masuk", "Bongkar", "Lasketok", "Dempul", "Poxy", "Pengecetan", "Poles", "Cuci", "Pemasangan", "Finishing", "Selesai"],

    async init() {
        // Force clear dummy data sekali saja saat update versi ini
        if (!localStorage.getItem('tracking_app_v12_cleared')) {
            localStorage.removeItem(this.UNITS_KEY);
            localStorage.removeItem(this.LOGS_KEY);
            localStorage.removeItem(this.NOTIFS_KEY);
            localStorage.setItem('tracking_app_v12_cleared', 'true');
        }

        // Load units dari localStorage, atau dari JSON jika belum ada
        if (!localStorage.getItem(this.UNITS_KEY)) {
            try {
                const res = await fetch('data/units.json');
                const units = await res.json();
                localStorage.setItem(this.UNITS_KEY, JSON.stringify(units));
            } catch (e) {
                localStorage.setItem(this.UNITS_KEY, JSON.stringify([]));
            }
        }
        // Load logs
        if (!localStorage.getItem(this.LOGS_KEY)) {
            try {
                const res = await fetch('data/logs.json');
                const logs = await res.json();
                localStorage.setItem(this.LOGS_KEY, JSON.stringify(logs));
            } catch (e) {
                localStorage.setItem(this.LOGS_KEY, JSON.stringify({}));
            }
        }
    },

    getUnits() {
        try {
            return JSON.parse(localStorage.getItem(this.UNITS_KEY)) || [];
        } catch (e) {
            return [];
        }
    },

    saveUnits(units) {
        localStorage.setItem(this.UNITS_KEY, JSON.stringify(units));
    },

    getLogs() {
        try {
            return JSON.parse(localStorage.getItem(this.LOGS_KEY)) || {};
        } catch (e) {
            return {};
        }
    },

    saveLogs(logs) {
        localStorage.setItem(this.LOGS_KEY, JSON.stringify(logs));
    },

    getNotifs() {
        try {
            return JSON.parse(localStorage.getItem(this.NOTIFS_KEY)) || [];
        } catch (e) {
            return [];
        }
    },

    saveNotifs(notifs) {
        localStorage.setItem(this.NOTIFS_KEY, JSON.stringify(notifs));
    },

    addNotification(notif, senderName = '', targetSA = '') {
        const notifs = this.getNotifs();
        notif.id = new Date().getTime();
        notif.is_read = false;
        
        // Simpan lokal dulu
        notifs.unshift(notif);
        if (notifs.length > 50) notifs.pop();
        this.saveNotifs(notifs);

        // SYNC REALTIME KE FIREBASE (Dengan Pengirim & Target SA)
        if (typeof Firebase !== 'undefined' && Firebase.syncNotification) {
            Firebase.syncNotification({
                ...notif,
                sender: senderName || localStorage.getItem('user_fullname') || 'System',
                target_sa: notif.target_sa || ''
            });
        }
    },

    markNotifsAsRead() {
        let n = this.getNotifs();
        n.forEach(x => x.is_read = true);
        this.saveNotifs(n);
    },

    markNotifAsRead(id) {
        let n = this.getNotifs();
        const found = n.find(x => x.id == id);
        if (found) {
            found.is_read = true;
            this.saveNotifs(n);
        }
    },

    // --- CRUD Operations ---
    addUnit(data) {
        const units = this.getUnits();
        const maxId = units.length > 0 ? Math.max(...units.map(u => u.id)) : 0;
        const newUnit = {
            id: maxId + 1,
            plate: data.plate.toUpperCase(),
            no_wo: data.no_wo || '',
            model: data.model,
            color: data.color || '',
            sa_name: data.sa_name || '',
            date_in: data.date_in,
            est_date: data.est_date,
            keterangan: data.keterangan || '',
            status_idx: 0,
            is_waiting_sparepart: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        units.push(newUnit);
        this.saveUnits(units);

        // Sync to Firebase in background
        if (typeof Firebase !== 'undefined') {
            Firebase.syncUnit(newUnit);
        }

        return newUnit;
    },

    updateUnit(unitId, data, updatedByRole, updatedByName) {
        const units = this.getUnits();
        const idx = units.findIndex(u => u.id == unitId);
        if (idx === -1) return null;

        const oldEstDate = units[idx].est_date;
        const newEstDate = data.est_date;
        const oldPlate = units[idx].plate; // Simpan plat lama untuk sync gsheet
        const plate = units[idx].plate;

        Object.assign(units[idx], data);
        if (data.is_waiting_sparepart !== undefined) units[idx].is_waiting_sparepart = data.is_waiting_sparepart;
        if (data.is_working !== undefined) units[idx].is_working = data.is_working;
        if (data.late_reason !== undefined) units[idx].late_reason = data.late_reason;
        if (data.plate) units[idx].plate = data.plate.toUpperCase();
        if (data.no_wo !== undefined) units[idx].no_wo = data.no_wo;
        this.saveUnits(units);

        // Sync edited unit to Firebase
        if (typeof Firebase !== 'undefined') {
            const syncData = { ...units[idx] };
            // Jika plat berubah, kirim old_plate ke Firebase agar bisa diupdate barisnya
            if (oldPlate !== units[idx].plate) {
                syncData.old_plate = oldPlate;
            }
            Firebase.syncUnit(syncData, 'update_data');
        }

        // Notification for Update Data
        if (updatedByRole === 'sa' || updatedByRole === 'umum' || updatedByRole === 'gh' || updatedByRole === 'admin_bp' || updatedByRole === 'admin') {
            let notifText = `Unit ${plate} update data oleh ${updatedByName}`;

            // Cek jika ada perubahan estimasi
            if (newEstDate && oldEstDate && newEstDate !== oldEstDate) {
                const formatDate = (d) => {
                    if(!d) return "-";
                    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
                    const dt = new Date(d);
                    return dt.getDate() + " " + months[dt.getMonth()] + " " + dt.getFullYear();
                };
                notifText = `Unit ${plate} update data (target: ${units[idx].sa_name}, posisi: ${units[idx].posisi_unit || '-'}) menjadi ${formatDate(newEstDate)}`;
            } else {
                notifText = `Unit ${plate} update data (target: ${units[idx].sa_name}, posisi: ${units[idx].posisi_unit || '-'}) oleh ${updatedByName}`;
            }

            this.addNotification({
                text: notifText,
                target_sa: units[idx].sa_name || '',
                time: new Date().toISOString()
            }, updatedByName);
        }

        return units[idx];
    },

    deleteUnit(unitId) {
        let units = this.getUnits();
        const unitToDelete = units.find(u => u.id == unitId);
        
        // Sync delete to Firebase
        if (unitToDelete && typeof Firebase !== 'undefined') {
            Firebase.syncUnit(unitToDelete, 'delete');
        }

        units = units.filter(u => u.id != unitId);
        this.saveUnits(units);
        // Also delete logs
        const logs = this.getLogs();
        delete logs[unitId];
        this.saveLogs(logs);
    },

    updateStatus(unitId, stepIdx, note, data = {}, updatedByRole = '', updatedByName = '') {
        const units = this.getUnits();
        const u = units.find(x => x.id == unitId);
        if (!u) return false;
        
        const oldStepIdx = parseInt(u.status_idx) || 0;
        const newStepIdx = parseInt(stepIdx);
        
        u.status_idx = newStepIdx;
        const newStep = this.steps[u.status_idx];
        u.posisi_unit = newStep;
        
        if (data && data.is_waiting_sparepart !== undefined) u.is_waiting_sparepart = data.is_waiting_sparepart;
        if (data && data.is_working !== undefined) u.is_working = data.is_working;
        u.updated_at = new Date().toISOString();
        this.saveUnits(units);

        const logs = this.getLogs();
        if (!logs[unitId]) logs[unitId] = {};
        logs[unitId][stepIdx] = note || '';
        this.saveLogs(logs);

        // Sync status to Firebase
        if (typeof Firebase !== 'undefined') {
            u.ket_progres = note;
            Firebase.syncUnit(u, 'update_status');
        }

        // Add Notification HANYA JIKA PINDAH POSISI (Step Berubah)
        if (oldStepIdx !== newStepIdx) {
            const isFinished = u.status_idx === (this.steps.length - 1);
            let notifText = `Unit ${u.plate} pindah posisi ke ${newStep}`;
            if (isFinished) {
                notifText = `Unit ${u.plate} sudah selesai!`;
            }
            
            this.addNotification({
                text: notifText,
                target_sa: u.sa_name || '',
                time: new Date().toISOString()
            }, updatedByName || updatedByRole || "System");
        }

        return true;
    },

    // --- User Management (for Admin) ---
    async getUsers() {
        try {
            if (!window.fbDB) return [];
            const db = window.fbDB;
            const q = window.fbQuery(window.fbCollection(db, "user"));
            const querySnapshot = await window.fbGetDocs(q);
            const users = [];
            querySnapshot.forEach((doc) => {
                users.push({ id: doc.id, ...doc.data() });
            });
            return users;
        } catch (e) {
            console.error("Gagal memuat users dari Firebase:", e);
            return [];
        }
    },

    getSAList() {
        // Get SA users from new master data cache
        try {
            return JSON.parse(localStorage.getItem('tracking_sa_cache')) || [];
        } catch (e) {
            return [];
        }
    },

    async loadAndCacheUsers() {
        const users = await this.getUsers();
        localStorage.setItem('tracking_users_cache', JSON.stringify(users));
        return users;
    },

    // --- Chart Data ---
    getChartData(month, year, filterSA = null) {
        let units = this.getUnits();
        if (filterSA) {
            units = units.filter(u => u.sa_name === filterSA);
        }
        const daysInMonth = new Date(year, month, 0).getDate();
        const labels = [];
        const dataIn = new Array(daysInMonth).fill(0);
        const dataOut = new Array(daysInMonth).fill(0);

        for (let i = 1; i <= daysInMonth; i++) labels.push(i);

        units.forEach(u => {
            const dIn = new Date(u.date_in);
            if (dIn.getMonth() + 1 == month && dIn.getFullYear() == year) {
                dataIn[dIn.getDate() - 1]++;
            }
            if (u.status_idx == (this.steps.length - 1)) {
                const dEst = new Date(u.est_date);
                if (dEst.getMonth() + 1 == month && dEst.getFullYear() == year) {
                    dataOut[dEst.getDate() - 1]++;
                }
            }
        });

        const dataNet = dataIn.map((v, i) => v - dataOut[i]);
        const totalActive = units.filter(u => u.status_idx < (this.steps.length - 1)).length;

        return {
            labels,
            dataIn,
            dataOut,
            dataNet,
            totalIn: dataIn.reduce((a, b) => a + b, 0),
            totalOut: dataOut.reduce((a, b) => a + b, 0),
            totalActive
        };
    },

    // --- Notifications Management ---
    getNotifs() {
        try {
            return JSON.parse(localStorage.getItem(this.NOTIFS_KEY)) || [];
        } catch (e) {
            return [];
        }
    },

    saveNotifs(notifs) {
        localStorage.setItem(this.NOTIFS_KEY, JSON.stringify(notifs));
    },

    markNotifsAsRead() {
        const notifs = this.getNotifs();
        notifs.forEach(n => n.is_read = true);
        this.saveNotifs(notifs);
    },

    markNotifAsRead(id) {
        const notifs = this.getNotifs();
        const n = notifs.find(x => x.id === id);
        if (n) n.is_read = true;
        this.saveNotifs(notifs);
    },

    async clearAllNotifications() {
        if (typeof Firebase !== 'undefined') {
            await Firebase.clearNotifications();
        }
        this.saveNotifs([]);
    },

    deleteNotification(id) {
        // Hapus Lokal
        let notifs = this.getNotifs();
        notifs = notifs.filter(n => n.id !== id);
        this.saveNotifs(notifs);

        // Hapus Global (Firebase)
        if (typeof Firebase !== 'undefined' && Firebase.deleteNotification) {
            Firebase.deleteNotification(id);
        }
    }
};
