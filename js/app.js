// Lógica de la aplicación "Menú Infantil 6m-5a"
// Todo se guarda en localStorage del navegador, no hay servidor.

const STORAGE_KEY = 'menuInfantil_v1';

let state = cargarEstado();
let vistaActual = 'menu'; // 'menu' | 'compra' | 'perfil'
let editandoPerfilId = null;
let marcadosCompartidosSesion = {};
let vistaRecetaPropiaId = null; // null = lista; 'nueva' = formulario vacío; id = editar esa receta
let mesColeSeleccionado = null; // 'YYYY-MM' seleccionado en la pestaña "Menú del cole"

const CATEGORIAS_INGREDIENTE = ['Frutas y verduras', 'Carnes y pescados', 'Lácteos y huevos', 'Cereales y legumbres', 'Otros'];

function etiquetasDisponibles() {
  const vistos = new Set();
  const combinadas = [];
  ALERGENOS.concat(NO_GUSTA_OPCIONES).forEach(o => {
    if (!vistos.has(o.etiqueta)) { vistos.add(o.etiqueta); combinadas.push(o); }
  });
  return combinadas;
}

// ---------------------------------------------------------------
// Compartir menú mediante enlace (sin cuentas ni servidor)
// ---------------------------------------------------------------
function toBase64Url(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return decodeURIComponent(escape(atob(b64)));
}

function generarEnlaceCompartido(perfil) {
  // Si el menú usa recetas propias, se incluyen completas para que quien reciba
  // el enlace pueda verlas aunque no las tenga guardadas en su propio navegador.
  const idsUsados = new Set(
    Object.values(perfil.menu || {}).flatMap(d => TIPOS_COMIDA.map(t => idDeAsignacion(d[t]))).filter(Boolean)
  );
  const recetasPropiasUsadas = (state.recetasPropias || []).filter(r => idsUsados.has(r.id));

  const payload = {
    v: 2,
    nombre: perfil.nombre,
    comidas: perfil.comidas,
    alergias: perfil.alergias || [],
    noGusta: perfil.noGusta || [],
    grupoEdad: etapaEfectiva(perfil),
    menu: perfil.menu,
    recetasPropias: recetasPropiasUsadas,
  };
  const codigo = toBase64Url(JSON.stringify(payload));
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('m', codigo);
  return url.toString();
}

function decodificarCompartido(codigo) {
  const payload = JSON.parse(fromBase64Url(codigo));
  if (!payload || !payload.v || !payload.menu) return null;
  if (!payload.recetasPropias) payload.recetasPropias = [];
  return payload;
}

// En vista compartida, busca primero entre las recetas propias que viajan en el
// enlace (por si quien lo envió usa recetas que tú no tienes guardadas).
function recetaPorIdCompartida(id) {
  const propia = (vistaCompartida && vistaCompartida.recetasPropias || []).find(r => r.id === id);
  return propia || recetaPorId(id);
}

let vistaCompartida = null;
try {
  const codigoURL = new URLSearchParams(window.location.search).get('m');
  if (codigoURL) vistaCompartida = decodificarCompartido(codigoURL);
} catch (e) { console.warn('No se pudo leer el menú compartido del enlace', e); }

function salirDeVistaCompartida() {
  vistaCompartida = null;
  marcadosCompartidosSesion = {};
  const url = new URL(window.location.href);
  url.searchParams.delete('m');
  window.history.replaceState({}, '', url.toString());
  vistaActual = 'menu';
  render();
}

function guardarPerfilDesdeCompartido() {
  const nuevo = normalizarPerfil({
    id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nombre: vistaCompartida.nombre,
    fechaNacimiento: null,
    texturaPreferida: vistaCompartida.grupoEdad,
    comidas: vistaCompartida.comidas,
    alergias: vistaCompartida.alergias,
    noGusta: vistaCompartida.noGusta,
    menu: vistaCompartida.menu,
    listaCompraMarcados: {},
  });
  state.perfiles.push(nuevo);
  state.perfilActualId = nuevo.id;
  // Incorpora también las recetas propias que venían en el enlace, si no las tenías ya
  (vistaCompartida.recetasPropias || []).forEach(r => {
    if (!(state.recetasPropias || []).some(existente => existente.id === r.id)) {
      state.recetasPropias.push(r);
    }
  });
  guardarEstado();
  salirDeVistaCompartida();
}

function abrirModalCompartir(url, nombre) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<h3>🔗 Compartir menú de ${nombre}</h3><p class="ayuda">Envía este enlace al otro padre/madre para que vea el mismo menú semanal y la lista de la compra. Si generas un menú nuevo, tendrás que volver a compartir el enlace actualizado.</p>`;

  const inputWrap = document.createElement('div');
  inputWrap.className = 'compartir-input';
  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.value = url;
  inputWrap.appendChild(input);
  modal.appendChild(inputWrap);

  const acciones = document.createElement('div');
  acciones.className = 'acciones-form';

  const btnCopiar = document.createElement('button');
  btnCopiar.type = 'button';
  btnCopiar.className = 'btn btn-primario';
  btnCopiar.textContent = '📋 Copiar enlace';
  btnCopiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      input.select();
      document.execCommand('copy');
    }
    btnCopiar.textContent = '✅ Copiado';
    setTimeout(() => { btnCopiar.textContent = '📋 Copiar enlace'; }, 1800);
  });
  acciones.appendChild(btnCopiar);

  const enlaceWhatsapp = document.createElement('a');
  enlaceWhatsapp.className = 'btn btn-secundario';
  enlaceWhatsapp.textContent = '💬 Enviar por WhatsApp';
  enlaceWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(`Menú semanal de ${nombre}: ${url}`)}`;
  enlaceWhatsapp.target = '_blank';
  enlaceWhatsapp.rel = 'noopener';
  acciones.appendChild(enlaceWhatsapp);

  const btnCerrar = document.createElement('button');
  btnCerrar.type = 'button';
  btnCerrar.className = 'btn btn-mini';
  btnCerrar.textContent = 'Cerrar';
  btnCerrar.addEventListener('click', () => overlay.remove());
  acciones.appendChild(btnCerrar);

  modal.appendChild(acciones);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  input.focus();
  input.select();
}

// ---------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------
function cargarEstado() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const datos = JSON.parse(raw);
      if (!datos.recetasPropias) datos.recetasPropias = [];
      return datos;
    }
  } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
  return { perfiles: [], perfilActualId: null, recetasPropias: [] };
}

function guardarEstado() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { console.warn('No se pudo guardar el almacenamiento local', e); }
}

// Rellena con valores por defecto los perfiles guardados antes de añadir
// meriendas / recetas propias / planificación con el cole, para que sigan funcionando.
function normalizarPerfil(perfil) {
  if (!perfil) return perfil;
  if (!perfil.comidas) perfil.comidas = { comida: true, cena: true, merienda: false };
  if (perfil.comidas.merienda === undefined) perfil.comidas.merienda = false;
  if (!perfil.menuCole) perfil.menuCole = {};
  if (perfil.usarMenuCole === undefined) perfil.usarMenuCole = false;
  if (perfil.reglaViernesPizza === undefined) perfil.reglaViernesPizza = true;
  if (perfil.finDeSemanaFuera === undefined) perfil.finDeSemanaFuera = true;
  if (perfil.semanaInicio === undefined) perfil.semanaInicio = null;
  return perfil;
}

function perfilActual() {
  return normalizarPerfil(state.perfiles.find(p => p.id === state.perfilActualId) || null);
}

// ---------------------------------------------------------------
// Cálculo de edad / etapa
// ---------------------------------------------------------------
function mesesDesde(fechaISO) {
  const nac = new Date(fechaISO);
  const hoy = new Date();
  let meses = (hoy.getFullYear() - nac.getFullYear()) * 12 + (hoy.getMonth() - nac.getMonth());
  if (hoy.getDate() < nac.getDate()) meses -= 1;
  return Math.max(0, meses);
}

function etapaAutoDesdeNacimiento(fechaISO) {
  const m = mesesDesde(fechaISO);
  if (m < 9) return '6-9';
  if (m < 12) return '9-12';
  return '1-5';
}

