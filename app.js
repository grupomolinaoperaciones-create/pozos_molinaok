// ============================================================
//  CONFIGURACIÓN FIREBASE — Reemplaza con tus credenciales
//  (Ver instrucciones en README.md)
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC3foXmWF93SvP1mxxj7f3k8OV1-kEePYM",
  authDomain:        "pozos-molina.firebaseapp.com",
  projectId:         "pozos-molina",
  messagingSenderId: "661435516321",
  appId:             "1:661435516321:web:4447e092379a5c0aa6f7e0"
  // storageBucket eliminado — fotos se guardan en Firestore (Base64)
};

// ============================================================
//  USUARIOS — Modifica usuarios y contraseñas aquí
//  roles: "admin" | "operador" | "visor"
// ============================================================
const DEFAULT_USERS = {
  admin: {
    password: "molina2024",
    role:     "admin",
    nombre:   "Administrador"
  },
  campo: {
    password: "campo2024",
    role:     "operador",
    nombre:   "Operador de campo"
  },
  consulta: {
    password: "ver2024",
    role:     "visor",
    nombre:   "Consulta"
  }
};

// ============================================================
//  TIPOS DE TRABAJO
// ============================================================
const TIPO_LABELS = {
  mantenimiento: "Mantenimiento general",
  bomba:         "Cambio de bomba",
  motor:         "Cambio de motor",
  preventivo:    "Mantenimiento preventivo",
  cepillado:     "Cepillado",
  sifoneo:       "Sifoneo",
  camara:        "Introducción de cámara",
  limpieza:      "Limpieza",
  parchado:      "Parchado de ademe",
  otro:          "Otro"
};

// ============================================================
//  ESTADO GLOBAL
// ============================================================
let db, storage;
let currentUser   = null;
let currentPozoId = null;
let allPozos      = [];
let usersConfig   = null;
let pendingFotos  = [];   // archivos seleccionados antes de subir
let uploadedFotoURLs = []; // URLs ya subidas a Storage

// ============================================================
//  INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Intentar iniciar Firebase
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
  } catch(e) {
    console.warn("Firebase no configurado aún:", e.message);
  }

  // Recuperar sesión
  const saved = sessionStorage.getItem('gm_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    showApp();
  }
});

// ============================================================
//  AUTH
// ============================================================
function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const err = document.getElementById('loginError');

  // Obtener config de usuarios (local o desde Firestore)
  const users = usersConfig || DEFAULT_USERS;
  const user  = users[u];

  if (!user || user.password !== p) {
    err.textContent = "Usuario o contraseña incorrectos.";
    err.classList.remove('hidden');
    return;
  }

  err.classList.add('hidden');
  currentUser = { username: u, role: user.role, nombre: user.nombre };
  sessionStorage.setItem('gm_user', JSON.stringify(currentUser));
  showApp();
}

function doLogout() {
  currentUser   = null;
  currentPozoId = null;
  sessionStorage.removeItem('gm_user');
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

// ============================================================
//  PERMISOS
// ============================================================
const CAN_EDIT_TECHNICAL = () => currentUser?.role === 'admin';
const CAN_ADD_EVENTOS    = () => ['admin','operador'].includes(currentUser?.role);
const CAN_ADD_POZOS      = () => currentUser?.role === 'admin';
const CAN_DELETE         = () => currentUser?.role === 'admin';
const CAN_ADMIN_USERS    = () => currentUser?.role === 'admin';

// ============================================================
//  MOSTRAR APP
// ============================================================
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');

  // Badge de usuario
  const roleLabel = { admin:'Admin', operador:'Operador', visor:'Visor' };
  const pillClass = { admin:'pill-admin', operador:'pill-operador', visor:'pill-visor' };
  document.getElementById('sidebarUser').innerHTML = `
    <div style="font-size:12px;color:var(--gray-600);margin-bottom:4px">${currentUser.nombre}</div>
    <span class="user-pill ${pillClass[currentUser.role]}">${roleLabel[currentUser.role]}</span>`;

  // Botón admin
  if (CAN_ADMIN_USERS()) {
    document.getElementById('btnAdminPanel').classList.remove('hidden');
  }

  // Botón agregar pozo en sidebar
  if (CAN_ADD_POZOS()) {
    const sidebar = document.getElementById('sidebarList');
    // Se añade después de cargar pozos
  }

  loadPozos();
  loadUsersConfig();
}

