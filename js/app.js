/* ============================================================
   app.js — Controlador principal con roles tutor/niño y backend
   ============================================================ */

const App = {
  rol:                  null,
  pantallaActual:       'monitoreo',
  monitoreoActivo:      false,
  sesionBackendId:      null,
  estadoPosturalActual: 'normal',
  estadoVisualActual:   'normal',
  anguloPitch:          0,
  distanciaRostro:      0,
  modoSimulacion:       false,
  contadores: {
    duracionSeg: 0,
    zonaNormal: 0, zonaPrecaucion: 0, zonaRiesgo: 0,
    zonaVisNormal: 0, zonaVisPrecaucion: 0, zonaVisRiesgo: 0,
    anguloMaximo: 0, distanciaMinima: 999, totalAlertas: 0
  }
};

// ============================================================
// ARRANQUE
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  _registrarSW();

  // Botones de autenticación
  document.getElementById('tab-btn-nino').addEventListener('click', () => mostrarTabAuth('nino'));
  document.getElementById('tab-btn-tutor').addEventListener('click', () => mostrarTabAuth('tutor'));
  document.getElementById('btn-vincular').addEventListener('click', accionVincularNino);
  document.getElementById('btn-login-tutor').addEventListener('click', accionLoginTutor);
  document.getElementById('btn-registro-tutor').addEventListener('click', accionRegistroTutor);
  document.getElementById('btn-ir-registro').addEventListener('click', mostrarRegistroTutor);
  document.getElementById('btn-ir-login').addEventListener('click', mostrarLoginTutor);

  if (API.estaAutenticado()) {
    const usuario = API.obtenerUsuario();
    if (usuario) {
      _arrancarComoUsuario(usuario);
      return;
    }
  }

  document.getElementById('pantalla-auth').style.display = 'flex';
  document.getElementById('app-principal').style.display = 'none';
});

function _registrarSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

function _arrancarComoUsuario(usuario) {
  App.rol = usuario.rol;
  document.getElementById('pantalla-auth').style.display = 'none';
  document.getElementById('app-principal').style.display = 'flex';

  document.getElementById('cabecera-rol').textContent =
    usuario.rol === 'tutor' ? 'Modo tutor' : 'Modo nino';

  _construirNavegacion(usuario.rol);

  if (usuario.rol === 'tutor') {
    irA('tutor');
    _cargarDatosTutor();
  } else {
    _inicializarPantallaMonitoreo();
    _configurarAlertas();
    _configurarBluetooth();
    _configurarCamara();
    irA('monitoreo');
  }
}

// ============================================================
// AUTENTICACION
// ============================================================
function mostrarTabAuth(tab) {
  document.getElementById('tab-nino').style.display  = tab === 'niño'  ? 'block' : 'none';
  document.getElementById('tab-tutor').style.display = tab === 'tutor' ? 'block' : 'none';
  document.querySelectorAll('.tab-auth-btn').forEach((b, i) => {
    b.classList.toggle('activo', (i === 0 && tab === 'niño') || (i === 1 && tab === 'tutor'));
  });
}

function mostrarRegistroTutor() {
  document.getElementById('sub-login-tutor').style.display    = 'none';
  document.getElementById('sub-registro-tutor').style.display = 'block';
}

function mostrarLoginTutor() {
  document.getElementById('sub-login-tutor').style.display    = 'block';
  document.getElementById('sub-registro-tutor').style.display = 'none';
}

async function accionVincularNino() {
  const codigo = document.getElementById('input-codigo').value.trim().toUpperCase();
  const edad   = parseInt(document.getElementById('input-edad-nino').value) || null;
  const sexo   = document.getElementById('input-sexo-nino').value || null;
  const errEl  = document.getElementById('error-nino');
  const btn    = document.getElementById('btn-vincular');

  if (!codigo || codigo.length !== 6) {
    errEl.textContent = 'El código debe tener exactamente 6 caracteres.';
    errEl.classList.add('visible');
    return;
  }
  errEl.classList.remove('visible');
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const datos = await API.vincularNino({ codigo, edad, sexo });
    _arrancarComoUsuario(datos.usuario);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'Comenzar';
  }
}

