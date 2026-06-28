/* ============================================================
   camara.js — Estimación de distancia rostro-pantalla
   Usa la API de detección de caras del navegador o un cálculo
   basado en la distancia interpupilar (MediaPipe-compatible).
   Fórmula: D = (W_real × f) / W_pixel  (triangulo pinhole)
   W_real para niños: ~57 mm (distancia interpupilar promedio)
   ============================================================ */

const Camara = (() => {

  const W_REAL_MM        = 57;    // distancia interpupilar niños (mm)
  let longitudFocal      = 620;   // píxeles — ajustable desde configuración
  let activa             = false;
  let streamActual       = null;
  let animFrameId        = null;
  let videoEl            = null;
  let canvasEl           = null;
  let ctxCanvas          = null;
  let detector           = null;
  let distanciaActual    = 0;
  let rostroDetectado    = false;
  let onDistancia        = null;
  let onRostro           = null;

  // ---- Inicializar con elementos del DOM ----
  function inicializar(video, canvas) {
    videoEl  = video;
    canvasEl = canvas;
    ctxCanvas = canvas.getContext('2d');
  }

  // ---- Iniciar cámara ----
  async function iniciar() {
    if (activa) return true;
    try {
      streamActual = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      videoEl.srcObject = streamActual;
      await new Promise(res => videoEl.onloadedmetadata = res);
      await videoEl.play();

      canvasEl.width  = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;

      activa = true;
      await _iniciarDetector();
      _bucle();
      return true;
    } catch (err) {
      activa = false;
      return false;
    }
  }

  // ---- Detener cámara ----
  function detener() {
    activa = false;
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (streamActual) {
      streamActual.getTracks().forEach(t => t.stop());
      streamActual = null;
    }
    if (videoEl) videoEl.srcObject = null;
    distanciaActual = 0;
    rostroDetectado = false;
  }

  // ---- Intentar usar FaceDetector nativo del navegador ----
  async function _iniciarDetector() {
    try {
      if ('FaceDetector' in window) {
        detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      }
    } catch (_) {
      detector = null;
    }
  }

  // ---- Bucle de análisis ----
  function _bucle() {
    if (!activa) return;
    animFrameId = requestAnimationFrame(async () => {
      await _analizar();
      _bucle();
    });
  }

  // ---- Analizar fotograma ----
  async function _analizar() {
    if (!videoEl || videoEl.readyState < 2) return;

    // Dibujar fotograma en canvas
    ctxCanvas.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

    if (detector) {
      try {
        const caras = await detector.detect(videoEl);
        if (caras.length === 0) {
          rostroDetectado = false;
          distanciaActual = 0;
          if (onRostro) onRostro(false);
          return;
        }

        const cara = caras[0];
        // Usamos el ancho del bounding box como aproximación a W_pixel
        // El FaceDetector nativo no da landmarks, así que estimamos:
        // Un ancho de cara ≈ 1.6× la distancia interpupilar en promedio
        const wPixelCara    = cara.boundingBox.width;
        const wPixelPupilas = wPixelCara / 1.65;

        distanciaActual = _calcularDistancia(wPixelPupilas);
        rostroDetectado = true;

        // Dibujar cuadro en canvas
        _dibujarCuadro(cara.boundingBox);

        if (onRostro)    onRostro(true);
        if (onDistancia) onDistancia(distanciaActual);

      } catch (_) {
        // FaceDetector fallo en este frame — ignorar
      }
    } else {
      // Sin detector nativo: retornar estimación basada en brillo
      // (modo degradado — solo para que la UI no quede vacía)
      distanciaActual = 0;
      rostroDetectado = false;
    }
  }

  // ---- Fórmula pinhole ----
  function _calcularDistancia(wPixel) {
    if (wPixel <= 0) return 0;
    const distCm = (W_REAL_MM * longitudFocal) / (wPixel * 10);
    // Limitar a rango razonable
    return Math.max(5, Math.min(200, Math.round(distCm)));
  }

  // ---- Dibujar cuadro sobre el rostro ----
  function _dibujarCuadro(bb) {
    ctxCanvas.clearRect(0, 0, canvasEl.width, canvasEl.height);
    const color = distanciaActual < 20 ? '#EF4444' :
                  distanciaActual < 30 ? '#EAB308' : '#22C55E';
    ctxCanvas.strokeStyle = color;
    ctxCanvas.lineWidth   = 2;
    ctxCanvas.strokeRect(bb.x, bb.y, bb.width, bb.height);
  }

  // ---- Calibración ----
  function calibrar(distanciaRealCm, wPixelMedido) {
    longitudFocal = (wPixelMedido * distanciaRealCm * 10) / W_REAL_MM;
    return longitudFocal;
  }

  function setLongitudFocal(valor) {
    longitudFocal = valor;
  }

  return {
    inicializar,
    iniciar,
    detener,
    calibrar,
    setLongitudFocal,
    get activa()          { return activa; },
    get distancia()       { return distanciaActual; },
    get rostroDetectado() { return rostroDetectado; },
    get longitudFocal()   { return longitudFocal; },
    set onDistancia(fn)   { onDistancia = fn; },
    set onRostro(fn)      { onRostro = fn; }
  };
})();
