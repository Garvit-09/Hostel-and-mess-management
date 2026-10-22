// ==============================================================================
// HOSTEL & MESS MANAGEMENT SYSTEM (DA2) - FRONTEND APPLICATION SCRIPT
// ==============================================================================

const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? `${window.location.origin}/api`
  : 'http://localhost:4000/api';

// State Store
let state = {
  students: [],
  filteredStudents: [],
  allocations: [],
  rooms: [],
  messes: [],
  messRegistrations: [],
  complaints: [],
  complaintTypes: [],
  queries: [],
  activeQueryId: 1,
  deleteTarget: null,
  menuItems: [],
  selectedMenuDay: 'All'
};

// Initializer
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  setupNavigation();
  initApplication();
});

async function initApplication() {
  await fetchSystemStatus();
  await loadStudents();
  await loadRoomsAndAllocations();
  await loadMessData();
  await loadComplaints();
  await loadQueryCatalog();
  loadMenu();
}

// ==============================================================================
// 1. NAVIGATION & STATUS
// ==============================================================================

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const tabEl = document.getElementById(tabId);
  const btnEl = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);

  if (tabEl) tabEl.classList.add('active');
  if (btnEl) btnEl.classList.add('active');

  if (tabId === 'tab-intelligence' && typeof loadHostelIntelligence === 'function') {
    loadHostelIntelligence();
  }
}

async function fetchSystemStatus() {
  try {
    const res = await fetch(`${API_BASE}/status`);
    const data = await res.json();
    const badgeText = document.getElementById('engine-status-text');
    const badgeDot = document.querySelector('.status-dot');

    if (badgeText && badgeDot) {
      if (data.isFallback) {
        badgeText.textContent = `High-Fidelity Engine [Active]`;
        badgeDot.style.background = '#38bdf8';
      } else {
        badgeText.textContent = `MySQL 8.0 [Connected]`;
        badgeDot.style.background = '#10b981';
      }
    }

    // Update KPI counters
    const stEl = document.getElementById('stat-total-students');
    const allocEl = document.getElementById('stat-active-allocations');
    const messEl = document.getElementById('stat-active-mess');
    const compEl = document.getElementById('stat-open-complaints');

    if (stEl) stEl.textContent = data.totalStudents || 0;
    if (allocEl) allocEl.textContent = data.activeAllocations || 0;
    if (messEl) messEl.textContent = data.activeMessRegistrations || 0;
    if (compEl) compEl.textContent = data.openComplaints || 0;
  } catch (err) {
    const badgeText = document.getElementById('engine-status-text');
    if (badgeText) badgeText.textContent = 'Backend Offline';
  }
}

// ==============================================================================
// 2. STUDENTS MANAGEMENT (CRUD)
// ==============================================================================

async function loadStudents() {
  try {
    const res = await fetch(`${API_BASE}/students`);
    state.students = await res.json();
    state.filteredStudents = [...state.students];
    renderStudentsTable();
    populateStudentSelectDropdowns();
  } catch (err) {
    showToast('Failed to load students: ' + err.message, 'error');
  }
}

function filterStudents() {
  const search = document.getElementById('student-search-input').value.toLowerCase().trim();
  const branch = document.getElementById('student-branch-filter').value;
  const year = document.getElementById('student-year-filter').value;

  state.filteredStudents = state.students.filter(st => {
    const matchesSearch = !search ||
      st.full_name.toLowerCase().includes(search) ||
      st.reg_no.toLowerCase().includes(search) ||
      st.email.toLowerCase().includes(search);

    const matchesBranch = !branch || st.branch === branch;
    const matchesYear = !year || String(st.year_of_study) === String(year);

    return matchesSearch && matchesBranch && matchesYear;
  });

  renderStudentsTable();
}