function subEtapaTextoEdad(perfil) {
  if (!perfil.fechaNacimiento) return null;
  const m = mesesDesde(perfil.fechaNacimiento);
  const anios = Math.floor(m / 12);
  const mesesRestantes = m % 12;
  if (m < 12) return `${m} meses`;
  return `${anios} año${anios !== 1 ? 's' : ''}${mesesRestantes ? ` y ${mesesRestantes} m` : ''}`;
}

function etapaEfectiva(perfil) {
  if (perfil.texturaPreferida && perfil.texturaPreferida !== 'auto') return perfil.texturaPreferida;
  if (perfil.fechaNacimiento) return etapaAutoDesdeNacimiento(perfil.fechaNacimiento);
  return '1-5';
}

// ---------------------------------------------------------------
// Generación de menú
// ---------------------------------------------------------------
const SENTINEL_FUERA = 'FUERA';
const SENTINEL_PIZZA = 'PIZZA_VIERNES';

function recetaPorId(id) {
  return RECIPES.find(r => r.id === id) || (state.recetasPropias || []).find(r => r.id === id) || null;
}

function poolFiltrado(lista, perfil, tipoComida, relajarNoGusta) {
  const grupo = etapaEfectiva(perfil);
  const alergias = perfil.alergias || [];
  const noGusta = perfil.noGusta || [];
  return lista
    .filter(r => r.grupoEdad === grupo && r.comida === tipoComida && !r.etiquetas.some(e => alergias.includes(e)))
    .filter(r => relajarNoGusta || !r.etiquetas.some(e => noGusta.includes(e)));
}

// Elige una receta priorizando siempre "mis recetas" sobre las genéricas; solo recurre
// a las genéricas (o repite) cuando las propias no dan más variedad esa semana.
// `filtroExtra`, si se indica, es una función receta => boolean (p.ej. para el equilibrio con el cole);
// si ese filtro deja las opciones vacías, se reintenta ignorándolo.
function elegirReceta(perfil, tipoComida, usadasIds, filtroExtra) {
  const propias = state.recetasPropias || [];
  const intentos = [
    () => poolFiltrado(propias, perfil, tipoComida, false).filter(r => !usadasIds.has(r.id)),
    () => poolFiltrado(RECIPES, perfil, tipoComida, false).filter(r => !usadasIds.has(r.id)),
    () => poolFiltrado(propias, perfil, tipoComida, false),
    () => poolFiltrado(RECIPES, perfil, tipoComida, false),
    () => poolFiltrado(propias, perfil, tipoComida, true),
    () => poolFiltrado(RECIPES, perfil, tipoComida, true),
  ];
  for (const obtenerPool of intentos) {
    let pool = obtenerPool();
    if (filtroExtra) pool = pool.filter(filtroExtra);
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  }
  if (filtroExtra) return elegirReceta(perfil, tipoComida, usadasIds, null);
  return null;
}

// ---------------------------------------------------------------
// Equilibrio comida del cole ↔ cena (reglas simples y editables a mano)
// ---------------------------------------------------------------
const EXCLUSION_PROTEINA_EQUIVALENTE = {
  pollo: ['pollo', 'pavo'],
  ternera: ['ternera'],
  pescado: ['pescado'],
  huevo: ['huevo'],
  legumbres: ['legumbres'],
};

function clasificarPlatoCole(texto) {
  const t = (texto || '').toLowerCase();
  let proteina = null;
  for (const [clave, palabras] of Object.entries(REGLAS_EQUILIBRIO.proteinas)) {
    if (palabras.some(p => t.includes(p))) { proteina = clave; break; }
  }
  const esCopioso = REGLAS_EQUILIBRIO.copioso.some(p => t.includes(p));
  return { proteina, esCopioso };
}

function filtroEquilibrio(infoCole) {
  return function (receta) {
    if (infoCole.proteina) {
      const excluir = EXCLUSION_PROTEINA_EQUIVALENTE[infoCole.proteina] || [];
      if (receta.etiquetas.some(e => excluir.includes(e))) return false;
    }
    if (infoCole.esCopioso && !receta.ligera) return false;
    return true;
  };
}

// ---------------------------------------------------------------
// Fechas de la semana planificada (solo se usan si hay menú del cole activo)
// ---------------------------------------------------------------
// Formatea una fecha LOCAL como 'YYYY-MM-DD' sin pasar por UTC
// (evita el desfase de un día que da toISOString() en husos horarios como el de España).
function formatoFechaISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lunesActualISO() {
  const hoy = new Date();
  const dow = hoy.getDay(); // 0 domingo ... 6 sábado
  const offset = dow === 0 ? -6 : 1 - dow;
  const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + offset);
  return formatoFechaISO(lunes);
}

function sumarDias(fechaISO, n) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d + n);
  return formatoFechaISO(fecha);
}

function fechaDeDia(semanaInicio, diaKey) {
  return sumarDias(semanaInicio, DIAS_SEMANA.indexOf(diaKey));
}