async function accionLoginTutor() {
  const correo   = document.getElementById('input-correo-login').value.trim();
  const password = document.getElementById('input-pass-login').value;
  const errEl    = document.getElementById('error-tutor');

  if (!correo || !password) {
    errEl.textContent = 'El correo y la contraseña son obligatorios.';
    errEl.classList.add('visible');
    return;
  }
  errEl.classList.remove('visible');

  try {
    const datos = await API.login({ correo, password });
    _arrancarComoUsuario(datos.usuario);
    if (datos.vinculos && datos.vinculos.length > 0) {
      const codigo = datos.vinculos.find(v => !v.nino_id);
      if (codigo) {
        setTimeout(() => {
          const el = document.getElementById('codigo-tutor-actual');
          if (el) el.textContent = codigo.codigo;
        }, 300);
      }
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  }
}

async function accionRegistroTutor() {
  const correo   = document.getElementById('input-correo-reg').value.trim();
  const password = document.getElementById('input-pass-reg').value;
  const errEl    = document.getElementById('error-registro');

  if (!correo || !password) {
    errEl.textContent = 'El correo y la contrasena son obligatorios.';
    errEl.classList.add('visible');
    return;
  }
  errEl.classList.remove('visible');

  try {
    const datos = await API.registrarTutor({ correo, password });
    _arrancarComoUsuario(datos.usuario);
    if (datos.usuario.codigoVinculacion) {
      setTimeout(() => {
        const el = document.getElementById('codigo-tutor-actual');
        if (el) el.textContent = datos.usuario.codigoVinculacion;
      }, 300);
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  }
}

async function accionCerrarSesion() {
  if (App.monitoreoActivo) await _accionDetenerSesion();
  Bluetooth.desconectar();
  Camara.detener();
  await API.cerrarSesionAuth();
  location.reload();
}

// ============================================================
// NAVEGACION
// ============================================================
function _construirNavegacion(rol) {
  const nav = document.getElementById('nav-principal');
  if (rol === 'tutor') {
    nav.innerHTML = `
      <button class="nav-btn activo" data-pantalla="tutor">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        Ninos
      </button>`;
  } else {
    nav.innerHTML = `
      <button class="nav-btn activo" data-pantalla="monitoreo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        Monitoreo
      </button>
      <button class="nav-btn" data-pantalla="historial">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        Historial
      </button>
      <button class="nav-btn" data-pantalla="configuracion">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Ajustes
      </button>`;
  }

  nav.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      irA(btn.dataset.pantalla);
      if (btn.dataset.pantalla === 'historial') _cargarHistorialNino();
    });
  });

  const btnSalir = document.getElementById('btn-cerrar-sesion-auth');
  if (btnSalir) btnSalir.addEventListener('click', accionCerrarSesion);
}

function irA(nombre) {
  App.pantallaActual = nombre;
  document.querySelectorAll('.pantalla').forEach(p  => p.classList.remove('activa'));
  document.querySelectorAll('.nav-btn').forEach(b   => b.classList.remove('activo'));
  const el  = document.getElementById('pantalla-' + nombre);
  const btn = document.querySelector(`[data-pantalla="${nombre}"]`);
  if (el)  el.classList.add('activa');
  if (btn) btn.classList.add('activo');
}

// ============================================================
// PANTALLA: MONITOREO
// ============================================================
function _inicializarPantallaMonitoreo() {
  const btnConectar = document.getElementById('btn-conectar-sensor');
  const btnCamara   = document.getElementById('btn-iniciar-camara');
  const btnIniciar  = document.getElementById('btn-iniciar-sesion');
  const btnDetener  = document.getElementById('btn-detener-sesion');
  const btnSim      = document.getElementById('btn-simulacion');
  const btnAlerta   = document.getElementById('btn-cerrar-alerta');

  if (btnConectar) btnConectar.addEventListener('click', () => {
    if (Bluetooth.conectado) Bluetooth.desconectar();
    else Bluetooth.conectar();
  });
  if (btnCamara)  btnCamara.addEventListener('click',  _accionIniciarCamara);
  if (btnIniciar) btnIniciar.addEventListener('click', _accionIniciarSesion);
  if (btnDetener) btnDetener.addEventListener('click', _accionDetenerSesion);
  if (btnSim)     btnSim.addEventListener('click',     _accionSimulacion);
  if (btnAlerta)  btnAlerta.addEventListener('click',  _cerrarAlerta);
}