// ============================================================
//  FIREBASE: CARGAR POZOS
// ============================================================
async function loadPozos() {
  if (!db) {
    renderSidebar([]);
    showFirebaseWarning();
    return;
  }

  try {
    const snap = await db.collection('pozos').orderBy('campo').orderBy('numero').get();
    allPozos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSidebar(allPozos);
  } catch(e) {
    console.error(e);
    renderSidebar([]);
  }
}

async function loadUsersConfig() {
  if (!db) return;
  try {
    const doc = await db.collection('config').doc('usuarios').get();
    if (doc.exists) usersConfig = doc.data().users;
  } catch(e) {}
}

// ============================================================
//  SIDEBAR
// ============================================================
function renderSidebar(pozos, filter = '') {
  const list = document.getElementById('sidebarList');
  const filtered = filter
    ? pozos.filter(p => `${p.numero} ${p.campo}`.toLowerCase().includes(filter.toLowerCase()))
    : pozos;

  // Agrupar por campo
  const campos = {};
  filtered.forEach(p => {
    if (!campos[p.campo]) campos[p.campo] = [];
    campos[p.campo].push(p);
  });

  let html = '';
  Object.entries(campos).forEach(([campo, pozs]) => {
    html += `<div class="campo-label">📍 ${campo}</div>`;
    pozs.forEach(p => {
      const dotClass = p.estado === 'operando' ? 'dot-op' : p.estado === 'mantenimiento' ? 'dot-mtto' : 'dot-off';
      html += `<div class="pozo-item${currentPozoId===p.id?' active':''}" onclick="selectPozo('${p.id}')">
        <span class="status-dot ${dotClass}"></span>
        <span>Pozo ${p.numero}</span>
      </div>`;
    });
  });

  if (!html) html = `<div class="sidebar-loading">${filter ? 'Sin resultados.' : 'Sin pozos aún.'}</div>`;

  if (CAN_ADD_POZOS()) {
    html += `<button class="btn-add-pozo" onclick="showModal('newPozo')">＋ Agregar pozo</button>`;
  }

  list.innerHTML = html;
}

function filterPozos() {
  renderSidebar(allPozos, document.getElementById('searchInput').value);
}

// ============================================================
//  SELECCIONAR POZO
// ============================================================
async function selectPozo(id) {
  currentPozoId = id;
  renderSidebar(allPozos, document.getElementById('searchInput').value);

  // Cerrar sidebar en móvil
  document.getElementById('sidebar').classList.remove('open');

  // Cargar datos del pozo
  if (!db) { showFirebaseWarning(); return; }

  const pozo = allPozos.find(p => p.id === id);
  if (!pozo) return;

  document.getElementById('mainTitle').textContent = `Pozo ${pozo.numero} — ${pozo.campo}`;

  // Header actions
  buildHeaderActions(pozo);

  // Cargar eventos
  const snap = await db.collection('pozos').doc(id).collection('eventos')
    .orderBy('fecha', 'desc').get();
  const eventos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  renderPozoContent(pozo, eventos);
}

function buildHeaderActions(pozo) {
  const div = document.getElementById('headerActions');
  let html = `<button class="btn" onclick="exportPDF()">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Exportar PDF</button>`;

  if (CAN_ADD_EVENTOS()) {
    html += `<button class="btn btn-primary" onclick="showModal('newEvento')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Registrar trabajo</button>`;
  }

  div.innerHTML = html;
}

