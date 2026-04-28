// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// --- CONFIGURACIÓN DE FIREBASE ---
// TODO: Reemplaza esto con tus propias llaves de Firebase Console
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROJECT_ID.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT_ID.appspot.com",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
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

    // Set current date
    const now = new Date();
    currentDateEl.innerText = now.toLocaleDateString('es-ES', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

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
            if (tabId === 'agenda') loadAgenda();
        });
    });

    // --- Database Logic (Firebase) ---

    async function loadAgenda() {
        agendaList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Conectando con la base de datos...</p></div>';
        
        try {
            const today = new Date();
            today.setHours(0,0,0,0);
            const todayISO = today.toISOString().split('T')[0];

            // Traer todos los pacientes con tratamientos activos
            const q = query(collection(db, "treatments"), where("active", "==", true), orderBy("next_contact_date", "asc"));
            const querySnapshot = await getDocs(q);
            
            let agendaData = [];
            querySnapshot.forEach((doc) => {
                agendaData.push(doc.data());
            });

            renderAgenda(agendaData, todayISO);
            pendingCount.innerText = agendaData.filter(i => i.next_contact_date <= todayISO).length;
            totalPatientsEl.innerText = agendaData.length;

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
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- Form Handling ---
    registrationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('full_name').value;
        const phone = document.getElementById('phone').value;
        const email = document.getElementById('email').value;
        const medName = document.getElementById('medication_name').value;
        const qty = parseFloat(document.getElementById('quantity_supplied').value);
        const dosage = parseFloat(document.getElementById('daily_dosage').value);
        const startDate = document.getElementById('start_date').value;

        // Lógica de cálculo (antes en el backend)
        const start = new Date(startDate);
        const durationDays = Math.floor(qty / dosage);
        
        const endDate = new Date(start);
        endDate.setDate(start.getDate() + durationDays);
        
        const contactDate = new Date(endDate);
        contactDate.setDate(endDate.getDate() - 3); // Margen de 3 días

        const treatmentData = {
            full_name: fullName,
            phone: phone,
            email: email,
            medication_name: medName,
            quantity_supplied: qty,
            daily_dosage: dosage,
            start_date: startDate,
            estimated_end_date: endDate.toISOString().split('T')[0],
            next_contact_date: contactDate.toISOString().split('T')[0],
            active: true,
            created_at: serverTimestamp()
        };

        try {
            await addDoc(collection(db, "treatments"), treatmentData);
            showToast('¡Registro guardado en la nube!', 'success');
            registrationForm.reset();
            setTimeout(() => document.querySelector('[data-tab="agenda"]').click(), 1500);
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
        const end = new Date(dateStr);
        const today = new Date();
        today.setHours(0,0,0,0);
        const diffTime = end - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    }

    // Initial Load
    loadAgenda();
});
