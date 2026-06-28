/* ============================================================
   alertas.js — Lógica de alertas según umbrales de la tesis
   Posturales: Normal <30°, Precaución 30-45°, Riesgo ≥45°
   Visuales:   Segura >30cm, Precaución 20-30cm, Riesgo <20cm
   ============================================================ */

const Alertas = (() => {

  // Temporizadores por módulo
  const temporizadores = {
    postural: null,
    visual: null
  };

  // Tiempos acumulados en precaución
  let tiempoPrecaucionPostural = 0;  // segundos
  let tiempoPrecaucionVisual   = 0;

  // Momento en que comenzó la precaución
  let inicioPrecaucionPostural = null;
  let inicioPrecaucionVisual   = null;

  // Momento en que comenzó el riesgo (para el retraso de 5s postural / 10s visual)
  let inicioRiesgoPostural = null;
  let inicioRiesgoVisual   = null;

  // Estado anterior para detectar cambios
  let estadoAnteriorPostural = 'normal';
  let estadoAnteriorVisual   = 'normal';

  // Última alerta emitida para no repetirla
  let ultimaAlertaEmitida = null;
  let alertaActiva = false;

  // Callbacks
  let onAlerta = null;
  let onEstadoCambio = null;

  // ---- Clasificar ángulo (postural) ----
  function clasificarAngulo(angulo) {
    if (angulo < 30) return 'normal';
    if (angulo < 45) return 'precaución';
    return 'riesgo';
  }

  // ---- Clasificar distancia (visual) ----
  function clasificarDistancia(distancia) {
    if (distancia > 30) return 'normal';
    if (distancia >= 20) return 'precaución';
    return 'riesgo';
  }

  // ---- Evaluar módulo postural ----
  function evaluarPostural(angulo, ahora = Date.now()) {
    const estado = clasificarAngulo(angulo);

    if (estado !== estadoAnteriorPostural) {
      // Resetear temporizadores del estado anterior
      inicioRiesgoPostural      = null;
      inicioPrecaucionPostural  = null;
      tiempoPrecaucionPostural  = 0;

      if (estado === 'precaución') {
        inicioPrecaucionPostural = ahora;
      } else if (estado === 'riesgo') {
        inicioRiesgoPostural = ahora;
      }
      estadoAnteriorPostural = estado;
      if (onEstadoCambio) onEstadoCambio('postural', estado, angulo);
      return;
    }

    // Verificar duración en el mismo estado
    if (estado === 'precaución' && inicioPrecaucionPostural) {
      const segundos = (ahora - inicioPrecaucionPostural) / 1000;
      if (segundos >= 180 && !alertaActiva) { // 3 minutos
        emitirAlerta({
          tipo: 'precaución',
          modulo: 'postural',
          titulo: 'Descansa un momento',
          mensaje: 'Llevas más de 3 minutos con el cuello inclinado. Levanta la cabeza y toma 30 segundos de descanso.',
          angulo
        });
        inicioPrecaucionPostural = ahora; // reiniciar para no repetir inmediatamente
      }
    }

    if (estado === 'riesgo' && inicioRiesgoPostural) {
      const segundos = (ahora - inicioRiesgoPostural) / 1000;
      if (segundos >= 5 && !alertaActiva) { // 5 segundos continuos
        emitirAlerta({
          tipo: 'riesgo',
          modulo: 'postural',
          titulo: 'Postura de riesgo',
          mensaje: `Tu cuello está inclinado ${Math.round(angulo)} grados. Eso puede lastimarte. Levanta el teléfono al nivel de tus ojos y endereza la espalda.`,
          angulo
        });
      }
    }
  }

  // ---- Evaluar módulo visual ----
  function evaluarVisual(distancia, ahora = Date.now()) {
    if (!distancia || distancia <= 0) return;
    const estado = clasificarDistancia(distancia);

    if (estado !== estadoAnteriorVisual) {
      inicioRiesgoVisual     = null;
      inicioPrecaucionVisual = null;
      tiempoPrecaucionVisual = 0;

      if (estado === 'precaución') {
        inicioPrecaucionVisual = ahora;
      } else if (estado === 'riesgo') {
        inicioRiesgoVisual = ahora;
      }
      estadoAnteriorVisual = estado;
      if (onEstadoCambio) onEstadoCambio('visual', estado, distancia);
      return;
    }

    if (estado === 'precaución' && inicioPrecaucionVisual) {
      const segundos = (ahora - inicioPrecaucionVisual) / 1000;
      if (segundos >= 120 && !alertaActiva) { // 2 minutos
        emitirAlerta({
          tipo: 'precaución',
          modulo: 'visual',
          titulo: 'El teléfono esta muy cerca',
          mensaje: `Llevas mas de 2 minutos con el teléfono a ${Math.round(distancia)} cm. Lo recomendado es mas de 30 cm. Alejalo un poco.`,
          distancia
        });
        inicioPrecaucionVisual = ahora;
      }
    }

    if (estado === 'riesgo' && inicioRiesgoVisual) {
      const segundos = (ahora - inicioRiesgoVisual) / 1000;
      if (segundos >= 10 && !alertaActiva) { // 10 segundos continuos
        emitirAlerta({
          tipo: 'riesgo',
          modulo: 'visual',
          titulo: 'Distancia muy peligrosa',
          mensaje: `El teléfono esta a solo ${Math.round(distancia)} cm de tu cara. Esto puede dañar tus ojos. Alejalo hasta que estes cómodo.`,
          distancia
        });
      }
    }
  }

  // ---- Calcular estado combinado ----
  function estadoCombinado(estadoPostural, estadoVisual) {
    const prioridad = { riesgo: 2, precaución: 1, normal: 0 };
    return prioridad[estadoPostural] >= prioridad[estadoVisual]
      ? estadoPostural
      : estadoVisual;
  }

  // ---- Emitir alerta ----
  function emitirAlerta(datos) {
    alertaActiva = true;
    ultimaAlertaEmitida = datos;

    // Vibración del dispositivo
    if (navigator.vibrate) {
      if (datos.tipo === 'riesgo')     navigator.vibrate([300, 100, 300, 100, 300]);
      else                              navigator.vibrate([200, 100, 200]);
    }

    if (onAlerta) onAlerta(datos);

    // Registrar en historial de la sesión actual
    Historial.registrarAlerta(datos);
  }

  function cerrarAlerta() {
    alertaActiva = false;
    ultimaAlertaEmitida = null;
    // Reiniciar el temporizador de riesgo para no disparar inmediatamente
    const ahora = Date.now();
    if (estadoAnteriorPostural === 'riesgo') inicioRiesgoPostural = ahora;
    if (estadoAnteriorVisual   === 'riesgo') inicioRiesgoVisual   = ahora;
  }

  function reiniciar() {
    estadoAnteriorPostural    = 'normal';
    estadoAnteriorVisual      = 'normal';
    tiempoPrecaucionPostural  = 0;
    tiempoPrecaucionVisual    = 0;
    inicioPrecaucionPostural  = null;
    inicioPrecaucionVisual    = null;
    inicioRiesgoPostural      = null;
    inicioRiesgoVisual        = null;
    alertaActiva              = false;
    ultimaAlertaEmitida       = null;
  }

  return {
    evaluarPostural,
    evaluarVisual,
    clasificarAngulo,
    clasificarDistancia,
    estadoCombinado,
    cerrarAlerta,
    reiniciar,
    set onAlerta(fn)       { onAlerta = fn; },
    set onEstadoCambio(fn) { onEstadoCambio = fn; },
    get alertaActiva()     { return alertaActiva; }
  };
})();