async function _accionIniciarCamara() {
  const btn = document.getElementById('btn-iniciar-camara');
  if (Camara.activa) {
    Camara.detener();
    document.getElementById('contenedor-camara').style.display = 'none';
    document.getElementById('sin-camara').style.display        = 'flex';
    btn.textContent = 'Activar cámara';
    return;
  }
  btn.disabled    = true;
  btn.textContent = 'Activando cámara...';
  const ok = await Camara.iniciar();
  btn.disabled = false;
  if (ok) {
    document.getElementById('contenedor-camara').style.display = 'block';
    document.getElementById('sin-camara').style.display        = 'none';
    btn.textContent = 'Apagar cámara';
  } else {
    btn.textContent = 'Activar cámara';
    _mostrarToast('No se pudo acceder a la cámara. Verifica los permisos.');
  }
}

async function _accionIniciarSesion() {
  App.contadores = {
    duracionSeg: 0, zonaNormal: 0, zonaPrecaucion: 0, zonaRiesgo: 0,
    zonaVisNormal: 0, zonaVisPrecaucion: 0, zonaVisRiesgo: 0,
    anguloMaximo: 0, distanciaMinima: 999, totalAlertas: 0
  };
  Alertas.reiniciar();

  try {
    const resp = await API.iniciarSesion();
    App.sesionBackendId = resp.sesionId;
    App.monitoreoActivo = true;
    API.iniciarEnvioAutomatico(resp.sesionId);
    _actualizarBotonesMonitoreo();
    _mostrarToast('Sesión iniciada. Los datos se estan guardando.');
  } catch (err) {
    _mostrarToast('No se pudo iniciar la sesión: ' + err.message);
  }
}

async function _accionDetenerSesion() {
  if (!App.sesionBackendId) return;
  App.monitoreoActivo = false;
  API.detenerEnvioAutomatico();

  const c = App.contadores;
  try {
    await API.finalizarSesion(App.sesionBackendId, {
      duracionSeg:       Math.round(c.duracionSeg),
      zonaNormal:        c.zonaNormal,
      zonaPrecaucion:    c.zonaPrecaucion,
      zonaRiesgo:        c.zonaRiesgo,
      zonaVisNormal:     c.zonaVisNormal,
      zonaVisPrecaucion: c.zonaVisPrecaucion,
      zonaVisRiesgo:     c.zonaVisRiesgo,
      anguloMaximo:      c.anguloMaximo,
      distanciaMinima:   c.distanciaMinima < 999 ? c.distanciaMinima : null,
      totalAlertas:      c.totalAlertas
    });
    _mostrarToast(`Sesion guardada: ${Math.round(c.duracionSeg / 60)} min, ${c.totalAlertas} alertas.`);
  } catch (_) {
    _mostrarToast('La sesión terminó pero no se pudo guardar en el servidor.');
  }

  App.sesionBackendId = null;
  _actualizarBotonesMonitoreo();
}

function _actualizarBotonesMonitoreo() {
  const btnI = document.getElementById('btn-iniciar-sesion');
  const btnD = document.getElementById('btn-detener-sesion');
  const label = document.getElementById('sesion-activa-label');
  if (btnI)  btnI.style.display  = App.monitoreoActivo ? 'none'  : 'block';
  if (btnD)  btnD.style.display  = App.monitoreoActivo ? 'block' : 'none';
  if (label) label.style.display = App.monitoreoActivo ? 'flex'  : 'none';
}

function _accionSimulacion() {
  if (App.modoSimulacion) {
    Bluetooth.detenerSimulacion();
    App.modoSimulacion = false;
    document.getElementById('btn-simulacion').textContent = 'Probar sin sensor';
  } else {
    Bluetooth.iniciarSimulacion();
    App.modoSimulacion = true;
    document.getElementById('btn-simulacion').textContent = 'Detener simulacion';
  }
}

