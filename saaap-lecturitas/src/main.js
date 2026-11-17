import { defineCustomElements } from '@ionic/core/loader';
import '@ionic/core/css/ionic.bundle.css';
import { addIcons } from 'ionicons';
import { arrowBackOutline, eyeOutline, eyeOffOutline, logOutOutline, searchOutline, settingsOutline } from 'ionicons/icons';
import { apiFija, apiOrigin, apiPath, request, setApiOrigin, setToken } from './api.js';
import gota from './assets/gota-lecturistas.png';
import soyServicios from './assets/logo-soyservicios.png';
import './style.css';

addIcons({ arrowBackOutline, eyeOutline, eyeOffOutline, logOutOutline, searchOutline, settingsOutline });
defineCustomElements(window);

const app = document.querySelector('#app');
const nombreApp = 'SAAAP-Lecturitas';
const formatearNumero = new Intl.NumberFormat('es-MX', { useGrouping: 'always' });
const formatearFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short' });
const filtros = {
  MEDIDOR: ['Medidor', 'Código del medidor'],
  CUENTA: ['No. de cuenta', 'Número de cuenta'],
  NOMBRE: ['Nombre', 'Nombre o apellido'],
};

let sesion;
let vista;
let busqueda;
let captura;

function texto(value) {
  const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, character => escapes[character]);
}

function icono(nombre) {
  return `<ion-icon name="${nombre}" aria-hidden="true"></ion-icon>`;
}

function pie() {
  return `<footer class="credito"><img src="${soyServicios}" alt=""><span>© SoyServicios.com</span></footer>`;
}

function pantalla(titulo, contenido, { volver, accion, clase = '' } = {}) {
  const encabezado = titulo ? `
    <header class="barra">
      ${volver ? `<button type="button" class="icono-boton" id="volver" aria-label="Volver">${icono('arrow-back-outline')}</button>` : `<img class="marca-barra" src="${gota}" alt="">`}
      <h1>${titulo}</h1>
      ${accion || ''}
    </header>` : '';
  app.innerHTML = `<main class="pantalla ${clase}">${encabezado}${contenido}${pie()}</main>`;
  if (volver) app.querySelector('#volver').onclick = volver;
  return app.firstElementChild;
}

function navegar(pagina, reemplazar = false) {
  if (reemplazar) history.replaceState({ pagina }, '', '#'+pagina);
  else history.pushState({ pagina }, '', '#'+pagina);
  mostrar(pagina);
}

function mostrar(pagina) {
  if (!sesion && pagina !== 'inicio') {
    history.replaceState({ pagina: 'inicio' }, '', '#inicio');
    pagina = 'inicio';
  }
  if (pagina === 'captura' && !captura) {
    history.replaceState({ pagina: 'buscar' }, '', '#buscar');
    pagina = 'buscar';
  }
  if (pagina === 'inicio') mostrarLogin();
  else if (pagina === 'captura') mostrarCaptura();
  else mostrarBusqueda();
}

function renovarSesion(error, pantallaActual) {
  if (vista !== pantallaActual) return true;
  if (error.status !== 401) return false;
  limpiarSesion();
  navegar('inicio', true);
  vista.querySelector('#mensaje').textContent = 'La sesión terminó. Vuelve a iniciar sesión.';
  return true;
}

function limpiarSesion() {
  setToken(undefined);
  sesion = undefined;
  busqueda = undefined;
  captura = undefined;
}