function fechaLegible(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function generarMenuSemanal(perfil) {
  const usadas = new Set();
  const menu = {};
  const semanaInicio = perfil.usarMenuCole ? (perfil.semanaInicio || lunesActualISO()) : null;
  if (perfil.usarMenuCole) perfil.semanaInicio = semanaInicio;

  DIAS_SEMANA.forEach(dia => {
    menu[dia] = {};
    const esFinde = dia === 'sabado' || dia === 'domingo';
    const fecha = semanaInicio ? fechaDeDia(semanaInicio, dia) : null;

    if (perfil.comidas.comida) {
      if (perfil.usarMenuCole && perfil.finDeSemanaFuera && esFinde) {
        menu[dia].comida = SENTINEL_FUERA;
      } else {
        const r = elegirReceta(perfil, 'comida', usadas);
        if (r) { menu[dia].comida = r.id; usadas.add(r.id); }
      }
    }

    if (perfil.comidas.merienda) {
      const r = elegirReceta(perfil, 'merienda', usadas);
      if (r) { menu[dia].merienda = r.id; usadas.add(r.id); }
    }

    if (perfil.comidas.cena) {
      if (perfil.usarMenuCole && perfil.reglaViernesPizza && dia === 'viernes') {
        menu[dia].cena = SENTINEL_PIZZA;
      } else if (perfil.usarMenuCole && !esFinde && fecha && perfil.menuCole[fecha]) {
        const info = clasificarPlatoCole(perfil.menuCole[fecha]);
        const r = elegirReceta(perfil, 'cena', usadas, filtroEquilibrio(info));
        if (r) { menu[dia].cena = r.id; usadas.add(r.id); }
      } else {
        const r = elegirReceta(perfil, 'cena', usadas);
        if (r) { menu[dia].cena = r.id; usadas.add(r.id); }
      }
    }
  });
  perfil.menu = menu;
  perfil.listaCompraMarcados = {};
  guardarEstado();
}

function cambiarDia(perfil, dia, tipo) {
  const usadas = new Set(
    Object.values(perfil.menu || {}).flatMap(d => TIPOS_COMIDA.map(t => idDeAsignacion(d[t]))).filter(Boolean)
  );
  const actual = idDeAsignacion(perfil.menu[dia] ? perfil.menu[dia][tipo] : null);

  let filtroExtra = null;
  if (perfil.usarMenuCole && tipo === 'cena' && perfil.semanaInicio) {
    const esFinde = dia === 'sabado' || dia === 'domingo';
    if (!esFinde && dia !== 'viernes') {
      const fecha = fechaDeDia(perfil.semanaInicio, dia);
      if (perfil.menuCole[fecha]) filtroExtra = filtroEquilibrio(clasificarPlatoCole(perfil.menuCole[fecha]));
    }
  }

  const propias = state.recetasPropias || [];
  let pool = poolFiltrado(propias, perfil, tipo, false).concat(poolFiltrado(RECIPES, perfil, tipo, false));
  if (pool.length === 0) pool = poolFiltrado(propias, perfil, tipo, true).concat(poolFiltrado(RECIPES, perfil, tipo, true));
  if (pool.length === 0) return;

  let candidatos = pool.filter(r => r.id !== actual && !usadas.has(r.id) && (!filtroExtra || filtroExtra(r)));
  if (candidatos.length === 0) candidatos = pool.filter(r => r.id !== actual && (!filtroExtra || filtroExtra(r)));
  if (candidatos.length === 0) candidatos = pool.filter(r => r.id !== actual);
  if (candidatos.length === 0) candidatos = pool;
  const nueva = candidatos[Math.floor(Math.random() * candidatos.length)];
  if (!perfil.menu[dia]) perfil.menu[dia] = {};
  perfil.menu[dia][tipo] = nueva.id;
  guardarEstado();
}

// ---------------------------------------------------------------
// Asignaciones del menú: pueden ser un id de receta, un objeto con
// ingredientes excluidos, o un valor fijo ('FUERA' / 'PIZZA_VIERNES')
// ---------------------------------------------------------------
function idDeAsignacion(asignacion) {
  if (!asignacion || asignacion === SENTINEL_FUERA || asignacion === SENTINEL_PIZZA) return null;
  if (typeof asignacion === 'string') return asignacion;
  return asignacion.id || null;
}

function excluidosDeAsignacion(asignacion) {
  if (asignacion && typeof asignacion === 'object' && asignacion.excluidos) return asignacion.excluidos;
  return [];
}

function recetaConExclusiones(receta, excluidos) {
  if (!excluidos || excluidos.length === 0) return receta;
  return Object.assign({}, receta, {
    ingredientes: receta.ingredientes.filter(ing => !excluidos.includes(ing.nombre)),
  });
}

function alternarIngredienteExcluido(perfil, dia, tipo, nombreIngrediente) {
  const actual = perfil.menu[dia][tipo];
  const id = idDeAsignacion(actual);
  if (!id) return;
  const excluidosActuales = excluidosDeAsignacion(actual);
  const excluidos = excluidosActuales.includes(nombreIngrediente)
    ? excluidosActuales.filter(n => n !== nombreIngrediente)
    : excluidosActuales.concat([nombreIngrediente]);
  perfil.menu[dia][tipo] = excluidos.length > 0 ? { id, excluidos } : id;
  guardarEstado();
}

// ---------------------------------------------------------------
// Lista de la compra
// ---------------------------------------------------------------
function generarListaCompra(perfil, buscarReceta) {
  buscarReceta = buscarReceta || recetaPorId;
  const acumulado = {}; // key: nombre|unidad|categoria -> cantidad
  if (!perfil.menu) return {};
  Object.values(perfil.menu).forEach(dia => {
    TIPOS_COMIDA.forEach(tipo => {
      const asignacion = dia[tipo];
      const id = idDeAsignacion(asignacion);
      if (!id) return;
      const recetaBase = buscarReceta(id);
      if (!recetaBase) return;
      const receta = recetaConExclusiones(recetaBase, excluidosDeAsignacion(asignacion));
      receta.ingredientes.forEach(ing => {
        const key = `${ing.nombre}|${ing.unidad}|${ing.categoria}`;
        if (!acumulado[key]) acumulado[key] = { nombre: ing.nombre, unidad: ing.unidad, categoria: ing.categoria, cantidad: 0 };
        acumulado[key].cantidad += ing.cantidad;
      });
    });
  });
  const porCategoria = {};
  Object.values(acumulado).forEach(item => {
    if (!porCategoria[item.categoria]) porCategoria[item.categoria] = [];
    porCategoria[item.categoria].push(item);
  });
  Object.values(porCategoria).forEach(lista => lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
  return porCategoria;
}

function formatoCantidad(item) {
  const cant = Number.isInteger(item.cantidad) ? item.cantidad : Math.round(item.cantidad * 10) / 10;
  return `${cant} ${item.unidad}`;
}

// ---------------------------------------------------------------
// Render: layout general
// ---------------------------------------------------------------
const app = document.getElementById('app');

function render() {
  app.innerHTML = '';

  if (vistaCompartida) {
    app.appendChild(renderHeaderCompartido());
    app.appendChild(renderNavCompartido());
    const contenidoCompartido = document.createElement('div');
    contenidoCompartido.className = 'contenido';
    if (vistaActual === 'compra') contenidoCompartido.appendChild(renderVistaCompraCompartida());
    else contenidoCompartido.appendChild(renderVistaMenuCompartida());
    app.appendChild(contenidoCompartido);
    return;
  }

  const perfil = perfilActual();
  app.appendChild(renderHeader(perfil));

  if (!perfil && vistaActual !== 'perfil') {
    app.appendChild(renderBienvenida());
    return;
  }

  if (perfil) app.appendChild(renderNav(perfil));

  const contenido = document.createElement('div');
  contenido.className = 'contenido';
  if (vistaActual === 'menu') contenido.appendChild(renderVistaMenu(perfil));
  else if (vistaActual === 'compra') contenido.appendChild(renderVistaCompra(perfil));
  else if (vistaActual === 'recetas') contenido.appendChild(renderVistaRecetas());
  else if (vistaActual === 'cole' && perfil.usarMenuCole) contenido.appendChild(renderVistaCole(perfil));
  else if (vistaActual === 'perfil') contenido.appendChild(renderVistaPerfil(perfil));
  app.appendChild(contenido);
}

// ---------------------------------------------------------------
// Vista compartida (solo lectura, recibida por enlace)
// ---------------------------------------------------------------
function renderHeaderCompartido() {
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `<div class="titulo"><h1>🍽️ Menú Infantil</h1><p>Menú compartido de ${vistaCompartida.nombre}</p></div>`;

  const acciones = document.createElement('div');
  acciones.className = 'selector-perfil';

  const btnGuardar = document.createElement('button');
  btnGuardar.className = 'btn btn-primario';
  btnGuardar.textContent = '➕ Guardar como mi perfil';
  btnGuardar.addEventListener('click', guardarPerfilDesdeCompartido);
  acciones.appendChild(btnGuardar);

  const btnSalir = document.createElement('button');
  btnSalir.className = 'btn btn-mini';
  btnSalir.textContent = '✖ Salir';
  btnSalir.addEventListener('click', salirDeVistaCompartida);
  acciones.appendChild(btnSalir);

  header.appendChild(acciones);
  return header;
}

function renderNavCompartido() {
  const nav = document.createElement('nav');
  nav.className = 'tabs';
  const tabs = [
    { id: 'menu', label: '📅 Menú semanal' },
    { id: 'compra', label: '🛒 Lista de la compra' },
  ];
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (vistaActual === t.id ? ' activo' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => { vistaActual = t.id; render(); });
    nav.appendChild(btn);
  });
  return nav;
}

function renderVistaMenuCompartida() {
  const wrap = document.createElement('div');
  wrap.className = 'vista-menu';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const info = document.createElement('div');
  info.className = 'info-etapa';
  const etapa = vistaCompartida.grupoEdad;
  info.innerHTML = `<strong>${vistaCompartida.nombre}</strong> · ${ETAPAS[etapa].nombre} (${ETAPAS[etapa].descripcionTextura}) · <em>solo lectura</em>`;
  toolbar.appendChild(info);
  wrap.appendChild(toolbar);

  const tabla = document.createElement('div');
  tabla.className = 'tabla-menu';
  const tipos = TIPOS_COMIDA.filter(t => vistaCompartida.comidas[t]);

  DIAS_SEMANA.forEach(dia => {
    const col = document.createElement('div');
    col.className = 'columna-dia';
    const h3 = document.createElement('h3');
    h3.textContent = DIAS_SEMANA_LABEL[dia];
    col.appendChild(h3);
    tipos.forEach(tipo => {
      const asignacion = vistaCompartida.menu[dia] ? vistaCompartida.menu[dia][tipo] : null;
      const id = idDeAsignacion(asignacion);
      const recetaBase = id ? recetaPorIdCompartida(id) : null;
      const receta = recetaBase ? recetaConExclusiones(recetaBase, excluidosDeAsignacion(asignacion)) : null;
      col.appendChild(renderTarjetaComida(null, dia, tipo, asignacion, receta, true));
    });
    tabla.appendChild(col);
  });
  wrap.appendChild(tabla);
  return wrap;
}