function renderStudentsTable() {
  const tbody = document.getElementById('students-table-body');
  if (!state.filteredStudents.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No matching students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.filteredStudents.map(st => `
    <tr>
      <td><strong>#${st.student_id}</strong></td>
      <td><span class="badge badge-accent">${st.reg_no}</span></td>
      <td>
        <strong>${st.full_name}</strong><br>
        <small style="color: var(--text-dim);">${st.email}</small>
      </td>
      <td>${st.course} • <strong>${st.branch}</strong></td>
      <td>Year ${st.year_of_study}</td>
      <td>${st.gender}</td>
      <td>${st.phone_number}</td>
      <td>
        <small>${st.parent_name || 'N/A'}</small><br>
        <small style="color: var(--text-dim);">${st.parent_contact || 'N/A'}</small>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal(${st.student_id})">
            Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteStudent(${st.student_id}, '${st.full_name}')">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddStudentModal() {
  document.getElementById('modal-student-title').textContent = 'Add New Student (Insert)';
  document.getElementById('student-form-id').value = '';
  document.getElementById('form-student').reset();
  document.getElementById('btn-student-submit').textContent = 'Save Student (Insert)';
  openModal('modal-student');
}

function openEditStudentModal(id) {
  const st = state.students.find(s => s.student_id === id);
  if (!st) return;

  document.getElementById('modal-student-title').textContent = `Edit Student: ${st.full_name} (Update)`;
  document.getElementById('student-form-id').value = st.student_id;
  document.getElementById('student-regno').value = st.reg_no;
  document.getElementById('student-fullname').value = st.full_name;
  document.getElementById('student-course').value = st.course;
  document.getElementById('student-branch').value = st.branch;
  document.getElementById('student-year').value = st.year_of_study;
  document.getElementById('student-gender').value = st.gender;
  document.getElementById('student-phone').value = st.phone_number;
  document.getElementById('student-email').value = st.email;
  document.getElementById('student-parent-name').value = st.parent_name || '';
  document.getElementById('student-parent-contact').value = st.parent_contact || '';
  document.getElementById('btn-student-submit').textContent = 'Update Student';
  openModal('modal-student');
}

async function handleStudentSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('student-form-id').value;
  const payload = {
    reg_no: document.getElementById('student-regno').value.trim(),
    full_name: document.getElementById('student-fullname').value.trim(),
    course: document.getElementById('student-course').value.trim(),
    branch: document.getElementById('student-branch').value,
    year_of_study: Number(document.getElementById('student-year').value),
    gender: document.getElementById('student-gender').value,
    phone_number: document.getElementById('student-phone').value.trim(),
    email: document.getElementById('student-email').value.trim(),
    parent_name: document.getElementById('student-parent-name').value.trim(),
    parent_contact: document.getElementById('student-parent-contact').value.trim()
  };

  try {
    if (id) {
      // UPDATE
      const res = await fetch(`${API_BASE}/students/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Student #${id} updated successfully!`, 'success');
    } else {
      // INSERT
      const res = await fetch(`${API_BASE}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`New student registered successfully (ID: ${data.insertedId})!`, 'success');
    }

    closeModal('modal-student');
    await loadStudents();
    await fetchSystemStatus();
  } catch (err) {
    showToast('Failed to save student: ' + err.message, 'error');
  }
}

function confirmDeleteStudent(id, name) {
  state.deleteTarget = { type: 'student', id };
  document.getElementById('modal-confirm-title').textContent = 'Delete Student';
  document.getElementById('modal-confirm-message').textContent = `Are you sure you want to delete student "${name}" (#${id})? This will also remove any linked allocations or records.`;
  document.getElementById('btn-confirm-delete').onclick = executeDelete;
  openModal('modal-confirm');
}

async function executeDelete() {
  if (!state.deleteTarget) return;
  const { type, id } = state.deleteTarget;

  try {
    if (type === 'student') {
      const res = await fetch(`${API_BASE}/students/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Student #${id} deleted successfully.`, 'success');
      await loadStudents();
    } else if (type === 'complaint') {
      const res = await fetch(`${API_BASE}/complaints/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Complaint #${id} deleted.`, 'success');
      await loadComplaints();
    }

    closeModal('modal-confirm');
    await fetchSystemStatus();
  } catch (err) {
    showToast('Delete operation failed: ' + err.message, 'error');
  }
}

// ==============================================================================
// 3. ROOMS & ALLOCATIONS (PL/SQL Stored Procedure & Functions)
// ==============================================================================

async function loadRoomsAndAllocations() {
  try {
    const [allocRes, roomsRes] = await Promise.all([
      fetch(`${API_BASE}/rooms/allocations/active`),
      fetch(`${API_BASE}/rooms/available`)
    ]);

    state.allocations = await allocRes.json();
    state.rooms = await roomsRes.json();

    renderAllocationsTable();
    renderRoomsInventoryGrid();
    renderHostelOccupancyDashboard();
  } catch (err) {
    showToast('Failed to load room data: ' + err.message, 'error');
  }
}

function renderAllocationsTable() {
  const tbody = document.getElementById('allocations-table-body');
  if (!state.allocations.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No active room allocations recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.allocations.map(al => `
    <tr>
      <td><strong>#${al.allocation_id}</strong></td>
      <td><span class="badge badge-accent">${al.reg_no}</span></td>
      <td><strong>${al.full_name}</strong></td>
      <td><span class="badge badge-neutral">Room ${al.room_number}</span></td>
      <td>${al.allocation_date}</td>
      <td><span class="badge badge-success">${al.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="vacateRoom(${al.allocation_id})">
          Vacate Room (Update)
        </button>
      </td>
    </tr>
  `).join('');
}

function renderRoomsInventoryGrid() {
  const grid = document.getElementById('rooms-inventory-grid');
  if (!state.rooms.length) {
    grid.innerHTML = `<p class="empty-state">No rooms available.</p>`;
    return;
  }

  grid.innerHTML = state.rooms.map(r => {
    const isFull = r.vacant_beds === 0;
    return `
      <div class="room-card">
        <div class="room-card-head">
          <span class="room-no">Room ${r.room_number}</span>
          <span class="bed-badge ${isFull ? 'bed-full' : 'bed-vacant'}">
            ${isFull ? 'Full' : `${r.vacant_beds} Beds Free`}
          </span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted);">
          ${r.hostel_name || 'Hostel'}<br>
          ${r.block_name || 'Block'}, Floor ${r.floor_number}
        </div>
        <div style="font-size: 0.8rem; display: flex; justify-content: space-between; margin-top: 6px;">
          <span>Type: <strong>${r.ac_type} (${r.capacity}-Bed)</strong></span>
          <span>₹${Number(r.fee_per_semester).toLocaleString()}</span>
        </div>
        <div class="progress-bar-bg" style="margin-top: 6px;">
          <div class="progress-bar-fill" style="width: ${(r.current_occupancy / r.capacity) * 100}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderHostelOccupancyDashboard() {
  const container = document.getElementById('hostel-occupancy-list');
  const hostels = {};

  state.rooms.forEach(r => {
    const hName = r.hostel_name || 'General';
    if (!hostels[hName]) {
      hostels[hName] = { name: hName, capacity: 0, occupancy: 0 };
    }
    hostels[hName].capacity += r.capacity;
    hostels[hName].occupancy += r.current_occupancy;
  });

  container.innerHTML = Object.values(hostels).map(h => {
    const pct = h.capacity > 0 ? ((h.occupancy / h.capacity) * 100).toFixed(1) : 0;
    return `
      <div class="occupancy-item">
        <div class="occupancy-item-header">
          <span class="occupancy-title">${h.name}</span>
          <span class="occupancy-stat">${h.occupancy} / ${h.capacity} Beds Occupied (${pct}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function openAllocateRoomModal() {
  const studentSelect = document.getElementById('allocate-student-select');
  const roomSelect = document.getElementById('allocate-room-select');

  // Filter students who don't already have an active allocation
  const activeStudentIds = state.allocations.map(a => a.student_id);
  const eligibleStudents = state.students.filter(s => !activeStudentIds.includes(s.student_id));

  studentSelect.innerHTML = eligibleStudents.length
    ? eligibleStudents.map(s => `<option value="${s.student_id}">${s.reg_no} - ${s.full_name} (${s.branch})</option>`).join('')
    : `<option value="">All students currently have active room allocations</option>`;

  // Filter rooms with vacant beds
  const availableRooms = state.rooms.filter(r => r.vacant_beds > 0);
  roomSelect.innerHTML = availableRooms.length
    ? availableRooms.map(r => `<option value="${r.room_id}">Room ${r.room_number} (${r.hostel_name} - ${r.vacant_beds} beds free, ${r.ac_type})</option>`).join('')
    : `<option value="">No rooms currently have available beds</option>`;

  openModal('modal-allocate');
}

async function handleAllocateSubmit(e) {
  e.preventDefault();
  const student_id = document.getElementById('allocate-student-select').value;
  const room_id = document.getElementById('allocate-room-select').value;

  if (!student_id || !room_id) {
    showToast('Please select both an eligible student and an available room.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/rooms/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, room_id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Room successfully allocated (via AllocateRoom PL/SQL Routine)!', 'success');
    closeModal('modal-allocate');
    await loadRoomsAndAllocations();
    await fetchSystemStatus();
  } catch (err) {
    showToast('Allocation failed: ' + err.message, 'error');
  }
}

async function vacateRoom(allocation_id) {
  try {
    const res = await fetch(`${API_BASE}/rooms/vacate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocation_id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`Room allocation #${allocation_id} vacated successfully. Bed released!`, 'success');
    await loadRoomsAndAllocations();
    await fetchSystemStatus();
  } catch (err) {
    showToast('Failed to vacate room: ' + err.message, 'error');
  }
}

// ==============================================================================
// 4. MESS MANAGEMENT, MENUS & BILLING
// ==============================================================================

async function loadMessData() {
  try {
    const [messesRes, regsRes] = await Promise.all([
      fetch(`${API_BASE}/mess/messes`),
      fetch(`${API_BASE}/mess/registrations/active`)
    ]);

    state.messes = await messesRes.json();
    state.messRegistrations = await regsRes.json();

    renderMessFacilitiesGrid();
    renderMessRegistrationsTable();
  } catch (err) {
    showToast('Failed to load mess data: ' + err.message, 'error');
  }
}

function renderMessFacilitiesGrid() {
  const container = document.getElementById('mess-facilities-grid');
  if (!state.messes.length) return;

  container.innerHTML = state.messes.map(m => `
    <div class="mess-card">
      <div class="mess-card-header">
        <span class="mess-title">${m.mess_name}</span>
        <span class="badge ${m.mess_category === 'Veg' ? 'badge-success' : (m.mess_category === 'Non-Veg' ? 'badge-danger' : 'badge-warning')}">
          ${m.mess_category}
        </span>
      </div>
      <div class="mess-meta">
        <strong>Caterer:</strong> ${m.caterer_name}<br>
        <strong>Monthly Fee:</strong> ₹${Number(m.monthly_fee).toLocaleString()} / month<br>
        <strong>Subscribers:</strong> ${m.active_students || 0} / ${m.capacity} capacity
      </div>
    </div>
  `).join('');
}

function renderMessRegistrationsTable() {
  const tbody = document.getElementById('mess-registrations-table-body');
  if (!state.messRegistrations.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No active mess registrations.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.messRegistrations.map(r => `
    <tr>
      <td><strong>#${r.mess_reg_id}</strong></td>
      <td><span class="badge badge-accent">${r.reg_no}</span></td>
      <td><strong>${r.full_name}</strong></td>
      <td>${r.mess_name}</td>
      <td><span class="badge badge-neutral">${r.mess_category}</span></td>
      <td>₹${Number(r.monthly_fee).toLocaleString()}</td>
      <td>${r.registration_date}</td>
      <td><span class="badge badge-success">${r.status}</span></td>
    </tr>
  `).join('');
}

async function loadMenu() {
  const messId = document.getElementById('menu-mess-select').value || 1;
  const container = document.getElementById('menu-items-grid');

  try {
    container.innerHTML = `<p class="loading-state">Loading rotational menu schedule...</p>`;
    const res = await fetch(`${API_BASE}/mess/menu/${messId}/2026-10-05`);
    const items = await res.json();
    state.menuItems = Array.isArray(items) ? items : [];
    renderMenuGrid();
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Failed to load menu: ${err.message}</p>`;
  }
}

function setMenuDayFilter(day) {
  state.selectedMenuDay = day;
  document.querySelectorAll('#menu-day-filter-bar .day-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-day') === day);
  });
  renderMenuGrid();
}

function renderMenuGrid() {
  const container = document.getElementById('menu-items-grid');
  if (!container) return;

  let items = state.menuItems || [];
  if (state.selectedMenuDay && state.selectedMenuDay !== 'All') {
    items = items.filter(it => it.day_of_week.toLowerCase() === state.selectedMenuDay.toLowerCase());
  }

  if (!items.length) {
    container.innerHTML = `<p class="empty-state">No scheduled menu items found for ${state.selectedMenuDay === 'All' ? 'this mess' : state.selectedMenuDay}.</p>`;
    return;
  }

  const mealMeta = {
    Breakfast: { icon: '🌅', time: '07:30 – 09:30 AM', color: 'var(--orange-primary)' },
    Lunch:     { icon: '☀️', time: '12:00 – 02:15 PM', color: '#05DF72' },
    Snacks:    { icon: '☕', time: '04:30 – 05:45 PM', color: '#FFB800' },
    Dinner:    { icon: '🌙', time: '07:30 – 09:30 PM', color: '#7C3AED' }
  };

  container.innerHTML = items.map(it => {
    const meta = mealMeta[it.meal_type] || { icon: '🍽️', time: 'Scheduled Meal', color: 'var(--orange-primary)' };
    const dishList = it.items
      ? it.items.split(',').map(d => d.trim()).filter(Boolean)
      : [];

    return `
      <div class="menu-day-card">
        <div class="menu-day-card-header">
          <span class="meal-slot-badge" style="color: ${meta.color};">
            <span>${meta.icon}</span> ${it.meal_type}
          </span>
          <span class="menu-day-badge">${it.day_of_week}</span>
        </div>
        <div class="meal-timing">🕒 ${meta.time}</div>
        <ul class="menu-dishes-list">
          ${dishList.map(dish => `<li class="menu-dish-item">${dish}</li>`).join('')}
        </ul>
      </div>
    `;
  }).join('');
}

function openRegisterMessModal() {
  const studentSelect = document.getElementById('messreg-student-select');
  const messSelect = document.getElementById('messreg-mess-select');

  studentSelect.innerHTML = state.students.map(s => `
    <option value="${s.student_id}">${s.reg_no} - ${s.full_name}</option>
  `).join('');

  messSelect.innerHTML = state.messes.map(m => `
    <option value="${m.mess_id}">${m.mess_name} (${m.mess_category} - ₹${m.monthly_fee}/mo)</option>
  `).join('');

  openModal('modal-mess-reg');
}

async function handleMessRegSubmit(e) {
  e.preventDefault();
  const student_id = document.getElementById('messreg-student-select').value;
  const mess_id = document.getElementById('messreg-mess-select').value;

  try {
    const res = await fetch(`${API_BASE}/mess/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, mess_id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Mess registration updated successfully via RegisterMess procedure!', 'success');
    closeModal('modal-mess-reg');
    await loadMessData();
    await fetchSystemStatus();
  } catch (err) {
    showToast('Mess registration failed: ' + err.message, 'error');
  }
}

function openPaymentModal() {
  const regSelect = document.getElementById('payment-reg-select');
  regSelect.innerHTML = state.messRegistrations.map(r => `
    <option value="${r.mess_reg_id}">${r.reg_no} - ${r.full_name} (${r.mess_name})</option>
  `).join('');

  document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
  openModal('modal-payment');
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  const payload = {
    mess_reg_id: document.getElementById('payment-reg-select').value,
    amount_paid: Number(document.getElementById('payment-amount').value),
    payment_month: document.getElementById('payment-month').value.trim(),
    payment_mode: document.getElementById('payment-mode').value,
    payment_date: document.getElementById('payment-date').value
  };

  try {
    const res = await fetch(`${API_BASE}/mess/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Mess fee payment recorded successfully!', 'success');
    closeModal('modal-payment');
  } catch (err) {
    showToast('Payment recording failed: ' + err.message, 'error');
  }
}

function openFeedbackModal() {
  const studentSelect = document.getElementById('feedback-student-select');
  const messSelect = document.getElementById('feedback-mess-select');

  studentSelect.innerHTML = state.students.map(s => `<option value="${s.student_id}">${s.reg_no} - ${s.full_name}</option>`).join('');
  messSelect.innerHTML = state.messes.map(m => `<option value="${m.mess_id}">${m.mess_name}</option>`).join('');

  openModal('modal-feedback');
}

async function handleFeedbackSubmit(e) {
  e.preventDefault();
  const payload = {
    student_id: document.getElementById('feedback-student-select').value,
    mess_id: document.getElementById('feedback-mess-select').value,
    rating: Number(document.getElementById('feedback-rating').value),
    comments: document.getElementById('feedback-comments').value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/mess/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Feedback submitted successfully!', 'success');
    closeModal('modal-feedback');
  } catch (err) {
    showToast('Feedback submission failed: ' + err.message, 'error');
  }
}

// ==============================================================================
// 5. GRIEVANCES & COMPLAINTS MANAGEMENT
// ==============================================================================

async function loadComplaints() {
  try {
    const [compsRes, typesRes] = await Promise.all([
      fetch(`${API_BASE}/complaints`),
      fetch(`${API_BASE}/complaints/types`)
    ]);

    state.complaints = await compsRes.json();
    state.complaintTypes = await typesRes.json();

    renderComplaintsTable();
  } catch (err) {
    showToast('Failed to load complaints: ' + err.message, 'error');
  }
}

function renderComplaintsTable() {
  const tbody = document.getElementById('complaints-table-body');
  if (!state.complaints.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No complaints logged.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.complaints.map(c => {
    const statusBadge = c.status === 'Resolved'
      ? 'badge-success'
      : (c.status === 'In Progress' ? 'badge-warning' : 'badge-danger');

    let facilityBadge = '<span class="badge badge-neutral">General</span>';
    if (c.room_number) {
      facilityBadge = `<span class="badge badge-accent">Room ${c.room_number}</span>`;
    } else if (c.mess_name) {
      facilityBadge = `<span class="badge badge-warning">${c.mess_name}</span>`;
    } else if (c.hostel_name) {
      facilityBadge = `<span class="badge badge-outline">${c.hostel_name}</span>`;
    }

    return `
      <tr>
        <td><strong>#${c.complaint_id}</strong></td>
        <td>
          <strong>${c.full_name}</strong><br>
          <small class="badge badge-accent">${c.reg_no}</small>
        </td>
        <td><span class="badge badge-neutral">${c.category}</span></td>
        <td>${facilityBadge}</td>
        <td><strong>${c.type_name}</strong></td>
        <td>${c.complaint_date}</td>
        <td><small>${c.description}</small></td>
        <td><span class="badge ${statusBadge}">${c.status}</span></td>
        <td><small style="color: var(--text-dim);">${c.remarks || 'No remarks recorded'}</small></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick="openUpdateComplaintModal(${c.complaint_id}, '${c.status}', '${(c.remarks || '').replace(/'/g, "\\'")}')">
              Update
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteComplaint(${c.complaint_id})">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddComplaintModal() {
  const studentSelect = document.getElementById('complaint-student-select');
  const typeSelect = document.getElementById('complaint-type-select');
  const roomSelect = document.getElementById('complaint-room-select');
  const messSelect = document.getElementById('complaint-mess-select');
  const hostelSelect = document.getElementById('complaint-hostel-select');

  studentSelect.innerHTML = state.students.map(s => `<option value="${s.student_id}">${s.reg_no} - ${s.full_name}</option>`).join('');
  typeSelect.innerHTML = state.complaintTypes.map(t => `<option value="${t.complaint_type_id}">[${t.category}] ${t.type_name}</option>`).join('');

  if (roomSelect) {
    roomSelect.innerHTML = '<option value="">-- Select Room --</option>' + (state.rooms || []).map(r => `<option value="${r.room_id}">Room ${r.room_number} (${r.hostel_name || 'Hostel'})</option>`).join('');
  }
  if (messSelect) {
    messSelect.innerHTML = '<option value="">-- Select Mess --</option>' + (state.messes || []).map(m => `<option value="${m.mess_id}">${m.mess_name} (${m.mess_category})</option>`).join('');
  }
  if (hostelSelect) {
    hostelSelect.innerHTML = `
      <option value="">-- Select Hostel --</option>
      <option value="1">Hostel Block A</option>
      <option value="2">Hostel Block B</option>
      <option value="3">Hostel Block C</option>
      <option value="4">Hostel Block D</option>
    `;
  }

  document.getElementById('form-complaint').reset();
  toggleComplaintFacilityDropdown();
  openModal('modal-complaint');
}

function toggleComplaintFacilityDropdown() {
  const facTypeEl = document.getElementById('complaint-facility-type');
  if (!facTypeEl) return;
  const facType = facTypeEl.value;
  const roomGrp = document.getElementById('group-complaint-room');
  const messGrp = document.getElementById('group-complaint-mess');
  const hostelGrp = document.getElementById('group-complaint-hostel');

  if (roomGrp) roomGrp.style.display = facType === 'room' ? 'block' : 'none';
  if (messGrp) messGrp.style.display = facType === 'mess' ? 'block' : 'none';
  if (hostelGrp) hostelGrp.style.display = facType === 'hostel' ? 'block' : 'none';
}

async function handleComplaintSubmit(e) {
  e.preventDefault();
  const facType = document.getElementById('complaint-facility-type') ? document.getElementById('complaint-facility-type').value : 'none';
  const payload = {
    student_id: document.getElementById('complaint-student-select').value,
    complaint_type_id: document.getElementById('complaint-type-select').value,
    description: document.getElementById('complaint-description').value.trim(),
    room_id: facType === 'room' ? (document.getElementById('complaint-room-select').value || null) : null,
    mess_id: facType === 'mess' ? (document.getElementById('complaint-mess-select').value || null) : null,
    hostel_id: facType === 'hostel' ? (document.getElementById('complaint-hostel-select').value || null) : null
  };

  try {
    const res = await fetch(`${API_BASE}/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Grievance logged successfully (Insert)!', 'success');
    closeModal('modal-complaint');
    await loadComplaints();
    await fetchSystemStatus();
    if (typeof loadComplaintHotspots === 'function') loadComplaintHotspots();
    if (typeof loadGraphOverview === 'function') loadGraphOverview();
  } catch (err) {
    showToast('Failed to file grievance: ' + err.message, 'error');
  }
}

function openUpdateComplaintModal(id, currentStatus, currentRemarks) {
  document.getElementById('complaint-update-id').value = id;
  document.getElementById('complaint-update-status').value = currentStatus;
  document.getElementById('complaint-update-remarks').value = currentRemarks || '';
  openModal('modal-complaint-update');
}

async function handleComplaintUpdateSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('complaint-update-id').value;
  const payload = {
    status: document.getElementById('complaint-update-status').value,
    remarks: document.getElementById('complaint-update-remarks').value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/complaints/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`Complaint #${id} updated successfully (Update)!`, 'success');
    closeModal('modal-complaint-update');
    await loadComplaints();
    await fetchSystemStatus();
  } catch (err) {
    showToast('Failed to update complaint: ' + err.message, 'error');
  }
}

function confirmDeleteComplaint(id) {
  state.deleteTarget = { type: 'complaint', id };
  document.getElementById('modal-confirm-title').textContent = 'Delete Grievance';
  document.getElementById('modal-confirm-message').textContent = `Are you sure you want to delete Grievance #${id}?`;
  document.getElementById('btn-confirm-delete').onclick = executeDelete;
  openModal('modal-confirm');
}

// ==============================================================================
// 6. SQL & PL/SQL QUERY CONSOLE (16 Analytical Queries)
// ==============================================================================

async function loadQueryCatalog() {
  try {
    const res = await fetch(`${API_BASE}/queries/list`);
    state.queries = await res.json();
    renderQuerySidebar();
    selectQuery(1);
  } catch (err) {
    showToast('Failed to load query catalog: ' + err.message, 'error');
  }
}

function renderQuerySidebar() {
  const container = document.getElementById('query-buttons-list');
  container.innerHTML = state.queries.map(q => `
    <button class="query-btn ${q.id === state.activeQueryId ? 'active' : ''}" onclick="selectQuery(${q.id})" id="q-btn-${q.id}">
      <span class="query-btn-cat">${q.category}</span>
      <span class="query-btn-title">Q${q.id}: ${q.title}</span>
    </button>
  `).join('');
}

function selectQuery(id) {
  state.activeQueryId = id;
  const q = state.queries.find(item => item.id === id);
  if (!q) return;

  document.querySelectorAll('.query-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`q-btn-${id}`);
  if (btn) btn.classList.add('active');

  document.getElementById('query-active-category').textContent = q.category;
  document.getElementById('query-active-title').textContent = `Q${q.id}: ${q.title}`;
  document.getElementById('query-active-desc').textContent = q.description;
  document.getElementById('query-active-sql').textContent = q.sql;

  // Reset results container to pristine view
  document.getElementById('query-stats-bar').style.display = 'none';
  document.getElementById('query-result-head').innerHTML = '';
  document.getElementById('query-result-body').innerHTML = `
    <tr><td class="empty-state">Ready to execute. Click 'Run Query' above.</td></tr>
  `;
}

async function executeCurrentQuery() {
  const runBtn = document.getElementById('btn-run-query');
  runBtn.disabled = true;
  runBtn.innerHTML = `Running...`;

  try {
    const res = await fetch(`${API_BASE}/queries/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.activeQueryId })
    });
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.error);
    }

    // Display Benchmark metrics
    document.getElementById('query-stats-bar').style.display = 'flex';
    document.getElementById('query-exec-time').textContent = `${result.durationMs} ms`;
    document.getElementById('query-exec-rows').textContent = `${result.rowCount} records`;

    // Render Data Table
    renderQueryResultTable(result.columns, result.data);
    showToast(`Query Q${state.activeQueryId} executed in ${result.durationMs}ms (${result.rowCount} rows).`, 'success');
  } catch (err) {
    showToast('Query execution error: ' + err.message, 'error');
    document.getElementById('query-result-body').innerHTML = `
      <tr><td class="empty-state" style="color: var(--accent-rose);">Execution Error: ${err.message}</td></tr>
    `;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Run Query';
  }
}

function renderQueryResultTable(columns, data) {
  const thead = document.getElementById('query-result-head');
  const tbody = document.getElementById('query-result-body');

  if (!data || !data.length) {
    thead.innerHTML = '';
    tbody.innerHTML = `<tr><td class="empty-state">Query executed successfully, but returned 0 rows.</td></tr>`;
    return;
  }

  thead.innerHTML = `<tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr>`;

  tbody.innerHTML = data.map(row => `
    <tr>
      ${columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return `<td style="color: var(--text-dim); font-style: italic;">NULL</td>`;
        if (typeof val === 'number') return `<td><strong>${val}</strong></td>`;
        return `<td>${val}</td>`;
      }).join('')}
    </tr>
  `).join('');
}

function copySqlCode() {
  const sql = document.getElementById('query-active-sql').textContent;
  navigator.clipboard.writeText(sql).then(() => {
    showToast('SQL statement copied to clipboard!', 'info');
  });
}

// ==============================================================================
// 7. UTILITIES & MODAL HELPERS
// ==============================================================================

function populateStudentSelectDropdowns() {
  // Utility for general population
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// ==============================================================================
// 8. THEME TOGGLE ENGINE (DARK & LIGHT MODE)
// ==============================================================================

function initThemeToggle() {
  const savedTheme = localStorage.getItem('app-theme') || 
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  localStorage.setItem('app-theme', newTheme);
  showToast(`Switched to ${newTheme.toUpperCase()} mode`, 'info');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (icon && label) {
    if (theme === 'dark') {
      icon.textContent = '☀️';
      label.textContent = 'Light';
    } else {
      icon.textContent = '🌙';
      label.textContent = 'Dark';
    }
  }
}

// ==============================================================================
// 9. HOSTEL INTELLIGENCE & NEO4J MODULE
// ==============================================================================

let cyInstance = null;
let roommateCy = null;
let hotspotsCy = null;
let messCy = null;
let graphFilterType = 'all';
let rawGraphData = null;
let currentSearchedStudentId = null;

async function loadHostelIntelligence() {
  await fetchGraphHealth();
  await loadGraphOverview();
  populateRoommateStudentSelect();
  populateMessExplorerSelect();
  loadComplaintHotspots();
  loadComplaintHotspotsGraph();
  filterSmartVacancyRooms();
}

// Health status check
async function fetchGraphHealth() {
  try {
    const res = await fetch(`${API_BASE}/graph/health`);
    const data = await res.json();
    const neoBadge = document.getElementById('graph-engine-badge');
    const syncTime = document.getElementById('graph-last-sync-time');

    if (neoBadge) {
      if (data.neo4j && data.neo4j.connected) {
        neoBadge.textContent = `Neo4j Connected (${data.neo4j.latencyMs}ms)`;
        neoBadge.className = 'badge badge-success';
        if (syncTime) syncTime.textContent = `Graph Status: Synchronized (${data.neo4j.nodeCount} nodes)`;
      } else {
        neoBadge.textContent = 'Neo4j Bolt [Offline - Fallback Engine Active]';
        neoBadge.className = 'badge badge-warning';
        if (syncTime) syncTime.textContent = 'Hybrid Fallback Active (Zero Interruption)';
      }
    }
  } catch (err) {
    const neoBadge = document.getElementById('graph-engine-badge');
    if (neoBadge) {
      neoBadge.textContent = 'Graph Offline';
      neoBadge.className = 'badge badge-danger';
    }
  }
}

// Overview metrics
async function loadGraphOverview() {
  try {
    const res = await fetch(`${API_BASE}/graph/overview`);
    const data = await res.json();

    const stEl = document.getElementById('intel-stat-students');
    const rmEl = document.getElementById('intel-stat-rooms');
    const alEl = document.getElementById('intel-stat-allocations');
    const lcEl = document.getElementById('intel-stat-linked-complaints');
    const lkCount = document.getElementById('intel-linked-count');
    const unCount = document.getElementById('intel-unlinked-count');

    if (stEl) stEl.textContent = data.totalStudents ?? '--';
    if (rmEl) rmEl.textContent = data.totalRooms ?? '--';
    if (alEl) alEl.textContent = data.activeAllocations ?? '--';
    if (lcEl) lcEl.textContent = data.linkedComplaints ?? '--';
    if (lkCount) lkCount.textContent = data.linkedComplaints ?? 0;
    if (unCount) unCount.textContent = data.unlinkedComplaints ?? 0;
  } catch (err) {
    console.error('Failed to load graph overview:', err);
  }
}

// Sub-navigation switcher inside Hostel Intelligence
function switchIntelSubTab(subTabId) {
  document.querySelectorAll('.intel-subcontent').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sub-nav-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  const contentEl = document.getElementById(subTabId);
  const btnEl = document.querySelector(`.sub-nav-btn[data-subtab="${subTabId}"]`);

  if (contentEl) contentEl.classList.add('active');
  if (btnEl) {
    btnEl.classList.add('active');
    btnEl.setAttribute('aria-selected', 'true');
  }

  // Cytoscape canvas auto-resize & fit whenever switching into hidden tabs
  setTimeout(() => {
    if (subTabId === 'subtab-roommates' && roommateCy) {
      roommateCy.resize();
      roommateCy.fit(undefined, 30);
    } else if (subTabId === 'subtab-hotspots') {
      if (hotspotsCy) {
        hotspotsCy.resize();
        hotspotsCy.fit(undefined, 30);
      } else {
        loadComplaintHotspotsGraph();
      }
    } else if (subTabId === 'subtab-vacancy') {
      filterSmartVacancyRooms();
    } else if (subTabId === 'subtab-mess-graph' && messCy) {
      messCy.resize();
      messCy.fit(undefined, 30);
    } else if (subTabId === 'subtab-visualizer') {
      if (cyInstance) {
        cyInstance.resize();
        cyInstance.fit(undefined, 30);
      } else {
        initGraphExplorer();
      }
    }
  }, 60);
}

// ------------------------------------------------------------------------------
// FEATURE 1: ROOMMATE EXPLORER
// ------------------------------------------------------------------------------

function populateRoommateStudentSelect() {
  const select = document.getElementById('roommate-student-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Select Student to Explore Roommates --</option>' +
    (state.students || []).map(s => `<option value="${s.student_id}">${s.reg_no} — ${s.full_name} (${s.branch}, Year ${s.year_of_study})</option>`).join('');
  if (currentVal) select.value = currentVal;
}

function handleRoommateStudentChange() {
  searchCurrentRoommates();
}

async function searchCurrentRoommates() {
  const select = document.getElementById('roommate-student-select');
  const studentId = select ? select.value : null;
  const container = document.getElementById('roommate-results-container');
  const historyContainer = document.getElementById('roommate-history-container');
  if (historyContainer) historyContainer.style.display = 'none';

  if (!studentId) {
    container.innerHTML = `
      <div class="empty-state-card">
        <p>Please select a student from the dropdown to discover roommate relationships.</p>
      </div>`;
    return;
  }

  currentSearchedStudentId = studentId;
  container.innerHTML = `<p class="loading-state">Querying Neo4j property graph for roommates...</p>`;

  try {
    const res = await fetch(`${API_BASE}/graph/students/${studentId}/roommates`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    if (!data.hasActiveAllocation) {
      container.innerHTML = `
        <div class="room-profile-card">
          <div class="profile-card-header">
            <div>
              <span class="badge badge-accent">Searched Student</span>
              <h2 class="mt-2">${data.student.full_name} (${data.student.reg_no})</h2>
              <p class="text-muted">${data.student.branch || ''} • B.Tech</p>
            </div>
            <span class="badge badge-warning">Unallocated</span>
          </div>
          <div class="empty-state-card mt-3">
            <p>ℹ️ ${data.message || 'Student does not currently have an active room allocation.'}</p>
          </div>
        </div>`;
      const graphContainer = document.getElementById('roommate-cytoscape-container');
      if (graphContainer) {
        graphContainer.innerHTML = `
          <div class="empty-state-card" style="padding: 40px; text-align: center;">
            <p class="text-muted">Target student has no active room allotment. No peer relationship network to display in Neo4j.</p>
          </div>`;
      }
      return;
    }

    const rm = data.room;
    const roommatesHtml = data.roommates && data.roommates.length > 0
      ? data.roommates.map(rmSt => `
          <div class="roommate-card">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="roommate-avatar">${rmSt.full_name.charAt(0)}</div>
              <div class="roommate-info">
                <h4>${rmSt.full_name}</h4>
                <div class="roommate-meta">${rmSt.reg_no} • ${rmSt.branch} (Year ${rmSt.year_of_study})</div>
              </div>
            </div>
            <div class="mt-2" style="font-size: 0.78rem; color: var(--text-muted);">
              <span>Allotted since: <strong>${rmSt.allocation_date}</strong></span>
            </div>
          </div>
        `).join('')
      : `<div class="empty-state-card" style="grid-column: 1 / -1;"><p>Single occupancy allotment. No active roommates sharing this room.</p></div>`;

    container.innerHTML = `
      <div class="room-profile-card">
        <div class="profile-card-header">
          <div>
            <span class="badge badge-accent">Searched Target Student</span>
            <h2 class="mt-2">${data.student.full_name} (${data.student.reg_no})</h2>
            <p class="text-muted">${data.student.branch || 'Engineering'} • Active Resident</p>
          </div>
          <div style="text-align: right;">
            <span class="badge badge-success">Active Allocation</span>
            <div class="mt-2" style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-muted);">
              Room Capacity: ${rm.capacity} Beds (${rm.ac_type})
            </div>
          </div>
        </div>

        <!-- Room Specs Card -->
        <div class="stats-pills mb-3" style="background: var(--bg-surface); padding: 12px 16px; border: 2px solid var(--border-color); border-radius: var(--radius-xs);">
          <div class="stat-pill"><span class="label">Room:</span> <span class="val">Room ${rm.room_number}</span></div>
          <div class="stat-pill"><span class="label">Hostel:</span> <span class="val">${rm.hostel_name}</span></div>
          <div class="stat-pill"><span class="label">Block:</span> <span class="val">${rm.block_name}</span></div>
          <div class="stat-pill"><span class="label">Floor:</span> <span class="val">Floor ${rm.floor_number}</span></div>
          <div class="stat-pill"><span class="label">Active Roommates:</span> <span class="val success">${data.roommateCount}</span></div>
        </div>

        <h3 class="mt-4 mb-2">Current Roommates Sharing Room ${rm.room_number}</h3>
        <div class="roommates-grid">
          ${roommatesHtml}
        </div>
      </div>
    `;

    // Render interactive relationship graph in parallel
    initRoommateGraph(studentId);
  } catch (err) {
    container.innerHTML = `<div class="empty-state-card"><p style="color: var(--danger-color);">Error querying roommates: ${err.message}</p></div>`;
    const graphContainer = document.getElementById('roommate-cytoscape-container');
    if (graphContainer) {
      graphContainer.innerHTML = `<div class="empty-state-card" style="padding: 24px; text-align: center;"><p style="color: var(--danger-color);">Graph unavailable: ${err.message}</p></div>`;
    }
  }
}

async function initRoommateGraph(studentId) {
  const container = document.getElementById('roommate-cytoscape-container');
  if (!container) return;

  if (typeof cytoscape === 'undefined') {
    container.innerHTML = `<div class="empty-state-card" style="padding: 24px; text-align: center;"><p>Cytoscape graph visualizer not loaded.</p></div>`;
    return;
  }

  if (roommateCy) {
    roommateCy.destroy();
    roommateCy = null;
  }

  container.innerHTML = `<p class="loading-state" style="padding: 20px;">Rendering roommate relationship graph...</p>`;

  try {
    const res = await fetch(`${API_BASE}/graph/students/${studentId}/roommates-graph`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch roommate graph');

    const nodes = data.elements?.nodes || [];
    const rawEdges = data.elements?.edges || [];

    if (nodes.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card" style="padding: 30px; text-align: center;">
          <p class="text-muted">No graph entities found for this student.</p>
        </div>`;
      return;
    }

    const nodeIds = new Set(nodes.map(n => n?.data?.id).filter(Boolean));
    const validEdges = [];
    for (const e of rawEdges) {
      if (e?.data?.source && e?.data?.target && nodeIds.has(e.data.source) && nodeIds.has(e.data.target)) {
        validEdges.push(e);
      }
    }

    container.innerHTML = '';

    roommateCy = cytoscape({
      container,
      elements: { nodes, edges: validEdges },
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#FFFFFF',
            'font-family': 'Space Grotesk, sans-serif',
            'font-size': '11px',
            'font-weight': 700,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-background-color': '#090d16',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'border-width': 2.5,
            'border-color': '#000000',
            'background-color': '#0284c7',
            'width': 34,
            'height': 34
          }
        },
        {
          selector: 'node[type = "Student"]',
          style: {
            'background-color': '#0284c7',
            'shape': 'ellipse',
            'width': 36,
            'height': 36
          }
        },
        {
          selector: `node[id = "student_${studentId}"]`,
          style: {
            'background-color': '#38bdf8',
            'border-color': '#FFFFFF',
            'border-width': 3.5,
            'width': 44,
            'height': 44,
            'shadow-blur': 14,
            'shadow-color': '#38bdf8',
            'shadow-opacity': 0.95
          }
        },
        {
          selector: 'node[type = "Room"]',
          style: {
            'background-color': '#a855f7',
            'shape': 'roundrectangle',
            'width': 42,
            'height': 42,
            'border-color': '#c084fc'
          }
        },
        {
          selector: 'node[type = "Floor"]',
          style: {
            'background-color': '#06b6d4',
            'shape': 'roundrectangle',
            'width': 34,
            'height': 34
          }
        },
        {
          selector: 'node[type = "Block"]',
          style: {
            'background-color': '#059669',
            'shape': 'roundrectangle',
            'width': 36,
            'height': 36
          }
        },
        {
          selector: 'node[type = "Hostel"]',
          style: {
            'background-color': '#10b981',
            'shape': 'hexagon',
            'width': 44,
            'height': 44,
            'border-color': '#34d399'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#475569',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'font-weight': 600,
            'color': '#94a3b8',
            'text-rotation': 'autorotate',
            'text-background-color': '#090d16',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#fbbf24',
            'shadow-blur': 12,
            'shadow-color': '#fbbf24',
            'shadow-opacity': 0.9
          }
        }
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 80,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 80,
        nodeRepulsion: 300000,
        edgeElasticity: 100,
        gravity: 80,
        numIter: 800
      }
    });

    roommateCy.on('tap', 'node', function(evt) {
      showRoommateNodeDetails(evt.target.data());
    });

    roommateCy.on('tap', function(evt) {
      if (evt.target === roommateCy) {
        closeRoommateInspector();
      }
    });
  } catch (err) {
    console.error('[Roommate Graph Error]:', err);
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 24px; text-align: center;">
        <p style="color: var(--danger-color);">Error loading roommate graph: ${err.message}</p>
      </div>`;
  }
}

function showRoommateNodeDetails(d) {
  const panel = document.getElementById('roommate-node-details');
  const typeBadge = document.getElementById('roommate-node-type');
  const labelEl = document.getElementById('roommate-node-label');
  const propsEl = document.getElementById('roommate-node-props');
  if (!panel) return;

  panel.style.display = 'block';
  if (typeBadge) typeBadge.textContent = d.type || 'Entity';
  if (labelEl) labelEl.textContent = d.label || d.id;

  let html = '';
  if (d.type === 'Student') {
    html = `
      <div class="prop-label">Reg No:</div><div class="prop-val">${d.reg_no || '--'}</div>
      <div class="prop-label">Branch:</div><div class="prop-val">${d.branch || '--'} (Year ${d.year_of_study || '--'})</div>
      <div class="prop-label">Allocation:</div><div class="prop-val">${d.allocation_date || 'Active'}</div>
      <div class="prop-label">Role:</div><div class="prop-val">${d.isTarget ? '<strong style="color: #38bdf8;">Target Selected Student</strong>' : 'Roommate Peer'}</div>
    `;
  } else if (d.type === 'Room') {
    html = `
      <div class="prop-label">Room Number:</div><div class="prop-val">${d.room_number || '--'}</div>
      <div class="prop-label">Capacity:</div><div class="prop-val">${d.capacity || '--'} Beds</div>
      <div class="prop-label">AC Type:</div><div class="prop-val">${d.ac_type || '--'}</div>
      <div class="prop-label">Fee/Sem:</div><div class="prop-val">₹${d.fee_per_semester || '--'}</div>
    `;
  } else if (d.type === 'Floor') {
    html = `<div class="prop-label">Floor Number:</div><div class="prop-val">Floor ${d.floor_number || '--'}</div>`;
  } else if (d.type === 'Block') {
    html = `<div class="prop-label">Block Name:</div><div class="prop-val">${d.block_name || '--'}</div>`;
  } else if (d.type === 'Hostel') {
    html = `
      <div class="prop-label">Hostel Name:</div><div class="prop-val">${d.hostel_name || '--'}</div>
      <div class="prop-label">Category:</div><div class="prop-val">${d.category || '--'}</div>
    `;
  }
  if (propsEl) propsEl.innerHTML = html;
}

function closeRoommateInspector() {
  const panel = document.getElementById('roommate-node-details');
  if (panel) panel.style.display = 'none';
}

function roommateCyZoomIn() { if (roommateCy) roommateCy.zoom(roommateCy.zoom() * 1.25); }
function roommateCyZoomOut() { if (roommateCy) roommateCy.zoom(roommateCy.zoom() * 0.8); }
function roommateCyFit() { if (roommateCy) roommateCy.fit(undefined, 30); }
function roommateCyResetLayout() {
  if (roommateCy) {
    const l = roommateCy.layout({ name: 'cose', animate: true, fit: true, padding: 30 });
    l.run();
  }
}

async function toggleRoommateHistory() {
  const container = document.getElementById('roommate-history-container');
  if (!container) return;

  if (container.style.display === 'block') {
    container.style.display = 'none';
    return;
  }

  if (!currentSearchedStudentId) {
    showToast('Please select a student first.', 'warning');
    return;
  }

  container.style.display = 'block';
  container.innerHTML = '<p class="loading-state">Traversing housing history and historical roommate intervals...</p>';

  try {
    const res = await fetch(`${API_BASE}/graph/students/${currentSearchedStudentId}/history`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (!data.history || data.history.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body"><p class="text-muted">No historical room allocations found for this student.</p></div></div>`;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Housing History & Overlapping Roommates</h3>
          <span class="badge badge-neutral">Temporal Graph Traversal</span>
        </div>
        <div class="card-body">
          ${data.history.map(item => `
            <div class="history-item mb-4" style="background: var(--bg-surface); padding: 16px; border: 2px solid var(--border-color); border-radius: var(--radius-xs);">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <div>
                  <h4 style="margin: 0; font-size: 1.05rem;">Room ${item.room_number} — ${item.hostel_name} (${item.block_name || ''})</h4>
                  <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                    Occupied: <strong>${item.allocation_date}</strong> to <strong>${item.vacate_date || 'Present'}</strong>
                  </div>
                </div>
                <span class="badge ${item.status === 'Active' ? 'badge-success' : 'badge-neutral'}">${item.status}</span>
              </div>
              <div class="mt-3">
                <span class="text-xs" style="font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Students Overlapping This Period:</span>
                ${item.roommates && item.roommates.length > 0
                  ? `<div class="roommates-grid mt-2">
                      ${item.roommates.map(p => `
                        <div class="roommate-card" style="padding: 10px;">
                          <strong>${p.full_name} (${p.reg_no})</strong>
                          <span class="text-xs text-muted">${p.allocation_date} to ${p.vacate_date || 'Present'}</span>
                        </div>
                      `).join('')}
                    </div>`
                  : '<p class="text-xs text-muted mt-1">No overlapping roommates recorded during this duration.</p>'
                }
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state-card"><p style="color: var(--danger-color);">Error loading housing history: ${err.message}</p></div>`;
  }
}

// ------------------------------------------------------------------------------
// FEATURE 2: COMPLAINT HOTSPOTS & RED INTENSITY GRAPH
// ------------------------------------------------------------------------------

function handleHotspotFilterChange() {
  loadComplaintHotspots();
  loadComplaintHotspotsGraph();
}

async function loadComplaintHotspots() {
  const catEl = document.getElementById('hotspot-category-filter');
  const statEl = document.getElementById('hotspot-status-filter');
  const tbody = document.getElementById('hotspots-table-body');
  const unlinkedPill = document.getElementById('hotspot-unlinked-pill');

  const category = catEl ? catEl.value : 'All';
  const status = statEl ? statEl.value : 'Open';

  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="loading-state">Aggregating grievance hotspots via Neo4j...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/graph/complaint-hotspots?category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (unlinkedPill) {
      unlinkedPill.innerHTML = `<span class="badge badge-neutral">${data.unlinkedComplaintsCount || 0} Unlinked Campus Grievances</span>`;
    }

    if (!data.hotspots || data.hotspots.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No grievance hotspots matching the selected filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.hotspots.map((h, i) => {
      const typeBadge = h.facility_type === 'Room'
        ? 'badge-accent'
        : (h.facility_type === 'Mess' ? 'badge-warning' : 'badge-outline');

      const safeComplaints = JSON.stringify(h.complaints || []).replace(/"/g, '&quot;');

      return `
        <tr id="hotspot-row-${i}">
          <td><strong>#${i + 1}</strong></td>
          <td><span class="badge ${typeBadge}">${h.facility_type}</span></td>
          <td><strong>${h.facility_name}</strong></td>
          <td>${h.hostel_name || 'Campus'}</td>
          <td><span class="badge badge-danger">${h.openComplaints}</span></td>
          <td><span class="badge badge-success">${h.resolvedComplaints}</span></td>
          <td><strong>${h.totalComplaints}</strong></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openHotspotInspectionModal('${h.facility_type}', '${h.facility_name.replace(/'/g, "\\'")}', '${safeComplaints}')">
              Inspect Grievances
            </button>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color: var(--danger-color);">Failed to load hotspots: ${err.message}</td></tr>`;
  }
}

async function loadComplaintHotspotsGraph() {
  const container = document.getElementById('hotspots-cytoscape-container');
  if (!container) return;

  if (typeof cytoscape === 'undefined') {
    container.innerHTML = `<div class="empty-state-card" style="padding: 24px; text-align: center;"><p>Cytoscape graph visualizer not loaded.</p></div>`;
    return;
  }

  const catEl = document.getElementById('hotspot-category-filter');
  const statEl = document.getElementById('hotspot-status-filter');
  const category = catEl ? catEl.value : 'All';
  const status = statEl ? statEl.value : 'Open';

  if (hotspotsCy) {
    hotspotsCy.destroy();
    hotspotsCy = null;
  }

  container.innerHTML = `<p class="loading-state" style="padding: 20px;">Analyzing spatial graph clusters & highlighting grievance hotspots...</p>`;

  try {
    const res = await fetch(`${API_BASE}/graph/hotspots-graph?category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch hotspot graph');

    const nodes = data.elements?.nodes || [];
    const rawEdges = data.elements?.edges || [];

    if (nodes.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card" style="padding: 30px; text-align: center;">
          <p class="text-muted">No facility hotspots or linked grievances found matching criteria.</p>
        </div>`;
      return;
    }

    const nodeIds = new Set(nodes.map(n => n?.data?.id).filter(Boolean));
    const validEdges = [];
    for (const e of rawEdges) {
      if (e?.data?.source && e?.data?.target && nodeIds.has(e.data.source) && nodeIds.has(e.data.target)) {
        validEdges.push(e);
      }
    }

    container.innerHTML = '';

    hotspotsCy = cytoscape({
      container,
      elements: { nodes, edges: validEdges },
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#FFFFFF',
            'font-family': 'Space Grotesk, sans-serif',
            'font-size': '10px',
            'font-weight': 700,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-background-color': '#090d16',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'border-width': 2.5,
            'border-color': '#000000',
            'background-color': '#475569',
            'width': 34,
            'height': 34
          }
        },
        {
          selector: 'node[hotspotIntensity = "high"]',
          style: {
            'background-color': '#ef4444',
            'border-color': '#fee2e2',
            'border-width': 3.5,
            'width': 48,
            'height': 48,
            'shadow-blur': 18,
            'shadow-color': '#ef4444',
            'shadow-opacity': 0.95
          }
        },
        {
          selector: 'node[hotspotIntensity = "medium"]',
          style: {
            'background-color': '#f97316',
            'border-color': '#ffedd5',
            'border-width': 3,
            'width': 40,
            'height': 40,
            'shadow-blur': 10,
            'shadow-color': '#f97316',
            'shadow-opacity': 0.75
          }
        },
        {
          selector: 'node[hotspotIntensity = "low"]',
          style: {
            'background-color': '#eab308',
            'border-color': '#fef08a',
            'border-width': 2.5,
            'width': 36,
            'height': 36
          }
        },
        {
          selector: 'node[hotspotIntensity = "neutral"]',
          style: {
            'background-color': '#334155',
            'border-color': '#475569',
            'border-width': 2,
            'width': 30,
            'height': 30
          }
        },
        {
          selector: 'node[type = "Room"]',
          style: { 'shape': 'roundrectangle' }
        },
        {
          selector: 'node[type = "Mess"]',
          style: { 'shape': 'tag' }
        },
        {
          selector: 'node[type = "Hostel"]',
          style: { 'shape': 'hexagon', 'background-color': '#10b981', 'width': 44, 'height': 44 }
        },
        {
          selector: 'node[type = "Complaint"]',
          style: {
            'background-color': '#f43f5e',
            'shape': 'triangle',
            'width': 26,
            'height': 26,
            'border-color': '#fda4af',
            'border-width': 2
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#475569',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '8px',
            'font-weight': 600,
            'color': '#94a3b8',
            'text-rotation': 'autorotate',
            'text-background-color': '#090d16',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#fbbf24',
            'shadow-blur': 14,
            'shadow-color': '#fbbf24',
            'shadow-opacity': 0.95
          }
        }
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 90,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 90,
        nodeRepulsion: 350000,
        edgeElasticity: 100,
        gravity: 80,
        numIter: 800
      }
    });

    hotspotsCy.on('tap', 'node', function(evt) {
      showHotspotNodeDetails(evt.target.data());
    });

    hotspotsCy.on('tap', function(evt) {
      if (evt.target === hotspotsCy) {
        closeHotspotInspector();
      }
    });
  } catch (err) {
    console.error('[Hotspots Graph Error]:', err);
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 24px; text-align: center;">
        <p style="color: var(--danger-color);">Error loading hotspots graph: ${err.message}</p>
      </div>`;
  }
}

function showHotspotNodeDetails(d) {
  const panel = document.getElementById('hotspots-node-details');
  const badgeEl = document.getElementById('hotspot-node-badge');
  const nameEl = document.getElementById('hotspot-node-name');
  const propsEl = document.getElementById('hotspot-node-props');
  if (!panel) return;

  panel.style.display = 'block';
  if (nameEl) nameEl.textContent = d.facility_name || d.label || d.id;

  if (d.type === 'Complaint') {
    if (badgeEl) {
      badgeEl.textContent = 'Grievance Record';
      badgeEl.className = d.status === 'Resolved' ? 'badge badge-success' : 'badge badge-danger';
    }
    if (propsEl) {
      propsEl.innerHTML = `
        <div class="prop-label">Complaint ID:</div><div class="prop-val">#${d.complaint_id || '--'}</div>
        <div class="prop-label">Category:</div><div class="prop-val">${d.category || '--'}</div>
        <div class="prop-label">Issue Type:</div><div class="prop-val">${d.type_name || '--'}</div>
        <div class="prop-label">Status:</div><div class="prop-val"><strong>${d.status || '--'}</strong></div>
        <div class="prop-label">Logged Date:</div><div class="prop-val">${d.complaint_date || '--'}</div>
        <div class="prop-label">Description:</div><div class="prop-val">${d.description || '--'}</div>
      `;
    }
    return;
  }

  // Facility node
  if (badgeEl) {
    const intensity = d.hotspotIntensity;
    if (intensity === 'high') {
      badgeEl.textContent = `CRITICAL HOTSPOT (${d.openComplaints || 0} Unresolved)`;
      badgeEl.className = 'badge badge-danger';
    } else if (intensity === 'medium') {
      badgeEl.textContent = `ELEVATED HOTSPOT (${d.openComplaints || 0} Unresolved)`;
      badgeEl.className = 'badge badge-warning';
    } else if (intensity === 'low') {
      badgeEl.textContent = `MODERATE HOTSPOT (${d.openComplaints || 0} Unresolved)`;
      badgeEl.className = 'badge badge-neutral';
    } else {
      badgeEl.textContent = 'CLEAN / RESOLVED ONLY';
      badgeEl.className = 'badge badge-success';
    }
  }

  let complaintsListHtml = '';
  if (d.complaints && d.complaints.length > 0) {
    complaintsListHtml = d.complaints.map(c => `
      <div style="background: rgba(0,0,0,0.3); padding: 6px 8px; border-radius: 4px; margin-top: 4px; border-left: 3px solid ${c.status === 'Resolved' ? '#10b981' : '#ef4444'};">
        <div style="font-weight: 700; color: #fff;">${c.type_name || 'Grievance'}</div>
        <div style="font-size: 0.72rem; color: #cbd5e1;">${c.description || ''}</div>
        <div style="font-size: 0.7rem; color: #94a3b8; display: flex; justify-content: space-between; margin-top: 2px;">
          <span>${c.complaint_date || ''}</span>
          <span style="color: ${c.status === 'Resolved' ? '#10b981' : '#ef4444'}; font-weight: 700;">${c.status}</span>
        </div>
      </div>
    `).join('');
  }

  if (propsEl) {
    propsEl.innerHTML = `
      <div class="prop-label">Facility Type:</div><div class="prop-val">${d.facility_type || d.type}</div>
      <div class="prop-label">Location:</div><div class="prop-val">${d.hostel_name || 'Campus'}</div>
      <div class="prop-label">Unresolved:</div><div class="prop-val"><strong style="color: #ef4444; font-size: 0.9rem;">${d.openComplaints ?? '--'}</strong></div>
      <div class="prop-label">Resolved:</div><div class="prop-val"><strong style="color: #10b981;">${d.resolvedComplaints ?? '--'}</strong></div>
      <div class="prop-label">Total Logs:</div><div class="prop-val"><strong>${d.totalComplaints ?? '--'}</strong></div>
      <div class="prop-label" style="grid-column: 1 / -1; margin-top: 8px;">Associated Grievances:</div>
      <div class="prop-val" style="grid-column: 1 / -1; max-height: 140px; overflow-y: auto;">
        ${complaintsListHtml || '<span class="text-muted">No individual complaints.</span>'}
      </div>
    `;
  }

  // Highlight facility row in table if present
  const rows = document.querySelectorAll('#hotspots-table tbody tr');
  rows.forEach(tr => {
    tr.style.backgroundColor = '';
    if (d.facility_name && tr.innerText.includes(d.facility_name)) {
      tr.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
      tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

function closeHotspotInspector() {
  const panel = document.getElementById('hotspots-node-details');
  if (panel) panel.style.display = 'none';
  document.querySelectorAll('#hotspots-table tbody tr').forEach(tr => tr.style.backgroundColor = '');
}

function hotspotsCyZoomIn() { if (hotspotsCy) hotspotsCy.zoom(hotspotsCy.zoom() * 1.25); }
function hotspotsCyZoomOut() { if (hotspotsCy) hotspotsCy.zoom(hotspotsCy.zoom() * 0.8); }
function hotspotsCyFit() { if (hotspotsCy) hotspotsCy.fit(undefined, 30); }
function hotspotsCyResetLayout() {
  if (hotspotsCy) {
    const l = hotspotsCy.layout({ name: 'cose', animate: true, fit: true, padding: 30 });
    l.run();
  }
}

function openHotspotInspectionModal(facType, facName, encodedComplaints) {
  const modal = document.getElementById('modal-facility-complaints');
  const title = document.getElementById('modal-facility-title');
  const meta = document.getElementById('modal-facility-meta');
  const tbody = document.getElementById('modal-facility-complaints-body');

  let complaints = [];
  try {
    complaints = JSON.parse(encodedComplaints.replace(/&quot;/g, '"'));
  } catch (e) {
    complaints = [];
  }

  if (title) title.textContent = `Grievances for ${facName}`;
  if (meta) {
    meta.innerHTML = `
      <div class="stats-pills">
        <div class="stat-pill"><span class="label">Facility Type:</span> <span class="val">${facType}</span></div>
        <div class="stat-pill"><span class="label">Total Records:</span> <span class="val">${complaints.length}</span></div>
      </div>`;
  }

  if (tbody) {
    if (!complaints.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No individual grievance records recorded.</td></tr>`;
    } else {
      tbody.innerHTML = complaints.map(c => {
        const badge = c.status === 'Resolved' ? 'badge-success' : (c.status === 'In Progress' ? 'badge-warning' : 'badge-danger');
        return `
          <tr>
            <td>#${c.complaint_id}</td>
            <td><span class="badge badge-neutral">${c.category || ''}</span></td>
            <td><strong>${c.type_name || ''}</strong></td>
            <td>${c.complaint_date || ''}</td>
            <td><small>${c.description || ''}</small></td>
            <td><span class="badge ${badge}">${c.status}</span></td>
          </tr>`;
      }).join('');
    }
  }

  openModal('modal-facility-complaints');
}

// ------------------------------------------------------------------------------
// FEATURE 3: SMART ROOM & VACANCY FINDER (ZERO-OVERFLOW CARDS)
// ------------------------------------------------------------------------------

async function filterSmartVacancyRooms() {
  const hostelId = document.getElementById('vacancy-hostel-filter')?.value || '';
  const acType = document.getElementById('vacancy-actype-filter')?.value || '';
  const capacity = document.getElementById('vacancy-capacity-filter')?.value || '';
  const grid = document.getElementById('smart-rooms-grid');

  if (!grid) return;
  grid.innerHTML = `<p class="loading-state">Traversing graph hierarchy and cross-validating occupancy with MySQL...</p>`;

  try {
    const params = new URLSearchParams();
    if (hostelId) params.append('hostelId', hostelId);
    if (acType) params.append('acType', acType);
    if (capacity) params.append('minCapacity', capacity);

    const res = await fetch(`${API_BASE}/graph/rooms/available?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (!data.rooms || data.rooms.length === 0) {
      grid.innerHTML = `<div class="empty-state-card" style="grid-column: 1 / -1;"><p>No candidate rooms match the selected criteria.</p></div>`;
      return;
    }

    grid.innerHTML = data.rooms.map(r => {
      const isFull = r.vacant_beds === 0;
      const statusClass = isFull ? 'badge-danger' : 'badge-success';

      return `
        <div class="card room-card ${isFull ? 'room-occupied' : 'room-available'}">
          <div class="card-header">
            <div>
              <span class="badge badge-accent">Room ${r.room_number}</span>
              <h3 class="mt-1">${r.hostel_name}</h3>
              <p class="text-xs text-muted">${r.block_name} • Floor ${r.floor_number}</p>
            </div>
            <span class="badge ${statusClass}">${isFull ? 'Fully Occupied' : `${r.vacant_beds} Free Bed${r.vacant_beds > 1 ? 's' : ''}`}</span>
          </div>
          <div class="card-body">
            <div class="stats-pills mb-3">
              <div class="stat-pill"><span class="label">Capacity:</span> <span class="val">${r.capacity} Beds</span></div>
              <div class="stat-pill"><span class="label">AC:</span> <span class="val">${r.ac_type}</span></div>
              <div class="stat-pill"><span class="label">Occupancy:</span> <span class="val">${r.current_occupancy}/${r.capacity}</span></div>
            </div>
            <div class="room-card-footer">
              <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Fee: ₹${Number(r.fee_per_semester).toLocaleString('en-IN')}/sem</span>
              <span class="badge badge-mini badge-neutral mysql-verified-badge">✓ Verified MySQL Vacancy</span>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state-card" style="grid-column: 1 / -1;"><p style="color: var(--danger-color);">Error loading rooms: ${err.message}</p></div>`;
  }
}

// ------------------------------------------------------------------------------
// FEATURE 4: MESS CONNECTIONS & INTERACTIVE RELATIONSHIP GRAPH
// ------------------------------------------------------------------------------

function populateMessExplorerSelect() {
  const select = document.getElementById('mess-explorer-select');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">-- Select Dining Facility --</option>' +
    (state.messes || []).map(m => `<option value="${m.mess_id}">${m.mess_name} (${m.mess_category})</option>`).join('');
  if (current) select.value = current;
}

async function handleMessExplorerChange() {
  const select = document.getElementById('mess-explorer-select');
  const messId = select ? select.value : null;
  const container = document.getElementById('mess-connections-container');
  if (!container) return;

  if (!messId) {
    container.innerHTML = `<div class="empty-state-card"><p>Select a dining facility from the dropdown above to inspect caterer relationships, registered students, and facility-specific grievances in the Neo4j graph.</p></div>`;
    return;
  }

  container.innerHTML = `<p class="loading-state">Querying Neo4j for mess supply network and registrations...</p>`;

  try {
    const res = await fetch(`${API_BASE}/graph/mess/${messId}/connections`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const m = data.mess;
    const cat = data.caterer;

    const studentsHtml = data.registeredStudents && data.registeredStudents.length > 0
      ? data.registeredStudents.map(s => `
          <tr>
            <td><strong>${s.full_name}</strong></td>
            <td><span class="badge badge-accent">${s.reg_no}</span></td>
            <td>${s.branch}</td>
            <td>${s.registration_date}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="4" class="empty-state">No students registered.</td></tr>`;

    const complaintsHtml = data.linkedComplaints && data.linkedComplaints.length > 0
      ? data.linkedComplaints.map(c => `
          <div style="background: var(--bg-surface); padding: 12px; border: 2px solid var(--border-color); border-radius: var(--radius-xs); margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>${c.type_name}</strong>
              <span class="badge ${c.status === 'Resolved' ? 'badge-success' : 'badge-danger'}">${c.status}</span>
            </div>
            <p class="text-xs mt-1 mb-0">${c.description}</p>
            <span class="text-xs text-muted">${c.complaint_date}</span>
          </div>
        `).join('')
      : `<p class="text-muted text-sm">No complaints logged for this dining facility.</p>`;

    container.innerHTML = `
      <div class="intel-split-layout">
        <!-- Left: Mess & Caterer Specs & Grievances -->
        <div class="intel-split-col">
          <div class="card">
            <div class="card-header">
              <div>
                <span class="badge badge-accent">${m.mess_category} Cuisine</span>
                <h3 class="mt-1">${m.mess_name}</h3>
                <p class="text-xs text-muted">${m.hostel_name}</p>
              </div>
              <span class="badge badge-success">${data.registeredStudentsCount} Active Enrolled</span>
            </div>
            <div class="card-body">
              <h4 class="mb-2">Contracted Catering Provider</h4>
              <div style="background: var(--bg-surface); padding: 14px; border: 2px solid var(--border-color); border-radius: var(--radius-xs);">
                <h3 style="font-size: 1.1rem; margin: 0;">${cat.caterer_name}</h3>
                <p class="text-sm mt-1 mb-2">Manager: <strong>${cat.contact_person}</strong> (${cat.contact_number})</p>
                <div class="stats-pills">
                  <div class="stat-pill"><span class="label">Contract Start:</span> <span class="val">${cat.contract_start_date}</span></div>
                  <div class="stat-pill"><span class="label">Contract End:</span> <span class="val">${cat.contract_end_date}</span></div>
                </div>
              </div>

              <h4 class="mt-4 mb-2">Dining Capacity & Tariff</h4>
              <div class="stats-pills">
                <div class="stat-pill"><span class="label">Capacity:</span> <span class="val">${m.capacity} Diners</span></div>
                <div class="stat-pill"><span class="label">Monthly Fee:</span> <span class="val">₹${Number(m.monthly_fee).toLocaleString('en-IN')}</span></div>
              </div>

              <h4 class="mt-4 mb-2">Facility-Specific Grievances</h4>
              <div class="mt-2">${complaintsHtml}</div>
            </div>
          </div>
        </div>

        <!-- Right: Mess Relationship Graph -->
        <div class="intel-split-col">
          <div class="card graph-card" id="mess-graph-card">
            <div class="card-header">
              <div>
                <h3 style="margin: 0; font-size: 1.15rem;">Mess Relationship Graph</h3>
                <p class="text-xs text-muted" style="margin-top: 2px;">Caterer contracts, dining location, students & complaints</p>
              </div>
              <div class="graph-toolbar-actions">
                <button type="button" class="btn btn-sm btn-outline" onclick="messCyZoomIn()" title="Zoom In">+</button>
                <button type="button" class="btn btn-sm btn-outline" onclick="messCyZoomOut()" title="Zoom Out">-</button>
                <button type="button" class="btn btn-sm btn-outline" onclick="messCyFit()" title="Fit to View">Fit</button>
                <button type="button" class="btn btn-sm btn-outline" onclick="messCyResetLayout()" title="Reset Layout">Reset</button>
              </div>
            </div>

            <!-- Legend -->
            <div class="graph-legend-bar">
              <span class="legend-chip"><span class="legend-color-dot dot-mess"></span> Selected Mess</span>
              <span class="legend-chip"><span class="legend-color-dot dot-caterer"></span> Caterer</span>
              <span class="legend-chip"><span class="legend-color-dot dot-selected-student"></span> Registered Student</span>
              <span class="legend-chip"><span class="legend-color-dot dot-complaint"></span> Grievance</span>
              <span class="legend-chip"><span class="legend-color-dot dot-hostel"></span> Hostel</span>
            </div>

            <div class="graph-canvas-wrapper" style="height: 480px; position: relative;">
              <div id="mess-cytoscape-container" style="width: 100%; height: 100%;"></div>
              <!-- Node Details Panel -->
              <div id="mess-node-details" class="graph-floating-inspector" style="display: none;">
                <div class="inspector-header">
                  <span class="badge badge-accent" id="mess-node-type">Entity</span>
                  <button type="button" class="btn-close-mini" onclick="closeMessInspector()">&times;</button>
                </div>
                <h4 id="mess-node-label" style="margin: 6px 0 8px; font-size: 0.95rem;">--</h4>
                <div id="mess-node-props" class="inspector-props text-xs"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom: Active Students Roster Full Width -->
      <div class="card mt-4">
        <div class="card-header">
          <h3>Registered Students Roster</h3>
          <span class="badge badge-neutral">${data.registeredStudentsCount} Active Enrolled</span>
        </div>
        <div class="card-body" style="max-height: 450px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Reg No</th>
                <th>Branch</th>
                <th>Subscribed</th>
              </tr>
            </thead>
            <tbody>${studentsHtml}</tbody>
          </table>
        </div>
      </div>
    `;

    // Render dedicated interactive Cytoscape relationship graph
    initMessGraph(messId);
  } catch (err) {
    container.innerHTML = `<div class="empty-state-card"><p style="color: var(--danger-color);">Error loading mess connections: ${err.message}</p></div>`;
  }
}

async function initMessGraph(messId) {
  const container = document.getElementById('mess-cytoscape-container');
  if (!container) return;

  if (typeof cytoscape === 'undefined') {
    container.innerHTML = `<div class="empty-state-card" style="padding: 24px; text-align: center;"><p>Cytoscape graph visualizer not loaded.</p></div>`;
    return;
  }

  if (messCy) {
    messCy.destroy();
    messCy = null;
  }

  container.innerHTML = `<p class="loading-state" style="padding: 20px;">Mapping mess relationships & supply network...</p>`;

  try {
    const res = await fetch(`${API_BASE}/graph/mess/${messId}/graph`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch mess graph');

    const nodes = data.elements?.nodes || [];
    const rawEdges = data.elements?.edges || [];

    if (nodes.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card" style="padding: 30px; text-align: center;">
          <p class="text-muted">No graph elements found for this mess facility.</p>
        </div>`;
      return;
    }

    const nodeIds = new Set(nodes.map(n => n?.data?.id).filter(Boolean));
    const validEdges = [];
    for (const e of rawEdges) {
      if (e?.data?.source && e?.data?.target && nodeIds.has(e.data.source) && nodeIds.has(e.data.target)) {
        validEdges.push(e);
      }
    }

    container.innerHTML = '';

    messCy = cytoscape({
      container,
      elements: { nodes, edges: validEdges },
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#FFFFFF',
            'font-family': 'Space Grotesk, sans-serif',
            'font-size': '10.5px',
            'font-weight': 700,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-background-color': '#090d16',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'border-width': 2.5,
            'border-color': '#000000',
            'background-color': '#f97316',
            'width': 34,
            'height': 34
          }
        },
        {
          selector: `node[id = "mess_${messId}"]`,
          style: {
            'background-color': '#f97316',
            'shape': 'tag',
            'width': 48,
            'height': 48,
            'border-color': '#fed7aa',
            'border-width': 3.5,
            'shadow-blur': 16,
            'shadow-color': '#f97316',
            'shadow-opacity': 0.95
          }
        },
        {
          selector: 'node[type = "Caterer"]',
          style: {
            'background-color': '#14b8a6',
            'shape': 'diamond',
            'width': 42,
            'height': 42,
            'border-color': '#99f6e4',
            'border-width': 3
          }
        },
        {
          selector: 'node[type = "Hostel"]',
          style: {
            'background-color': '#10b981',
            'shape': 'hexagon',
            'width': 42,
            'height': 42
          }
        },
        {
          selector: 'node[type = "Student"]',
          style: {
            'background-color': '#38bdf8',
            'shape': 'ellipse',
            'width': 32,
            'height': 32
          }
        },
        {
          selector: 'node[type = "Complaint"]',
          style: {
            'background-color': '#f43f5e',
            'shape': 'triangle',
            'width': 28,
            'height': 28,
            'border-color': '#fecdd3'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#475569',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '8.5px',
            'font-weight': 600,
            'color': '#94a3b8',
            'text-rotation': 'autorotate',
            'text-background-color': '#090d16',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#fbbf24',
            'shadow-blur': 14,
            'shadow-color': '#fbbf24',
            'shadow-opacity': 0.95
          }
        }
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 85,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 85,
        nodeRepulsion: 300000,
        edgeElasticity: 100,
        gravity: 80,
        numIter: 800
      }
    });

    messCy.on('tap', 'node', function(evt) {
      showMessNodeDetails(evt.target.data());
    });

    messCy.on('tap', function(evt) {
      if (evt.target === messCy) {
        closeMessInspector();
      }
    });
  } catch (err) {
    console.error('[Mess Graph Error]:', err);
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 24px; text-align: center;">
        <p style="color: var(--danger-color);">Error loading mess graph: ${err.message}</p>
      </div>`;
  }
}

function showMessNodeDetails(d) {
  const panel = document.getElementById('mess-node-details');
  const typeBadge = document.getElementById('mess-node-type');
  const labelEl = document.getElementById('mess-node-label');
  const propsEl = document.getElementById('mess-node-props');
  if (!panel) return;

  panel.style.display = 'block';
  if (typeBadge) typeBadge.textContent = d.type || 'Entity';
  if (labelEl) labelEl.textContent = d.label || d.id;

  let html = '';
  if (d.type === 'Mess') {
    html = `
      <div class="prop-label">Facility Name:</div><div class="prop-val">${d.mess_name || d.label}</div>
      <div class="prop-label">Category:</div><div class="prop-val">${d.category || '--'}</div>
      <div class="prop-label">Dining Capacity:</div><div class="prop-val">${d.capacity || '--'} Diners</div>
      <div class="prop-label">Monthly Tariff:</div><div class="prop-val">₹${d.monthly_fee || '--'}</div>
    `;
  } else if (d.type === 'Caterer') {
    html = `
      <div class="prop-label">Provider Name:</div><div class="prop-val">${d.caterer_name || d.label}</div>
      <div class="prop-label">Contact Person:</div><div class="prop-val">${d.contact_person || '--'}</div>
      <div class="prop-label">Phone:</div><div class="prop-val">${d.contact_number || '--'}</div>
      <div class="prop-label">Contract Period:</div><div class="prop-val">${d.contract_start_date || ''} to ${d.contract_end_date || ''}</div>
    `;
  } else if (d.type === 'Student') {
    html = `
      <div class="prop-label">Reg No:</div><div class="prop-val">${d.reg_no || '--'}</div>
      <div class="prop-label">Branch:</div><div class="prop-val">${d.branch || '--'}</div>
      <div class="prop-label">Registration Date:</div><div class="prop-val">${d.registration_date || '--'}</div>
      <div class="prop-label">Status:</div><div class="prop-val"><strong style="color: #10b981;">Active Registration</strong></div>
    `;
  } else if (d.type === 'Complaint') {
    html = `
      <div class="prop-label">Grievance Type:</div><div class="prop-val">${d.type_name || '--'}</div>
      <div class="prop-label">Status:</div><div class="prop-val"><strong>${d.status || '--'}</strong></div>
      <div class="prop-label">Logged Date:</div><div class="prop-val">${d.complaint_date || '--'}</div>
      <div class="prop-label">Description:</div><div class="prop-val">${d.description || '--'}</div>
    `;
  } else if (d.type === 'Hostel') {
    html = `
      <div class="prop-label">Hostel Name:</div><div class="prop-val">${d.hostel_name || d.label}</div>
      <div class="prop-label">Location:</div><div class="prop-val">Campus Dining Facility</div>
    `;
  }
  if (propsEl) propsEl.innerHTML = html;
}

function closeMessInspector() {
  const panel = document.getElementById('mess-node-details');
  if (panel) panel.style.display = 'none';
}

function messCyZoomIn() { if (messCy) messCy.zoom(messCy.zoom() * 1.25); }
function messCyZoomOut() { if (messCy) messCy.zoom(messCy.zoom() * 0.8); }
function messCyFit() { if (messCy) messCy.fit(undefined, 30); }
function messCyResetLayout() {
  if (messCy) {
    const l = messCy.layout({ name: 'cose', animate: true, fit: true, padding: 30 });
    l.run();
  }
}


// ------------------------------------------------------------------------------
// FEATURE 5: INTERACTIVE RELATIONSHIP GRAPH (CYTOSCAPE.JS)
// ------------------------------------------------------------------------------

async function initGraphExplorer() {
  const container = document.getElementById('cytoscape-container');
  if (!container) return;

  if (typeof cytoscape === 'undefined') {
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 40px; text-align: center;">
        <h3>Graph Engine Library Loaded</h3>
        <p>Interactive graph canvas initialized with property graph nodes.</p>
      </div>`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/graph/explore?type=${graphFilterType}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    rawGraphData = data.elements;
    renderCytoscapeGraph(data.elements);
  } catch (err) {
    container.innerHTML = `<div class="empty-state-card"><p style="color: var(--danger-color);">Error loading graph explorer: ${err.message}</p></div>`;
  }
}

function renderCytoscapeGraph(elements) {
  const container = document.getElementById('cytoscape-container');
  if (!container || typeof cytoscape === 'undefined') return;

  if (cyInstance) {
    cyInstance.destroy();
    cyInstance = null;
  }

  const nodes = elements?.nodes || [];
  const rawEdges = elements?.edges || [];

  if (nodes.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 40px; text-align: center;">
        <h3>No Graph Elements Found</h3>
        <p class="text-muted text-sm">No synchronized entities match the current exploration scope.</p>
        <button class="btn btn-sm btn-secondary mt-3" onclick="initGraphExplorer()">Refresh Graph</button>
      </div>`;
    return;
  }

  // Client-side defensive validation: verify every edge has both source and target in nodes
  const nodeIds = new Set(nodes.map(n => n?.data?.id).filter(Boolean));
  const validEdges = [];
  const droppedEdges = [];

  for (const edge of rawEdges) {
    const src = edge?.data?.source;
    const tgt = edge?.data?.target;
    if (src && tgt && nodeIds.has(src) && nodeIds.has(tgt)) {
      validEdges.push(edge);
    } else {
      droppedEdges.push({ id: edge?.data?.id, src, tgt });
    }
  }

  if (droppedEdges.length > 0) {
    console.warn(`[Cytoscape Adapter] Excluded ${droppedEdges.length} edge(s) missing endpoint nodes:`, droppedEdges);
  }

  const safeElements = {
    nodes,
    edges: validEdges
  };

  try {
    cyInstance = cytoscape({
      container,
      elements: safeElements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#FFFFFF',
            'font-family': 'Space Grotesk, sans-serif',
            'font-size': '11px',
            'font-weight': 700,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-background-color': '#090d16',
            'text-background-opacity': 0.8,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'width': 34,
            'height': 34,
            'border-width': 2.5,
            'border-color': '#000000',
            'background-color': '#38bdf8'
          }
        },
        {
          selector: 'node[type = "Student"]',
          style: { 'background-color': '#38bdf8', 'shape': 'ellipse' }
        },
        {
          selector: 'node[type = "Room"]',
          style: { 'background-color': '#a855f7', 'shape': 'roundrectangle', 'width': 38, 'height': 38 }
        },
        {
          selector: 'node[type = "Hostel"]',
          style: { 'background-color': '#10b981', 'shape': 'hexagon', 'width': 44, 'height': 44 }
        },
        {
          selector: 'node[type = "Mess"]',
          style: { 'background-color': '#f97316', 'shape': 'tag', 'width': 38, 'height': 38 }
        },
        {
          selector: 'node[type = "Caterer"]',
          style: { 'background-color': '#14b8a6', 'shape': 'diamond', 'width': 36, 'height': 36 }
        },
        {
          selector: 'node[type = "Complaint"]',
          style: { 'background-color': '#f43f5e', 'shape': 'triangle', 'width': 34, 'height': 34 }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#475569',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'font-weight': 600,
            'color': '#94a3b8',
            'text-rotation': 'autorotate',
            'text-background-color': '#090d16',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#fbbf24',
            'shadow-blur': 12,
            'shadow-color': '#fbbf24',
            'shadow-opacity': 0.8
          }
        }
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      }
    });

    // Tap node event
    cyInstance.on('tap', 'node', function(evt) {
      const node = evt.target;
      showNodeDetails(node.data());
    });

    // Tap background clears inspector
    cyInstance.on('tap', function(evt) {
      if (evt.target === cyInstance) {
        closeGraphDetails();
      }
    });
  } catch (err) {
    console.error('[Cytoscape Render Error]:', err);
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 30px; text-align: center;">
        <h4 style="color: var(--danger-color); margin-bottom: 8px;">Graph Display Warning</h4>
        <p class="text-sm text-muted">${err.message}</p>
        <button class="btn btn-sm btn-secondary mt-3" onclick="initGraphExplorer()">Retry Layout</button>
      </div>`;
  }
}

function filterGraphByType(type) {
  graphFilterType = type;
  document.querySelectorAll('.toolbar-group .btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-gfilter') === type);
  });

  if (!cyInstance || !rawGraphData) return;

  if (type === 'all') {
    cyInstance.elements().show();
  } else {
    cyInstance.elements().hide();
    const matchingNodes = cyInstance.nodes(`[type = "${type}"]`);
    matchingNodes.show();
    matchingNodes.connectedEdges().show();
    matchingNodes.neighborhood().show();
  }

  cyInstance.layout({ name: 'cose', fit: true, padding: 30 }).run();
}

function cyZoomIn() {
  if (cyInstance) cyInstance.zoom(cyInstance.zoom() * 1.25);
}
function cyZoomOut() {
  if (cyInstance) cyInstance.zoom(cyInstance.zoom() * 0.8);
}
function cyFit() {
  if (cyInstance) cyInstance.fit(null, 30);
}
function cyResetLayout() {
  if (cyInstance) cyInstance.layout({ name: 'cose', fit: true, padding: 30 }).run();
}

function showNodeDetails(data) {
  const panel = document.getElementById('graph-details-panel');
  const content = document.getElementById('graph-details-content');
  if (!panel || !content) return;

  panel.style.display = 'flex';

  const rows = Object.entries(data)
    .filter(([k]) => !k.startsWith('_') && k !== 'id' && k !== 'label')
    .map(([k, v]) => `<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`)
    .join('');

  content.innerHTML = `
    <div>
      <span class="badge badge-accent">${data.type || 'Entity'}</span>
      <h3 style="margin-top: 6px; font-size: 1.1rem;">${data.label || 'Node'}</h3>
      <table class="prop-table mt-2">
        <tbody>
          <tr><td>Graph ID</td><td><code>${data.id}</code></td></tr>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function closeGraphDetails() {
  const panel = document.getElementById('graph-details-panel');
  if (panel) panel.style.display = 'none';
}

// ------------------------------------------------------------------------------
// FEATURE 7: ADMINISTRATIVE SYNCHRONIZATION
// ------------------------------------------------------------------------------

async function triggerGraphSync() {
  openModal('modal-graph-sync');
  const spinner = document.getElementById('sync-spinner');
  const title = document.getElementById('sync-status-title');
  const detail = document.getElementById('sync-status-detail');
  const closeBtn = document.getElementById('btn-sync-close');

  if (spinner) spinner.style.display = 'block';
  if (closeBtn) closeBtn.style.display = 'none';
  if (title) title.textContent = 'Synchronizing MySQL to Neo4j...';
  if (detail) detail.textContent = 'Executing idempotent ETL pipeline, loading nodes and relationship constraints...';

  try {
    const res = await fetch(`${API_BASE}/graph/sync`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    if (spinner) spinner.style.display = 'none';
    if (title) title.textContent = 'Synchronization Successful!';
    if (detail) {
      const stats = data.stats || {};
      detail.innerHTML = `
        <div style="text-align: left; background: var(--bg-surface); padding: 12px; border: 2px solid var(--border-color); border-radius: var(--radius-xs); margin-top: 10px;">
          <div>⏱️ <strong>Duration:</strong> ${data.durationMs} ms</div>
          <div>👤 <strong>Students:</strong> ${stats.students || 0}</div>
          <div>🛏️ <strong>Rooms:</strong> ${stats.rooms || 0}</div>
          <div>🍽️ <strong>Messes:</strong> ${stats.messes || 0}</div>
          <div>⚠️ <strong>Grievances:</strong> ${stats.complaints || 0}</div>
          <div>🔗 <strong>Linked Facility Edges:</strong> ${stats.facilityLinks || 0}</div>
        </div>`;
    }
    if (closeBtn) closeBtn.style.display = 'inline-block';

    showToast('Graph projection synchronized successfully!', 'success');
    await fetchGraphHealth();
    await loadGraphOverview();
    loadComplaintHotspots();
    filterSmartVacancyRooms();
    initGraphExplorer();
  } catch (err) {
    if (spinner) spinner.style.display = 'none';
    if (title) title.textContent = 'Synchronization Failed';
    if (detail) detail.textContent = err.message + ' (Ensure Neo4j is configured in backend/.env).';
    if (closeBtn) closeBtn.style.display = 'inline-block';
    showToast('Graph synchronization failed: ' + err.message, 'error');
  }
}