function mostrarLogin() {
  const pantallaActual = pantalla('', `
    <section class="contenido login">
      <div class="marca"><img src="${gota}" alt=""><h1>${nombreApp}</h1></div>
      <form id="login">
        <h2>Iniciar sesión</h2>
        <label for="codigo">Código de empleado</label>
        <input id="codigo" autocomplete="username" autocapitalize="off" maxlength="10" required>
        <label for="contrasena">Contraseña</label>
        <div class="entrada-con-icono">
          <input id="contrasena" type="password" autocomplete="current-password" required>
          <button type="button" id="ver-clave" class="icono-boton" aria-label="Mostrar contraseña">${icono('eye-outline')}</button>
        </div>
        <p id="mensaje" class="mensaje error" role="alert"></p>
        <button class="principal" type="submit">Entrar</button>
      </form>
      ${apiFija ? '' : `<details id="ajustes">
        <summary>${icono('settings-outline')} Conexión con la API</summary>
        <form id="configuracion">
          <label for="direccion-api">Dirección de la API</label>
          <input id="direccion-api" type="url" autocomplete="off" spellcheck="false" value="${texto(apiOrigin())}" required>
          <p id="mensaje-config" class="mensaje" role="status"></p>
          <button class="secundario" type="submit">Guardar dirección</button>
        </form>
      </details>`}
    </section>`);
  vista = pantallaActual;
  const clave = vista.querySelector('#contrasena');
  const verClave = vista.querySelector('#ver-clave');
  verClave.onclick = () => {
    const oculta = clave.type === 'password';
    clave.type = oculta ? 'text' : 'password';
    verClave.setAttribute('aria-label', oculta ? 'Ocultar contraseña' : 'Mostrar contraseña');
    verClave.innerHTML = icono(oculta ? 'eye-off-outline' : 'eye-outline');
  };
  const login = vista.querySelector('#login');
  const entrar = login.querySelector('button[type=submit]');
  const configuracion = vista.querySelector('#configuracion');
  const guardarDireccion = configuracion?.querySelector('button');
  configuracion?.addEventListener('submit', event => {
    event.preventDefault();
    const aviso = configuracion.querySelector('#mensaje-config');
    try {
      setApiOrigin(configuracion.querySelector('#direccion-api').value);
      aviso.classList.remove('error');
      aviso.textContent = 'Dirección guardada.';
    } catch {
      aviso.classList.add('error');
      aviso.textContent = 'Ingresa una dirección como http://192.168.1.50:5080.';
    }
  });
  login.onsubmit = async event => {
    event.preventDefault();
    if (entrar.disabled) return;
    const mensaje = login.querySelector('#mensaje');
    mensaje.textContent = '';
    entrar.disabled = true;
    if (guardarDireccion) guardarDireccion.disabled = true;
    entrar.textContent = 'Entrando…';
    try {
      const datos = await request('/api/login', {
        method: 'POST',
        body: { empleadoCodigo: login.querySelector('#codigo').value.trim(), contrasena: clave.value },
      });
      if (!datos?.token) throw new Error('La API no devolvió una sesión.');
      sesion = datos;
      setToken(datos.token);
      navegar('buscar', true);
    } catch (error) {
      if (error.status === 401) mensaje.textContent = 'Revisa el código y la contraseña del lecturista.';
      else if (error.status === 503) mensaje.textContent = 'El inicio de sesión no está disponible en este momento.';
      else mensaje.textContent = error.message;
    } finally {
      entrar.disabled = false;
      if (guardarDireccion) guardarDireccion.disabled = false;
      entrar.textContent = 'Entrar';
    }
  };
}

