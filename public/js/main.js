document.addEventListener('DOMContentLoaded', () => {
    const apiBase = '/api';
    
    // Elements
    const navLinks = document.querySelectorAll('.nav-links li');
    const tabContents = document.querySelectorAll('.tab-content');
    const agendaList = document.getElementById('agenda-list');
    const registrationForm = document.getElementById('registration-form');
    const medicationSelect = document.getElementById('medication_id');
    const pendingCount = document.getElementById('pending-count');
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
            
            // Update Active Link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Show Tab
            tabContents.forEach(tab => {
                tab.classList.remove('active');
                if (tab.id === `tab-${tabId}`) {
                    tab.classList.add('active');
                }
            });

            if (tabId === 'agenda') loadAgenda();
        });
    });

    // --- API Calls ---

    async function loadAgenda() {
        agendaList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando pacientes...</p></div>';
        
        try {
            const response = await fetch(`${apiBase}/agenda/refills`);
            const data = await response.json();
            
            renderAgenda(data);
            pendingCount.innerText = data.length;
        } catch (error) {
            showToast('Error al cargar la agenda', 'error');
            agendaList.innerHTML = '<p class="error-msg">No se pudo cargar la información.</p>';
        }
    }

    async function loadMedications() {
        try {
            const response = await fetch(`${apiBase}/medications`);
            const meds = await response.json();

            medicationSelect.innerHTML = '<option value="">Selecciona un medicamento</option>' + 
                meds.map(m => `<option value="${m.id}">${m.name} (${m.presentation})</option>`).join('');
        } catch (error) {
            console.error('Error al cargar medicamentos');
        }
    }

    function renderAgenda(items) {
        if (items.length === 0) {
            agendaList.innerHTML = '<div class="loading-state"><i class="fas fa-check-circle" style="color: var(--success)"></i><p>Todo al día. No hay resurtidos pendientes.</p></div>';
            return;
        }

        agendaList.innerHTML = items.map(item => {
            const daysLeft = calculateDaysDiff(item.estimated_end_date);
            const statusClass = daysLeft <= 0 ? 'today' : 'soon';
            const statusText = daysLeft <= 0 ? 'AGOTADO HOY' : `Faltan ${daysLeft} días`;

            return `
                <div class="agenda-card">
                    <div class="card-header">
                        <span class="patient-name">${item.full_name}</span>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="card-body">
                        <p><i class="fas fa-pills"></i> ${item.medication}</p>
                        <p><i class="fas fa-calendar-alt"></i> Fin: ${formatDate(item.estimated_end_date)}</p>
                        <p><i class="fas fa-phone"></i> ${item.phone}</p>
                    </div>
                    <div class="card-actions">
                        <a href="https://wa.me/${item.phone.replace(/\D/g,'')}?text=Hola%20${encodeURIComponent(item.full_name)},%20le%20escribimos%20de%20la%20Farmacia%20para%20recordarle%20el%20resurtido%20de%20su%20${encodeURIComponent(item.medication)}" 
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
        
        const formData = {
            full_name: document.getElementById('full_name').value,
            phone: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            medication_id: parseInt(document.getElementById('medication_id').value),
            quantity_supplied: parseFloat(document.getElementById('quantity_supplied').value),
            daily_dosage: parseFloat(document.getElementById('daily_dosage').value),
            start_date: document.getElementById('start_date').value
        };

        try {
            const response = await fetch(`${apiBase}/patients`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                showToast('¡Registro guardado con éxito!', 'success');
                registrationForm.reset();
                // Regresar a la agenda
                setTimeout(() => document.querySelector('[data-tab="agenda"]').click(), 1500);
            } else {
                throw new Error();
            }
        } catch (error) {
            showToast('Error al guardar el registro', 'error');
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
        return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    }

    // Initial Load
    loadAgenda();
    loadMedications();
});