function renderVistaCompraCompartida() {
  const wrap = document.createElement('div');
  wrap.className = 'vista-compra';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `<div class="info-etapa"><strong>Lista de la compra</strong> — menú compartido de ${vistaCompartida.nombre}</div>`;
  const btnImprimir = document.createElement('button');
  btnImprimir.className = 'btn btn-secundario no-imprimir';
  btnImprimir.textContent = '🖨️ Imprimir';
  btnImprimir.addEventListener('click', () => window.print());
  toolbar.appendChild(btnImprimir);
  wrap.appendChild(toolbar);

  const perfilTemporal = { menu: vistaCompartida.menu, listaCompraMarcados: marcadosCompartidosSesion };
  const porCategoria = generarListaCompra(perfilTemporal, recetaPorIdCompartida);
  const categoriasOrden = ['Frutas y verduras', 'Carnes y pescados', 'Lácteos y huevos', 'Cereales y legumbres', 'Otros'];

  const lista = document.createElement('div');
  lista.className = 'lista-compra';
  categoriasOrden.forEach(cat => {
    const items = porCategoria[cat];
    if (!items || items.length === 0) return;
    const grupo = document.createElement('div');
    grupo.className = 'grupo-compra';
    const h3 = document.createElement('h3');
    h3.textContent = cat;
    grupo.appendChild(h3);
    const ul = document.createElement('ul');
    items.forEach(item => {
      const key = `${item.nombre}|${item.unidad}|${item.categoria}`;
      const li = document.createElement('li');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!marcadosCompartidosSesion[key];
      checkbox.addEventListener('change', () => {
        marcadosCompartidosSesion[key] = checkbox.checked;
        li.classList.toggle('marcado', checkbox.checked);
      });
      label.appendChild(checkbox);
      const span = document.createElement('span');
      span.textContent = ` ${item.nombre} — ${formatoCantidad(item)}`;
      label.appendChild(span);
      li.appendChild(label);
      if (marcadosCompartidosSesion[key]) li.classList.add('marcado');
      ul.appendChild(li);
    });
    grupo.appendChild(ul);
    lista.appendChild(grupo);
  });
  wrap.appendChild(lista);
  return wrap;
}

function renderHeader(perfil) {
  const header = document.createElement('header');
  header.className = 'app-header';

  const titulo = document.createElement('div');
  titulo.className = 'titulo';
  titulo.innerHTML = `<h1>🍽️ Menú Infantil</h1><p>De 6 meses a 5 años</p>`;
  header.appendChild(titulo);

  const selectorWrap = document.createElement('div');
  selectorWrap.className = 'selector-perfil';

  if (state.perfiles.length > 0) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Seleccionar perfil');
    state.perfiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nombre;
      if (p.id === state.perfilActualId) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', e => {
      state.perfilActualId = e.target.value;
      vistaActual = 'menu';
      guardarEstado();
      render();
    });
    selectorWrap.appendChild(select);
  }

  const btnNuevo = document.createElement('button');
  btnNuevo.className = 'btn btn-secundario';
  btnNuevo.textContent = '+ Nuevo perfil';
  btnNuevo.addEventListener('click', () => {
    editandoPerfilId = null;
    vistaActual = 'perfil';
    render();
  });
  selectorWrap.appendChild(btnNuevo);

  header.appendChild(selectorWrap);
  return header;
}

function renderBienvenida() {
  const div = document.createElement('div');
  div.className = 'bienvenida';
  div.innerHTML = `
    <h2>¡Bienvenido/a!</h2>
    <p>Crea el primer perfil de tu peque para generar menús semanales adaptados a su edad, su textura de alimentación y sus gustos.</p>
  `;
  const btn = document.createElement('button');
  btn.className = 'btn btn-primario';
  btn.textContent = 'Crear primer perfil';
  btn.addEventListener('click', () => {
    editandoPerfilId = null;
    vistaActual = 'perfil';
    render();
  });
  div.appendChild(btn);
  return div;
}

function renderNav(perfil) {
  const nav = document.createElement('nav');
  nav.className = 'tabs';
  const tabs = [
    { id: 'menu', label: '📅 Menú semanal' },
    { id: 'compra', label: '🛒 Lista de la compra' },
    { id: 'recetas', label: '📖 Mis recetas' },
  ];
  if (perfil && perfil.usarMenuCole) tabs.push({ id: 'cole', label: '🏫 Menú del cole' });
  tabs.push({ id: 'perfil', label: '👤 Perfil' });
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (vistaActual === t.id ? ' activo' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => { vistaActual = t.id; render(); });
    nav.appendChild(btn);
  });
  return nav;
}

// ---------------------------------------------------------------
// Vista: Menú semanal
// ---------------------------------------------------------------
function renderVistaMenu(perfil) {
  const wrap = document.createElement('div');
  wrap.className = 'vista-menu';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const info = document.createElement('div');
  info.className = 'info-etapa';
  const etapa = etapaEfectiva(perfil);
  const edadTxt = subEtapaTextoEdad(perfil);
  info.innerHTML = `<strong>${perfil.nombre}</strong> · ${ETAPAS[etapa].nombre} (${ETAPAS[etapa].descripcionTextura})${edadTxt ? ` · ${edadTxt}` : ''}`;
  toolbar.appendChild(info);

  const btnGenerar = document.createElement('button');
  btnGenerar.className = 'btn btn-primario';
  btnGenerar.textContent = perfil.menu ? '🔁 Generar nuevo menú semanal' : '✨ Generar menú semanal';
  btnGenerar.addEventListener('click', () => {
    if (perfil.menu && !confirm('Esto sustituirá el menú semanal actual. ¿Continuar?')) return;
    generarMenuSemanal(perfil);
    render();
  });
  toolbar.appendChild(btnGenerar);

  if (perfil.menu) {
    const btnCompartir = document.createElement('button');
    btnCompartir.className = 'btn btn-secundario';
    btnCompartir.textContent = '🔗 Compartir';
    btnCompartir.addEventListener('click', () => {
      abrirModalCompartir(generarEnlaceCompartido(perfil), perfil.nombre);
    });
    toolbar.appendChild(btnCompartir);
  }

  wrap.appendChild(toolbar);

  if (perfil.usarMenuCole) {
    const filaSemana = document.createElement('div');
    filaSemana.className = 'toolbar';
    const labelSemana = document.createElement('label');
    labelSemana.className = 'campo-inline';
    labelSemana.innerHTML = '<span>Semana a planificar (lunes):</span>';
    const inputSemana = document.createElement('input');
    inputSemana.type = 'date';
    inputSemana.value = perfil.semanaInicio || lunesActualISO();
    inputSemana.addEventListener('change', () => {
      if (!inputSemana.value) return;
      perfil.semanaInicio = inputSemana.value;
      guardarEstado();
      render();
    });
    labelSemana.appendChild(inputSemana);
    filaSemana.appendChild(labelSemana);
    wrap.appendChild(filaSemana);
  }

  if (!perfil.menu) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'Todavía no hay menú generado para este perfil. Pulsa "Generar menú semanal" para crear uno.';
    wrap.appendChild(vacio);
    return wrap;
  }

  const tabla = document.createElement('div');
  tabla.className = 'tabla-menu';

  const tipos = TIPOS_COMIDA.filter(t => perfil.comidas[t]);

  DIAS_SEMANA.forEach(dia => {
    const col = document.createElement('div');
    col.className = 'columna-dia';
    const h3 = document.createElement('h3');
    h3.textContent = DIAS_SEMANA_LABEL[dia];
    col.appendChild(h3);

    tipos.forEach(tipo => {
      const asignacion = perfil.menu[dia] ? perfil.menu[dia][tipo] : null;
      const id = idDeAsignacion(asignacion);
      const recetaBase = id ? recetaPorId(id) : null;
      const receta = recetaBase ? recetaConExclusiones(recetaBase, excluidosDeAsignacion(asignacion)) : null;
      col.appendChild(renderTarjetaComida(perfil, dia, tipo, asignacion, receta, false));
    });

    tabla.appendChild(col);
  });

  wrap.appendChild(tabla);
  return wrap;
}