function mostrarBusqueda() {
  busqueda ??= { calendarios: null, calendario: '', filtro: 'MEDIDOR', consulta: '', resultados: null };
  const estado = busqueda;
  const pantallaActual = pantalla('Buscar medidor', `
    <section class="contenido buscar">
      <dl class="fecha"><dt>Fecha de captura</dt><dd>${texto(estado.fechaCaptura || formatearFecha.format(new Date()))}</dd></dl>
      <label for="calendario">Calendario</label>
      <select id="calendario" disabled><option>Cargando calendarios…</option></select>
      <div id="avance" class="avance" role="status" hidden></div>
      <p id="mensaje-calendario" class="mensaje error" role="alert"></p>
      <button id="reintentar-calendarios" type="button" class="secundario" hidden>Reintentar calendarios</button>
      <form id="buscar">
        <fieldset class="filtros">
          <legend class="sr-only">Buscar por</legend>
          ${Object.entries(filtros).map(([key, [label]]) => `
            <label><input type="radio" name="filtro" value="${key}" ${estado.filtro === key ? 'checked' : ''}><span>${label}</span></label>
          `).join('')}
        </fieldset>
        <label class="sr-only" for="consulta" id="etiqueta-consulta"></label>
        <div class="buscador">
          <input id="consulta" value="${texto(estado.consulta)}" maxlength="200" enterkeyhint="search" required>
          <button type="submit" class="principal" aria-label="Buscar">${icono('search-outline')}</button>
        </div>
      </form>
      <p id="confirmacion" class="mensaje exito" role="status">${texto(estado.confirmacion)}</p>
      <p id="estado-busqueda" class="mensaje" role="status"></p>
      <div id="resultados" class="resultados"></div>
    </section>`, {
    accion: `<button class="icono-boton" type="button" id="salir" aria-label="Cerrar sesión">${icono('log-out-outline')}</button>`,
  });
  vista = pantallaActual;
  vista.querySelector('#salir').onclick = () => {
    request('/api/logout', { method: 'POST' }).catch(() => {});
    limpiarSesion();
    navegar('inicio', true);
  };
  estado.confirmacion = '';
  const calendario = vista.querySelector('#calendario');
  const avisoCalendario = vista.querySelector('#mensaje-calendario');
  const reintentar = vista.querySelector('#reintentar-calendarios');
  const avance = vista.querySelector('#avance');
  const form = vista.querySelector('#buscar');
  const consulta = form.querySelector('#consulta');
  const boton = form.querySelector('button');
  const estadoBusqueda = vista.querySelector('#estado-busqueda');
  const resultados = vista.querySelector('#resultados');
  let versionBusqueda = 0;

  function actualizarEtiqueta() {
    const etiqueta = filtros[estado.filtro][1];
    form.querySelector('#etiqueta-consulta').textContent = etiqueta;
    consulta.placeholder = etiqueta;
    consulta.inputMode = estado.filtro === 'CUENTA' ? 'numeric' : 'text';
  }

  function mostrarResultados() {
    estadoBusqueda.textContent = estado.resultados?.length === 0 ? 'No se encontraron medidores.' : '';
    resultados.innerHTML = (estado.resultados || []).map((medidor, index) => `
      <article class="resultado">
        <h2>Medidor ${texto(medidor.medidorSerie)}</h2>
        <p>Cuenta ${texto(medidor.noCuenta)}</p>
        <p class="titular">${texto(medidor.nombre)}</p>
        <p>${texto([medidor.colonia, medidor.direccion].filter(Boolean).join(' · '))}</p>
        <ion-button expand="block" data-medidor="${index}">Tomar lectura</ion-button>
      </article>`).join('');
    resultados.querySelectorAll('[data-medidor]').forEach(accion => {
      accion.onclick = () => {
        if (!estado.calendario) {
          estadoBusqueda.textContent = 'Selecciona un calendario para tomar la lectura.';
          calendario.focus();
          return;
        }
        captura = {
          medidor: estado.resultados[Number(accion.dataset.medidor)],
          calendarioId: Number(estado.calendario),
          calendarioNombre: calendario.selectedOptions[0].textContent,
        };
        navegar('captura');
      };
    });
  }

  async function cargarAvance() {
    const id = estado.calendario;
    avance.hidden = !id;
    avisoCalendario.textContent = '';
    if (!id) return;
    avance.textContent = 'Cargando avance…';
    try {
      const resumen = await request('/api/calendarios/' + id + '/resumen');
      if (vista !== pantallaActual || id !== estado.calendario) return;
      avance.innerHTML = `<dl class="conteos">${[
        ['Activos', resumen.medidoresActivos],
        ['Con lectura', resumen.conLectura],
        ['Pendientes', resumen.pendientes],
      ].map(([label, total]) => `<div><dt>${label}</dt><dd>${formatearNumero.format(total)}</dd></div>`).join('')}</dl>`;
    } catch (error) {
      if (vista !== pantallaActual || id !== estado.calendario || renovarSesion(error, pantallaActual)) return;
      avance.hidden = true;
      avisoCalendario.textContent = 'No se pudo cargar el avance del calendario. ' + error.message;
    }
  }

  async function cargarCalendarios() {
    reintentar.hidden = true;
    avisoCalendario.textContent = '';
    try {
      estado.calendarios ??= await request('/api/calendarios');
      if (vista !== pantallaActual) return;
      calendario.innerHTML = `<option value="">${estado.calendarios.length ? 'Selecciona un calendario' : 'Sin calendarios abiertos'}</option>` +
        estado.calendarios.map(item => `<option value="${texto(item.calendarioId)}">${texto(item.calendarioNombre)}</option>`).join('');
      calendario.disabled = estado.calendarios.length === 0;
      calendario.value = estado.calendario;
      cargarAvance();
    } catch (error) {
      if (renovarSesion(error, pantallaActual)) return;
      calendario.innerHTML = '<option>Calendarios no disponibles</option>';
      avisoCalendario.textContent = error.message;
      reintentar.hidden = false;
    }
  }

  calendario.onchange = () => {
    estado.calendario = calendario.value;
    cargarAvance();
  };
  reintentar.onclick = cargarCalendarios;
  form.onchange = event => {
    if (event.target.name !== 'filtro') return;
    versionBusqueda++;
    boton.disabled = false;
    estado.filtro = event.target.value;
    estado.consulta = '';
    estado.resultados = null;
    consulta.value = '';
    vista.querySelector('#confirmacion').textContent = '';
    actualizarEtiqueta();
    mostrarResultados();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    estado.consulta = consulta.value.trim();
    if (!estado.consulta || boton.disabled) return;
    const version = ++versionBusqueda;
    estado.resultados = null;
    mostrarResultados();
    vista.querySelector('#confirmacion').textContent = '';
    estadoBusqueda.textContent = 'Buscando medidores…';
    boton.disabled = true;
    try {
      const datos = await request(apiPath('/api/medidores', { buscarPor: estado.filtro, texto: estado.consulta }));
      if (vista !== pantallaActual || version !== versionBusqueda) return;
      estado.resultados = datos;
      mostrarResultados();
    } catch (error) {
      if (version === versionBusqueda && !renovarSesion(error, pantallaActual)) estadoBusqueda.textContent = error.message;
    } finally {
      if (version === versionBusqueda) boton.disabled = false;
    }
  };
  actualizarEtiqueta();
  mostrarResultados();
  cargarCalendarios();
}

