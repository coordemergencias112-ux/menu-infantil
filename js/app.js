// Lógica de la aplicación "Menú Infantil 6m-5a"
// Todo se guarda en localStorage del navegador, no hay servidor.

const STORAGE_KEY = 'menuInfantil_v1';

let state = cargarEstado();
let vistaActual = 'menu'; // 'menu' | 'compra' | 'perfil'
let editandoPerfilId = null;
let marcadosCompartidosSesion = {};

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
  const payload = {
    v: 1,
    nombre: perfil.nombre,
    comidas: perfil.comidas,
    alergias: perfil.alergias || [],
    noGusta: perfil.noGusta || [],
    grupoEdad: etapaEfectiva(perfil),
    menu: perfil.menu,
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
  if (!payload || payload.v !== 1 || !payload.menu) return null;
  return payload;
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
  const nuevo = {
    id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nombre: vistaCompartida.nombre,
    fechaNacimiento: null,
    texturaPreferida: vistaCompartida.grupoEdad,
    comidas: vistaCompartida.comidas,
    alergias: vistaCompartida.alergias,
    noGusta: vistaCompartida.noGusta,
    menu: vistaCompartida.menu,
    listaCompraMarcados: {},
  };
  state.perfiles.push(nuevo);
  state.perfilActualId = nuevo.id;
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
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
  return { perfiles: [], perfilActualId: null };
}

function guardarEstado() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { console.warn('No se pudo guardar el almacenamiento local', e); }
}