// ============================================================
//  RENDER POZO
// ============================================================
function renderPozoContent(pozo, eventos) {
  const estadoLabel = { operando:'En operación', mantenimiento:'En mantenimiento', fuera:'Fuera de servicio' };
  const badgeClass  = { operando:'badge-operando', mantenimiento:'badge-mantenimiento', fuera:'badge-fuera' };
  const dotClass    = pozo.estado === 'operando' ? 'dot-op' : pozo.estado === 'mantenimiento' ? 'dot-mtto' : 'dot-off';

  // Foto pozo
  const fotoPozo  = pozo.fotoPozo  ? `<img src="${pozo.fotoPozo}" alt="Foto del pozo" onclick="viewFoto('${pozo.fotoPozo}','Fotografía del pozo')">` :
    (CAN_EDIT_TECHNICAL()
      ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span class="foto-label">Clic para subir<br>foto del pozo</span>`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span class="foto-label">Sin foto</span>`);

  const fotoMotor = pozo.fotoMotor ? `<img src="${pozo.fotoMotor}" alt="Placa del motor" onclick="viewFoto('${pozo.fotoMotor}','Placa del motor')">` :
    (CAN_EDIT_TECHNICAL()
      ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span class="foto-label">Clic para subir<br>placa del motor</span>`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span class="foto-label">Sin foto</span>`);

  // Botón editar datos técnicos
  const btnEdit = CAN_EDIT_TECHNICAL()
    ? `<button class="btn" style="margin-left:auto" onclick="showEditPozo()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar</button>`
    : '';

  // Eventos HTML
  const eventosHTML = eventos.length === 0
    ? `<div style="text-align:center;padding:30px 0;color:var(--gray-400);font-size:13px">Sin registros de trabajos aún.</div>`
    : eventos.map(e => renderEvento(e)).join('');

  document.getElementById('mainContent').innerHTML = `
    <!-- FOTOS -->
    <div class="card">
      <div class="card-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Fotografías
      </div>
      <div class="fotos-grid">
        <div class="foto-box ${CAN_EDIT_TECHNICAL()?'clickable':''}" id="boxFotoPozo" onclick="${CAN_EDIT_TECHNICAL()?`uploadFotoPozo('pozo')`:''}">
          ${fotoPozo}
        </div>
        <div class="foto-box ${CAN_EDIT_TECHNICAL()?'clickable':''}" id="boxFotoMotor" onclick="${CAN_EDIT_TECHNICAL()?`uploadFotoPozo('motor')`:''}">
          ${fotoMotor}
        </div>
      </div>
      <div style="display:flex;gap:8px;font-size:11px;color:var(--gray-400);margin-top:4px">
        <span style="flex:1;text-align:center">Fotografía del pozo</span>
        <span style="flex:1;text-align:center">Placa del motor</span>
      </div>
    </div>

    <!-- DATOS TÉCNICOS -->
    <div class="card">
      <div class="card-title" style="display:flex;align-items:center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        Datos técnicos
        <span class="status-badge ${badgeClass[pozo.estado] || 'badge-operando'}">
          <span class="status-dot ${dotClass}" style="width:6px;height:6px;flex-shrink:0"></span>
          ${estadoLabel[pozo.estado] || pozo.estado}
        </span>
        ${btnEdit}
      </div>
      <div class="datos-grid">
        ${datoBox('Profundidad total', pozo.profTotal)}
        ${datoBox('Profundidad bomba', pozo.profBomba)}
        ${datoBox('No. de flechas', pozo.flechas)}
        ${datoBox('Bomba', pozo.bomba)}
        ${datoBox('Nivel estático', pozo.nivelEst)}
        ${datoBox('Nivel dinámico', pozo.nivelDin)}
        ${datoBox('LPS', pozo.lps)}
        ${datoBox('Voltaje nominal', pozo.voltaje)}
        ${datoBox('Amperaje nominal', pozo.amperaje)}
      </div>
    </div>

    <!-- HISTORIAL -->
    <div class="card">
      <div class="historial-header">
        <div class="card-title" style="margin-bottom:0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Historial de trabajos
        </div>
        <span class="historial-count">${eventos.length} ${eventos.length === 1 ? 'registro' : 'registros'}</span>
      </div>
      <div class="timeline" id="timeline">${eventosHTML}</div>
    </div>
  `;
}

function datoBox(label, value) {
  return `<div class="dato-item"><div class="dato-label">${label}</div><div class="dato-value">${value || '—'}</div></div>`;
}

function renderEvento(e) {
  const d = e.fecha ? new Date(e.fecha + 'T12:00:00') : new Date();
  const dateStr = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const fotosHTML = (e.fotos || []).map(url =>
    `<img src="${url}" class="evento-foto-thumb" alt="Foto" onclick="viewFoto('${url}','Foto de trabajo')">`
  ).join('');

  const deleteBtn = CAN_DELETE()
    ? `<button class="btn-delete-evento" onclick="deleteEvento('${e.id}')">✕ Eliminar</button>`
    : '';

  return `<div class="evento" id="evento-${e.id}">
    <div class="evento-meta">
      <span class="evento-fecha">${dateStr}</span>
      <span class="evento-tipo tipo-${e.tipo}">${TIPO_LABELS[e.tipo] || e.tipo}</span>
    </div>
    <div class="evento-desc">${e.desc}</div>
    ${fotosHTML ? `<div class="evento-fotos">${fotosHTML}</div>` : ''}
    <div class="evento-registrado">Registrado por: ${e.registradoPor || 'sistema'}</div>
    ${deleteBtn ? `<div class="evento-actions">${deleteBtn}</div>` : ''}
  </div>`;
}

