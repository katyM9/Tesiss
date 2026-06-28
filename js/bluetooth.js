/* ============================================================
   bluetooth.js — Conexión BLE con el ESP32 TTGO + MPU6050
   UUIDs coinciden con el firmware entregado previamente.
   ============================================================ */

const Bluetooth = (() => {

  // UUIDs del perfil GATT del firmware ESP32
  const UUID_SERVICIO         = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
  const UUID_CARACTERISTICA   = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

  let dispositivo      = null;
  let servidor         = null;
  let caracteristica   = null;
  let intentando       = false;
  let conectado        = false;

  // Callbacks
  let onDatos        = null;
  let onConectado    = null;
  let onDesconectado = null;
  let onError        = null;

  // ---- Verificar soporte ----
  function soportado() {
    return navigator.bluetooth !== undefined;
  }

  // ---- Conectar ----
  async function conectar() {
    if (!soportado()) {
      if (onError) onError('Este navegador no permite Bluetooth. Usa Chrome para Android.');
      return false;
    }
    if (intentando || conectado) return false;
    intentando = true;

    try {
      dispositivo = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'Monitor Postural' }],
        optionalServices: [UUID_SERVICIO]
      });

      dispositivo.addEventListener('gattserverdisconnected', _manejarDesconexion);

      servidor = await dispositivo.gatt.connect();
      const servicio = await servidor.getPrimaryService(UUID_SERVICIO);
      caracteristica = await servicio.getCharacteristic(UUID_CARACTERISTICA);

      await caracteristica.startNotifications();
      caracteristica.addEventListener('characteristicvaluechanged', _manejarDatos);

      conectado = true;
      intentando = false;
      if (onConectado) onConectado(dispositivo.name);
      return true;

    } catch (err) {
      intentando = false;
      conectado  = false;
      if (err.name === 'NotFoundError') return false; // Usuario canceló
      if (onError) onError('No se pudo conectar. Verifica que el sensor esté encendido cerca del teléfono.');
      return false;
    }
  }

  // ---- Desconectar ----
  function desconectar() {
    if (dispositivo && dispositivo.gatt.connected) {
      dispositivo.gatt.disconnect();
    }
    _limpiar();
  }

  // ---- Manejar datos recibidos del ESP32 ----
  // El firmware envía un JSON: {"p": 23.4, "r": 1.2, "e": 0}
  // p = pitch (grados), r = roll (grados), e = estado (0=normal,1=precaucion,2=riesgo)
  function _manejarDatos(evento) {
    try {
      const texto = new TextDecoder().decode(evento.target.value);
      const datos = JSON.parse(texto);
      if (onDatos) onDatos({
        pitch:   parseFloat(datos.p) || 0,
        roll:    parseFloat(datos.r) || 0,
        estado:  parseInt(datos.e)   || 0
      });
    } catch (_) {
      // Dato mal formado — ignorar
    }
  }

  // ---- Manejar desconexión inesperada ----
  function _manejarDesconexion() {
    _limpiar();
    if (onDesconectado) onDesconectado();
  }

  function _limpiar() {
    conectado    = false;
    intentando   = false;
    servidor     = null;
    caracteristica = null;
  }

  // ---- Datos simulados para pruebas sin hardware ----
  let intervaloSimulacion = null;
  let pitchSim = 0;
  let direccionSim = 1;

  function iniciarSimulacion() {
    if (intervaloSimulacion) return;
    pitchSim = 10;
    direccionSim = 1;
    conectado = true;
    if (onConectado) onConectado('Simulación (sin sensor)');

    intervaloSimulacion = setInterval(() => {
      pitchSim += direccionSim * (Math.random() * 3);
      if (pitchSim > 65) direccionSim = -1;
      if (pitchSim < 5)  direccionSim =  1;
      pitchSim = Math.max(0, Math.min(70, pitchSim));

      if (onDatos) onDatos({
        pitch:  Math.round(pitchSim * 10) / 10,
        roll:   Math.round((Math.random() * 4 - 2) * 10) / 10,
        estado: pitchSim >= 45 ? 2 : pitchSim >= 30 ? 1 : 0
      });
    }, 100); // 10 Hz como el firmware real
  }

  function detenerSimulacion() {
    if (intervaloSimulacion) {
      clearInterval(intervaloSimulacion);
      intervaloSimulacion = null;
    }
    conectado = false;
    if (onDesconectado) onDesconectado();
  }

  return {
    conectar,
    desconectar,
    iniciarSimulacion,
    detenerSimulacion,
    get conectado()    { return conectado; },
    get soportado()    { return soportado(); },
    set onDatos(fn)        { onDatos = fn; },
    set onConectado(fn)    { onConectado = fn; },
    set onDesconectado(fn) { onDesconectado = fn; },
    set onError(fn)        { onError = fn; }
  };
})();
