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

  // Botón admin — toggle explícito en ambos sentidos (corrige bug donde
  // el botón quedaba visible para un rol no-admin tras cambiar de sesión)
  document.getElementById('btnAdminPanel').classList.toggle('hidden', !CAN_ADMIN_USERS());

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
    const snap = await db.collection('pozos').get();
    allPozos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Ordenar en el cliente (evita requerir índice compuesto en Firestore)
    allPozos.sort((a, b) => {
      const campoCmp = (a.campo || '').localeCompare(b.campo || '');
      if (campoCmp !== 0) return campoCmp;
      return (a.numero || 0) - (b.numero || 0);
    });
    renderSidebar(allPozos);
  } catch(e) {
    console.error('Error cargando pozos:', e);
    document.getElementById('sidebarList').innerHTML =
      `<div class="sidebar-loading" style="color:var(--red)">Error al cargar pozos.<br><span style="font-size:10px">${e.message}</span></div>`;
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
  currentSection = 'pozos';
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
  let eventos = [];
  try {
    const snap = await db.collection('pozos').doc(id).collection('eventos').get();
    eventos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    eventos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  } catch(e) {
    console.error('Error cargando historial:', e);
  }

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
  } else if (name === 'importConsumo') {
    importedData = null;
    document.getElementById('importStep1').classList.remove('hidden');
    document.getElementById('importStep2').classList.add('hidden');
    document.getElementById('btnConfirmImport').classList.add('hidden');
    document.getElementById('pdfDropLabel').textContent = 'Clic para seleccionar el PDF del corte';
    document.getElementById('consumoPdfInput').value = '';
    document.getElementById('modalImportConsumo').classList.remove('hidden');
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
  const snap = await db.collection('pozos').doc(currentPozoId).collection('eventos').get();
  const eventos = snap.docs.map(d => d.data());
  eventos.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

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

// ============================================================
//  NAVEGACIÓN ENTRE SECCIONES: POZOS / CONSUMOS
// ============================================================
let currentSection = 'pozos';

function switchSection(section) {
  currentSection = section;
  document.getElementById('tabPozos').classList.toggle('active', section === 'pozos');
  document.getElementById('tabConsumos').classList.toggle('active', section === 'consumos');
  document.getElementById('sidebarSearchWrap').classList.toggle('hidden', section !== 'pozos');
  document.getElementById('sidebarList').classList.toggle('hidden', section !== 'pozos');
  document.getElementById('sidebarListConsumos').classList.toggle('hidden', section !== 'consumos');

  if (section === 'pozos') {
    currentCampoConsumo = null;
    document.getElementById('mainTitle').textContent = currentPozoId
      ? document.getElementById('mainTitle').textContent
      : 'Selecciona un pozo';
    if (!currentPozoId) {
      document.getElementById('headerActions').innerHTML = '';
      document.getElementById('mainContent').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🚰</div>
          <p>Selecciona un pozo del panel izquierdo<br>o agrega uno nuevo.</p>
        </div>`;
    }
  } else {
    loadCamposConsumo();
    showConsumosOverview();
  }
}

// ============================================================
//  MÓDULO DE CONSUMOS
// ============================================================
let camposConsumo    = [];   // [{id, nombre}]
let currentCampoConsumo = null;
let importedData      = null; // datos extraídos del PDF antes de confirmar
let consumoChartData  = null;

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ---- Cargar lista de campos agrícolas desde Firestore ----
async function loadCamposConsumo() {
  const list = document.getElementById('sidebarListConsumos');
  if (!db) { list.innerHTML = `<div class="sidebar-loading">Firebase no configurado.</div>`; return; }

  try {
    const snap = await db.collection('camposConsumo').get();
    camposConsumo = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    camposConsumo.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));
    renderSidebarConsumos();
  } catch(e) {
    console.error(e);
    list.innerHTML = `<div class="sidebar-loading" style="color:var(--red)">Error al cargar campos.</div>`;
  }
}

function renderSidebarConsumos() {
  const list = document.getElementById('sidebarListConsumos');
  let html = `<div class="campo-label">📊 Resumen general</div>
    <div class="campo-consumo-item${currentCampoConsumo===null?' active':''}" onclick="selectCampoConsumo(null)">
      <span>Todos los campos</span>
    </div>
    <div class="campo-label" style="margin-top:6px">🌾 Campos agrícolas</div>`;

  if (camposConsumo.length === 0) {
    html += `<div class="sidebar-loading">Sin campos aún.<br>Importa un PDF para crearlos.</div>`;
  } else {
    camposConsumo.forEach(c => {
      html += `<div class="campo-consumo-item${currentCampoConsumo===c.id?' active':''}" onclick="selectCampoConsumo('${c.id}')">
        <span>${c.nombre}</span>
      </div>`;
    });
  }

  if (CAN_ADD_EVENTOS()) {
    html += `<button class="btn-import-consumo" onclick="showModal('importConsumo')">＋ Importar corte (PDF)</button>`;
  }

  list.innerHTML = html;
}

function selectCampoConsumo(campoId) {
  currentCampoConsumo = campoId;
  renderSidebarConsumos();
  if (campoId === null) showConsumosOverview();
  else showCampoConsumoDetail(campoId);
}

// ---- Vista general (todos los campos) ----
async function showConsumosOverview() {
  document.getElementById('mainTitle').textContent = 'Consumos de agua — Resumen general';
  document.getElementById('headerActions').innerHTML = CAN_ADD_EVENTOS()
    ? `<button class="btn btn-primary" onclick="showModal('importConsumo')">＋ Importar corte (PDF)</button>` : '';

  if (!db) { showFirebaseWarning(); return; }

  document.getElementById('mainContent').innerHTML = `<div class="card"><p style="font-size:13px;color:var(--gray-400)">Cargando datos de consumo...</p></div>`;

  try {
    const snap = await db.collection('cortesConsumo').get();
    const cortes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cortes.sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));

    if (cortes.length === 0) {
      document.getElementById('mainContent').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>Aún no hay cortes de consumo registrados.<br>Importa tu primer PDF para comenzar el análisis.</p>
        </div>`;
      return;
    }

    renderConsumosOverview(cortes);
  } catch(e) {
    console.error(e);
    document.getElementById('mainContent').innerHTML = `<div class="card" style="background:var(--red-light)"><p style="color:var(--red);font-size:13px">Error al cargar consumos: ${e.message}</p></div>`;
  }
}

function renderConsumosOverview(cortes) {
  // KPIs del corte más reciente
  const ultimo = cortes[cortes.length - 1];
  const totalConsumido = (ultimo.campos || []).reduce((s,c) => s + (c.sumaConsumido || 0), 0);
  const totalDotacion  = (ultimo.campos || []).reduce((s,c) => s + (c.sumaDotacion || 0), 0);
  const pctGlobal = totalDotacion ? (totalConsumido / totalDotacion * 100) : 0;
  const numPozos = (ultimo.campos || []).reduce((s,c) => s + (c.pozos||[]).length, 0);

  const fechaUltimo = formatFechaCorte(ultimo.fecha);

  let html = `
  <div class="card">
    <div class="card-title">📅 Último corte registrado: ${fechaUltimo}</div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total consumido</div><div class="kpi-value">${fmtNum(totalConsumido)}</div><div class="kpi-sub">litros</div></div>
      <div class="kpi-card"><div class="kpi-label">Total dotación</div><div class="kpi-value">${fmtNum(totalDotacion)}</div><div class="kpi-sub">litros</div></div>
      <div class="kpi-card"><div class="kpi-label">% dotación usado</div><div class="kpi-value">${pctGlobal.toFixed(1)}%</div><div class="kpi-sub">promedio global</div></div>
      <div class="kpi-card"><div class="kpi-label">Pozos reportados</div><div class="kpi-value">${numPozos}</div><div class="kpi-sub">en ${(ultimo.campos||[]).length} campos</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>📈 Histórico de consumo por campo</span>
      <span style="font-size:11px;color:var(--gray-400);font-weight:400">${cortes.length} corte(s)</span>
    </div>
    <div class="chart-wrap" id="overviewChartWrap"></div>
  </div>

  <div class="card">
    <div class="card-title">🌾 Resumen por campo — último corte</div>
    <div class="consumo-table-wrap">
      <table class="consumo-table">
        <thead><tr><th>Campo</th><th>Dotación total</th><th>Consumido</th><th>% usado</th><th>Gasto (lps)</th><th>Pozos</th></tr></thead>
        <tbody>
          ${(ultimo.campos||[]).map(c => {
            const pct = c.sumaDotacion ? (c.sumaConsumido / c.sumaDotacion * 100) : 0;
            return `<tr style="cursor:pointer" onclick="selectCampoConsumo('${campoIdByNombre(c.nombre)}')">
              <td><strong>${c.nombre}</strong></td>
              <td>${fmtNum(c.sumaDotacion)}</td>
              <td>${fmtNum(c.sumaConsumido)}</td>
              <td>${pctPill(pct)}</td>
              <td>${(c.sumaGasto||0).toFixed(1)}</td>
              <td>${(c.pozos||[]).length}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  document.getElementById('mainContent').innerHTML = html;

  // Dibujar gráfica histórica por campo
  drawLineChart('overviewChartWrap', buildCampoSeriesFromCortes(cortes), 'consumido');
}

function campoIdByNombre(nombre) {
  const c = camposConsumo.find(x => x.nombre === nombre);
  return c ? c.id : '';
}

// ---- Vista detalle de un campo ----
async function showCampoConsumoDetail(campoId) {
  const campo = camposConsumo.find(c => c.id === campoId);
  if (!campo) return;

  document.getElementById('mainTitle').textContent = `Consumos — ${campo.nombre}`;
  document.getElementById('headerActions').innerHTML = CAN_ADD_EVENTOS()
    ? `<button class="btn btn-primary" onclick="showModal('importConsumo')">＋ Importar corte (PDF)</button>` : '';

  document.getElementById('mainContent').innerHTML = `<div class="card"><p style="font-size:13px;color:var(--gray-400)">Cargando...</p></div>`;

  try {
    const snap = await db.collection('cortesConsumo').get();
    const cortes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(c => (c.campos||[]).some(cc => cc.nombre === campo.nombre));
    cortes.sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));

    if (cortes.length === 0) {
      document.getElementById('mainContent').innerHTML = `
        <div class="empty-state"><div class="empty-icon">📊</div><p>Sin cortes registrados para este campo aún.</p></div>`;
      return;
    }

    renderCampoConsumoDetail(campo, cortes);
  } catch(e) {
    console.error(e);
    document.getElementById('mainContent').innerHTML = `<div class="card" style="background:var(--red-light)"><p style="color:var(--red);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

function renderCampoConsumoDetail(campo, cortes) {
  const ultimo = cortes[cortes.length - 1];
  const datosUltimo = (ultimo.campos || []).find(c => c.nombre === campo.nombre);
  const pozos = datosUltimo ? datosUltimo.pozos : [];
  const pctCampo = datosUltimo && datosUltimo.sumaDotacion ? (datosUltimo.sumaConsumido / datosUltimo.sumaDotacion * 100) : 0;

  let html = `
  <div class="card">
    <div class="card-title">📅 Último corte: ${formatFechaCorte(ultimo.fecha)}</div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Consumido</div><div class="kpi-value">${fmtNum(datosUltimo?.sumaConsumido)}</div><div class="kpi-sub">litros</div></div>
      <div class="kpi-card"><div class="kpi-label">Dotación</div><div class="kpi-value">${fmtNum(datosUltimo?.sumaDotacion)}</div><div class="kpi-sub">litros</div></div>
      <div class="kpi-card"><div class="kpi-label">% usado</div><div class="kpi-value">${pctCampo.toFixed(1)}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Gasto</div><div class="kpi-value">${(datosUltimo?.sumaGasto||0).toFixed(1)}</div><div class="kpi-sub">lps</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">📈 Histórico de consumo — ${campo.nombre}</div>
    <div class="chart-wrap" id="campoChartWrap"></div>
  </div>

  <div class="card">
    <div class="card-title">💧 Detalle por pozo — ${formatFechaCorte(ultimo.fecha)}</div>
    <div class="consumo-table-wrap">
      <table class="consumo-table">
        <thead><tr><th>Pozo</th><th>Dotación</th><th>Lec. inicial</th><th>Lec. final</th><th>Consumido</th><th>%</th><th>Gasto (lps)</th></tr></thead>
        <tbody>
          ${pozos.map(p => `<tr>
            <td><strong>${p.pozo}</strong></td>
            <td>${fmtNum(p.dotacion)}</td>
            <td>${fmtNum(p.lecInicial)}</td>
            <td>${fmtNum(p.lecFinal)}</td>
            <td>${fmtNum(p.consumido)}</td>
            <td>${pctPill(p.pct)}</td>
            <td>${(p.gasto||0).toFixed(1)}</td>
          </tr>`).join('')}
          <tr class="row-suma">
            <td>SUMA</td>
            <td>${fmtNum(datosUltimo?.sumaDotacion)}</td>
            <td>—</td><td>—</td>
            <td>${fmtNum(datosUltimo?.sumaConsumido)}</td>
            <td>${pctCampo.toFixed(1)}%</td>
            <td>${(datosUltimo?.sumaGasto||0).toFixed(1)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-title">🗓️ Histórico de cortes — ${campo.nombre}</div>
    <div class="consumo-table-wrap">
      <table class="consumo-table">
        <thead><tr><th>Corte</th><th>Dotación total</th><th>Consumido</th><th>% usado</th><th>Gasto (lps)</th></tr></thead>
        <tbody>
          ${cortes.slice().reverse().map(c => {
            const d = (c.campos||[]).find(x => x.nombre === campo.nombre);
            if (!d) return '';
            const pct = d.sumaDotacion ? (d.sumaConsumido / d.sumaDotacion * 100) : 0;
            return `<tr>
              <td>${formatFechaCorte(c.fecha)}</td>
              <td>${fmtNum(d.sumaDotacion)}</td>
              <td>${fmtNum(d.sumaConsumido)}</td>
              <td>${pctPill(pct)}</td>
              <td>${(d.sumaGasto||0).toFixed(1)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  document.getElementById('mainContent').innerHTML = html;

  // Serie histórica solo de este campo, por pozo
  const series = {};
  cortes.forEach(c => {
    const d = (c.campos||[]).find(x => x.nombre === campo.nombre);
    if (!d) return;
    (d.pozos||[]).forEach(p => {
      if (!series[p.pozo]) series[p.pozo] = [];
      series[p.pozo].push({ fecha: c.fecha, valor: p.consumido });
    });
  });
  drawLineChart('campoChartWrap', series, 'consumido');
}

// ---- Helpers de formato ----
function fmtNum(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('es-MX');
}

function pctPill(pct) {
  if (pct === undefined || pct === null || isNaN(pct)) return '—';
  const cls = pct >= 90 ? 'pct-over' : pct >= 70 ? 'pct-warn' : 'pct-ok';
  return `<span class="pct-pill ${cls}">${pct.toFixed(1)}%</span>`;
}

function formatFechaCorte(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(fechaStr + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' });
}

function buildCampoSeriesFromCortes(cortes) {
  const series = {};
  cortes.forEach(c => {
    (c.campos||[]).forEach(cc => {
      if (!series[cc.nombre]) series[cc.nombre] = [];
      series[cc.nombre].push({ fecha: c.fecha, valor: cc.sumaConsumido });
    });
  });
  return series;
}

// ============================================================
//  GRÁFICA DE LÍNEAS (SVG nativo, sin librerías)
// ============================================================
const CHART_COLORS = ['#185FA5','#0F6E56','#854F0B','#993556','#534AB7','#3B6D11','#A32D2D','#5F5E5A'];

function drawLineChart(containerId, series, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const keys = Object.keys(series);
  if (keys.length === 0) { container.innerHTML = `<p style="font-size:12px;color:var(--gray-400)">Sin datos suficientes para graficar.</p>`; return; }

  // Fechas únicas ordenadas
  const allFechas = [...new Set(keys.flatMap(k => series[k].map(p => p.fecha)))].sort();
  if (allFechas.length < 2) {
    container.innerHTML = `<p style="font-size:12px;color:var(--gray-400)">Se necesitan al menos 2 cortes para mostrar tendencia. Por ahora solo hay ${allFechas.length}.</p>`;
    return;
  }

  const W = container.clientWidth || 600, H = 240, M = { t:20, r:20, b:34, l:60 };
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b;

  let maxVal = 0;
  keys.forEach(k => series[k].forEach(p => { if (p.valor > maxVal) maxVal = p.valor; }));
  maxVal = maxVal * 1.15 || 1;

  const xStep = plotW / (allFechas.length - 1);
  const xPos = i => M.l + i * xStep;
  const yPos = v => M.t + plotH - (v / maxVal) * plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px" role="img" aria-label="Gráfica de consumo histórico">`;

  // Grid horizontal
  for (let g = 0; g <= 4; g++) {
    const gy = M.t + plotH - (g/4) * plotH;
    svg += `<line x1="${M.l}" y1="${gy}" x2="${W-M.r}" y2="${gy}" stroke="#E5E3DA" stroke-width="1"/>`;
    svg += `<text x="${M.l-8}" y="${gy+3}" font-size="9.5" fill="#888780" text-anchor="end">${fmtNum(maxVal*g/4)}</text>`;
  }

  // Eje X labels
  allFechas.forEach((f, i) => {
    const d = new Date(f + 'T12:00:00');
    const lbl = d.toLocaleDateString('es-MX', { month:'short', year:'2-digit' });
    svg += `<text x="${xPos(i)}" y="${H-12}" font-size="9.5" fill="#888780" text-anchor="middle">${lbl}</text>`;
  });

  // Líneas por serie
  keys.forEach((k, ki) => {
    const color = CHART_COLORS[ki % CHART_COLORS.length];
    const pointsByFecha = {};
    series[k].forEach(p => pointsByFecha[p.fecha] = p.valor);

    let pathD = '';
    let points = '';
    allFechas.forEach((f, i) => {
      if (pointsByFecha[f] === undefined) return;
      const x = xPos(i), y = yPos(pointsByFecha[f]);
      pathD += (pathD === '' ? 'M' : 'L') + x + ',' + y + ' ';
      points += `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`;
    });

    svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    svg += points;
  });

  svg += `</svg>`;

  let legend = `<div class="chart-legend">`;
  keys.forEach((k, ki) => {
    legend += `<div class="chart-legend-item"><span class="chart-legend-dot" style="background:${CHART_COLORS[ki % CHART_COLORS.length]}"></span>${k}</div>`;
  });
  legend += `</div>`;

  container.innerHTML = svg + legend;
}

// ============================================================
//  IMPORTAR PDF DE CONSUMOS
// ============================================================
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function handlePdfUpload(input) {
  const file = input.files[0];
  if (!file) return;

  document.getElementById('pdfDropLabel').textContent = 'Leyendo PDF...';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Agrupar por línea usando posición Y, con tolerancia para pequeñas
      // diferencias de redondeo entre caracteres de la misma línea
      const items = content.items
        .filter(it => it.str && it.str.trim() !== '')
        .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

      items.sort((a, b) => b.y - a.y || a.x - b.x);

      const TOL = 2.5; // tolerancia en puntos para considerar misma línea
      const lineGroups = [];
      items.forEach(it => {
        let group = lineGroups.find(g => Math.abs(g.y - it.y) <= TOL);
        if (!group) { group = { y: it.y, items: [] }; lineGroups.push(group); }
        group.items.push(it);
      });

      lineGroups.sort((a, b) => b.y - a.y);
      lineGroups.forEach(g => {
        g.items.sort((a, b) => a.x - b.x);
        fullText += g.items.map(it => it.str).join(' ') + '\n';
      });
    }

    const parsed = parseConsumoPDF(fullText);

    if (!parsed.campos.length) {
      alert('No se pudo detectar la estructura esperada en el PDF. Verifica que el formato sea el mismo (Campo Agrícola / pozo / dotación / lecturas).');
      document.getElementById('pdfDropLabel').textContent = 'Clic para seleccionar el PDF del corte';
      return;
    }

    importedData = parsed;
    showImportPreview(parsed);

  } catch(e) {
    console.error(e);
    alert('Error al leer el PDF: ' + e.message);
    document.getElementById('pdfDropLabel').textContent = 'Clic para seleccionar el PDF del corte';
  }
}

// ---- Parser de texto extraído del PDF ----
function parseConsumoPDF(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const campos = [];
  let current = null;
  let fechaCorte = null;
  const numTokenRe = /^-?[\d,]*\.?\d+$/;

  lines.forEach(line => {
    // Detectar inicio de campo
    const campoMatch = line.match(/Campo\s+Agr[ií]cola\s+(.+)/i);
    if (campoMatch) {
      if (current) campos.push(current);
      current = { nombre: campoMatch[1].replace(/\.$/, '').trim(), pozos: [] };
      return;
    }

    if (!current) return;

    // Saltar líneas de encabezado
    if (/^(lec\.?\s*final|pozo\s+dotaci|vol\s*%|consumido|gasto)/i.test(line)) return;

    // Línea de fecha de corte (ej. "30-abr-26 vol % (lps)") — es encabezado, no datos
    const fechaMatch = line.match(/^(\d{1,2})-([a-zé]{3})-(\d{2,4})\b/i);
    if (fechaMatch) {
      const f = parseFechaCorta(fechaMatch[1], fechaMatch[2], fechaMatch[3]);
      if (f) fechaCorte = f;
      return;
    }

    const tokens = line.split(/\s+/);

    // Línea SUMA
    if (/^suma/i.test(tokens[0])) {
      const nums = tokens.slice(1).filter(t => numTokenRe.test(t)).map(parseNum);
      if (nums.length >= 4) {
        current.sumaDotacion  = nums[0];
        current.sumaConsumido = nums[1];
        current.sumaPct       = nums[2];
        current.sumaGasto     = nums[3];
      }
      return;
    }

    // Tomar los últimos 6 tokens numéricos consecutivos desde el final de la línea
    const numericTokens = [];
    let i = tokens.length - 1;
    while (i >= 0 && numericTokens.length < 6) {
      if (numTokenRe.test(tokens[i])) {
        numericTokens.unshift(tokens[i]);
        i--;
      } else {
        break;
      }
    }

    if (numericTokens.length >= 6) {
      const nombre = tokens.slice(0, i + 1).join(' ').trim();
      const vals = numericTokens.slice(-6).map(parseNum);
      current.pozos.push({
        pozo:       nombre || `Pozo ${current.pozos.length + 1}`,
        dotacion:   vals[0],
        lecInicial: vals[1],
        lecFinal:   vals[2],
        consumido:  vals[3],
        pct:        vals[4],
        gasto:      vals[5]
      });
    }
  });

  if (current) campos.push(current);

  // Calcular sumas si no se detectaron explícitamente
  campos.forEach(c => {
    if (c.sumaDotacion === undefined) c.sumaDotacion = c.pozos.reduce((s,p)=>s+(p.dotacion||0),0);
    if (c.sumaConsumido === undefined) c.sumaConsumido = c.pozos.reduce((s,p)=>s+(p.consumido||0),0);
    if (c.sumaGasto === undefined) c.sumaGasto = c.pozos.reduce((s,p)=>s+(p.gasto||0),0);
  });

  return { fechaCorte, campos };
}

function parseNum(str) {
  return parseFloat(str.replace(/,/g, '')) || 0;
}

function parseFechaCorta(dia, mesAbr, anio) {
  const meses = { ene:'01', feb:'02', mar:'03', abr:'04', may:'05', jun:'06', jul:'07', ago:'08', sep:'09', oct:'10', nov:'11', dic:'12' };
  const mm = meses[mesAbr.toLowerCase().substring(0,3)];
  if (!mm) return null;
  let yyyy = anio.length === 2 ? '20' + anio : anio;
  const dd = dia.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---- Vista previa editable antes de guardar ----
function showImportPreview(data) {
  document.getElementById('importStep1').classList.add('hidden');
  document.getElementById('importStep2').classList.remove('hidden');
  document.getElementById('btnConfirmImport').classList.remove('hidden');

  document.getElementById('importFechaCorte').value = data.fechaCorte || new Date().toISOString().split('T')[0];

  let html = '';
  data.campos.forEach((c, ci) => {
    html += `<div class="import-campo-block">
      <div class="import-campo-title">🌾 ${c.nombre} <span style="font-size:11px;color:var(--gray-400);font-weight:400">(${c.pozos.length} pozos)</span></div>
      <div class="consumo-table-wrap">
        <table class="consumo-table">
          <thead><tr><th>Pozo</th><th>Dotación</th><th>Lec. inicial</th><th>Lec. final</th><th>Consumido</th><th>%</th><th>Gasto</th><th></th></tr></thead>
          <tbody>
            ${c.pozos.map((p, pi) => `<tr id="prevrow-${ci}-${pi}">
              <td>${p.pozo}</td>
              <td>${fmtNum(p.dotacion)}</td>
              <td>${fmtNum(p.lecInicial)}</td>
              <td>${fmtNum(p.lecFinal)}</td>
              <td>${fmtNum(p.consumido)}</td>
              <td>${(p.pct||0).toFixed(1)}%</td>
              <td>${(p.gasto||0).toFixed(1)}</td>
              <td><button class="row-edit-btn" onclick="editImportRow(${ci},${pi})" title="Editar">✎</button></td>
            </tr>`).join('')}
            <tr class="row-suma">
              <td>SUMA</td><td>${fmtNum(c.sumaDotacion)}</td><td>—</td><td>—</td>
              <td>${fmtNum(c.sumaConsumido)}</td><td>${(c.sumaPct||0).toFixed(1)}%</td><td>${(c.sumaGasto||0).toFixed(1)}</td><td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  });

  document.getElementById('importPreviewTables').innerHTML = html;
}

function editImportRow(ci, pi) {
  const p = importedData.campos[ci].pozos[pi];
  const body = document.getElementById('editConsumoRowBody');
  body.innerHTML = `
    <div class="form-group"><label class="form-label">Nombre del pozo</label><input class="form-input" id="er_pozo" value="${p.pozo}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Dotación</label><input class="form-input" id="er_dotacion" type="number" value="${p.dotacion}"></div>
      <div class="form-group"><label class="form-label">Gasto (lps)</label><input class="form-input" id="er_gasto" type="number" value="${p.gasto}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Lectura inicial</label><input class="form-input" id="er_lecInicial" type="number" value="${p.lecInicial}"></div>
      <div class="form-group"><label class="form-label">Lectura final</label><input class="form-input" id="er_lecFinal" type="number" value="${p.lecFinal}"></div>
    </div>
    <div class="form-group"><label class="form-label">Consumido (se recalcula si dejas en blanco)</label><input class="form-input" id="er_consumido" type="number" value="${p.consumido}"></div>
  `;
  body.dataset.ci = ci;
  body.dataset.pi = pi;
  document.getElementById('modalEditConsumoRow').classList.remove('hidden');
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function saveEditConsumoRow() {
  const body = document.getElementById('editConsumoRowBody');
  const ci = parseInt(body.dataset.ci), pi = parseInt(body.dataset.pi);
  const p = importedData.campos[ci].pozos[pi];

  p.pozo       = document.getElementById('er_pozo').value;
  p.dotacion   = parseFloat(document.getElementById('er_dotacion').value) || 0;
  p.gasto      = parseFloat(document.getElementById('er_gasto').value) || 0;
  p.lecInicial = parseFloat(document.getElementById('er_lecInicial').value) || 0;
  p.lecFinal   = parseFloat(document.getElementById('er_lecFinal').value) || 0;
  const consumidoInput = document.getElementById('er_consumido').value;
  p.consumido  = consumidoInput !== '' ? parseFloat(consumidoInput) : (p.lecFinal - p.lecInicial);
  p.pct        = p.dotacion ? (p.consumido / p.dotacion * 100) : 0;

  // Recalcular sumas del campo
  const c = importedData.campos[ci];
  c.sumaDotacion  = c.pozos.reduce((s,x)=>s+(x.dotacion||0),0);
  c.sumaConsumido = c.pozos.reduce((s,x)=>s+(x.consumido||0),0);
  c.sumaGasto     = c.pozos.reduce((s,x)=>s+(x.gasto||0),0);
  c.sumaPct       = c.sumaDotacion ? (c.sumaConsumido / c.sumaDotacion * 100) : 0;

  hideModal('modalEditConsumoRow');
  showImportPreview(importedData);
}

// ---- Confirmar y guardar el corte completo en Firestore ----
async function confirmImportConsumo() {
  if (!importedData || !db) return;

  const fecha = document.getElementById('importFechaCorte').value;
  if (!fecha) { alert('Indica la fecha del corte.'); return; }

  const btn = document.getElementById('btnConfirmImport');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    // 1. Crear campos agrícolas que no existan aún
    for (const c of importedData.campos) {
      const exists = camposConsumo.find(x => x.nombre === c.nombre);
      if (!exists) {
        const ref = await db.collection('camposConsumo').add({ nombre: c.nombre, creadoEn: firebase.firestore.FieldValue.serverTimestamp() });
        camposConsumo.push({ id: ref.id, nombre: c.nombre });
      }
    }

    // 2. Guardar el corte completo (un documento por fecha, con todos los campos anidados)
    const corteData = {
      fecha,
      campos: importedData.campos.map(c => ({
        nombre: c.nombre,
        sumaDotacion: c.sumaDotacion, sumaConsumido: c.sumaConsumido,
        sumaPct: c.sumaPct, sumaGasto: c.sumaGasto,
        pozos: c.pozos
      })),
      registradoPor: currentUser.nombre,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Usar la fecha como ID para evitar duplicados si se reimporta
    await db.collection('cortesConsumo').doc(fecha).set(corteData);

    hideModal('modalImportConsumo');
    importedData = null;
    document.getElementById('importStep1').classList.remove('hidden');
    document.getElementById('importStep2').classList.add('hidden');
    document.getElementById('btnConfirmImport').classList.add('hidden');
    document.getElementById('pdfDropLabel').textContent = 'Clic para seleccionar el PDF del corte';
    document.getElementById('consumoPdfInput').value = '';

    await loadCamposConsumo();
    if (currentCampoConsumo) showCampoConsumoDetail(currentCampoConsumo);
    else showConsumosOverview();

  } catch(e) {
    console.error(e);
    alert('Error al guardar: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar corte';
  }
}

// Permitir login con Enter
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('loginScreen').classList.contains('hidden')) {
    doLogin();
  }
});