function _actualizarDatosPosturales(pitch) {
  App.anguloPitch = pitch;
  const valEl   = document.getElementById('valor-angulo');
  const barraEl = document.getElementById('barra-angulo-relleno');
  const mEl     = document.getElementById('medicion-angulo');
  if (valEl)   valEl.textContent = Math.round(pitch);
  if (barraEl) {
    barraEl.style.width      = Math.min(100, (pitch / 60) * 100) + '%';
    barraEl.style.background = pitch >= 45 ? 'var(--rojo)' : pitch >= 30 ? 'var(--amarillo)' : 'var(--verde)';
  }
  if (mEl) mEl.className = 'medicion' + (pitch >= 45 ? ' peligro' : pitch >= 30 ? ' advertencia' : ' bien');

  if (App.monitoreoActivo) {
    App.contadores.duracionSeg  += 0.1;
    App.contadores.anguloMaximo  = Math.max(App.contadores.anguloMaximo, pitch);
    if (pitch >= 45)      App.contadores.zonaRiesgo++;
    else if (pitch >= 30) App.contadores.zonaPrecaucion++;
    else                  App.contadores.zonaNormal++;
    API.agregarMuestraPostural(pitch);
  }
  _actualizarEstadoGlobal();
}

function _actualizarDatosVisuales(distancia) {
  App.distanciaRostro = distancia;
  const el  = document.getElementById('valor-distancia');
  const mEl = document.getElementById('medicion-distancia');
  if (el)  el.textContent = distancia > 0 ? Math.round(distancia) : '--';
  if (mEl) mEl.className  = 'medicion' + (distancia > 0 && distancia < 20 ? ' peligro' : distancia >= 20 && distancia <= 30 ? ' advertencia' : distancia > 30 ? ' bien' : '');

  if (App.monitoreoActivo && distancia > 0) {
    App.contadores.distanciaMinima = Math.min(App.contadores.distanciaMinima, distancia);
    if (distancia < 20)       App.contadores.zonaVisRiesgo++;
    else if (distancia <= 30) App.contadores.zonaVisPrecaucion++;
    else                      App.contadores.zonaVisNormal++;
    API.agregarMuestraVisual(distancia);
  }
  _actualizarEstadoGlobal();
}

function _actualizarEstadoGlobal() {
  const ep = Alertas.clasificarAngulo(App.anguloPitch);
  const ev = Alertas.clasificarDistancia(App.distanciaRostro);
  const ef = Alertas.estadoCombinado(ep, ev);

  const panel = document.getElementById('panel-estado');
  if (panel) panel.className = 'estado-principal ' + ef;

  const msgs = {
    normal:     ['Todo bien',   'Postura y distancia correctas',       'Continua así.'],
    precaucion: ['Ten cuidado', ep === 'precaución' ? 'El cuello está un poco inclinado' : 'El teléfono esta cerca',
                                ep === 'precaución' ? 'Levanta el teléfono para no bajar tanto la cabeza.' : 'Aleja el teléfono un poco.'],
    riesgo:     ['Hay riesgo',  ep === 'riesgo' ? 'El cuello está muy inclinado' : 'El teléfono esta muy cerca',
                                ep === 'riesgo' ? 'Levanta la cabeza. Tu cuello puede lastimarse.' : 'Aleja el teléfono. Puede dañar tu visión.']
  };

  const etEl = document.getElementById('estado-etiqueta');
  const msEl = document.getElementById('estado-mensaje');
  const dsEl = document.getElementById('estado-descripcion');
  if (etEl) etEl.textContent = msgs[ef][0];
  if (msEl) msEl.textContent = msgs[ef][1];
  if (dsEl) dsEl.textContent = msgs[ef][2];

  const punto  = document.getElementById('punto-conexión');
  const textoC = document.getElementById('texto-conexión');
  if (Bluetooth.conectado || App.modoSimulacion) {
    if (punto)  punto.className    = 'punto-conexión conectado';
    if (textoC) textoC.textContent = App.modoSimulacion ? 'Simulación' : 'Sensor conectado';
  } else {
    if (punto)  punto.className    = 'punto-conexión';
    if (textoC) textoC.textContent = 'Sin sensor';
  }
}