function perfilActual() {
  return state.perfiles.find(p => p.id === state.perfilActualId) || null;
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
function recetasDisponibles(perfil, tipoComida) {
  const grupo = etapaEfectiva(perfil);
  const alergias = perfil.alergias || [];
  const noGusta = perfil.noGusta || [];
  return RECIPES.filter(r => {
    if (r.grupoEdad !== grupo || r.comida !== tipoComida) return false;
    if (r.etiquetas.some(e => alergias.includes(e))) return false;
    return true;
  }).filter(r => {
    // Preferimos excluir lo que no gusta, pero si no queda nada disponible, se relaja este filtro
    return !r.etiquetas.some(e => noGusta.includes(e));
  });
}

function recetasDisponiblesRelajado(perfil, tipoComida) {
  const grupo = etapaEfectiva(perfil);
  const alergias = perfil.alergias || [];
  return RECIPES.filter(r => r.grupoEdad === grupo && r.comida === tipoComida && !r.etiquetas.some(e => alergias.includes(e)));
}

function elegirReceta(perfil, tipoComida, usadasIds) {
  let pool = recetasDisponibles(perfil, tipoComida);
  if (pool.length === 0) pool = recetasDisponiblesRelajado(perfil, tipoComida);
  if (pool.length === 0) return null;
  let sinUsar = pool.filter(r => !usadasIds.has(r.id));
  const candidatos = sinUsar.length > 0 ? sinUsar : pool;
  return candidatos[Math.floor(Math.random() * candidatos.length)];
}

function generarMenuSemanal(perfil) {
  const usadas = new Set();
  const menu = {};
  DIAS_SEMANA.forEach(dia => {
    menu[dia] = {};
    if (perfil.comidas.comida) {
      const r = elegirReceta(perfil, 'comida', usadas);
      if (r) { menu[dia].comida = r.id; usadas.add(r.id); }
    }
    if (perfil.comidas.cena) {
      const r = elegirReceta(perfil, 'cena', usadas);
      if (r) { menu[dia].cena = r.id; usadas.add(r.id); }
    }
  });
  perfil.menu = menu;
  perfil.listaCompraMarcados = {};
  guardarEstado();
}

function cambiarDia(perfil, dia, tipo) {
  const usadas = new Set(
    Object.values(perfil.menu || {}).flatMap(d => [d.comida, d.cena]).filter(Boolean)
  );
  const actual = perfil.menu[dia] ? perfil.menu[dia][tipo] : null;
  let pool = recetasDisponibles(perfil, tipo);
  if (pool.length === 0) pool = recetasDisponiblesRelajado(perfil, tipo);
  if (pool.length === 0) return;
  let candidatos = pool.filter(r => r.id !== actual && !usadas.has(r.id));
  if (candidatos.length === 0) candidatos = pool.filter(r => r.id !== actual);
  if (candidatos.length === 0) candidatos = pool;
  const nueva = candidatos[Math.floor(Math.random() * candidatos.length)];
  if (!perfil.menu[dia]) perfil.menu[dia] = {};
  perfil.menu[dia][tipo] = nueva.id;
  guardarEstado();
}

function recetaPorId(id) {
  return RECIPES.find(r => r.id === id) || null;
}

// ---------------------------------------------------------------
// Lista de la compra
// ---------------------------------------------------------------
function generarListaCompra(perfil) {
  const acumulado = {}; // key: nombre|unidad|categoria -> cantidad
  if (!perfil.menu) return {};
  Object.values(perfil.menu).forEach(dia => {
    ['comida', 'cena'].forEach(tipo => {
      const id = dia[tipo];
      if (!id) return;
      const receta = recetaPorId(id);
      if (!receta) return;
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

  if (perfil) app.appendChild(renderNav());

  const contenido = document.createElement('div');
  contenido.className = 'contenido';
  if (vistaActual === 'menu') contenido.appendChild(renderVistaMenu(perfil));
  else if (vistaActual === 'compra') contenido.appendChild(renderVistaCompra(perfil));
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
  const tipos = [];
  if (vistaCompartida.comidas.comida) tipos.push('comida');
  if (vistaCompartida.comidas.cena) tipos.push('cena');

  DIAS_SEMANA.forEach(dia => {
    const col = document.createElement('div');
    col.className = 'columna-dia';
    const h3 = document.createElement('h3');
    h3.textContent = DIAS_SEMANA_LABEL[dia];
    col.appendChild(h3);
    tipos.forEach(tipo => {
      const id = vistaCompartida.menu[dia] ? vistaCompartida.menu[dia][tipo] : null;
      const receta = id ? recetaPorId(id) : null;
      col.appendChild(renderTarjetaComida(null, dia, tipo, receta, true));
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
  const porCategoria = generarListaCompra(perfilTemporal);
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

function renderNav() {
  const nav = document.createElement('nav');
  nav.className = 'tabs';
  const tabs = [
    { id: 'menu', label: '📅 Menú semanal' },
    { id: 'compra', label: '🛒 Lista de la compra' },
    { id: 'perfil', label: '👤 Perfil' },
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

  if (!perfil.menu) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'Todavía no hay menú generado para este perfil. Pulsa "Generar menú semanal" para crear uno.';
    wrap.appendChild(vacio);
    return wrap;
  }

  const tabla = document.createElement('div');
  tabla.className = 'tabla-menu';

  const tipos = [];
  if (perfil.comidas.comida) tipos.push('comida');
  if (perfil.comidas.cena) tipos.push('cena');

  DIAS_SEMANA.forEach(dia => {
    const col = document.createElement('div');
    col.className = 'columna-dia';
    const h3 = document.createElement('h3');
    h3.textContent = DIAS_SEMANA_LABEL[dia];
    col.appendChild(h3);

    tipos.forEach(tipo => {
      const id = perfil.menu[dia] ? perfil.menu[dia][tipo] : null;
      const receta = id ? recetaPorId(id) : null;
      col.appendChild(renderTarjetaComida(perfil, dia, tipo, receta, false));
    });

    tabla.appendChild(col);
  });

  wrap.appendChild(tabla);
  return wrap;
}

function renderTarjetaComida(perfil, dia, tipo, receta, soloLectura) {
  const card = document.createElement('div');
  card.className = 'tarjeta-comida';

  const etiqueta = document.createElement('div');
  etiqueta.className = 'etiqueta-tipo';
  etiqueta.textContent = tipo === 'comida' ? 'Comida' : 'Cena';
  card.appendChild(etiqueta);

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

  const ul = document.createElement('ul');
  receta.ingredientes.forEach(ing => {
    const li = document.createElement('li');
    li.textContent = `${ing.nombre} — ${formatoCantidad(ing)}`;
    ul.appendChild(li);
  });
  detalles.appendChild(ul);

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
  const datos = perfilEnEdicion || {
    id: null,
    nombre: '',
    fechaNacimiento: '',
    texturaPreferida: 'auto',
    comidas: { comida: true, cena: true },
    alergias: [],
    noGusta: [],
  };

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
  inputFecha.max = new Date().toISOString().slice(0, 10);
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
  const chkCena = checkboxConLabel('incluir-cena', 'Cena', datos.comidas.cena);
  grupoComidas.appendChild(chkComida.wrapper);
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
    const comidas = { comida: chkComida.input.checked, cena: chkCena.input.checked };
    if (!comidas.comida && !comidas.cena) {
      alert('Selecciona al menos "Comida" o "Cena".');
      return;
    }
    const alergias = chksAlergias.filter(c => c.input.checked).map(c => c.valor);
    const noGusta = chksNoGusta.filter(c => c.input.checked).map(c => c.valor);

    if (esNuevo) {
      const nuevoPerfil = {
        id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        nombre,
        fechaNacimiento: inputFecha.value || null,
        texturaPreferida: selectTextura.value,
        comidas,
        alergias,
        noGusta,
        menu: null,
        listaCompraMarcados: {},
      };
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