// ============================================================
//  MODALES
// ============================================================
function showModal(name) {
  document.getElementById('modalOverlay').classList.remove('hidden');

  if (name === 'newEvento') {
    pendingFotos = [];
    uploadedFotoURLs = [];
    document.getElementById('ne_fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('ne_desc').value  = '';
    document.getElementById('ne_tipo').value  = 'mantenimiento';
    document.getElementById('ne_estado').value= '';
    document.getElementById('fotoPreviewGrid').innerHTML = '';
    document.getElementById('fileDropLabel').textContent = 'Clic para seleccionar imágenes';
    document.getElementById('modalNewEvento').classList.remove('hidden');
  } else if (name === 'newPozo') {
    ['np_numero','np_campo','np_profTotal','np_profBomba','np_flechas','np_bomba',
     'np_nivelEst','np_nivelDin','np_lps','np_voltaje','np_amperaje']
      .forEach(id => document.getElementById(id).value = '');
    document.getElementById('np_estado').value = 'operando';
    document.getElementById('modalNewPozo').classList.remove('hidden');
  } else if (name === 'admin') {
    renderAdminPanel();
    document.getElementById('modalAdmin').classList.remove('hidden');
  }
}

function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
  // Ocultar overlay si no hay otro modal visible
  const modals = document.querySelectorAll('.modal:not(.hidden)');
  if (modals.length === 0) document.getElementById('modalOverlay').classList.add('hidden');
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modalOverlay')) {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('modalOverlay').classList.add('hidden');
  }
}

function viewFoto(url, title) {
  document.getElementById('modalFotoTitle').textContent = title;
  document.getElementById('modalFotoImg').src = url;
  document.getElementById('modalFoto').classList.remove('hidden');
  document.getElementById('modalOverlay').classList.remove('hidden');
}

// ============================================================
//  PREVIEW FOTOS (antes de subir)
// ============================================================
function previewFotos(input) {
  const files = Array.from(input.files);
  pendingFotos = files;

  const grid = document.getElementById('fotoPreviewGrid');
  grid.innerHTML = '';
  document.getElementById('fileDropLabel').textContent = `${files.length} foto(s) seleccionada(s)`;

  files.forEach((f, i) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const div = document.createElement('div');
      div.className = 'foto-preview-item';
      div.innerHTML = `<img src="${ev.target.result}" alt="preview">
        <button class="foto-preview-remove" onclick="removePendingFoto(${i})">✕</button>`;
      grid.appendChild(div);
    };
    reader.readAsDataURL(f);
  });
}

function removePendingFoto(i) {
  pendingFotos.splice(i, 1);
  const dt = new DataTransfer();
  pendingFotos.forEach(f => dt.items.add(f));
  document.getElementById('ne_fotos').files = dt.files;
  previewFotos({ files: dt.files });
}