function renderTarjetaComida(perfil, dia, tipo, asignacion, receta, soloLectura) {
  const card = document.createElement('div');
  card.className = 'tarjeta-comida';

  const etiqueta = document.createElement('div');
  etiqueta.className = 'etiqueta-tipo';
  etiqueta.textContent = TIPOS_COMIDA_LABEL[tipo] || tipo;
  card.appendChild(etiqueta);

  if (asignacion === SENTINEL_FUERA) {
    const nombre = document.createElement('p');
    nombre.className = 'nombre-receta';
    nombre.textContent = '🍽️ Come fuera de casa';
    card.appendChild(nombre);
    if (!soloLectura) {
      const btnCambiar = document.createElement('button');
      btnCambiar.className = 'btn btn-cambiar';
      btnCambiar.textContent = '🔄 Planificar igualmente';
      btnCambiar.addEventListener('click', () => { cambiarDia(perfil, dia, tipo); render(); });
      card.appendChild(btnCambiar);
    }
    return card;
  }

  if (asignacion === SENTINEL_PIZZA) {
    const nombre = document.createElement('p');
    nombre.className = 'nombre-receta';
    nombre.textContent = '🍕 Noche de pizza';
    card.appendChild(nombre);
    const nota = document.createElement('p');
    nota.className = 'textura-receta';
    nota.textContent = 'Regla fija de los viernes';
    card.appendChild(nota);
    if (!soloLectura) {
      const btnCambiar = document.createElement('button');
      btnCambiar.className = 'btn btn-cambiar';
      btnCambiar.textContent = '🔄 Cambiar por otra cosa';
      btnCambiar.addEventListener('click', () => { cambiarDia(perfil, dia, tipo); render(); });
      card.appendChild(btnCambiar);
    }
    return card;
  }

  if (!receta) {
    const vacio = document.createElement('p');
    vacio.className = 'sin-receta';
    vacio.textContent = 'Sin opciones disponibles con los filtros actuales.';
    card.appendChild(vacio);
    return card;
  }

  const nombre = document.createElement('p');
  nombre.className = 'nombre-receta';
  nombre.textContent = receta.nombre;
  card.appendChild(nombre);

  const textura = document.createElement('p');
  textura.className = 'textura-receta';
  textura.textContent = receta.textura;
  card.appendChild(textura);

  const detalles = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Ver receta completa';
  detalles.appendChild(summary);

  const tituloIngredientes = document.createElement('p');
  tituloIngredientes.className = 'subtitulo-receta';
  tituloIngredientes.textContent = 'Ingredientes';
  detalles.appendChild(tituloIngredientes);

  const excluidosActuales = excluidosDeAsignacion(asignacion);
  const ul = document.createElement('ul');
  receta.ingredientes.forEach(ing => {
    const li = document.createElement('li');
    if (soloLectura) {
      li.textContent = `${ing.nombre} — ${formatoCantidad(ing)}`;
    } else {
      const label = document.createElement('label');
      label.className = 'checkbox-ingrediente';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.title = 'Desmárcalo para quitar este ingrediente de este día';
      checkbox.addEventListener('change', () => {
        alternarIngredienteExcluido(perfil, dia, tipo, ing.nombre);
        render();
      });
      label.appendChild(checkbox);
      const span = document.createElement('span');
      span.textContent = ` ${ing.nombre} — ${formatoCantidad(ing)}`;
      label.appendChild(span);
      li.appendChild(label);
    }
    ul.appendChild(li);
  });
  detalles.appendChild(ul);

  if (excluidosActuales.length > 0) {
    const notaExcluidos = document.createElement('p');
    notaExcluidos.className = 'ayuda';
    notaExcluidos.textContent = `Sin: ${excluidosActuales.join(', ')}`;
    detalles.appendChild(notaExcluidos);
  }

  if (receta.preparacion) {
    const tituloPrep = document.createElement('p');
    tituloPrep.className = 'subtitulo-receta';
    tituloPrep.textContent = 'Preparación';
    detalles.appendChild(tituloPrep);

    const prep = document.createElement('p');
    prep.className = 'texto-preparacion';
    prep.textContent = receta.preparacion;
    detalles.appendChild(prep);
  }

  card.appendChild(detalles);

  if (!soloLectura) {
    const btnCambiar = document.createElement('button');
    btnCambiar.className = 'btn btn-cambiar';
    btnCambiar.textContent = '🔄 Cambiar';
    btnCambiar.addEventListener('click', () => {
      cambiarDia(perfil, dia, tipo);
      render();
    });
    card.appendChild(btnCambiar);
  }

  return card;
}

// ---------------------------------------------------------------
// Vista: Lista de la compra
// ---------------------------------------------------------------
function renderVistaCompra(perfil) {
  const wrap = document.createElement('div');
  wrap.className = 'vista-compra';

  if (!perfil.menu) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'Genera primero un menú semanal para poder crear la lista de la compra.';
    wrap.appendChild(vacio);
    return wrap;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `<div class="info-etapa"><strong>Lista de la compra</strong> — menú semanal de ${perfil.nombre}</div>`;
  const btnImprimir = document.createElement('button');
  btnImprimir.className = 'btn btn-secundario no-imprimir';
  btnImprimir.textContent = '🖨️ Imprimir';
  btnImprimir.addEventListener('click', () => window.print());
  toolbar.appendChild(btnImprimir);
  wrap.appendChild(toolbar);

  const porCategoria = generarListaCompra(perfil);
  const categoriasOrden = ['Frutas y verduras', 'Carnes y pescados', 'Lácteos y huevos', 'Cereales y legumbres', 'Otros'];
  if (!perfil.listaCompraMarcados) perfil.listaCompraMarcados = {};

  const lista = document.createElement('div');
  lista.className = 'lista-compra';

  categoriasOrden.forEach(cat => {
    const items = porCategoria[cat];
    if (!items || items.length === 0) return;
    const grupo = document.createElement('div');
    grupo.className = 'grupo-compra';
    const h3 = document.createElement('h3');
    h3.textContent = cat;
    grupo.appendChild(h3);
    const ul = document.createElement('ul');
    items.forEach(item => {
      const key = `${item.nombre}|${item.unidad}|${item.categoria}`;
      const li = document.createElement('li');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!perfil.listaCompraMarcados[key];
      checkbox.addEventListener('change', () => {
        perfil.listaCompraMarcados[key] = checkbox.checked;
        guardarEstado();
        li.classList.toggle('marcado', checkbox.checked);
      });
      label.appendChild(checkbox);
      const span = document.createElement('span');
      span.textContent = ` ${item.nombre} — ${formatoCantidad(item)}`;
      label.appendChild(span);
      li.appendChild(label);
      if (perfil.listaCompraMarcados[key]) li.classList.add('marcado');
      ul.appendChild(li);
    });
    grupo.appendChild(ul);
    lista.appendChild(grupo);
  });

  wrap.appendChild(lista);
  return wrap;
}

