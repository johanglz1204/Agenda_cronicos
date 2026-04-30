import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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
            document.getElementById('btn-export-csv').style.display = 'block';
            document.getElementById('stat-monthly-sales').style.display = 'flex';
            loadTemplates(); // Solo admin puede cargar/ver plantillas
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

    // --- Navigation ---
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
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        applyFilters(term);
    });

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

    function applyFilters(term = '') {
        const filtered = currentAgendaData.filter(item => 
            item.full_name.toLowerCase().includes(term) || 
            item.medication_name.toLowerCase().includes(term) ||
            item.phone.includes(term)
        );
        
        const todayISO = getTodayISO();
        renderAgenda(filtered, todayISO);
        pendingCount.innerText = filtered.filter(i => calculateDaysDiff(i.estimated_end_date) <= 3).length;
    }

    // --- Database Logic (Firebase) ---

    async function loadAgenda() {
        if (!agendaCards) return;
        agendaCards.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Conectando con la base de datos...</p></div>';
        
        try {
            const todayISO = getTodayISO();
            const role = sessionStorage.getItem('role');
            const username = sessionStorage.getItem('username');
            
            console.log("Cargando agenda para:", username, "con rol:", role);

            let q;
            if (role === 'admin') {
                q = collection(db, "treatments");
            } else if (username) {
                q = query(collection(db, "treatments"), where("created_by", "==", username));
            } else {
                // Si por alguna razón no hay usuario, no mostrar nada
                renderAgenda([], todayISO);
                return;
            }

            const querySnapshot = await getDocs(q);
            
            currentAgendaData = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                data.id = doc.id; 
                // Consideramos activos si no tienen el campo o si es true
                if (data.active !== false) {
                    currentAgendaData.push(data);
                }
            });

            // Ordenamos por fecha de contacto en JavaScript (con protección por si algún campo está vacío)
            currentAgendaData.sort((a, b) => {
                const dateA = a.next_contact_date || "";
                const dateB = b.next_contact_date || "";
                return dateA.localeCompare(dateB);
            });

            renderAgenda(currentAgendaData, todayISO);
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

            // Calcular Ventas del Mes (Admin)
            if (sessionStorage.getItem('role') === 'admin') {
                const now = getTodayDate();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                
                const monthlySales = currentAgendaData.filter(item => {
                    if (!item.last_renewed_at) return false;
                    const renewedDate = item.last_renewed_at.toDate ? item.last_renewed_at.toDate() : new Date(item.last_renewed_at);
                    return renewedDate >= startOfMonth;
                }).length;
                
                document.getElementById('monthly-sales-count').innerText = monthlySales;
            }

        } catch (error) {
            console.error(error);
            showToast('Error al cargar datos. ¿Configuraste Firebase?', 'error');
            if (agendaCards) {
                agendaCards.innerHTML = '<p class="error-msg">Error de conexión. Asegúrate de configurar tus llaves de Firebase en js/main.js.</p>';
            }
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
                            <button class="btn-t-action btn-edit" data-id="${t.id}" title="Editar">
                                <i class="fas fa-edit"></i>
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
