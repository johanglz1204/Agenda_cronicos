import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    
    // Elements
    const navLinks = document.querySelectorAll('.nav-links li');
    const tabContents = document.querySelectorAll('.tab-content');
    const agendaList = document.getElementById('agenda-list');
    const registrationForm = document.getElementById('registration-form');
    const pendingCount = document.getElementById('pending-count');
    const totalPatientsEl = document.getElementById('total-patients');
    const currentDateEl = document.getElementById('current-date');
    const toast = document.getElementById('toast');
    const searchContainer = document.querySelector('.search-container');
    const searchInput = document.querySelector('.search-container input');

    let currentAgendaData = [];
    let editModeId = null;
    let simulatedDate = null; // Para el modo desarrollador

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

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('login-user').value.trim();
        const pass = document.getElementById('login-pass').value.trim();

        if (user === 'admin' && pass === '7294967290') {
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('role', 'admin');
            showApp();
        } else {
            loginError.style.display = 'block';
        }
    });

    function showApp() {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        if (sessionStorage.getItem('role') === 'admin') {
            navDevtools.style.display = 'flex';
        }
        loadAgenda(); // Cargar agenda al entrar
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
            } else {
                searchContainer.style.visibility = 'hidden';
            }
        });
    });

    // --- Buscador ---
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = currentAgendaData.filter(item => 
            item.full_name.toLowerCase().includes(term) || 
            item.medication_name.toLowerCase().includes(term) ||
            item.phone.includes(term)
        );
        
        const todayISO = getTodayISO();
        renderAgenda(filtered, todayISO);
    });

    // --- Database Logic (Firebase) ---

    async function loadAgenda() {
        agendaList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Conectando con la base de datos...</p></div>';
        
        try {
            const todayISO = getTodayISO();

            // Traemos todos los tratamientos (más simple y evita errores de índices)
            const querySnapshot = await getDocs(collection(db, "treatments"));
            
            currentAgendaData = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                data.id = doc.id; // Guardamos el ID para poder editar
                if (data.active === true) {
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
            pendingCount.innerText = currentAgendaData.filter(i => i.next_contact_date <= todayISO).length;
            totalPatientsEl.innerText = currentAgendaData.length;

        } catch (error) {
            console.error(error);
            showToast('Error al cargar datos. ¿Configuraste Firebase?', 'error');
            agendaList.innerHTML = '<p class="error-msg">Error de conexión. Asegúrate de configurar tus llaves de Firebase en js/main.js.</p>';
        }
    }

    function renderAgenda(items, todayISO) {
        if (items.length === 0) {
            agendaList.innerHTML = '<div class="loading-state"><i class="fas fa-check-circle" style="color: var(--success)"></i><p>Todo al día. No hay resurtidos pendientes.</p></div>';
            return;
        }

        agendaList.innerHTML = items.map(item => {
            const daysLeft = calculateDaysDiff(item.estimated_end_date);
            const statusClass = item.next_contact_date <= todayISO ? 'today' : 'soon';
            const statusText = daysLeft <= 0 ? 'AGOTADO HOY' : `Faltan ${daysLeft} días`;

            return `
                <div class="agenda-card">
                    <div class="card-header">
                        <span class="patient-name">${item.full_name}</span>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="card-body">
                        <p><i class="fas fa-pills"></i> ${item.medication_name}</p>
                        <p><i class="fas fa-calendar-alt"></i> Fin: ${formatDate(item.estimated_end_date)}</p>
                        <p><i class="fas fa-phone"></i> ${item.phone}</p>
                    </div>
                    <div class="card-actions">
                        <a href="https://wa.me/${item.phone.replace(/\D/g,'')}?text=Hola%20${encodeURIComponent(item.full_name)},%20le%20escribimos%20de%20la%20Farmacia%20para%20recordarle%20el%20resurtido%20de%20su%20${encodeURIComponent(item.medication_name)}" 
                           target="_blank" class="btn-action btn-whatsapp">
                            <i class="fab fa-whatsapp"></i> WhatsApp
                        </a>
                        <button class="btn-action btn-edit" data-id="${item.id}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Añadir eventos a los botones de editar
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                openEditMode(id);
            });
        });
    }

    function openEditMode(id) {
        const item = currentAgendaData.find(i => i.id === id);
        if (!item) return;
        
        editModeId = id;
        
        // Llenar formulario
        document.getElementById('full_name').value = item.full_name;
        document.getElementById('phone').value = item.phone;
        document.getElementById('email').value = item.email || '';
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
            medication_name: medName,
            recurrence: recurrenceDays,
            start_date: startDate,
            estimated_end_date: endDate.toISOString().split('T')[0],
            next_contact_date: contactDate.toISOString().split('T')[0],
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

    // Se eliminó la carga inicial para que solo cargue tras el login.
});