function fechaSql(fecha) {
  const [ano, mes, dia] = fecha.split('-');
  return [dia, mes, ano].join('/');
}

async function mostrarCaptura() {
  const seleccion = captura;
  const parametros = { medidorSerie: seleccion.medidor.medidorSerie, calendarioId: seleccion.calendarioId };
  let guardando = false;
  const pantallaActual = pantalla('Tomar lectura', `
    <section class="contenido">
      <div class="resultado">
        <h2>Medidor ${texto(parametros.medidorSerie)}</h2>
        <p>Cuenta ${texto(seleccion.medidor.noCuenta)} · ${texto(seleccion.medidor.nombre)}</p>
        <dl class="datos-captura">
          <div><dt>Fecha de captura</dt><dd id="fecha-captura">—</dd></div>
          <div><dt>Calendario</dt><dd>${texto(seleccion.calendarioNombre)}</dd></div>
        </dl>
      </div>
      <p id="carga" class="mensaje" role="status">Cargando lectura…</p>
      <button id="reintentar" class="secundario" type="button" hidden>Reintentar</button>
      <form id="lectura" hidden>
        <dl class="inicial"><dt>Lectura inicial</dt><dd id="inicial"></dd></dl>
        <label for="final">Lectura final</label>
        <input id="final" inputmode="numeric" maxlength="10" pattern="[0-9]{1,10}" required aria-describedby="validacion-lectura">
        <p id="validacion-lectura" class="mensaje error" role="status"></p>
        <dl class="consumo"><dt>Consumo</dt><dd id="consumo" aria-live="polite">—</dd></dl>
        <p id="error-guardar" class="mensaje error" role="alert"></p>
        <button class="principal" type="submit" disabled>Guardar lectura</button>
      </form>
    </section>`, { volver: () => { if (!guardando) history.back(); } });
  vista = pantallaActual;
  const carga = vista.querySelector('#carga');
  const reintentar = vista.querySelector('#reintentar');
  let detalle;
  try {
    detalle = await request(apiPath('/api/lecturas/captura', parametros));
  } catch (error) {
    if (renovarSesion(error, pantallaActual)) return;
    carga.textContent = error.message;
    carga.classList.add('error');
    reintentar.hidden = false;
    reintentar.onclick = mostrarCaptura;
    return;
  }
  if (vista !== pantallaActual) return;
  const fecha = fechaSql(detalle.fechaCaptura);
  busqueda.fechaCaptura = fecha;
  vista.querySelector('#fecha-captura').textContent = fecha;
  vista.querySelector('#inicial').textContent = formatearNumero.format(detalle.lecturaInicial);
  carga.hidden = true;
  const form = vista.querySelector('#lectura');
  form.hidden = false;
  const final = form.querySelector('#final');
  const consumo = form.querySelector('#consumo');
  const validacion = form.querySelector('#validacion-lectura');
  const errorGuardar = form.querySelector('#error-guardar');
  const guardar = form.querySelector('button');
  final.value = detalle.lecturaFinal ?? '';

  function validar() {
    const valor = /^[0-9]{1,10}$/.test(final.value) ? Number(final.value) : null;
    const valida = valor !== null && valor >= detalle.lecturaInicial;
    let mensaje = '';
    if (final.value && valor === null) mensaje = 'Ingresa una lectura entera de hasta 10 dígitos.';
    if (valor !== null && !valida) mensaje = 'La lectura final debe ser mayor o igual a la lectura inicial.';
    validacion.textContent = mensaje;
    final.setAttribute('aria-invalid', String(Boolean(mensaje)));
    guardar.disabled = !valida || guardando;
    consumo.textContent = valida ? formatearNumero.format(valor - detalle.lecturaInicial) + ' m³' : '—';
    return valida;
  }

  final.oninput = () => {
    errorGuardar.textContent = '';
    validar();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (guardando || !validar()) return;
    guardando = true;
    final.readOnly = true;
    guardar.disabled = true;
    guardar.textContent = 'Guardando…';
    errorGuardar.textContent = '';
    try {
      const resultado = await request('/api/lecturas/captura', {
        method: 'PUT', body: { ...parametros, lecturaFinal: Number(final.value) },
      });
      if (vista !== pantallaActual) return;
      busqueda.fechaCaptura = fechaSql(resultado.lecturaFecha);
      busqueda.confirmacion = resultado.esNueva ? 'Lectura guardada.' : 'Lectura actualizada.';
      busqueda.consulta = '';
      busqueda.resultados = null;
      history.back();
    } catch (error) {
      if (!renovarSesion(error, pantallaActual)) errorGuardar.textContent = error.message;
    } finally {
      guardando = false;
      final.readOnly = false;
      guardar.textContent = 'Guardar lectura';
      validar();
    }
  };
  validar();
}

window.addEventListener('popstate', event => mostrar(event.state?.pagina || 'inicio'));
vista = pantalla('', `<section class="contenido marca arranque"><img src="${gota}" alt=""><h1>${nombreApp}</h1></section>`);
window.setTimeout(() => navegar('inicio', true), 550);