// ---------------------------------------------------------------
// Vista: Perfil (creación / edición)
// ---------------------------------------------------------------
function renderVistaPerfil(perfilVisible) {
  const perfilEnEdicion = editandoPerfilId ? state.perfiles.find(p => p.id === editandoPerfilId) : null;
  const esNuevo = !perfilEnEdicion;
  const datos = perfilEnEdicion || normalizarPerfil({
    id: null,
    nombre: '',
    fechaNacimiento: '',
    texturaPreferida: 'auto',
    comidas: { comida: true, cena: true, merienda: false },
    alergias: [],
    noGusta: [],
  });

  const wrap = document.createElement('div');
  wrap.className = 'vista-perfil';

  const form = document.createElement('form');
  form.className = 'form-perfil';

  form.innerHTML = `<h2>${esNuevo ? 'Nuevo perfil' : `Editar perfil: ${datos.nombre}`}</h2>`;

  // Nombre
  const campoNombre = campoTexto('Nombre', 'nombre', datos.nombre, true);
  form.appendChild(campoNombre.wrapper);

  // Fecha de nacimiento
  const grupoFecha = document.createElement('div');
  grupoFecha.className = 'campo';
  grupoFecha.innerHTML = `<label for="fecha-nacimiento">Fecha de nacimiento (opcional)</label>`;
  const inputFecha = document.createElement('input');
  inputFecha.type = 'date';
  inputFecha.id = 'fecha-nacimiento';
  inputFecha.value = datos.fechaNacimiento || '';
  inputFecha.max = formatoFechaISO(new Date());
  grupoFecha.appendChild(inputFecha);
  form.appendChild(grupoFecha);

  // Textura / etapa
  const grupoTextura = document.createElement('div');
  grupoTextura.className = 'campo';
  grupoTextura.innerHTML = `<label for="textura">Textura / etapa</label>`;
  const selectTextura = document.createElement('select');
  selectTextura.id = 'textura';
  const opciones = [
    { v: 'auto', t: 'Automática según la fecha de nacimiento' },
    { v: '6-9', t: '6-9 meses — puré fino' },
    { v: '9-12', t: '9-12 meses — puré con grumos / trocitos' },
    { v: '1-5', t: '1-5 años — sólido' },
  ];
  opciones.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.v; opt.textContent = o.t;
    if (datos.texturaPreferida === o.v) opt.selected = true;
    selectTextura.appendChild(opt);
  });
  grupoTextura.appendChild(selectTextura);
  const ayudaTextura = document.createElement('p');
  ayudaTextura.className = 'ayuda';
  ayudaTextura.textContent = 'Elige una etapa manual si tu peque va por delante o por detrás del ritmo habitual.';
  grupoTextura.appendChild(ayudaTextura);
  form.appendChild(grupoTextura);

  // Comidas incluidas
  const grupoComidas = document.createElement('div');
  grupoComidas.className = 'campo';
  grupoComidas.innerHTML = `<label>Comidas a planificar</label>`;
  const chkComida = checkboxConLabel('incluir-comida', 'Comida (almuerzo)', datos.comidas.comida);
  const chkMerienda = checkboxConLabel('incluir-merienda', 'Merienda', datos.comidas.merienda);
  const chkCena = checkboxConLabel('incluir-cena', 'Cena', datos.comidas.cena);
  grupoComidas.appendChild(chkComida.wrapper);
  grupoComidas.appendChild(chkMerienda.wrapper);
  grupoComidas.appendChild(chkCena.wrapper);
  form.appendChild(grupoComidas);

  // Alergias
  const grupoAlergias = document.createElement('div');
  grupoAlergias.className = 'campo';
  grupoAlergias.innerHTML = `<label>Alergias / intolerancias (se excluyen siempre)</label>`;
  const contAlergias = document.createElement('div');
  contAlergias.className = 'chips';
  const chksAlergias = ALERGENOS.map(a => checkboxConLabel(`alergia-${a.id}`, a.nombre, (datos.alergias || []).includes(a.etiqueta), a.etiqueta));
  chksAlergias.forEach(c => contAlergias.appendChild(c.wrapper));
  grupoAlergias.appendChild(contAlergias);
  form.appendChild(grupoAlergias);

  // No le gusta
  const grupoNoGusta = document.createElement('div');
  grupoNoGusta.className = 'campo';
  grupoNoGusta.innerHTML = `<label>No le gusta (se evita cuando sea posible)</label>`;
  const contNoGusta = document.createElement('div');
  contNoGusta.className = 'chips';
  const chksNoGusta = NO_GUSTA_OPCIONES.map(n => checkboxConLabel(`nogusta-${n.id}`, n.nombre, (datos.noGusta || []).includes(n.etiqueta), n.etiqueta));
  chksNoGusta.forEach(c => contNoGusta.appendChild(c.wrapper));
  grupoNoGusta.appendChild(contNoGusta);
  form.appendChild(grupoNoGusta);

  // Planificación con el cole
  const grupoCole = document.createElement('div');
  grupoCole.className = 'campo';
  grupoCole.innerHTML = '<label>Planificación con el cole (opcional)</label>';
  const chkUsarCole = checkboxConLabel('usar-menu-cole', 'Ajustar las cenas según lo que come en el cole', datos.usarMenuCole);
  grupoCole.appendChild(chkUsarCole.wrapper);
  const chkViernesPizza = checkboxConLabel('regla-viernes-pizza', 'Los viernes, cena fija: pizza 🍕', datos.reglaViernesPizza);
  grupoCole.appendChild(chkViernesPizza.wrapper);
  const chkFindeFuera = checkboxConLabel('finde-fuera', 'Los findes come fuera (no planificar comida ese día)', datos.finDeSemanaFuera);
  grupoCole.appendChild(chkFindeFuera.wrapper);
  const ayudaCole = document.createElement('p');
  ayudaCole.className = 'ayuda';
  ayudaCole.textContent = 'Al activarlo aparece una pestaña "Menú del cole" donde escribes cada mes lo que come al mediodía; la app evita repetir la misma proteína por la noche y sugiere una cena ligera si el mediodía fue copioso.';
  grupoCole.appendChild(ayudaCole);
  form.appendChild(grupoCole);

  // Aviso
  const aviso = document.createElement('p');
  aviso.className = 'aviso';
  aviso.textContent = '⚠️ Esta guía es orientativa. Consulta con tu pediatra o nutricionista, especialmente sobre la introducción de alérgenos y el ritmo de cada niño/a.';
  form.appendChild(aviso);

  // Botones
  const acciones = document.createElement('div');
  acciones.className = 'acciones-form';
  const btnGuardar = document.createElement('button');
  btnGuardar.type = 'submit';
  btnGuardar.className = 'btn btn-primario';
  btnGuardar.textContent = esNuevo ? 'Crear perfil' : 'Guardar cambios';
  acciones.appendChild(btnGuardar);

  if (!esNuevo) {
    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'btn btn-peligro';
    btnEliminar.textContent = 'Eliminar perfil';
    btnEliminar.addEventListener('click', () => {
      if (!confirm(`¿Eliminar el perfil de ${datos.nombre}? Esta acción no se puede deshacer.`)) return;
      state.perfiles = state.perfiles.filter(p => p.id !== datos.id);
      if (state.perfilActualId === datos.id) {
        state.perfilActualId = state.perfiles.length > 0 ? state.perfiles[0].id : null;
      }
      editandoPerfilId = null;
      vistaActual = 'menu';
      guardarEstado();
      render();
    });
    acciones.appendChild(btnEliminar);
  }
  form.appendChild(acciones);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const nombre = campoNombre.input.value.trim();
    if (!nombre) { campoNombre.input.focus(); return; }
    const comidas = { comida: chkComida.input.checked, cena: chkCena.input.checked, merienda: chkMerienda.input.checked };
    if (!comidas.comida && !comidas.cena && !comidas.merienda) {
      alert('Selecciona al menos "Comida", "Merienda" o "Cena".');
      return;
    }
    const alergias = chksAlergias.filter(c => c.input.checked).map(c => c.valor);
    const noGusta = chksNoGusta.filter(c => c.input.checked).map(c => c.valor);
    const usarMenuCole = chkUsarCole.input.checked;
    const reglaViernesPizza = chkViernesPizza.input.checked;
    const finDeSemanaFuera = chkFindeFuera.input.checked;

    if (esNuevo) {
      const nuevoPerfil = normalizarPerfil({
        id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        nombre,
        fechaNacimiento: inputFecha.value || null,
        texturaPreferida: selectTextura.value,
        comidas,
        alergias,
        noGusta,
        usarMenuCole,
        reglaViernesPizza,
        finDeSemanaFuera,
        menuCole: {},
        semanaInicio: null,
        menu: null,
        listaCompraMarcados: {},
      });
      state.perfiles.push(nuevoPerfil);
      state.perfilActualId = nuevoPerfil.id;
      generarMenuSemanal(nuevoPerfil);
    } else {
      perfilEnEdicion.nombre = nombre;
      perfilEnEdicion.fechaNacimiento = inputFecha.value || null;
      perfilEnEdicion.texturaPreferida = selectTextura.value;
      perfilEnEdicion.comidas = comidas;
      perfilEnEdicion.alergias = alergias;
      perfilEnEdicion.noGusta = noGusta;
      perfilEnEdicion.usarMenuCole = usarMenuCole;
      perfilEnEdicion.reglaViernesPizza = reglaViernesPizza;
      perfilEnEdicion.finDeSemanaFuera = finDeSemanaFuera;
      guardarEstado();
    }
    editandoPerfilId = null;
    vistaActual = 'menu';
    guardarEstado();
    render();
  });

  wrap.appendChild(form);

  // Lista de perfiles existentes con acceso rápido a edición
  if (state.perfiles.length > 0) {
    const listaPerfiles = document.createElement('div');
    listaPerfiles.className = 'lista-perfiles';
    listaPerfiles.innerHTML = '<h3>Perfiles guardados</h3>';
    const ul = document.createElement('ul');
    state.perfiles.forEach(p => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = p.nombre;
      li.appendChild(span);
      const btnEditar = document.createElement('button');
      btnEditar.className = 'btn btn-mini';
      btnEditar.textContent = 'Editar';
      btnEditar.type = 'button';
      btnEditar.addEventListener('click', () => { editandoPerfilId = p.id; render(); });
      li.appendChild(btnEditar);
      ul.appendChild(li);
    });
    listaPerfiles.appendChild(ul);
    wrap.appendChild(listaPerfiles);
  }

  return wrap;
}

