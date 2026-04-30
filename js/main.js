import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, serverTimestamp, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// --- Inicializar Dark Mode ---
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
}

// --- CONFIGURACIÓN DE FIREBASE ---
// TODO: Reemplaza esto con tus propias llaves de Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyDVA_N6L1Fm2A07gKzGqQOd0obeVXOssOw",
    authDomain: "agenda-farmacia-8d24b.firebaseapp.com",
    projectId: "agenda-farmacia-8d24b",
    storageBucket: "agenda-farmacia-8d24b.firebasestorage.app",
    messagingSenderId: "117482842350",
    appId: "1:117482842350:web:1c0d6e68be2b927dbe2bff",
    measurementId: "G-FYQEPSLEHV"
};

// Default Templates
const defaultTemplates = {
    reminder: "¡Hola {nombre}! 👋\nLe escribimos de *Farmacias Madero* 💊 para recordarle el resurtido de su medicamento: *{medicamento}* 💊.\n\n¿Desea que se lo apartemos o se lo enviemos a domicilio? 👆👆",
    birthday: "¡Hola {nombre}! 👋\nLe escribimos de *Farmacias Madero* para desearle un muy feliz cumpleaños 🎂🎁 Esperamos que pase un excelente día."
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    
    // Elements
    const navLinks = document.querySelectorAll('.nav-links li');
    const tabContents = document.querySelectorAll('.tab-content');
    const agendaCards = document.getElementById('agenda-cards');
    const registrationForm = document.getElementById('registration-form');
    const pendingCount = document.getElementById('pending-count');
    const totalPatientsEl = document.getElementById('total-patients');
    const currentDateEl = document.getElementById('current-date');
    const toast = document.getElementById('toast');
    const searchContainer = document.querySelector('.search-container');
    const searchInput = document.querySelector('.search-container input');

    let currentAgendaData = [];
    let editModeId = null;
    let simulatedDate = null; 
    let whatsappTemplates = { ...defaultTemplates };
    let agendaUnsubscribe = null; 
    let salesChartInstance = null; // Instancia para gráfico de ventas
    let reasonsChartInstance = null; // Instancia para gráfico de motivos

    // --- Helper para Fechas (Soporta simulación) ---
    function getTodayDate() {
        if (simulatedDate) {
            return new Date(simulatedDate + "T12:00:00");
        }
        const d = new Date();
        d.setHours(12,0,0,0);
        return d;
    }

    function getTodayISO() {
        return getTodayDate().toISOString().split('T')[0];
    }

    function updateCurrentDateDisplay() {
        const d = getTodayDate();
        currentDateEl.innerText = d.toLocaleDateString('es-ES', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
        if(simulatedDate) {
            currentDateEl.innerText += ' (SIMULADA)';
            currentDateEl.style.color = 'var(--danger)';
        } else {
            currentDateEl.style.color = 'var(--text-muted)';
        }
    }

    // Set current date on load
    updateCurrentDateDisplay();

    // --- Login Logic ---
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const navDevtools = document.getElementById('nav-devtools');

    if (sessionStorage.getItem('isLoggedIn') === 'true') {
        showApp();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('login-user').value.trim();
        const pass = document.getElementById('login-pass').value.trim();

        // 1. Acceso maestro de respaldo
        if (user === 'admin' && pass === '7294967290') {
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('role', 'admin');
            sessionStorage.setItem('username', 'admin');
            showApp();
            return;
        }

        // 2. Consulta a Firestore para usuarios adicionales
        try {
            const q = query(collection(db, "users"), where("username", "==", user), where("password", "==", pass));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const userData = querySnapshot.docs[0].data();
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('role', userData.role || 'vendedor');
                sessionStorage.setItem('username', userData.username);
                showApp();
            } else {
                loginError.style.display = 'block';
            }
        } catch (error) {
            console.error("Login error:", error);
            loginError.innerText = "Error de conexión con la base de datos.";
            loginError.style.display = 'block';
        }
    });

    function showApp() {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        if (sessionStorage.getItem('role') === 'admin') {
            navDevtools.style.display = 'flex';
            const navStats = document.getElementById('nav-statistics');
            if (navStats) navStats.style.display = 'flex';
            loadTemplates(); 
        }
        loadAgenda(); 
    }

    // --- Logout Logic ---
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
                sessionStorage.clear();
                window.location.reload(); 
            }
        });
    }

    // --- Dark Mode Toggle ---
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            if (document.body.classList.contains('dark-theme')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // --- Navegación ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            tabContents.forEach(tab => {
                tab.classList.remove('active');
                if (tab.id === `tab-${tabId}`) tab.classList.add('active');
            });

            // Ocultar buscador si no estamos en la agenda
            if (tabId === 'agenda') {
                searchContainer.style.visibility = 'visible';
                searchInput.value = '';
                loadAgenda();
            } else if (tabId === 'birthdays') {
                searchContainer.style.visibility = 'hidden';
                checkBirthdays(currentAgendaData);
            } else if (tabId === 'devtools') {
                searchContainer.style.visibility = 'hidden';
                loadUsers(); // Cargar usuarios al entrar a Modo Dev
            } else {
                searchContainer.style.visibility = 'hidden';
            }
        });
    });

    // --- Buscador y Filtros ---
    const statPending = document.getElementById('stat-pending');
    const statTotal = document.getElementById('stat-total');

    statPending.addEventListener('click', () => {
        const pending = currentAgendaData.filter(i => calculateDaysDiff(i.estimated_end_date) <= 3);
        const todayISO = getTodayISO();
        renderAgenda(pending, todayISO);
        
        statPending.classList.add('active-filter');
        statTotal.classList.remove('active-filter');
        showToast('Mostrando solo pendientes próximos', 'info');
    });

    statTotal.addEventListener('click', () => {
        const todayISO = getTodayISO();
        renderAgenda(currentAgendaData, todayISO);
        
        statTotal.classList.add('active-filter');
        statPending.classList.remove('active-filter');
        showToast('Mostrando todos los pacientes', 'info');
    });

     // --- Búsqueda y Filtros ---
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');

    function applyFiltersAndRender() {
        if (!searchInput || !filterSelect) return;
        const searchTerm = searchInput.value.toLowerCase();
        const filterVal = filterSelect.value;
        const currentUser = sessionStorage.getItem('username');

        const filtered = currentAgendaData.filter(item => {
            const matchesSearch = item.full_name.toLowerCase().includes(searchTerm) || 
                                  item.medication_name.toLowerCase().includes(searchTerm) ||
                                  item.phone.includes(searchTerm);
            
            let matchesFilter = true;
            if (filterVal === 'mine') {
                matchesFilter = (item.last_handled_by === currentUser || item.created_by === currentUser);
            } else if (filterVal === 'failed') {
                matchesFilter = (item.last_action === 'venta_fallida' || item.last_action === 'no_surtido');
            }

            return matchesSearch && matchesFilter;
        });
        renderAgenda(filtered, getTodayISO());
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyFiltersAndRender);
    }
    if (filterSelect) {
        filterSelect.addEventListener('change', applyFiltersAndRender);
    }

    // --- Carga en Tiempo Real (onSnapshot) ---
    async function loadAgenda() {
        if (!agendaCards) return;
        
        // Si ya hay un listener activo, lo cerramos para no duplicar
        if (agendaUnsubscribe) agendaUnsubscribe();

        agendaCards.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Conectando con la base de datos en tiempo real...</p></div>';
        
        try {
            const role = sessionStorage.getItem('role');
            const username = sessionStorage.getItem('username');
            
            let q;
            if (role === 'admin') {
                q = query(collection(db, "treatments"), where("active", "==", true));
            } else if (username) {
                q = query(collection(db, "treatments"), where("created_by", "==", username), where("active", "==", true));
            } else {
                return;
            }

            // Iniciamos el listener en tiempo real
            agendaUnsubscribe = onSnapshot(q, (querySnapshot) => {
                const todayISO = getTodayISO();
                currentAgendaData = [];
                
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    data.id = doc.id; 
                    currentAgendaData.push(data);
                });

                // Ordenamos por fecha de contacto
                currentAgendaData.sort((a, b) => {
                    const dateA = a.next_contact_date || "";
                    const dateB = b.next_contact_date || "";
                    return dateA.localeCompare(dateB);
                });

                // Renderizar inicialmente
                applyFiltersAndRender();
                checkBirthdays(currentAgendaData); 
                
                const urgentCount = currentAgendaData.filter(i => calculateDaysDiff(i.estimated_end_date) <= 3).length;
                pendingCount.innerText = urgentCount;
                totalPatientsEl.innerText = currentAgendaData.length;

                // Actualizar Badge de Agenda
                const agendaBadge = document.getElementById('agenda-badge');
                if (urgentCount > 0) {
                    agendaBadge.innerText = urgentCount;
                    agendaBadge.style.display = 'inline-block';
                } else {
                    agendaBadge.style.display = 'none';
                }

                // Estadísticas para Admin (Eficacia y Dashboard)
                if (role === 'admin') {
                    updateAdminStats(currentAgendaData);
                    updateAdminDashboard(currentAgendaData);
                }
            }, (error) => {
                console.error("Error en Snapshot:", error);
                showToast('Error en la conexión en tiempo real', 'error');
            });

        } catch (error) {
            console.error(error);
            showToast('Error al configurar la agenda', 'error');
        }
    }

    function updateAdminStats(data) {
        const now = getTodayDate();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const thisMonthActions = data.filter(item => {
            if (!item.last_action) return false;
            const actionDate = item.last_renewed_at ? (item.last_renewed_at.toDate ? item.last_renewed_at.toDate() : new Date(item.last_renewed_at)) : new Date(item.start_date);
            return actionDate >= startOfMonth;
        });

        const sales = thisMonthActions.filter(i => i.last_action === 'surtido').length;
        const total = thisMonthActions.length;
        const efficacy = total > 0 ? Math.round((sales / total) * 100) : 0;
        
        document.getElementById('monthly-sales-count').innerText = `${sales} / ${efficacy}%`;
    }

    function updateAdminDashboard(data) {
        const now = getTodayDate();
        const fifteenDaysAgo = new Date(now);
        fifteenDaysAgo.setDate(now.getDate() - 15);

        // 1. Procesar Datos para Gráfico de Tendencia (Ventas de los últimos 15 días)
        const salesByDate = {};
        // Inicializar los últimos 15 días con 0
        for (let i = 0; i <= 15; i++) {
            const d = new Date(fifteenDaysAgo);
            d.setDate(fifteenDaysAgo.getDate() + i);
            salesByDate[d.toISOString().split('T')[0]] = 0;
        }

        // 2. Procesar Motivos de Falla y Ranking de Vendedores
        const failReasons = {};
        const sellerSales = {};

        data.forEach(item => {
            const history = item.history || [];
            history.forEach(event => {
                const eventDate = event.date; // Viene formateado como "30 abr"
                // Para el gráfico de tendencia necesitamos la fecha real o aproximada.
                // Usaremos el start_date del item si la acción fue reciente.
                if (event.action === 'surtido') {
                    const dateKey = item.last_renewed_at ? 
                        (item.last_renewed_at.toDate ? item.last_renewed_at.toDate().toISOString().split('T')[0] : new Date(item.last_renewed_at).toISOString().split('T')[0]) 
                        : item.start_date;
                    
                    if (salesByDate[dateKey] !== undefined) {
                        salesByDate[dateKey]++;
                    }

                    // Ranking de Vendedores
                    const seller = event.user || 'Desconocido';
                    sellerSales[seller] = (sellerSales[seller] || 0) + 1;
                }

                if (event.action === 'no_surtido' || event.action === 'venta_fallida') {
                    const reason = event.note || 'Sin motivo';
                    failReasons[reason] = (failReasons[reason] || 0) + 1;
                }
            });
        });

        // --- RENDERIZAR GRÁFICO DE TENDENCIA ---
        const labels = Object.keys(salesByDate).map(d => {
            const date = new Date(d + "T12:00:00");
            return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        });
        const values = Object.values(salesByDate);

        if (salesChartInstance) salesChartInstance.destroy();
        const ctxSales = document.getElementById('salesTrendChart').getContext('2d');
        salesChartInstance = new Chart(ctxSales, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ventas Diarias',
                    data: values,
                    borderColor: '#4361ee',
                    backgroundColor: 'rgba(67, 97, 238, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });

        // --- RENDERIZAR GRÁFICO DE MOTIVOS ---
        const reasonLabels = Object.keys(failReasons);
        const reasonValues = Object.values(failReasons);

        if (reasonsChartInstance) reasonsChartInstance.destroy();
        const ctxReasons = document.getElementById('failReasonsChart').getContext('2d');
        reasonsChartInstance = new Chart(ctxReasons, {
            type: 'doughnut',
            data: {
                labels: reasonLabels,
                datasets: [{
                    data: reasonValues,
                    backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
            }
        });

        // --- RENDERIZAR RANKING DE VENDEDORES ---
        const rankingEl = document.getElementById('seller-ranking');
        const sortedSellers = Object.entries(sellerSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (sortedSellers.length === 0) {
            rankingEl.innerHTML = '<p class="loading-text">No hay ventas registradas este periodo.</p>';
        } else {
            rankingEl.innerHTML = sortedSellers.map(([name, count]) => `
                <div class="ranking-item">
                    <span class="seller-name">${name}</span>
                    <span class="sales-count">${count} ventas</span>
                </div>
            `).join('');
        }
    }

    function renderAgenda(items, todayISO) {
        const agendaCards = document.getElementById('agenda-cards');
        
        if (items.length === 0) {
            agendaCards.innerHTML = '<div class="loading-state"><i class="fas fa-calendar-times" style="color: var(--primary); opacity: 0.5;"></i><p>No hay pacientes para mostrar con los filtros actuales.</p></div>';
            return;
        }

        // --- Agrupación por Paciente (Teléfono) ---
        const grouped = items.reduce((acc, item) => {
            const key = item.phone;
            if (!acc[key]) {
                acc[key] = {
                    full_name: item.full_name,
                    phone: item.phone,
                    treatments: []
                };
            }
            acc[key].treatments.push(item);
            return acc;
        }, {});

        agendaCards.innerHTML = Object.values(grouped).map(group => {
            // Determinar urgencia máxima del grupo
            const mostUrgent = group.treatments.reduce((prev, curr) => {
                const prevDiff = calculateDaysDiff(prev.estimated_end_date);
                const currDiff = calculateDaysDiff(curr.estimated_end_date);
                return currDiff < prevDiff ? curr : prev;
            });

            const diff = calculateDaysDiff(mostUrgent.estimated_end_date);
            let statusText = `Faltan ${diff} días`;
            let statusClass = 'soon';
            if (diff <= 0) { statusText = 'VENCIDO'; statusClass = 'urgent'; }
            else if (diff <= 3) { statusText = 'PRÓXIMO'; statusClass = 'alert'; }

            // Mensaje de WhatsApp Unificado (solo los que vencen en 3 días o menos)
            const dueTreatments = group.treatments.filter(t => calculateDaysDiff(t.estimated_end_date) <= 7);
            const medNames = dueTreatments.map(t => `*${t.medication_name}*`).join(', ');
            
            const message = whatsappTemplates.reminder
                .replace(/{nombre}/g, group.full_name)
                .replace(/{medicamento}/g, medNames);

            const phone = group.phone.replace(/\D/g, '');
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

            // Renderizar lista de medicamentos
            const treatmentsHtml = group.treatments.map(t => {
                const tDiff = calculateDaysDiff(t.estimated_end_date);
                let tStatus = '';
                if (tDiff <= 0) tStatus = '<span class="t-badge urgent">Vencido</span>';
                else if (tDiff <= 3) tStatus = '<span class="t-badge alert">Próximo</span>';

                return `
                    <div class="treatment-item ${t.last_action === 'venta_fallida' ? 'has-fail' : ''}">
                        <div class="t-info">
                            <strong style="font-size: 1.1rem;">${t.medication_name}</strong>
                            <span>Termina: ${formatDate(t.estimated_end_date)} ${tStatus}</span>
                        </div>
                        <div class="t-btns">
                            <button class="btn-t-action btn-renew" data-id="${t.id}" title="Compró este producto">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn-t-action btn-fail" data-id="${t.id}" title="No compró este">
                                <i class="fas fa-times"></i>
                            </button>
                            <button class="btn-t-action btn-history" data-id="${t.id}" title="Ver historial">
                                <i class="fas fa-history"></i>
                            </button>
                            <button class="btn-t-action btn-note" data-id="${t.id}" title="Añadir Nota">
                                <i class="fas fa-sticky-note"></i>
                            </button>
                            <button class="btn-t-action btn-edit" data-id="${t.id}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-t-action btn-archive" data-id="${t.id}" title="Archivar/Eliminar de Agenda">
                                <i class="fas fa-archive"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="agenda-card unified">
                    <div class="card-header">
                        <div class="header-main">
                            <span class="patient-name" style="font-size: 1.4rem;">${group.full_name}</span>
                            <span class="patient-phone"><i class="fas fa-phone"></i> Llamar al: <strong>${group.phone}</strong></span>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                            <span class="status-badge ${statusClass}" style="padding: 8px 15px; font-size: 0.9rem;">${statusText}</span>
                            <button class="btn-add-med-shortcut" data-name="${group.full_name}" data-phone="${group.phone}" title="Agregar otra medicina a este paciente">
                                <i class="fas fa-plus-circle"></i> + Medicina
                            </button>
                        </div>
                    </div>
                    
                    <div class="card-body">
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 10px; font-weight: 600;">LISTA DE MEDICAMENTOS:</p>
                        <div class="treatments-list">
                            ${treatmentsHtml}
                        </div>
                    </div>

                    <div class="card-actions">
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 5px; font-weight: 600;">ACCIONES:</p>
                        <a href="${whatsappUrl}" target="_blank" class="btn-action btn-whatsapp" style="height: 55px; font-size: 1.1rem;">
                            <i class="fab fa-whatsapp"></i> 1. Avisar por WhatsApp
                        </a>
                        <div class="action-row">
                            <button class="btn-action btn-renew-all" data-ids='${JSON.stringify(group.treatments.map(t => t.id))}' data-name="${group.full_name}" style="height: 50px;">
                                <i class="fas fa-check-double"></i> 2. Marcar TODO como Vendido
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Re-asignar eventos
        attachAgendaEvents();
    }

    function attachAgendaEvents() {
        // Renovar individual
        document.querySelectorAll('.btn-renew').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                renewTreatment(id);
            });
        });

        // Renovar TODO el grupo
        document.querySelectorAll('.btn-renew-all').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ids = JSON.parse(e.currentTarget.getAttribute('data-ids'));
                const name = e.currentTarget.getAttribute('data-name');
                renewAllTreatments(ids, name);
            });
        });

        // Venta fallida individual
        document.querySelectorAll('.btn-fail').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                recordFailedSale(id);
            });
        });

        // Editar individual
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                openEditMode(id);
            });
        });

        // Historial
        document.querySelectorAll('.btn-history').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                showPatientHistory(id);
            });
        });

        // Notas
        document.querySelectorAll('.btn-note').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                showNoteModal(id);
            });
        });

        // Archivar
        document.querySelectorAll('.btn-archive').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                archiveTreatment(id);
            });
        });

        // Nuevo medicamento shortcut
        document.querySelectorAll('.btn-add-med-shortcut').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = e.currentTarget.getAttribute('data-name');
                const phone = e.currentTarget.getAttribute('data-phone');
                prepareNewTreatment(name, phone);
            });
        });

        // Eliminar se manejará dentro de Editar o como botón global si es necesario
        // Por ahora lo dejamos en la función de edición para no saturar la tarjeta unificada
    }

    async function renewTreatment(id) {
        const item = currentAgendaData.find(i => i.id === id);
        if (!item) return;

        if (confirm(`¿Confirmas que ${item.full_name} ya compró su medicamento? El contador se reiniciará desde hoy.`)) {
            const today = getTodayDate();
            const startDate = today.toISOString().split('T')[0];
            const recurrenceDays = item.recurrence || 30;
            
            const endDate = new Date(today);
            endDate.setDate(today.getDate() + recurrenceDays);
            
            const contactDate = new Date(endDate);
            contactDate.setDate(endDate.getDate() - 3);

            const historyEntry = {
                action: 'surtido',
                date: today.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                user: sessionStorage.getItem('username'),
                note: 'Compra completada'
            };

            const history = item.history || [];
            history.push(historyEntry);

            try {
                await updateDoc(doc(db, "treatments", id), {
                    start_date: startDate,
                    estimated_end_date: endDate.toISOString().split('T')[0],
                    next_contact_date: contactDate.toISOString().split('T')[0],
                    last_renewed_at: serverTimestamp(),
                    last_handled_by: sessionStorage.getItem('username'),
                    last_action: 'surtido',
                    history: history,
                    latest_fail_reason: null // Limpiamos falla anterior al surtir
                });
                showToast('¡Contador reiniciado con éxito!', 'success');
                loadAgenda();
            } catch (error) {
                console.error(error);
                showToast('Error al renovar el registro', 'error');
            }
        }
    }

    async function recordFailedSale(id) {
        const item = currentAgendaData.find(i => i.id === id);
        if (!item) return;

        const reason = prompt(`¿Por qué no se concretó la venta para ${item.full_name}?\nEj: Precio alto, Sin stock, Ya compró, Suspendió tratamiento.`);
        
        if (reason && reason.trim() !== "") {
            const today = getTodayDate();
            const startDate = today.toISOString().split('T')[0];
            const recurrenceDays = item.recurrence || 30;
            
            const endDate = new Date(today);
            endDate.setDate(today.getDate() + recurrenceDays);
            
            const contactDate = new Date(endDate);
            contactDate.setDate(endDate.getDate() - 3);

            const historyEntry = {
                action: 'no_surtido',
                date: today.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                user: sessionStorage.getItem('username'),
                note: reason.trim()
            };

            const history = item.history || [];
            history.push(historyEntry);

            try {
                await updateDoc(doc(db, "treatments", id), {
                    start_date: startDate, // Reiniciamos para que no sature la agenda este mes
                    estimated_end_date: endDate.toISOString().split('T')[0],
                    next_contact_date: contactDate.toISOString().split('T')[0],
                    latest_fail_reason: reason.trim(),
                    latest_fail_date: startDate,
                    last_action: 'venta_fallida',
                    last_handled_by: sessionStorage.getItem('username'),
                    history: history
                });
                showToast('Motivo registrado. El recordatorio se movió al siguiente ciclo.', 'success');
                loadAgenda();
            } catch (error) {
                console.error(error);
                showToast('Error al registrar el motivo', 'error');
            }
        }
    }

    async function renewAllTreatments(ids, name) {
        if (confirm(`¿Confirmas que ${name} resurtió TODOS sus medicamentos? Se reiniciarán todos los contadores.`)) {
            try {
                const today = getTodayDate();
                const startDate = today.toISOString().split('T')[0];
                
                // Promesas para actualizar todos en paralelo
                const updates = ids.map(async (id) => {
                    const item = currentAgendaData.find(i => i.id === id);
                    if (!item) return;

                    const recurrenceDays = item.recurrence || 30;
                    const endDate = new Date(today);
                    endDate.setDate(today.getDate() + recurrenceDays);
                    const contactDate = new Date(endDate);
                    contactDate.setDate(endDate.getDate() - 3);

                    const historyEntry = {
                        action: 'surtido',
                        date: today.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                        user: sessionStorage.getItem('username'),
                        note: 'Resurtido masivo'
                    };
                    const history = item.history || [];
                    history.push(historyEntry);

                    return updateDoc(doc(db, "treatments", id), {
                        start_date: startDate,
                        estimated_end_date: endDate.toISOString().split('T')[0],
                        next_contact_date: contactDate.toISOString().split('T')[0],
                        last_renewed_at: serverTimestamp(),
                        last_handled_by: sessionStorage.getItem('username'),
                        last_action: 'surtido',
                        history: history,
                        latest_fail_reason: null
                    });
                });

                await Promise.all(updates);
                showToast('¡Todos los medicamentos resurtidos!', 'success');
                loadAgenda();
            } catch (error) {
                console.error(error);
                showToast('Error en la actualización masiva', 'error');
            }
        }
    }

    function prepareNewTreatment(name, phone) {
        // Limpiar formulario primero
        registrationForm.reset();
        editModeId = null;
        
        const formTitle = document.querySelector('.content-header h1');
        if (formTitle) formTitle.innerText = 'Registrar Nuevo Medicamento';
        
        const submitBtn = document.querySelector('.btn-submit');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Medicamento';

        // Pre-llenar datos usando los IDs correctos del HTML
        document.getElementById('full_name').value = name;
        document.getElementById('phone').value = phone;

        // Cambiar a la pestaña de registro directamente
        const navLinksArr = document.querySelectorAll('.nav-links li');
        const tabContentsArr = document.querySelectorAll('.tab-content');
        
        navLinksArr.forEach(link => link.classList.remove('active'));
        const tabBtn = document.querySelector('[data-tab="patients"]');
        if (tabBtn) tabBtn.classList.add('active');
        
        tabContentsArr.forEach(tab => tab.classList.remove('active'));
        const tabPatient = document.getElementById('tab-patients');
        if (tabPatient) tabPatient.classList.add('active');

        // Ocultar buscador si aplica
        const searchCont = document.querySelector('.search-container');
        if (searchCont) searchCont.style.visibility = 'hidden';

        // Enfocar el campo de medicamento
        setTimeout(() => {
            const medInput = document.getElementById('medication_name');
            if (medInput) medInput.focus();
        }, 300);

        showToast(`Agregando medicina extra para ${name}`, 'info');
    }

    function openEditMode(id) {
        const item = currentAgendaData.find(i => i.id === id);
        if (!item) return;
        
        editModeId = id;
        
        // Llenar formulario
        document.getElementById('full_name').value = item.full_name;
        document.getElementById('phone').value = item.phone;
        document.getElementById('email').value = item.email || '';
        document.getElementById('birth_date').value = item.birth_date || '';
        document.getElementById('medication_name').value = item.medication_name;
        document.getElementById('recurrence').value = item.recurrence || '30';
        document.getElementById('start_date').value = item.start_date;

        // Cambiar texto del botón
        document.querySelector('#registration-form .btn-submit').innerHTML = '<i class="fas fa-save"></i> Actualizar Registro';
        
        // Mover a la pestaña de registro
        document.querySelector('[data-tab="patients"]').click();
    }

    // --- Form Handling ---
    registrationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('full_name').value;
        const phone = document.getElementById('phone').value;
        const email = document.getElementById('email').value;
        const birthDate = document.getElementById('birth_date').value;
        const medName = document.getElementById('medication_name').value;
        const recurrenceDays = parseInt(document.getElementById('recurrence').value);
        const startDate = document.getElementById('start_date').value;

        // Forzamos mediodía (T12:00:00) para evitar que JS reste un día por la zona horaria
        const start = new Date(startDate + "T12:00:00");
        const endDate = new Date(start);
        endDate.setDate(start.getDate() + recurrenceDays);
        
        const contactDate = new Date(endDate);
        contactDate.setDate(endDate.getDate() - 3); // Margen de 3 días

        const treatmentData = {
            full_name: fullName,
            phone: phone,
            email: email,
            birth_date: birthDate,
            medication_name: medName,
            recurrence: recurrenceDays,
            start_date: startDate,
            estimated_end_date: endDate.toISOString().split('T')[0],
            next_contact_date: contactDate.toISOString().split('T')[0],
            created_by: sessionStorage.getItem('username'),
            active: true
        };

        try {
            if (editModeId) {
                await updateDoc(doc(db, "treatments", editModeId), treatmentData);
                showToast('¡Registro actualizado!', 'success');
            } else {
                treatmentData.created_at = serverTimestamp();
                await addDoc(collection(db, "treatments"), treatmentData);
                showToast('¡Registro guardado en la nube!', 'success');
            }
            
            // Limpiar y resetear formulario
            registrationForm.reset();
            editModeId = null;
            document.querySelector('#registration-form .btn-submit').innerHTML = '<i class="fas fa-save"></i> Guardar Registro';
            
            setTimeout(() => document.querySelector('[data-tab="agenda"]').click(), 1000);
        } catch (error) {
            console.error(error);
            showToast('Error al guardar. Revisa la consola.', 'error');
        }
    });

    // --- Helpers ---
    function showToast(message, type) {
        toast.innerText = message;
        toast.style.background = type === 'success' ? 'var(--success)' : 'var(--danger)';
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    function calculateDaysDiff(dateStr) {
        const end = new Date(dateStr + "T12:00:00");
        const today = getTodayDate();
        const diffTime = end - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr + "T12:00:00");
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    }

    // --- Lógica de Cumpleaños ---
    function checkBirthdays(patients) {
        const birthdaysList = document.getElementById('birthdays-list');
        const bdayBadge = document.getElementById('bday-badge');
        const today = getTodayDate();
        const upcomingBirthdays = [];

        patients.forEach(p => {
            if (!p.birth_date) return;

            const bDate = new Date(p.birth_date + "T12:00:00");
            const thisYearBday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate(), 12, 0, 0);
            
            if (thisYearBday < today && (today.getMonth() === 11 && bDate.getMonth() === 0)) {
                thisYearBday.setFullYear(today.getFullYear() + 1);
            }

            const diffTime = thisYearBday - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Mostramos los próximos 7 días en la pestaña dedicada
            if (diffDays >= 0 && diffDays <= 7) {
                upcomingBirthdays.push({ ...p, daysToBday: diffDays });
            }
        });

        // Ordenar por cercanía
        upcomingBirthdays.sort((a, b) => a.daysToBday - b.daysToBday);

        // Actualizar Badge (solo los de los próximos 3 días)
        const urgentCount = upcomingBirthdays.filter(p => p.daysToBday <= 3).length;
        if (urgentCount > 0) {
            bdayBadge.innerText = urgentCount;
            bdayBadge.style.display = 'inline-block';
        } else {
            bdayBadge.style.display = 'none';
        }

        if (upcomingBirthdays.length > 0) {
            birthdaysList.innerHTML = upcomingBirthdays.map(p => {
                const daysText = p.daysToBday === 0 ? '¡HOY!' : `en ${p.daysToBday} días`;
                const iconClass = p.daysToBday === 0 ? 'fa-birthday-cake' : 'fa-gift';
                const message = whatsappTemplates.birthday
                    .replace(/{nombre}/g, p.full_name);

                const whatsappUrl = `https://api.whatsapp.com/send?phone=${p.phone.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`;

                return `
                    <div class="agenda-card ${p.daysToBday === 0 ? 'is-today-bday' : ''}">
                        <div class="card-header">
                            <span class="patient-name"><i class="fas ${iconClass}"></i> ${p.full_name}</span>
                            <span class="status-badge ${p.daysToBday === 0 ? 'today' : 'soon'}">${daysText}</span>
                        </div>
                        <div class="card-body">
                            <p><i class="fas fa-calendar-day"></i> Fecha: ${formatDate(p.birth_date)}</p>
                            <p><i class="fas fa-phone"></i> ${p.phone}</p>
                        </div>
                        <div class="card-actions">
                            <a href="${whatsappUrl}" target="_blank" class="btn-action btn-whatsapp">
                                <i class="fab fa-whatsapp"></i> Felicitar
                            </a>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            birthdaysList.innerHTML = '<div class="loading-state"><i class="fas fa-gift" style="color: var(--primary); opacity: 0.5;"></i><p>No hay cumpleaños en los próximos 7 días.</p></div>';
        }
    }

    // --- Lógica de Historial y Archivo ---
    const historyModal = document.getElementById('history-modal');
    const closeHistory = document.getElementById('close-history');
    const timelineContainer = document.getElementById('timeline-container');
    const histPatientName = document.getElementById('hist-patient-name');
    const histMedName = document.getElementById('hist-med-name');

    if (closeHistory) {
        closeHistory.addEventListener('click', () => {
            historyModal.style.display = 'none';
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === historyModal) historyModal.style.display = 'none';
        });
    }

    function showPatientHistory(id) {
        const item = currentAgendaData.find(i => i.id === id);
        if (!item) return;

        histPatientName.innerText = item.full_name;
        histMedName.innerText = item.medication_name;
        
        const history = item.history || [];
        
        if (history.length === 0) {
            timelineContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No hay registros previos para este tratamiento.</p>';
        } else {
            // Mostrar últimos 10 eventos, del más reciente al más antiguo
            const sortedHistory = [...history].reverse().slice(0, 10);
            
            timelineContainer.innerHTML = sortedHistory.map(event => {
                const isFail = event.action === 'no_surtido' || event.action === 'venta_fallida';
                const isNote = event.action === 'nota';
                let iconText = '';
                let extraClass = '';
                
                if (isNote) {
                    iconText = '📝 Nota Adicional';
                    extraClass = 'note';
                } else if (isFail) {
                    iconText = '❌ Venta no Concretada';
                } else {
                    iconText = '✅ Surtido Completado';
                }

                return `
                    <div class="timeline-item ${isFail ? 'fail' : ''} ${extraClass}">
                        <span class="timeline-date">${event.date}</span>
                        <div class="timeline-content">
                            <strong>${iconText}</strong>
                            <p>${event.note || 'Sin observaciones'}</p>
                            <span class="user-tag"><i class="fas fa-user"></i> ${event.user || 'Desconocido'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        historyModal.style.display = 'flex';
    }

    // --- Modal de Notas CRM ---
    const noteModal = document.getElementById('note-modal');
    const closeNote = document.getElementById('close-note');
    const btnSaveNote = document.getElementById('btn-save-note');
    const noteText = document.getElementById('note-text');
    let currentNoteId = null;

    if (closeNote) {
        closeNote.addEventListener('click', () => { noteModal.style.display = 'none'; });
        window.addEventListener('click', (e) => {
            if (e.target === noteModal) noteModal.style.display = 'none';
        });
    }

    function showNoteModal(id) {
        currentNoteId = id;
        noteText.value = '';
        noteModal.style.display = 'flex';
    }

    if (btnSaveNote) {
        btnSaveNote.addEventListener('click', async () => {
            const text = noteText.value.trim();
            if (!text || !currentNoteId) return;

            const item = currentAgendaData.find(i => i.id === currentNoteId);
            if (!item) return;

            const newHistoryEvent = {
                action: 'nota',
                date: formatDate(getTodayISO()),
                note: text,
                user: sessionStorage.getItem('username')
            };

            const updatedHistory = item.history ? [...item.history, newHistoryEvent] : [newHistoryEvent];

            try {
                await updateDoc(doc(db, "treatments", currentNoteId), {
                    history: updatedHistory
                });
                showToast('Nota añadida correctamente', 'success');
                noteModal.style.display = 'none';
            } catch (error) {
                console.error(error);
                showToast('Error al añadir nota', 'error');
            }
        });
    }

    async function archiveTreatment(id) {
        const item = currentAgendaData.find(i => i.id === id);
        if (!item) return;

        if (confirm(`¿Estás seguro que deseas archivar el tratamiento de "${item.medication_name}" para ${item.full_name}? Ya no aparecerá en la agenda.`)) {
            try {
                await updateDoc(doc(db, "treatments", id), {
                    active: false,
                    archived_at: serverTimestamp(),
                    archived_by: sessionStorage.getItem('username')
                });
                showToast('Tratamiento archivado con éxito', 'success');
            } catch (error) {
                console.error(error);
                showToast('Error al archivar el tratamiento', 'error');
            }
        }
    }

    // --- Modo Desarrollador ---
    const btnSimulateDate = document.getElementById('btn-simulate-date');
    const btnResetDate = document.getElementById('btn-reset-date');
    const devDateInput = document.getElementById('dev-simulated-date');

    if (btnSimulateDate) {
        btnSimulateDate.addEventListener('click', () => {
            if (devDateInput.value) {
                simulatedDate = devDateInput.value;
                updateCurrentDateDisplay();
                showToast('Fecha simulada aplicada: ' + formatDate(simulatedDate), 'success');
                setTimeout(() => document.querySelector('[data-tab="agenda"]').click(), 1000);
            }
        });

        btnResetDate.addEventListener('click', () => {
            simulatedDate = null;
            devDateInput.value = '';
            updateCurrentDateDisplay();
            showToast('Fecha real restaurada', 'success');
            setTimeout(() => document.querySelector('[data-tab="agenda"]').click(), 1000);
        });
    }

    // --- Gestión de Usuarios ---
    const userManagementForm = document.getElementById('user-management-form');
    const usersList = document.getElementById('users-list');

    if (userManagementForm) {
        userManagementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('new-username').value.trim();
            const password = document.getElementById('new-password').value.trim();

            try {
                await addDoc(collection(db, "users"), {
                    username,
                    password,
                    role: 'vendedor',
                    created_at: serverTimestamp()
                });
                showToast('Usuario creado con éxito', 'success');
                userManagementForm.reset();
                loadUsers();
            } catch (error) {
                console.error(error);
                showToast('Error al crear usuario', 'error');
            }
        });
    }

    async function loadUsers() {
        if (!usersList) return;
        usersList.innerHTML = '<p>Cargando usuarios...</p>';
        
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            if (querySnapshot.empty) {
                usersList.innerHTML = '<p style="color: var(--text-muted);">No hay usuarios registrados aún.</p>';
                return;
            }

            usersList.innerHTML = querySnapshot.docs.map(doc => {
                const data = doc.data();
                if (data.username === 'admin') return ''; // No borrar al admin
                return `
                    <div class="user-item">
                        <div class="user-info">
                            <span>Usuario: <strong>${data.username}</strong></span>
                            <span>Clave: <strong>${data.password}</strong></span>
                        </div>
                        <button class="btn-delete-user" data-id="${doc.id}" title="Eliminar usuario">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
            }).join('');

            // Eventos para eliminar
            document.querySelectorAll('.btn-delete-user').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    if (confirm('¿Seguro que quieres eliminar este acceso?')) {
                        await deleteDoc(doc(db, "users", id));
                        showToast('Usuario eliminado', 'success');
                        loadUsers();
                    }
                });
            });

        } catch (error) {
            console.error(error);
            usersList.innerHTML = '<p class="error-msg">Error al cargar lista de usuarios.</p>';
        }
    }

    // --- Generación de Reportes ---
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            if (currentAgendaData.length === 0) {
                showToast('No hay datos para exportar', 'error');
                return;
            }

            const headers = ["Paciente", "Telefono", "Medicamento", "Estado", "Motivo No Surtido", "Fecha Ultima Accion", "Atendido Por"];
            const csvRows = [headers.join(",")];

            currentAgendaData.forEach(item => {
                let status = "Pendiente";
                if (item.last_action === 'venta_fallida') {
                    status = "No Surtido";
                } else if (item.last_renewed_at) {
                    status = "Surtido";
                }

                const row = [
                    `"${item.full_name}"`,
                    `"${item.phone}"`,
                    `"${item.medication_name}"`,
                    `"${status}"`,
                    `"${item.latest_fail_reason || ''}"`,
                    `"${item.start_date}"`,
                    `"${item.last_handled_by || item.created_by || 'Sistema'}"`
                ];
                csvRows.push(row.join(","));
            });

            const csvString = csvRows.join("\n");
            const blob = new Blob(["\ufeff" + csvString], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Reporte_FarmaAgenda_${getTodayISO()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Reporte generado con éxito', 'success');
        });
    }

    // --- Importación CSV ---
    const btnImportCsv = document.getElementById('btn-import-csv');
    const csvImportFile = document.getElementById('csv-import-file');

    if (btnImportCsv && csvImportFile) {
        btnImportCsv.addEventListener('click', () => {
            csvImportFile.click();
        });

        csvImportFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const text = event.target.result;
                const lines = text.split('\n').filter(line => line.trim() !== '');
                if (lines.length <= 1) {
                    showToast('El archivo está vacío o solo tiene cabeceras.', 'error');
                    return;
                }

                // Esperamos Formato: Nombre,Telefono,Medicamento,Recurrencia,FechaInicio(YYYY-MM-DD)
                let successCount = 0;
                let errorCount = 0;

                // Usamos writeBatch para subidas múltiples eficientes
                const batch = writeBatch(db);
                
                for (let i = 1; i < lines.length; i++) { // Skip header
                    const cols = lines[i].split(',');
                    if (cols.length >= 5) {
                        const fullName = cols[0].replace(/"/g, '').trim();
                        const phone = cols[1].replace(/"/g, '').trim();
                        const medName = cols[2].replace(/"/g, '').trim();
                        const recurrence = parseInt(cols[3].replace(/"/g, '').trim()) || 30;
                        const startDate = cols[4].replace(/"/g, '').trim();

                        if (fullName && phone && medName && startDate) {
                            const start = new Date(startDate + "T12:00:00");
                            const endDate = new Date(start);
                            endDate.setDate(start.getDate() + recurrence);
                            
                            const contactDate = new Date(endDate);
                            contactDate.setDate(endDate.getDate() - 3);

                            const newDocRef = doc(collection(db, "treatments"));
                            batch.set(newDocRef, {
                                full_name: fullName,
                                phone: phone,
                                email: "",
                                birth_date: "",
                                medication_name: medName,
                                recurrence: recurrence,
                                start_date: startDate,
                                estimated_end_date: endDate.toISOString().split('T')[0],
                                next_contact_date: contactDate.toISOString().split('T')[0],
                                created_by: sessionStorage.getItem('username'),
                                active: true,
                                created_at: serverTimestamp()
                            });
                            successCount++;
                        } else {
                            errorCount++;
                        }
                    }
                }

                if (successCount > 0) {
                    try {
                        await batch.commit();
                        showToast(`Importados ${successCount} registros exitosamente.`, 'success');
                    } catch (err) {
                        console.error("Error importando:", err);
                        showToast('Error al importar lotes. Revisa la consola.', 'error');
                    }
                } else {
                    showToast('No se encontraron registros válidos.', 'error');
                }
                
                // Limpiar el input file
                csvImportFile.value = '';
            };
            reader.readAsText(file);
        });
    }

    // --- Gestión de Plantillas ---
    async function loadTemplates() {
        try {
            const docSnap = await getDocs(collection(db, "settings"));
            const templateDoc = docSnap.docs.find(d => d.id === 'whatsapp_templates');
            
            if (templateDoc) {
                whatsappTemplates = templateDoc.data();
            }
            
            document.getElementById('template-reminder').value = whatsappTemplates.reminder;
            document.getElementById('template-birthday').value = whatsappTemplates.birthday;
        } catch (error) {
            console.error("Error cargando plantillas:", error);
        }
    }

    const btnSaveTemplates = document.getElementById('btn-save-templates');
    if (btnSaveTemplates) {
        btnSaveTemplates.addEventListener('click', async () => {
            const reminder = document.getElementById('template-reminder').value;
            const birthday = document.getElementById('template-birthday').value;

            try {
                // Usamos setDoc para asegurar que el ID sea fijo
                const { setDoc } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js");
                await setDoc(doc(db, "settings", "whatsapp_templates"), {
                    reminder,
                    birthday
                });
                whatsappTemplates = { reminder, birthday };
                showToast('Plantillas actualizadas', 'success');
            } catch (error) {
                console.error(error);
                showToast('Error al guardar plantillas', 'error');
            }
        });
    }

    // Se eliminó la carga inicial para que solo cargue tras el login.
});