// ============================================================
// ALERTAS
// ============================================================
function _configurarAlertas() {
  Alertas.onAlerta = (datos) => {
    App.contadores.totalAlertas++;
    const iconEl  = document.getElementById('alerta-icono');
    const titEl   = document.getElementById('alerta-titulo');
    const txtEl   = document.getElementById('alerta-texto');
    const cajaEl  = document.getElementById('alerta-caja');
    const overEl  = document.getElementById('alerta-overlay');
    if (iconEl) iconEl.textContent  = datos.tipo === 'riesgo' ? '' : '';
    if (titEl)  titEl.textContent   = datos.titulo;
    if (txtEl)  txtEl.textContent   = datos.mensaje;
    if (cajaEl) cajaEl.className    = 'alerta-caja ' + datos.tipo;
    if (overEl) overEl.classList.add('visible');

    if (App.sesionBackendId) {
      API.registrarAlerta(App.sesionBackendId, {
        tipo:   datos.tipo,
        modulo: datos.modulo,
        valor:  datos.angulo || datos.distancia || null
      });
    }
  };
}

function _cerrarAlerta() {
  const overEl = document.getElementById('alerta-overlay');
  if (overEl) overEl.classList.remove('visible');
  Alertas.cerrarAlerta();
}

// ============================================================
// BLUETOOTH
// ============================================================
function _configurarBluetooth() {
  Bluetooth.onDatos = (datos) => {
    _actualizarDatosPosturales(datos.pitch);
    if (App.monitoreoActivo) Alertas.evaluarPostural(datos.pitch);
  };
  Bluetooth.onConectado = () => {
    const btn = document.getElementById('btn-conectar-sensor');
    if (btn) { btn.textContent = 'Desconectar sensor'; btn.className = 'btn-accion btn-peligro'; }
    _actualizarEstadoGlobal();
  };
  Bluetooth.onDesconectado = () => {
    const btn = document.getElementById('btn-conectar-sensor');
    if (btn) { btn.textContent = 'Conectar sensor'; btn.className = 'btn-accion btn-primario'; }
    App.modoSimulacion = false;
    const btnSim = document.getElementById('btn-simulacion');
    if (btnSim) btnSim.textContent = 'Probar sin sensor';
    _actualizarEstadoGlobal();
  };
  Bluetooth.onError = _mostrarToast;
}

// ============================================================
// CAMARA
// ============================================================
function _configurarCamara() {
  const videoEl  = document.getElementById('vista-camara');
  const canvasEl = document.getElementById('canvas-camara');
  if (!videoEl || !canvasEl) return;
  Camara.inicializar(videoEl, canvasEl);
  const focal = localStorage.getItem('monitor_focal');
  if (focal) Camara.setLongitudFocal(parseFloat(focal));

  Camara.onDistancia = (dist) => {
    _actualizarDatosVisuales(dist);
    if (App.monitoreoActivo) Alertas.evaluarVisual(dist);
    const stEl = document.getElementById('camara-estado-texto');
    if (stEl) stEl.textContent = dist > 0 ? Math.round(dist) + ' cm' : 'Buscando rostro...';
  };
  Camara.onRostro = (detectado) => {
    const stEl = document.getElementById('camara-estado-texto');
    if (stEl) stEl.textContent = detectado ? (Math.round(App.distanciaRostro) + ' cm') : 'Sin rostro detectado';
  };
}