// ---------------------------------------------------------------
// Vista: Mis recetas (recetas propias, con prioridad sobre las genéricas)
// ---------------------------------------------------------------
function renderVistaRecetas() {
  if (vistaRecetaPropiaId !== null) {
    const receta = vistaRecetaPropiaId === 'nueva' ? null : (state.recetasPropias || []).find(r => r.id === vistaRecetaPropiaId);
    return renderFormRecetaPropia(receta);
  }

  const wrap = document.createElement('div');
  wrap.className = 'vista-recetas';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = '<div class="info-etapa"><strong>Mis recetas</strong> — se usan primero al generar el menú, y solo se completa con las genéricas de la app cuando hace falta más variedad.</div>';
  const btnNueva = document.createElement('button');
  btnNueva.className = 'btn btn-primario';
  btnNueva.textContent = '+ Nueva receta';
  btnNueva.addEventListener('click', () => { vistaRecetaPropiaId = 'nueva'; render(); });
  toolbar.appendChild(btnNueva);
  wrap.appendChild(toolbar);

  const propias = state.recetasPropias || [];
  if (propias.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'Aún no has añadido ninguna receta tuya. Añade las que sueles cocinar en casa para que el menú se base en ellas de verdad.';
    wrap.appendChild(vacio);
    return wrap;
  }

  const lista = document.createElement('div');
  lista.className = 'tabla-menu';
  propias.forEach(r => {
    const card = document.createElement('div');
    card.className = 'tarjeta-comida';
    const etiqueta = document.createElement('div');
    etiqueta.className = 'etiqueta-tipo';
    etiqueta.textContent = `${TIPOS_COMIDA_LABEL[r.comida] || r.comida} · ${ETAPAS[r.grupoEdad].nombre}`;
    card.appendChild(etiqueta);
    const nombre = document.createElement('p');
    nombre.className = 'nombre-receta';
    nombre.textContent = r.nombre + (r.ligera ? ' 🌿' : '');
    card.appendChild(nombre);
    const acciones = document.createElement('div');
    acciones.className = 'acciones-form';
    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn btn-mini';
    btnEditar.type = 'button';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => { vistaRecetaPropiaId = r.id; render(); });
    acciones.appendChild(btnEditar);
    card.appendChild(acciones);
    lista.appendChild(card);
  });
  wrap.appendChild(lista);
  return wrap;
}