// ============================================================
//  GUARDAR NUEVO EVENTO
// ============================================================
// Comprime imagen a base64 con tamaño máximo
function compressImage(file, maxW = 1200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveNewEvento() {
  const fecha = document.getElementById('ne_fecha').value;
  const desc  = document.getElementById('ne_desc').value.trim();
  const tipo  = document.getElementById('ne_tipo').value;
  const nuevoEstado = document.getElementById('ne_estado').value;

  if (!fecha || !desc) { alert('Ingresa fecha y descripción.'); return; }
  if (!db) { alert('Firebase no configurado. Ver README.md'); return; }

  const btn = document.getElementById('btnGuardarEvento');
  btn.disabled = true;
  btn.textContent = 'Procesando fotos...';

  try {
    // 1. Comprimir fotos a base64
    const fotoBase64 = [];
    for (let i = 0; i < pendingFotos.length; i++) {
      btn.textContent = `Comprimiendo foto ${i+1}/${pendingFotos.length}...`;
      const b64 = await compressImage(pendingFotos[i]);
      fotoBase64.push(b64);
    }

    btn.textContent = 'Guardando...';

    // 2. Guardar evento en Firestore (fotos como base64)
    const evento = {
      fecha,
      tipo,
      desc,
      fotos: fotoBase64,
      registradoPor: currentUser.nombre,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('pozos').doc(currentPozoId).collection('eventos').add(evento);

    // 3. Actualizar estado si se indicó
    if (nuevoEstado) {
      await db.collection('pozos').doc(currentPozoId).update({ estado: nuevoEstado });
      const pozo = allPozos.find(p => p.id === currentPozoId);
      if (pozo) pozo.estado = nuevoEstado;
      renderSidebar(allPozos, document.getElementById('searchInput').value);
    }

    hideModal('modalNewEvento');
    await selectPozo(currentPozoId);

  } catch(e) {
    console.error(e);
    alert('Error al guardar: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Registrar trabajo';
    pendingFotos    = [];
  }
}

// ============================================================
//  GUARDAR NUEVO POZO
// ============================================================
async function saveNewPozo() {
  const numero = document.getElementById('np_numero').value;
  const campo  = document.getElementById('np_campo').value.trim();
  if (!numero || !campo) { alert('Ingresa número y campo del pozo.'); return; }
  if (!db) { alert('Firebase no configurado. Ver README.md'); return; }

  const pozo = {
    numero:    parseInt(numero),
    campo,
    profTotal: document.getElementById('np_profTotal').value,
    profBomba: document.getElementById('np_profBomba').value,
    flechas:   document.getElementById('np_flechas').value,
    bomba:     document.getElementById('np_bomba').value,
    nivelEst:  document.getElementById('np_nivelEst').value,
    nivelDin:  document.getElementById('np_nivelDin').value,
    lps:       document.getElementById('np_lps').value,
    voltaje:   document.getElementById('np_voltaje').value,
    amperaje:  document.getElementById('np_amperaje').value,
    estado:    document.getElementById('np_estado').value,
    fotoPozo:  null,
    fotoMotor: null,
    creadoEn:  firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const ref = await db.collection('pozos').add(pozo);
    pozo.id = ref.id;
    allPozos.push(pozo);
    allPozos.sort((a,b) => a.campo.localeCompare(b.campo) || a.numero - b.numero);
    hideModal('modalNewPozo');
    renderSidebar(allPozos);
    selectPozo(ref.id);
  } catch(e) {
    alert('Error al guardar: ' + e.message);
  }
}

// ============================================================
//  EDITAR DATOS TÉCNICOS
// ============================================================
function showEditPozo() {
  const pozo = allPozos.find(p => p.id === currentPozoId);
  if (!pozo) return;

  const fields = [
    ['profTotal','Profundidad total'],['profBomba','Profundidad bomba'],['flechas','No. de flechas'],
    ['bomba','Bomba'],['nivelEst','Nivel estático'],['nivelDin','Nivel dinámico'],
    ['lps','LPS'],['voltaje','Voltaje nominal'],['amperaje','Amperaje nominal']
  ];

  let html = '';
  fields.forEach(([key, label]) => {
    html += `<div class="form-group">
      <label class="form-label">${label}</label>
      <input class="form-input" id="edit_${key}" value="${pozo[key] || ''}">
    </div>`;
  });
  html += `<div class="form-group"><label class="form-label">Estado</label>
    <select class="form-select" id="edit_estado">
      <option value="operando" ${pozo.estado==='operando'?'selected':''}>En operación</option>
      <option value="mantenimiento" ${pozo.estado==='mantenimiento'?'selected':''}>En mantenimiento</option>
      <option value="fuera" ${pozo.estado==='fuera'?'selected':''}>Fuera de servicio</option>
    </select></div>`;

  document.getElementById('editPozoBody').innerHTML = html;
  document.getElementById('modalEditPozo').classList.remove('hidden');
  document.getElementById('modalOverlay').classList.remove('hidden');
}

async function saveEditPozo() {
  if (!db) return;
  const fields = ['profTotal','profBomba','flechas','bomba','nivelEst','nivelDin','lps','voltaje','amperaje','estado'];
  const updates = {};
  fields.forEach(k => { updates[k] = document.getElementById('edit_' + k)?.value || ''; });

  try {
    await db.collection('pozos').doc(currentPozoId).update(updates);
    const pozo = allPozos.find(p => p.id === currentPozoId);
    Object.assign(pozo, updates);
    hideModal('modalEditPozo');
    selectPozo(currentPozoId);
    renderSidebar(allPozos, document.getElementById('searchInput').value);
  } catch(e) {
    alert('Error al guardar: ' + e.message);
  }
}

// ============================================================
//  SUBIR FOTO PRINCIPAL DEL POZO
// ============================================================
function uploadFotoPozo(tipo) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async function () {
    if (!this.files[0]) return;
    if (!db) { alert('Firebase no configurado.'); return; }
    try {
      const b64 = await compressImage(this.files[0]);
      const campo = tipo === 'pozo' ? 'fotoPozo' : 'fotoMotor';
      await db.collection('pozos').doc(currentPozoId).update({ [campo]: b64 });
      const pozo = allPozos.find(p => p.id === currentPozoId);
      pozo[campo] = b64;
      selectPozo(currentPozoId);
    } catch(e) {
      alert('Error al subir foto: ' + e.message);
    }
  };
  input.click();
}

// ============================================================
//  ELIMINAR EVENTO
// ============================================================
async function deleteEvento(eventoId) {
  if (!confirm('¿Eliminar este registro del historial?')) return;
  if (!db) return;
  try {
    await db.collection('pozos').doc(currentPozoId).collection('eventos').doc(eventoId).delete();
    const el = document.getElementById('evento-' + eventoId);
    if (el) el.remove();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ============================================================
//  PANEL ADMIN — GESTIÓN DE USUARIOS
// ============================================================
function renderAdminPanel() {
  const users = usersConfig || DEFAULT_USERS;
  let html = `<p style="font-size:12px;color:var(--gray-400);margin-bottom:16px">
    Puedes cambiar usuarios, contraseñas y roles. Los cambios se guardan en la base de datos.</p>`;

  Object.entries(users).forEach(([username, data]) => {
    html += `<div class="user-admin-item">
      <div class="user-admin-name">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        ${username}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input" id="u_${username}_nombre" value="${data.nombre}">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input class="form-input" id="u_${username}_pass" value="${data.password}" type="text">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Rol</label>
        <select class="form-select" id="u_${username}_role">
          <option value="admin"    ${data.role==='admin'?'selected':''}>Admin — ver y editar todo</option>
          <option value="operador" ${data.role==='operador'?'selected':''}>Operador — agregar trabajos</option>
          <option value="visor"    ${data.role==='visor'?'selected':''}>Visor — solo lectura</option>
        </select>
      </div>
    </div>`;
  });

  document.getElementById('adminBody').innerHTML = html;
}

async function saveUsers() {
  if (!db) { alert('Firebase no configurado.'); return; }
  const users = usersConfig || DEFAULT_USERS;
  const updated = {};

  Object.keys(users).forEach(username => {
    updated[username] = {
      nombre:   document.getElementById(`u_${username}_nombre`)?.value || users[username].nombre,
      password: document.getElementById(`u_${username}_pass`)?.value   || users[username].password,
      role:     document.getElementById(`u_${username}_role`)?.value    || users[username].role,
    };
  });

  try {
    await db.collection('config').doc('usuarios').set({ users: updated });
    usersConfig = updated;
    hideModal('modalAdmin');
    alert('Usuarios actualizados correctamente.');
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ============================================================
//  EXPORTAR PDF
// ============================================================
async function exportPDF() {
  if (!db) { alert('Firebase no configurado.'); return; }
  const pozo = allPozos.find(p => p.id === currentPozoId);
  if (!pozo) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 15, CW = W - M * 2;
  let y = M;

  const LINE = () => { doc.setDrawColor(200); doc.line(M, y, W-M, y); y += 4; };
  const H1 = (txt) => {
    doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(24,95,165);
    doc.text(txt, W/2, y, { align:'center' }); y += 8;
  };
  const H2 = (txt) => {
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(50,50,50);
    doc.text(txt, M, y); y += 6;
  };
  const SMALL = (txt) => {
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100);
    doc.text(txt, M, y); y += 5;
  };

  // Encabezado
  doc.setFillColor(24, 95, 165);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255);
  doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('GRUPO MOLINA', W/2, 10, { align:'center' });
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('Sistema de Historial de Pozos', W/2, 17, { align:'center' });
  y = 30;

  // Título pozo
  H1(`POZO ${pozo.numero} — CAMPO: ${(pozo.campo||'').toUpperCase()}`);
  LINE();

  // Estado
  const estadoLabel = { operando:'EN OPERACIÓN', mantenimiento:'EN MANTENIMIENTO', fuera:'FUERA DE SERVICIO' };
  doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.setTextColor(50,50,50);
  doc.text(`Estado: ${estadoLabel[pozo.estado] || pozo.estado}`, M, y); y += 8;

  // Datos técnicos en tabla simple
  H2('DATOS TÉCNICOS');
  const datos = [
    ['Profundidad total', pozo.profTotal], ['Profundidad bomba', pozo.profBomba],
    ['No. de flechas',    pozo.flechas],   ['Bomba',             pozo.bomba],
    ['Nivel estático',    pozo.nivelEst],  ['Nivel dinámico',    pozo.nivelDin],
    ['LPS',               pozo.lps],       ['Voltaje nominal',   pozo.voltaje],
    ['Amperaje nominal',  pozo.amperaje],
  ];

  doc.setFontSize(9);
  let col = 0;
  datos.forEach(([label, val]) => {
    const xOff = col === 0 ? M : M + CW/2 + 4;
    doc.setFont('helvetica','bold'); doc.setTextColor(100);
    doc.text(label + ':', xOff, y);
    doc.setFont('helvetica','normal'); doc.setTextColor(30);
    doc.text(val || '—', xOff + 36, y);
    if (col === 1) y += 6;
    col = 1 - col;
  });
  if (col === 1) y += 6;
  y += 4;
  LINE();

  // Cargar historial
  const snap = await db.collection('pozos').doc(currentPozoId)
    .collection('eventos').orderBy('fecha','asc').get();
  const eventos = snap.docs.map(d => d.data());

  H2(`HISTORIAL DE TRABAJOS (${eventos.length} registros)`);

  if (eventos.length === 0) {
    SMALL('Sin registros de trabajos.');
  } else {
    eventos.forEach(e => {
      // Nueva página si no hay espacio
      if (y > 260) { doc.addPage(); y = M; }

      const d = new Date((e.fecha || '') + 'T12:00:00');
      const dateStr = d.toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' });

      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(24,95,165);
      doc.text(dateStr, M, y);

      doc.setFont('helvetica','bold'); doc.setTextColor(60);
      doc.text(`  •  ${TIPO_LABELS[e.tipo] || e.tipo}`, M + 28, y);
      y += 5;

      doc.setFont('helvetica','normal'); doc.setTextColor(40);
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(e.desc || '', CW - 4);
      lines.forEach(line => {
        if (y > 278) { doc.addPage(); y = M; }
        doc.text(line, M + 2, y); y += 4.5;
      });

      if (e.registradoPor) {
        doc.setTextColor(150); doc.setFontSize(7.5);
        doc.text(`Registrado por: ${e.registradoPor}`, M + 2, y); y += 3.5;
      }

      doc.setDrawColor(220); doc.line(M, y, W-M, y); y += 4;
    });
  }

  // Pie de página en cada hoja
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5); doc.setTextColor(160); doc.setFont('helvetica','normal');
    doc.text(`Grupo Molina — Pozo ${pozo.numero} ${pozo.campo} — Generado: ${new Date().toLocaleDateString('es-MX')}`, M, 292);
    doc.text(`Página ${i} / ${pages}`, W - M, 292, { align:'right' });
  }

  doc.save(`Pozo_${pozo.numero}_${(pozo.campo||'').replace(/\s/g,'_')}.pdf`);
}

// ============================================================
//  SIDEBAR MÓVIL
// ============================================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============================================================
//  AVISO FIREBASE NO CONFIGURADO
// ============================================================
function showFirebaseWarning() {
  document.getElementById('mainContent').innerHTML = `
    <div class="card" style="border-color:rgba(163,45,45,0.3);background:var(--red-light)">
      <div class="card-title" style="color:var(--red)">⚠️ Firebase no configurado</div>
      <p style="font-size:13px;line-height:1.7;color:var(--red)">
        Para usar la plataforma necesitas configurar Firebase.<br>
        Sigue los pasos en el archivo <strong>README.md</strong> incluido en el proyecto.
      </p>
    </div>`;
}

// Permitir login con Enter
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('loginScreen').classList.contains('hidden')) {
    doLogin();
  }
});