// ============================================================
// HISTORIAL NINO
// ============================================================
async function _cargarHistorialNino() {
  const contenedor = document.getElementById('lista-sesiones');
  if (!contenedor) return;
  contenedor.innerHTML = '<div class="cargando-txt">Cargando historial...</div>';

  try {
    const sesiones = await API.obtenerHistorial();
    const hace7    = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const recientes = sesiones.filter(s => new Date(s.inicio) >= hace7);
    const totalMin  = recientes.reduce((a, s) => a + s.duracion_seg / 60, 0);
    const totalAl   = recientes.reduce((a, s) => a + s.total_alertas, 0);

    const elSes = document.getElementById('resumen-total-sesiones');
    const elMin = document.getElementById('resumen-total-minutos');
    const elAl  = document.getElementById('resumen-total-alertas');
    if (elSes) elSes.textContent = recientes.length;
    if (elMin) elMin.textContent = Math.round(totalMin);
    if (elAl)  elAl.textContent  = totalAl;

    const porDia = Array(7).fill(0);
    recientes.forEach(s => { porDia[new Date(s.inicio).getDay()] += s.duracion_seg / 60; });
    _renderizarGrafico(porDia);

    if (sesiones.length === 0) {
      contenedor.innerHTML = '<div class="sin-datos"><div style="font-size:2.5rem">📋</div><div class="sin-datos-titulo">Aun no hay sesiones</div><div class="sin-datos-desc">Inicia una sesión de monitoreo para que aparezca aquí.</div></div>';
      return;
    }

    contenedor.innerHTML = sesiones.map(s => {
      const fecha    = new Date(s.inicio);
      const fechaStr = fecha.toLocaleDateString('es', { day: '2-digit', month: 'short' });
      const horaStr  = fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      const durMin   = Math.round(s.duracion_seg / 60);
      const num      = s.total_alertas;
      const clase    = num === 0 ? 'sin-alertas' : num < 3 ? 'pocas' : 'muchas';
      const total    = (s.zona_normal || 0) + (s.zona_precaucion || 0) + (s.zona_riesgo || 0);
      const pN = total > 0 ? (s.zona_normal     / total * 100) : 0;
      const pP = total > 0 ? (s.zona_precaucion / total * 100) : 0;
      const pR = total > 0 ? (s.zona_riesgo     / total * 100) : 0;
      return `
      <li class="sesion-item">
        <div style="flex:1">
          <div class="sesion-fecha-hora">${fechaStr} a las ${horaStr}</div>
          <div class="sesion-duracion">${durMin > 0 ? durMin + ' min' : '< 1 min'}</div>
          <div class="sesion-barra-mini">
            <div class="sesion-barra-mini-seg" style="width:${pN}%;background:var(--verde)"></div>
            <div class="sesion-barra-mini-seg" style="width:${pP}%;background:var(--amarillo)"></div>
            <div class="sesion-barra-mini-seg" style="width:${pR}%;background:var(--rojo)"></div>
          </div>
        </div>
        <div class="sesion-alertas">
          <div class="sesion-alerta-num ${clase}">${num}</div>
          <div class="sesion-alerta-label">${num === 1 ? 'alerta' : 'alertas'}</div>
        </div>
      </li>`;
    }).join('');
  } catch (err) {
    contenedor.innerHTML = `<div class="sin-datos"><div class="sin-datos-titulo">No se pudo cargar</div><div class="sin-datos-desc">${err.message}</div></div>`;
  }
}

function _renderizarGrafico(porDia) {
  const dias   = ['D','L','M','X','J','V','S'];
  const maximo = Math.max(...porDia, 1);
  const el = document.getElementById('gráfico-semanal');
  if (!el) return;
  el.innerHTML = dias.map((d, i) => {
    const h = Math.round((porDia[i] / maximo) * 100);
    const c = porDia[i] > 60 ? 'var(--rojo)' : porDia[i] > 30 ? 'var(--amarillo)' : 'var(--verde)';
    return `<div class="grafico-columna"><div class="grafico-barra" style="height:100%"><div class="grafico-barra-relleno" style="height:${h}%;background:${c}"></div></div><div class="gráfico-día">${d}</div></div>`;
  }).join('');
}