function renderFormRecetaPropia(receta) {
  const esNueva = !receta;
  const wrap = document.createElement('div');
  wrap.className = 'vista-recetas';

  const form = document.createElement('form');
  form.className = 'form-perfil';
  form.innerHTML = `<h2>${esNueva ? 'Nueva receta' : `Editar receta: ${receta.nombre}`}</h2>`;

  const campoNombre = campoTexto('Nombre del plato', 'receta-nombre', receta ? receta.nombre : '', true);
  form.appendChild(campoNombre.wrapper);

  const grupoTipo = document.createElement('div');
  grupoTipo.className = 'campo';
  grupoTipo.innerHTML = '<label for="receta-tipo">¿Para comida, merienda o cena?</label>';
  const selectTipo = document.createElement('select');
  selectTipo.id = 'receta-tipo';
  TIPOS_COMIDA.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = TIPOS_COMIDA_LABEL[t];
    if (receta && receta.comida === t) opt.selected = true;
    selectTipo.appendChild(opt);
  });
  grupoTipo.appendChild(selectTipo);
  form.appendChild(grupoTipo);

  const grupoEtapa = document.createElement('div');
  grupoEtapa.className = 'campo';
  grupoEtapa.innerHTML = '<label for="receta-etapa">¿Para qué etapa/textura?</label>';
  const selectEtapa = document.createElement('select');
  selectEtapa.id = 'receta-etapa';
  Object.keys(ETAPAS).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = `${ETAPAS[k].nombre} — ${ETAPAS[k].descripcionTextura}`;
    if (receta ? receta.grupoEdad === k : k === '1-5') opt.selected = true;
    selectEtapa.appendChild(opt);
  });
  grupoEtapa.appendChild(selectEtapa);
  form.appendChild(grupoEtapa);

  const grupoLigera = document.createElement('div');
  grupoLigera.className = 'campo';
  const chkLigera = checkboxConLabel('receta-ligera', 'Es una cena ligera (para después de un mediodía copioso en el cole)', receta ? !!receta.ligera : false);
  grupoLigera.appendChild(chkLigera.wrapper);
  form.appendChild(grupoLigera);

  const grupoIngredientes = document.createElement('div');
  grupoIngredientes.className = 'campo';
  grupoIngredientes.innerHTML = '<label>Ingredientes</label>';
  const contFilas = document.createElement('div');
  contFilas.className = 'filas-ingredientes';
  grupoIngredientes.appendChild(contFilas);

  const filas = [];
  function agregarFila(datosIng) {
    const fila = document.createElement('div');
    fila.className = 'fila-ingrediente';
    const inputNombre = document.createElement('input');
    inputNombre.type = 'text'; inputNombre.placeholder = 'Ingrediente'; inputNombre.value = datosIng ? datosIng.nombre : '';
    const inputCantidad = document.createElement('input');
    inputCantidad.type = 'number'; inputCantidad.step = 'any'; inputCantidad.min = '0'; inputCantidad.placeholder = 'Cant.';
    inputCantidad.value = datosIng ? datosIng.cantidad : '';
    const inputUnidad = document.createElement('input');
    inputUnidad.type = 'text'; inputUnidad.placeholder = 'ud / g / ml'; inputUnidad.value = datosIng ? datosIng.unidad : '';
    const selectCategoria = document.createElement('select');
    CATEGORIAS_INGREDIENTE.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      if (datosIng ? datosIng.categoria === c : c === 'Otros') opt.selected = true;
      selectCategoria.appendChild(opt);
    });
    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button'; btnQuitar.className = 'btn btn-mini'; btnQuitar.textContent = '✕';
    btnQuitar.addEventListener('click', () => {
      fila.remove();
      const idx = filas.findIndex(f => f.fila === fila);
      if (idx > -1) filas.splice(idx, 1);
    });
    fila.append(inputNombre, inputCantidad, inputUnidad, selectCategoria, btnQuitar);
    contFilas.appendChild(fila);
    filas.push({ fila, inputNombre, inputCantidad, inputUnidad, selectCategoria });
  }
  if (receta && receta.ingredientes.length) receta.ingredientes.forEach(agregarFila);
  else agregarFila(null);

  const btnAgregarFila = document.createElement('button');
  btnAgregarFila.type = 'button'; btnAgregarFila.className = 'btn btn-mini'; btnAgregarFila.textContent = '+ Añadir ingrediente';
  btnAgregarFila.addEventListener('click', () => agregarFila(null));
  grupoIngredientes.appendChild(btnAgregarFila);
  form.appendChild(grupoIngredientes);

  const grupoPrep = document.createElement('div');
  grupoPrep.className = 'campo';
  grupoPrep.innerHTML = '<label for="receta-prep">Preparación (opcional)</label>';
  const textareaPrep = document.createElement('textarea');
  textareaPrep.id = 'receta-prep'; textareaPrep.rows = 3; textareaPrep.value = receta ? (receta.preparacion || '') : '';
  grupoPrep.appendChild(textareaPrep);
  form.appendChild(grupoPrep);

  const grupoEtiquetas = document.createElement('div');
  grupoEtiquetas.className = 'campo';
  grupoEtiquetas.innerHTML = '<label>Contiene (para poder excluirla por alergia o por gusto)</label>';
  const contEtiquetas = document.createElement('div');
  contEtiquetas.className = 'chips';
  const chksEtiquetas = etiquetasDisponibles().map(o => checkboxConLabel(`receta-etq-${o.etiqueta}`, o.nombre, receta ? receta.etiquetas.includes(o.etiqueta) : false, o.etiqueta));
  chksEtiquetas.forEach(c => contEtiquetas.appendChild(c.wrapper));
  grupoEtiquetas.appendChild(contEtiquetas);
  form.appendChild(grupoEtiquetas);

  const acciones = document.createElement('div');
  acciones.className = 'acciones-form';
  const btnGuardar = document.createElement('button');
  btnGuardar.type = 'submit'; btnGuardar.className = 'btn btn-primario'; btnGuardar.textContent = esNueva ? 'Guardar receta' : 'Guardar cambios';
  acciones.appendChild(btnGuardar);
  const btnCancelar = document.createElement('button');
  btnCancelar.type = 'button'; btnCancelar.className = 'btn btn-mini'; btnCancelar.textContent = 'Cancelar';
  btnCancelar.addEventListener('click', () => { vistaRecetaPropiaId = null; render(); });
  acciones.appendChild(btnCancelar);
  if (!esNueva) {
    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button'; btnEliminar.className = 'btn btn-peligro'; btnEliminar.textContent = 'Eliminar receta';
    btnEliminar.addEventListener('click', () => {
      if (!confirm(`¿Eliminar la receta "${receta.nombre}"?`)) return;
      state.recetasPropias = state.recetasPropias.filter(r => r.id !== receta.id);
      guardarEstado();
      vistaRecetaPropiaId = null;
      render();
    });
    acciones.appendChild(btnEliminar);
  }
  form.appendChild(acciones);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const nombre = campoNombre.input.value.trim();
    if (!nombre) { campoNombre.input.focus(); return; }
    const ingredientes = filas.map(f => ({
      nombre: f.inputNombre.value.trim(),
      cantidad: parseFloat(f.inputCantidad.value) || 0,
      unidad: f.inputUnidad.value.trim() || 'ud',
      categoria: f.selectCategoria.value,
    })).filter(ing => ing.nombre);
    if (ingredientes.length === 0) { alert('Añade al menos un ingrediente.'); return; }
    const etiquetas = chksEtiquetas.filter(c => c.input.checked).map(c => c.valor);
    const tipoComida = selectTipo.value;
    const grupoEdad = selectEtapa.value;
    const datosReceta = {
      id: receta ? receta.id : 'propia-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nombre,
      grupoEdad,
      comida: tipoComida,
      textura: ETAPAS[grupoEdad].descripcionTextura,
      etiquetas,
      ligera: tipoComida === 'cena' ? chkLigera.input.checked : false,
      preparacion: textareaPrep.value.trim(),
      ingredientes,
      origen: 'propia',
    };
    if (esNueva) state.recetasPropias.push(datosReceta);
    else Object.assign(receta, datosReceta);
    guardarEstado();
    vistaRecetaPropiaId = null;
    render();
  });

  wrap.appendChild(form);
  return wrap;
}

// ---------------------------------------------------------------
// Vista: Menú del cole (comedor escolar) — entrada manual mensual
// ---------------------------------------------------------------
function diasLaborablesDelMes(mesISO) {
  const [y, m] = mesISO.split('-').map(Number);
  const dias = [];
  const fecha = new Date(y, m - 1, 1);
  while (fecha.getMonth() === m - 1) {
    const dow = fecha.getDay();
    if (dow >= 1 && dow <= 5) dias.push(formatoFechaISO(fecha));
    fecha.setDate(fecha.getDate() + 1);
  }
  return dias;
}

function renderVistaCole(perfil) {
  const wrap = document.createElement('div');
  wrap.className = 'vista-cole';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = '<div class="info-etapa"><strong>Menú del cole</strong> — escribe lo que come cada día al mediodía para que las cenas se equilibren automáticamente.</div>';
  wrap.appendChild(toolbar);

  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  if (!mesColeSeleccionado) mesColeSeleccionado = mesActual;

  const grupoMes = document.createElement('div');
  grupoMes.className = 'campo';
  grupoMes.innerHTML = '<label for="mes-cole">Mes</label>';
  const inputMes = document.createElement('input');
  inputMes.type = 'month'; inputMes.id = 'mes-cole'; inputMes.value = mesColeSeleccionado;
  inputMes.addEventListener('change', () => {
    if (inputMes.value) { mesColeSeleccionado = inputMes.value; render(); }
  });
  grupoMes.appendChild(inputMes);
  wrap.appendChild(grupoMes);

  const form = document.createElement('form');
  form.className = 'form-perfil';
  const dias = diasLaborablesDelMes(mesColeSeleccionado);
  const inputsPorFecha = {};
  dias.forEach(fecha => {
    const campo = document.createElement('div');
    campo.className = 'campo campo-cole-dia';
    const label = document.createElement('label');
    label.textContent = fechaLegible(fecha);
    label.setAttribute('for', 'cole-' + fecha);
    campo.appendChild(label);
    const input = document.createElement('input');
    input.type = 'text'; input.id = 'cole-' + fecha; input.placeholder = 'ej. Lentejas con verduras y pan';
    input.value = perfil.menuCole[fecha] || '';
    campo.appendChild(input);
    inputsPorFecha[fecha] = input;
    form.appendChild(campo);
  });

  const acciones = document.createElement('div');
  acciones.className = 'acciones-form';
  const btnGuardar = document.createElement('button');
  btnGuardar.type = 'submit'; btnGuardar.className = 'btn btn-primario'; btnGuardar.textContent = 'Guardar mes';
  acciones.appendChild(btnGuardar);
  form.appendChild(acciones);

  form.addEventListener('submit', e => {
    e.preventDefault();
    dias.forEach(fecha => {
      const valor = inputsPorFecha[fecha].value.trim();
      if (valor) perfil.menuCole[fecha] = valor;
      else delete perfil.menuCole[fecha];
    });
    guardarEstado();
    alert('Menú del cole guardado. Genera (o regenera) el menú semanal de esa semana para aplicar el equilibrio en las cenas.');
    render();
  });

  wrap.appendChild(form);
  return wrap;
}

function campoTexto(labelTxt, id, valor, requerido) {
  const wrapper = document.createElement('div');
  wrapper.className = 'campo';
  const label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = labelTxt;
  wrapper.appendChild(label);
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.value = valor || '';
  if (requerido) input.required = true;
  wrapper.appendChild(input);
  return { wrapper, input };
}

function checkboxConLabel(id, labelTxt, checked, valor) {
  const wrapper = document.createElement('label');
  wrapper.className = 'checkbox-label';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = !!checked;
  wrapper.appendChild(input);
  const span = document.createElement('span');
  span.textContent = labelTxt;
  wrapper.appendChild(span);
  return { wrapper, input, valor: valor !== undefined ? valor : id };
}

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------
render();
