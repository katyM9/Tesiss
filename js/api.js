/* ============================================================
   api.js — Comunicación con el backend Node.js
   Maneja autenticación, sesiones y envío de datos.
   ============================================================ */

const API = (() => {

  // ---- Detectar IP automáticamente ----
  const IP = window.location.hostname;
  const BASE_URL = `http://${IP}:3001/api`;

  console.log(`🔗 Conectando a: ${BASE_URL}`);

  // ---- Token de sesión ----
  function obtenerToken() {
    return localStorage.getItem('monitor_token');
  }

  function guardarToken(token) {
    localStorage.setItem('monitor_token', token);
  }

  function borrarToken() {
    localStorage.removeItem('monitor_token');
    localStorage.removeItem('monitor_usuario');
  }

  function obtenerUsuario() {
    try {
      return JSON.parse(localStorage.getItem('monitor_usuario'));
    } catch (_) { return null; }
  }

  function guardarUsuario(usuario) {
    localStorage.setItem('monitor_usuario', JSON.stringify(usuario));
  }

  function estaAutenticado() {
    return !!obtenerToken();
  }

  // ---- Petición base con manejo de errores mejorado ----
  async function peticion(metodo, ruta, cuerpo = null) {
    const token = obtenerToken();
    const url = BASE_URL + ruta;
    
    console.log(`📤 ${metodo} ${url}`);
    if (cuerpo) console.log('📦 Body:', cuerpo);

    const opciones = {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    };
    if (cuerpo) opciones.body = JSON.stringify(cuerpo);

    try {
      const respuesta = await fetch(url, opciones);
      
      // Obtener la respuesta como texto primero
      const texto = await respuesta.text();
      console.log(`📥 Respuesta (${respuesta.status}):`, texto.substring(0, 200) + (texto.length > 200 ? '...' : ''));
      
      // Intentar parsear como JSON
      let datos;
      try {
        datos = JSON.parse(texto);
      } catch (e) {
        console.error('❌ No es JSON válido:', texto);
        throw new Error(`El servidor respondió con un formato inválido. Status: ${respuesta.status}`);
      }
      
      if (!respuesta.ok) {
        throw new Error(datos.error || `Error ${respuesta.status}: ${respuesta.statusText}`);
      }
      return datos;
    } catch (err) {
      console.error('❌ Error en petición:', err.message);
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        throw new Error(`No se pudo conectar con el servidor (${url}). Verifica que el servidor esté corriendo y accesible.`);
      }
      throw err;
    }
  }

  // ============================================================
  // AUTH
  // ============================================================
  async function registrarTutor({ correo, password, edad, sexo }) {
    const datos = await peticion('POST', '/auth/registro-tutor', { correo, password, edad, sexo });
    guardarToken(datos.token);
    guardarUsuario(datos.usuario);
    return datos;
  }

  async function vincularNino({ codigo, edad, sexo }) {
    const datos = await peticion('POST', '/auth/vincular-nino', { codigo, edad, sexo });
    guardarToken(datos.token);
    guardarUsuario(datos.usuario);
    return datos;
  }

  async function login({ correo, password }) {
    const datos = await peticion('POST', '/auth/login', { correo, password });
    guardarToken(datos.token);
    guardarUsuario(datos.usuario);
    return datos;
  }

  async function cerrarSesionAuth() {
    borrarToken();
  }

  async function nuevoCodigo() {
    return peticion('POST', '/auth/nuevo-codigo');
  }

  // ============================================================
  // SESIONES DE MONITOREO
  // ============================================================
  async function iniciarSesion() {
    return peticion('POST', '/sesiones/iniciar');
  }

  async function finalizarSesion(sesionId, resumen) {
    return peticion('PUT', `/sesiones/${sesionId}/finalizar`, resumen);
  }

  // Buffer local para acumular muestras antes de enviarlas en lote
  let bufferPosturales = [];
  let bufferVisuales   = [];
  let intervaloEnvio   = null;

  function agregarMuestraPostural(pitch, roll = 0) {
    bufferPosturales.push({ pitch, roll });
    if (bufferPosturales.length > 10) bufferPosturales.shift();
  }

  function agregarMuestraVisual(distancia) {
    bufferVisuales.push({ distancia });
    if (bufferVisuales.length > 10) bufferVisuales.shift();
  }

  function iniciarEnvioAutomatico(sesionId) {
    if (intervaloEnvio) clearInterval(intervaloEnvio);
    intervaloEnvio = setInterval(async () => {
      const post = [...bufferPosturales];
      const vis  = [...bufferVisuales];
      bufferPosturales = [];
      bufferVisuales   = [];

      if (post.length === 0 && vis.length === 0) return;
      try {
        await peticion('POST', `/sesiones/${sesionId}/muestras`, {
          posturales: post,
          visuales:   vis
        });
      } catch (_) {
        // Si falla el envío, no interrumpir el monitoreo
      }
    }, 10000);
  }

  function detenerEnvioAutomatico() {
    if (intervaloEnvio) {
      clearInterval(intervaloEnvio);
      intervaloEnvio = null;
    }
    bufferPosturales = [];
    bufferVisuales   = [];
  }

  async function registrarAlerta(sesionId, { tipo, modulo, valor }) {
    try {
      await peticion('POST', `/sesiones/${sesionId}/alerta`, { tipo, modulo, valor });
    } catch (_) {}
  }

  async function obtenerHistorial() {
    return peticion('GET', '/sesiones/historial');
  }

  // ============================================================
  // TUTOR
  // ============================================================
  async function obtenerNinos() {
    return peticion('GET', '/tutor/ninos');
  }

  async function historialNino(ninoId) {
    return peticion('GET', `/tutor/ninos/${ninoId}/historial`);
  }

  async function obtenerCodigos() {
    return peticion('GET', '/tutor/codigos');
  }

  async function alertasRecientes() {
    return peticion('GET', '/tutor/alertas-recientes');
  }

  return {
    obtenerToken, obtenerUsuario, estaAutenticado,
    cerrarSesionAuth,
    registrarTutor, vincularNino, login, nuevoCodigo,
    iniciarSesion, finalizarSesion,
    agregarMuestraPostural, agregarMuestraVisual,
    iniciarEnvioAutomatico, detenerEnvioAutomatico,
    registrarAlerta,
    obtenerHistorial,
    obtenerNinos, historialNino, obtenerCodigos, alertasRecientes
  };
})();