// ============================================================
// TUTOR
// ============================================================
async function _cargarDatosTutor() {
  try {
    const codigos     = await API.obtenerCodigos();
    const sinVincular = codigos.find(c => !c.nino_id);
    if (sinVincular) {
      const el = document.getElementById('codigo-tutor-actual');
      if (el) el.textContent = sinVincular.codigo;
    }
  } catch (_) {}

  const contenedorNinos = document.getElementById('lista-ninos-tutor');
  if (contenedorNinos) {
    try {
      const ninos = await API.obtenerNinos();
      if (ninos.length === 0) {
        contenedorNinos.innerHTML = '<div class="sin-datos"><div style="font-size:2rem"></div><div class="sin-datos-titulo">Aún no hay niños vinculados</div><div class="sin-datos-desc">Comparte el código de arriba con el niño para vincularlo.</div></div>';
      } else {
        contenedorNinos.innerHTML = ninos.map(n => {
          const edad     = n.edad ? `${n.edad} años` : 'Edad no registrada';
          const sexo     = n.sexo === 'M' ? 'Masculino' : n.sexo === 'F' ? 'Femenino' : '';
          const minutos  = Math.round((n.total_segundos || 0) / 60);
          const pctRiesgo = n.pct_tiempo_riesgo_postural ? Math.round(n.pct_tiempo_riesgo_postural) : 0;
          return `
          <div class="nino-card">
            <div class="nino-card-titulo">${edad}${sexo ? ' · ' + sexo : ''}</div>
            <div class="nino-card-sub">Vinculado desde ${new Date(n.vinculado_en).toLocaleDateString('es')}</div>
            <div class="nino-stats">
              <div class="nino-stat"><div class="nino-stat-val">${n.total_sesiones || 0}</div><div class="nino-stat-lbl">Sesiones</div></div>
              <div class="nino-stat"><div class="nino-stat-val">${minutos}</div><div class="nino-stat-lbl">Min esta semana</div></div>
              <div class="nino-stat"><div class="nino-stat-val" style="color:${pctRiesgo > 30 ? 'var(--rojo)' : pctRiesgo > 10 ? 'var(--amarillo)' : 'var(--verde)'}">${pctRiesgo}%</div><div class="nino-stat-lbl">Tiempo en riesgo</div></div>
            </div>
          </div>`;
        }).join('');
      }
    } catch (err) {
      contenedorNinos.innerHTML = `<div class="sin-datos"><div class="sin-datos-desc">${err.message}</div></div>`;
    }
  }

  const contenedorAlertas = document.getElementById('lista-alertas-tutor');
  if (contenedorAlertas) {
    try {
      const alertas = await API.alertasRecientes();
      if (alertas.length === 0) {
        contenedorAlertas.innerHTML = '<div class="sin-datos"><div class="sin-datos-desc">No hay alertas de riesgo recientes.</div></div>';
      } else {
        contenedorAlertas.innerHTML = alertas.map(a => {
          const modulo = a.modulo === 'postural' ? 'postura del cuello' : 'distancia a la pantalla';
          const valor  = a.modulo === 'postural' ? `${Math.round(a.valor)}°` : `${Math.round(a.valor)} cm`;
          const hora   = new Date(a.momento).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          return `
          <div class="sesion-item">
            <div style="flex:1">
              <div class="sesion-fecha-hora">${hora}</div>
              <div class="sesion-duracion" style="font-size:0.88rem">${modulo}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:1.1rem;font-weight:800;color:var(--rojo)">${valor}</div>
              <div class="sesion-alerta-label">riesgo</div>
            </div>
          </div>`;
        }).join('');
      }
    } catch (_) {}
  }
}

async function generarNuevoCodigo() {
  try {
    const datos = await API.nuevoCodigo();
    const el = document.getElementById('codigo-tutor-actual');
    if (el) el.textContent = datos.codigo;
    _mostrarToast('Nuevo código generado.');
  } catch (err) {
    _mostrarToast('Error: ' + err.message);
  }
}

// ============================================================
// AJUSTES
// ============================================================
function guardarLongitudFocal() {
  const inputEl = document.getElementById('config-focal');
  if (!inputEl) return;
  const val = parseFloat(inputEl.value);
  if (val > 0) {
    Camara.setLongitudFocal(val);
    localStorage.setItem('monitor_focal', val);
    _mostrarToast('Calibración guardada.');
  }
}

// ============================================================
// PERFIL (compatibilidad — los elementos pueden no existir)
// ============================================================
function _inicializarPantallaPerfil() {
  const btnGuardar = document.getElementById('btn-guardar-perfil');
  const btnBorrar  = document.getElementById('btn-borrar-historial');
  if (btnGuardar) {
    btnGuardar.addEventListener('click', () => {
      const edad = parseInt(document.getElementById('perfil-edad').value) || null;
      const sexo = document.getElementById('perfil-sexo').value || null;
      localStorage.setItem('monitor_perfil', JSON.stringify({ edad, sexo }));
      _mostrarToast('Datos guardados.');
    });
  }
  if (btnBorrar) {
    btnBorrar.addEventListener('click', () => {
      if (confirm('¿Borrar todo el historial local? Esta acción no se puede deshacer.')) {
        localStorage.clear();
        _mostrarToast('Historial borrado.');
      }
    });
  }
}

// ============================================================
// UTILIDADES
// ============================================================
function _mostrarToast(texto) {
  const el = document.getElementById('toast-mensaje');
  if (!el) return;
  el.textContent   = texto;
  el.style.display = 'block';
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }, 3500);
}