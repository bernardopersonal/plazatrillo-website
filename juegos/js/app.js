(function () {
  const C = window.CONTENIDO;
  const TEMAS = window.TEMAS;
  const { hablar } = window.Voz;
  const $ = (s) => document.querySelector(s);
  const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];
  const barajar = (lista) => lista.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Guardado local (solo en este dispositivo, si el navegador lo permite) ----------
  const guardado = {
    leer(k, def) { try { return JSON.parse(localStorage.getItem('jp-' + k)) ?? def; } catch { return def; } },
    escribir(k, v) { try { localStorage.setItem('jp-' + k, JSON.stringify(v)); return true; } catch { return false; } },
    borrar(k) { try { localStorage.removeItem('jp-' + k); } catch { /* nada */ } },
  };

  // ---------- Perfiles ----------
  // Leo y Lía vienen de PERFILES_CON_VOZ; sus cambios (foto, tema...) se guardan encima.
  // Los demás perfiles se crean desde "+ Otro niño".
  function cargarPerfiles() {
    const guardados = guardado.leer('perfiles', {});
    const lista = Object.entries(C.PERFILES_CON_VOZ).map(([id, p]) => ({
      id, nombre: p.nombre, edad: p.edad, tema: p.tema, emoji: p.emoji, foto: null, conVoz: true,
      ...(guardados[id] || {}),
    }));
    Object.values(guardados).forEach((p) => { if (!C.PERFILES_CON_VOZ[p.id]) lista.push({ ...p, conVoz: false }); });
    return lista;
  }
  let perfiles = cargarPerfiles();
  let perfil = null; // el que está jugando

  function guardarPerfil(p) {
    const guardados = guardado.leer('perfiles', {});
    const { conVoz, ...datos } = p;
    guardados[p.id] = datos;
    if (!guardado.escribir('perfiles', guardados) && p.foto) {
      // Si no cabe la foto, se guarda sin ella
      guardados[p.id] = { ...datos, foto: null };
      guardado.escribir('perfiles', guardados);
    }
    perfiles = cargarPerfiles();
  }
  function borrarPerfil(id) {
    const guardados = guardado.leer('perfiles', {});
    delete guardados[id];
    guardado.escribir('perfiles', guardados);
    ['estrellas', 'trazados', 'nivel', 'letra'].forEach((k) => guardado.borrar(k + '-' + id));
    perfiles = cargarPerfiles();
  }
  const dato = (k, def) => guardado.leer(k + '-' + perfil.id, def);
  const guardarDato = (k, v) => guardado.escribir(k + '-' + perfil.id, v);

  // ---------- Tipo de letra: ABC (mayúsculas) / abc (minúsculas) / Abc (mixto) ----------
  // Se recuerda por niño. Los valores internos (respuestas, audios) no cambian: solo cómo se ven.
  const MODOS_LETRA = { mayus: 'ABC', minus: 'abc', mixto: 'Abc' };
  const SIGUIENTE_LETRA = { mayus: 'minus', minus: 'mixto', mixto: 'mayus' };
  const NOMBRE_MODO_LETRA = { mayus: 'mayúsculas', minus: 'minúsculas', mixto: 'mayúscula y minúsculas' };
  function modoLetra() {
    const m = perfil ? dato('letra', 'mayus') : 'mayus';
    return MODOS_LETRA[m] ? m : 'mayus';
  }
  // Cómo se escribe en pantalla un texto según el modo.
  // Mixto: primera letra mayúscula y el resto minúscula (inicial: false → todo minúscula);
  // una letra suelta se enseña en pareja: "M m", separadas por un espacio fino
  // (juntas, "Ll" se lee como la elle de "Llama").
  const ESPACIO_FINO = ' ';
  function comoLetra(texto, { inicial = true } = {}) {
    const t = String(texto);
    const modo = modoLetra();
    if (modo === 'mayus') return t.toUpperCase();
    const min = t.toLowerCase();
    if (modo === 'minus' || !inicial) return min;
    if (min.length === 1 && min !== min.toUpperCase()) return min.toUpperCase() + ESPACIO_FINO + min;
    return min.charAt(0).toUpperCase() + min.slice(1);
  }
  // ¿Hay trazos para este carácter? (las minúsculas se van añadiendo en js/trazos.js)
  const tieneGlifo = (c) => { const g = window.Trazos.glifo(c); return !!(g && g.length); };
  // Carácter que se traza según el modo: en minúsculas, la minúscula (si ya tiene trazos);
  // en mayúsculas y en mixto (un carácter suelto), la mayúscula. Los números no cambian.
  function casoTrazo(c) {
    const min = c.toLowerCase();
    return modoLetra() === 'minus' && tieneGlifo(min) ? min : c.toUpperCase();
  }
  // Pone un texto "para leer" en un elemento y lo apunta para repintarlo si cambia el tipo de letra.
  // Solo toca el primer nodo de texto, así no se pierden los hijos (el 🔊 de las fichas).
  function letrero(el, texto, { inicial = true } = {}) {
    el.dataset.letra = texto;
    if (!inicial) el.dataset.inicial = 'no';
    pintarLetrero(el);
    return el;
  }
  function pintarLetrero(el) {
    const s = comoLetra(el.dataset.letra, { inicial: el.dataset.inicial !== 'no' });
    const n = el.firstChild;
    if (n && n.nodeType === Node.TEXT_NODE) n.nodeValue = s;
    else el.insertBefore(document.createTextNode(s), n);
    el.classList.toggle('pareja', el.dataset.letra.length === 1 && s.length > 1); // "M m"
    el.classList.toggle('minus', s.length === 1 && s !== s.toUpperCase()); // una minúscula suelta: algo más grande
    el.classList.toggle('caps', s.length > 1 && s === s.toUpperCase() && s !== s.toLowerCase()); // "MIÉRCOLES"
  }

  function pintarAvatar(caja, p) {
    caja.innerHTML = '';
    if (p.foto) {
      const img = document.createElement('img');
      img.src = p.foto;
      img.alt = '';
      caja.appendChild(img);
    } else caja.textContent = p.emoji || '🙂';
  }

  // ---------- Temas ----------
  function aplicarTema(t) {
    const r = document.documentElement;
    ['fondo', 'tinta', 'tarjeta', 'guia', 'c1', 'c2', 'c3', 'c4', 'acento'].forEach((k) => r.style.setProperty('--' + k, t[k]));
    r.classList.toggle('oscuro', !!t.oscuro);
    [...r.classList].filter((c) => c.startsWith('tema-')).forEach((c) => r.classList.remove(c));
    if (t.clase) r.classList.add(t.clase);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = t.fondo;
    const deco = $('#deco');
    deco.innerHTML = '';
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.textContent = t.deco[i % t.deco.length];
      s.style.left = ((i * 37) % 100) + 'vw';
      s.style.top = ((i * 61 + 7) % 100) + 'vh';
      s.style.animationDelay = -i * 0.7 + 's';
      deco.appendChild(s);
    }
    temaActual = t;
  }
  let temaActual = window.TEMA_INICIO;

  // ---------- Navegación ----------
  const PADRE = { perfil: 'inicio', menu: 'inicio', elegir: 'menu', trazar: 'elegir', juego: 'menu' };
  let vista = 'inicio';

  function ir(destino) {
    vista = destino;
    document.querySelectorAll('.vista').forEach((v) => (v.hidden = v.id !== 'v-' + destino));
    $('#btn-atras').hidden = destino === 'inicio';
    if (destino === 'inicio') {
      perfil = null;
      aplicarTema(window.TEMA_INICIO);
      pintarPerfiles();
    }
    const enJuego = !!perfil && destino !== 'perfil';
    $('#avatar-mini').hidden = !enJuego;
    if (enJuego) pintarAvatar($('#avatar-mini'), perfil);
    $('#titulo').textContent =
      destino === 'inicio' ? 'Juegos peques'
        : destino === 'perfil' ? (editando && editando.nombre ? editando.nombre : 'Nuevo jugador')
          : perfil.nombre;
    pintarEstrellas();
    pintarBtnLetra();
    if (destino === 'elegir') pintarRejillas(); // con el tipo de letra de ahora y las letras ya hechas
    window.scrollTo(0, 0);
    if (destino === 'trazar') ajustarLienzo();
  }
  $('#btn-atras').addEventListener('click', () => {
    ronda++;
    limpiarTrazadores();
    ir(PADRE[vista]);
  });

  // Botón ABC → abc → Abc (solo mientras juega un niño)
  function pintarBtnLetra() {
    const b = $('#btn-letra');
    b.hidden = !perfil || !['menu', 'elegir', 'trazar', 'juego'].includes(vista);
    if (b.hidden) return;
    const m = modoLetra();
    b.textContent = MODOS_LETRA[m];
    // El nombre accesible empieza por lo que se ve (ABC / abc / Abc): así se encuentra también por voz
    b.setAttribute('aria-label', MODOS_LETRA[m] + ': letra en ' + NOMBRE_MODO_LETRA[m] + '. Toca para cambiar.');
  }
  $('#btn-letra').addEventListener('click', () => {
    if (!perfil) return;
    guardarDato('letra', SIGUIENTE_LETRA[modoLetra()]);
    pintarBtnLetra();
    repintarLetras();
  });
  // Repinta la pantalla actual con el nuevo tipo de letra, sin empezar otra ronda.
  function repintarLetras() {
    if (vista === 'elegir') pintarRejillas();
    else if (vista === 'trazar' && actual) {
      const nuevo = casoTrazo(actual);
      if (nuevo !== actual) { actual = nuevo; principal.cargar(nuevo); } // se llama igual: no hace falta volver a decirlo
    } else if (vista === 'juego') {
      if (juego === 'silabas' && modoSilabas() === 'escribir') rehacerEscritura();
      else document.querySelectorAll('#v-juego [data-letra]').forEach(pintarLetrero);
    }
  }

  // ---------- Estrellas y fiesta ----------
  function pintarEstrellas() {
    const e = $('#estrellas');
    e.hidden = !perfil || vista === 'perfil';
    if (!e.hidden) e.querySelector('b').textContent = dato('estrellas', 0);
  }
  function ganarEstrella() {
    guardarDato('estrellas', dato('estrellas', 0) + 1);
    pintarEstrellas();
  }
  function fiesta() {
    const caja = $('#fiesta');
    for (let i = 0; i < 24; i++) {
      const s = document.createElement('span');
      s.textContent = azar(temaActual.fiesta);
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDelay = Math.random() * 0.5 + 's';
      caja.appendChild(s);
      setTimeout(() => s.remove(), 2400);
    }
  }
  let ctxAudio;
  function pip(frec = 660) {
    try {
      ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctxAudio.createOscillator();
      const g = ctxAudio.createGain();
      o.frequency.value = frec;
      g.gain.setValueAtTime(0.15, ctxAudio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctxAudio.currentTime + 0.25);
      o.connect(g).connect(ctxAudio.destination);
      o.start();
      o.stop(ctxAudio.currentTime + 0.25);
    } catch { /* sin sonido */ }
  }
  // Felicitación: con nombre solo para Leo y Lía (los que tienen audio con su nombre)
  const bravo = () => azar(C.felicitaciones(perfil.id));

  // =====================================================
  // INICIO: ¿QUIÉN JUEGA?
  // =====================================================
  function pintarPerfiles() {
    const caja = $('#perfiles');
    caja.innerHTML = '';
    perfiles.forEach((p) => {
      const t = TEMAS[p.tema] || TEMAS.divertido;
      const el = document.createElement('div');
      el.className = 'perfil';
      el.innerHTML = '<button class="entrar"><span class="avatar"></span><span class="nombre"></span></button>' +
        '<button class="editar" aria-label="Cambiar foto o tema">✏️</button>';
      const entrar = el.querySelector('.entrar');
      entrar.style.background = t.c1;
      pintarAvatar(el.querySelector('.avatar'), p);
      el.querySelector('.nombre').textContent = p.nombre;
      entrar.addEventListener('click', () => elegirPerfil(p));
      el.querySelector('.editar').addEventListener('click', () => abrirFormulario(p));
      caja.appendChild(el);
    });
    const nuevo = document.createElement('div');
    nuevo.className = 'perfil nuevo';
    nuevo.innerHTML = '<button class="entrar"><span class="avatar">➕</span>Otro niño</button>';
    nuevo.querySelector('.entrar').addEventListener('click', () => abrirFormulario(null));
    caja.appendChild(nuevo);
  }

  async function elegirPerfil(p) {
    perfil = p;
    aplicarTema(TEMAS[p.tema] || TEMAS.divertido);
    prepararMenu();
    ir('menu');
    await hablar(C.bienvenida(p.id));
    if (perfil === p && vista === 'menu') hablar(C.comun.aQueJugamos);
  }

  // =====================================================
  // CREAR / EDITAR PERFIL
  // =====================================================
  const EMOJIS = ['🐱', '🐶', '🦊', '🐼', '🐸', '🦁', '🐵', '🐰', '🦋', '🦖', '🦄', '🐙', '🐯', '🐨', '🚀', '⚽', '👑', '🚗'];
  let editando = null;

  function abrirFormulario(p) {
    const esNuevo = !p;
    editando = p ? { ...p } : { id: 'p' + Date.now(), nombre: '', edad: null, tema: 'divertido', emoji: azar(EMOJIS), foto: null, conVoz: false };
    $('#pf-nombre').value = editando.nombre;
    $('#pf-nombre').disabled = editando.conVoz; // el nombre de Leo y Lía va unido a su voz
    $('#pf-borrar').hidden = esNuevo || editando.conVoz;
    $('#pf-confirmar').hidden = true;
    $('#pf-guardar').textContent = esNuevo ? '¡A jugar!' : 'Guardar';
    pintarFormulario();
    ir('perfil');
    if (esNuevo) hablar(C.comun.comoTeLlamas).then(() => $('#pf-nombre').focus());
  }

  function pintarFormulario() {
    aplicarTema(TEMAS[editando.tema] || TEMAS.divertido);
    pintarAvatar($('#pf-avatar'), editando);

    const edades = $('#pf-edades');
    edades.innerHTML = '';
    for (let e = 2; e <= 10; e++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (editando.edad === e ? ' activo' : '');
      b.textContent = e;
      b.addEventListener('click', () => { editando.edad = e; pintarFormulario(); });
      edades.appendChild(b);
    }

    const emojis = $('#pf-emojis');
    emojis.querySelectorAll('button').forEach((b) => b.remove());
    $('.chip-foto').classList.toggle('activo', !!editando.foto);
    EMOJIS.forEach((em) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (!editando.foto && editando.emoji === em ? ' activo' : '');
      b.textContent = em;
      b.addEventListener('click', () => { editando.emoji = em; editando.foto = null; pintarFormulario(); });
      emojis.appendChild(b);
    });

    const temas = $('#pf-temas');
    temas.innerHTML = '';
    Object.entries(TEMAS).forEach(([id, t]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tema' + (editando.tema === id ? ' activo' : '');
      b.style.background = t.fondo;
      b.style.color = t.tinta;
      b.innerHTML = '<span class="emoji"></span><span></span>';
      b.firstChild.textContent = t.emoji;
      b.lastChild.textContent = t.nombre;
      b.addEventListener('click', () => { editando.tema = id; pintarFormulario(); });
      temas.appendChild(b);
    });
  }

  // Foto: se recorta en cuadrado de 256 px y se guarda solo en este dispositivo
  $('#pf-foto').addEventListener('change', (ev) => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    const img = new Image();
    img.onload = () => {
      const lado = Math.min(img.width, img.height);
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      cv.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
      editando.foto = cv.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(img.src);
      pintarFormulario();
    };
    img.src = URL.createObjectURL(archivo);
    ev.target.value = '';
  });

  $('#form-perfil').addEventListener('submit', (ev) => {
    ev.preventDefault();
    editando.nombre = editando.conVoz ? editando.nombre : $('#pf-nombre').value.trim();
    if (!editando.nombre) { $('#pf-nombre').focus(); hablar(C.comun.comoTeLlamas); return; }
    if (!editando.edad) { $('#pf-edades').scrollIntoView({ block: 'center' }); hablar(C.comun.cuantosAnos); return; }
    guardarPerfil(editando);
    const p = perfiles.find((x) => x.id === editando.id);
    editando = null;
    elegirPerfil(p);
  });
  $('#pf-borrar').addEventListener('click', () => { $('#pf-confirmar').hidden = false; });
  $('#pf-borrar-no').addEventListener('click', () => { $('#pf-confirmar').hidden = true; });
  $('#pf-borrar-si').addEventListener('click', () => { borrarPerfil(editando.id); editando = null; ir('inicio'); });

  // =====================================================
  // MENÚ DE JUEGOS (según la edad)
  // =====================================================
  const JUEGOS = {
    trazar: { emoji: '✏️', nombre: 'Trazar' },
    contar: { emoji: '🔢', nombre: 'Contar' },
    colores: { emoji: '🎨', nombre: 'Colores' },
    letras: { emoji: '🔤', nombre: 'Letras' },
    sonidos: { emoji: '👂', nombre: 'Sonidos' },
    silabas: { emoji: '🧩', nombre: 'Sílabas' },
    palabras: { emoji: '📖', nombre: 'Palabras' },
    dias: { emoji: '🚂', nombre: 'Días de la semana' },
  };
  const esPeque = () => perfil.edad <= C.EDAD_PEQUES;

  function prepararMenu() {
    const lista = esPeque() ? ['trazar', 'contar', 'colores', 'letras'] : ['dias', 'trazar', 'sonidos', 'silabas', 'palabras'];
    const caja = $('#juegos');
    caja.classList.toggle('peques', esPeque());
    caja.innerHTML = '';
    lista.forEach((id, i) => {
      const b = document.createElement('button');
      const ancha = esPeque() ? id === 'trazar' : id === 'dias';
      b.className = 'tarjeta ' + (id === 'dias' ? 'tarjeta-dias' : 't' + (((i - (esPeque() ? 0 : 1)) % 4) + 1)) + (ancha ? ' ancha' : '');
      b.innerHTML = '<span class="emoji"></span><span></span>';
      b.firstChild.textContent = JUEGOS[id].emoji;
      b.lastChild.textContent = JUEGOS[id].nombre;
      b.addEventListener('click', () => abrirJuego(id));
      caja.appendChild(b);
    });
    $('#nivel-caja').hidden = esPeque();
    if (!esPeque()) pintarNiveles();
  }
  function nivelActual() { return dato('nivel', perfil.edad >= 7 ? 1 : 0); }
  function pintarNiveles() {
    const caja = $('#niveles');
    caja.innerHTML = '';
    C.NIVELES.forEach((n, i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (i === nivelActual() ? ' activo' : '');
      b.textContent = i + 1 + '. ' + n.nombre;
      b.addEventListener('click', () => { guardarDato('nivel', i); pintarNiveles(); });
      caja.appendChild(b);
    });
  }

  async function abrirJuego(id) {
    if (id === 'trazar') {
      ir('elegir');
      hablar(C.trazar.intro);
      return;
    }
    juego = id;
    ir('juego');
    if (id === 'dias' && !dato('video-dias-visto', false)) {
      guardarDato('video-dias-visto', true);
      abrirIntro('media/dias.mp4'); // la primera vez, el vídeo de los días
    }
    pintarModos();
    const r = ++ronda;
    limpiarTrazadores();
    $('#escena').innerHTML = '';
    $('#opciones').innerHTML = '';
    if (introJuego()) await hablar(introJuego());
    if (r === ronda) nuevaRonda();
  }
  function introJuego() {
    if (juego === 'silabas' && modoSilabas() === 'escribir') return C.silabas.introEscribir;
    if (juego === 'dias') return null;
    return C[juego].intro;
  }

  // =====================================================
  // TRAZADOR: motor de trazado (Trazar y escribir sílabas)
  // modo 'completo': guía + bolita siempre (Trazar)
  // modo 'guia':     letra clarita; la bolita sale con la pista
  // modo 'oculto':   hoja en blanco; con la pista sale la letra y la bolita
  // =====================================================
  // La letra se da por buena en cuanto se acaba su último trazo. Cada trazo se sigue en orden, y vale
  // empezarlo en cualquiera de sus 5 primeros puntos (los peques no siempre aciertan con la bolita).
  // Sin guía, la letra se coloca a lo ancho donde el niño empieza a escribirla.
  const ESPERA_PISTA = 5000; // ms sin avanzar antes de enseñar la pista
  // Con pauta, la letra va de y=10 (b, d, l...) a y=94 (rabito de g, p, q...) y la guía tiene 15 de grueso:
  // se dibuja todo al 90 % y centrado para que no se corte contra el borde del lienzo.
  const MARGEN_PAUTA = { s: 0.9, dx: 5, dy: 3.2 };
  // Mezcla dos colores #rrggbb (p = cuánto del segundo)
  function mezclar(a, b, p) {
    const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const A = rgb(a), B = rgb(b);
    return '#' + A.map((v, i) => Math.round(v * (1 - p) + B[i] * p).toString(16).padStart(2, '0')).join('');
  }
  let trazadores = [];
  function limpiarTrazadores() { trazadores.forEach((t) => t.destruir()); trazadores = []; }

  class Trazador {
    constructor(lienzo, opciones = {}) {
      this.cv = lienzo;
      this.ctx = lienzo.getContext('2d');
      this.op = opciones;
      this.activo = true;
      this.T = null;
      // Los dedos que tocan ahora el lienzo (pointerId → su tinta, último punto y recorrido): cada uno va por su
      // cuenta, así la palma o un segundo dedo no cortan el trazo del que dibuja ni le pintan una raya hasta él
      this.dedos = new Map();
      lienzo.addEventListener('pointerdown', (ev) => this.abajo(ev));
      lienzo.addEventListener('pointermove', (ev) => this.mover(ev));
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((e) => lienzo.addEventListener(e, (ev) => this.arriba(ev)));
    }
    get modo() { return this.op.modo || 'completo'; }
    // Tolerancia en unidades de la cuadrícula. Sin guía, las minúsculas (la mitad de altas) con menos:
    // con 16 una raya hacía la 'e' o la 's'.
    get tol() {
      if (this.modo === 'oculto' && this.T && window.Trazos.esMinuscula(this.T.c)) return 11;
      return { completo: 12, guia: 13, oculto: 16 }[this.modo];
    }
    cargar(c) {
      // pauta: true = siempre (Escribir); 'auto' = solo con las minúsculas (Trazar)
      const pauta = this.op.pauta === 'auto' ? window.Trazos.esMinuscula(c) : !!this.op.pauta;
      const trazos = window.Trazos.glifo(c, { pauta }) || window.Trazos.glifo(c.toUpperCase(), { pauta });
      const guias = trazos.map((t) => window.Trazos.puntos(t));
      const xs = guias.flat().map((q) => q[0]);
      this.T = {
        c, pauta, i: 0, j: 0, tinta: [], fin: false,
        dx: 0, // sin guía: cuánto a la derecha (o izquierda) ha empezado el niño la letra
        ult: null, // sin guía: dónde levantó el dedo tras un trazo de verdad (para seguir desde ahí)
        xmin: Math.min(...xs), xmax: Math.max(...xs),
        guias,
        ctrl: trazos.map((t) => window.Trazos.controles(t)),
      };
      this.dedos.clear();
      this.conPista = this.modo === 'completo';
      this.reloj();
      this.dibujar();
    }
    activar(si) { this.activo = si; this.reloj(); this.dibujar(); }
    pista() { this.conPista = true; clearTimeout(this._reloj); this.dibujar(); }
    reloj() {
      clearTimeout(this._reloj);
      if (this.activo && this.T && !this.T.fin && !this.conPista) this._reloj = setTimeout(() => this.pista(), ESPERA_PISTA);
    }
    destruir() { clearTimeout(this._reloj); this.T = null; }
    ajustar() {
      const r = this.cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.cv.width = Math.round(r.width * dpr);
      this.cv.height = Math.round(r.height * dpr);
      this.dibujar();
    }
    camino(pts, hasta = pts.length) {
      const k = this.cv.width / 100;
      const ctx = this.ctx;
      ctx.beginPath();
      pts.slice(0, hasta).forEach(([x, y], n) => (n ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
      if (Math.min(hasta, pts.length) === 1) ctx.lineTo(pts[0][0] * k + 0.01, pts[0][1] * k); // un punto (el de la i): que se vea
    }
    // Pauta de 4 líneas del cuaderno: arriba y abajo suaves, la de la x discontinua, la base más marcada
    pintarPauta() {
      const { asc, x, base, desc } = window.Trazos.LINEAS;
      const ctx = this.ctx;
      const k = this.cv.width / 100;
      const linea = (y, alfa, grosor, discontinua) => {
        ctx.globalAlpha = alfa;
        ctx.lineWidth = grosor * k;
        ctx.setLineDash(discontinua ? [2.5 * k, 2 * k] : []);
        ctx.beginPath(); ctx.moveTo(4 * k, y * k); ctx.lineTo(96 * k, y * k); ctx.stroke();
      };
      ctx.save();
      ctx.strokeStyle = temaActual.tinta;
      ctx.lineCap = 'butt';
      linea(asc, 0.16, 0.6);
      linea(desc, 0.16, 0.6);
      linea(x, 0.3, 0.7, true);
      linea(base, this.modo === 'completo' ? 0.5 : 0.35, 1.1);
      ctx.restore();
    }
    dibujar() {
      const T = this.T;
      const ctx = this.ctx;
      const k = this.cv.width / 100;
      const t = temaActual;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      if (!T) return;
      if (T.pauta) ctx.setTransform(MARGEN_PAUTA.s, 0, 0, MARGEN_PAUTA.s, MARGEN_PAUTA.dx * k, MARGEN_PAUTA.dy * k);
      ctx.lineCap = ctx.lineJoin = 'round';
      const modo = this.modo;

      if (T.pauta) this.pintarPauta();

      // Sin guía, la letra (pista, avance y letra terminada) va donde la empezó el niño
      ctx.save();
      if (T.dx) ctx.translate(T.dx * k, 0);
      const verGuia = modo !== 'oculto' || this.conPista || T.fin;
      if (verGuia) {
        // Con guía (Escribir): un tono más fuerte que el de Trazar y opaco, para que se vea por encima
        // de la pauta y no salgan manchas donde se juntan los trazos. En Trazar, con pauta (minúsculas),
        // algo más fuerte también: si no, la línea base destaca más que la letra (sobre todo en Espacio).
        const colorGuia = modo === 'completo' ? (T.pauta ? mezclar(t.guia, t.tinta, 0.2) : t.guia) : mezclar(t.guia, t.tinta, 0.35);
        // Las minúsculas son la mitad de altas: guía más fina para que no se cierren el ojo de la e o la s
        const grosorGuia = window.Trazos.esMinuscula(T.c) ? 12 : 15;
        T.guias.forEach((g) => {
          this.camino(g); ctx.strokeStyle = colorGuia; ctx.lineWidth = grosorGuia * k; ctx.stroke();
        });
        T.guias.forEach((g) => {
          if (modo !== 'oculto' || this.conPista) {
            this.camino(g); ctx.setLineDash([2 * k, 3 * k]); ctx.strokeStyle = t.tinta; ctx.globalAlpha = 0.3;
            ctx.lineWidth = 1.2 * k; ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
          }
        });
      }

      T.ctrl.forEach((cp, n) => {
        const hasta = n < T.i ? cp.length : n === T.i ? T.j : 0;
        if (hasta > 1 || (hasta === 1 && cp.length === 1)) { this.camino(cp, hasta); ctx.strokeStyle = t.acento; ctx.lineWidth = 11 * k; ctx.stroke(); }
      });
      ctx.restore();

      // La tinta, donde ha pasado el dedo de verdad
      ctx.strokeStyle = t.c2; ctx.globalAlpha = 0.45; ctx.lineWidth = 4 * k;
      T.tinta.forEach((tr) => { this.camino(tr); ctx.stroke(); });
      ctx.globalAlpha = 1;

      if (T.fin || !this.activo || !this.conPista) return;

      // Bolita que marca por dónde seguir, con una flecha con palo: se lee bien en cualquier dirección
      // (un triángulo solo, en diagonal, parece apuntar a otro lado)
      const cp = T.ctrl[T.i];
      const [x, y] = cp[Math.min(T.j, cp.length - 1)];
      const [nx, ny] = cp[Math.min(T.j + 3, cp.length - 1)];
      ctx.save();
      if (T.dx) ctx.translate(T.dx * k, 0);
      ctx.fillStyle = '#3fbf7f';
      ctx.beginPath(); ctx.arc(x * k, y * k, 6.5 * k, 0, Math.PI * 2); ctx.fill();
      if (nx !== x || ny !== y) {
        ctx.translate(x * k, y * k); ctx.rotate(Math.atan2(ny - y, nx - x));
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(4.8 * k, 0);
        ctx.lineTo(0.6 * k, -3.6 * k); ctx.lineTo(0.6 * k, -1.3 * k); ctx.lineTo(-4 * k, -1.3 * k);
        ctx.lineTo(-4 * k, 1.3 * k); ctx.lineTo(0.6 * k, 1.3 * k); ctx.lineTo(0.6 * k, 3.6 * k);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    punto(ev) {
      const r = this.cv.getBoundingClientRect();
      const p = [((ev.clientX - r.left) / r.width) * 100, ((ev.clientY - r.top) / r.height) * 100];
      if (!this.T || !this.T.pauta) return p;
      const { s, dx, dy } = MARGEN_PAUTA; // de la pantalla a la cuadrícula
      return [(p[0] - dx) / s, (p[1] - dy) / s];
    }
    // Sin guía no se ve dónde va la letra a lo ancho (la altura ya la marca la pauta):
    // la letra se coloca donde el niño empieza el primer trazo, si empieza a la altura de la salida,
    // en cualquier sitio del recuadro (sin que la letra se salga).
    anclar(p) {
      const T = this.T;
      const c0 = T.ctrl[0][0];
      if (Math.abs(p[1] - c0[1]) >= this.tol) return 0;
      return Math.max(2 - T.xmin, Math.min(98 - T.xmax, p[0] - c0[0]));
    }
    // Sin guía, con el primer trazo a medias: ¿vuelve a poner el dedo donde lo levantó (o en la bolita de la
    // pista), más cerca de ahí que de la salida? Entonces sigue la letra; si no, la empieza otra vez.
    // T.ult solo lo deja un trazo de verdad (8 o más de recorrido): un toque suelto no se encadena con otro.
    sigue(p) {
      const T = this.T;
      if (!T.j || !T.ult) return false;
      const cp = T.ctrl[0];
      const dist = (q, dx = 0) => Math.hypot(p[0] - dx - q[0], p[1] - q[1]);
      let cerca = dist(T.ult);
      if (this.conPista) cerca = Math.min(cerca, dist(cp[Math.min(T.j, cp.length - 1)], T.dx));
      return cerca < this.tol && cerca < dist(cp[0], T.dx);
    }
    // ¿Hay otro dedo dibujando (no solo apoyado)?
    dibujando() { return [...this.dedos.values()].some((d) => d.largo >= 8); }
    avanzar(p) {
      const T = this.T;
      if (T.dx) p = [p[0] - T.dx, p[1]];
      const cp = T.ctrl[T.i];
      const antes = T.j;
      // Sin guía, la letra empieza por la salida del primer trazo: un toque suelto en otro sitio no cuenta
      if (this.modo === 'oculto' && T.i === 0 && T.j === 0 && Math.hypot(p[0] - cp[0][0], p[1] - cp[0][1]) >= this.tol) return;
      // En orden, mirando los 5 puntos siguientes: así también vale empezar un poco por delante de la bolita
      for (let n = T.j; n < Math.min(T.j + 5, cp.length); n++) {
        if (Math.hypot(p[0] - cp[n][0], p[1] - cp[n][1]) < this.tol) T.j = n + 1;
      }
      if (T.j !== antes) this.reloj();
      if (T.j < cp.length) return;
      T.i++; T.j = 0;
      if (T.i >= T.ctrl.length) {
        T.fin = true; T.tinta = [];
        clearTimeout(this._reloj);
        this.dibujar();
        if (this.op.alTerminar) this.op.alTerminar(T.c);
        return;
      }
      pip(660);
      // La n, la m, la u... se pueden seguir sin levantar el dedo; los puntos de la i y la j, con un toque aparte
      if (T.ctrl[T.i].length <= 2) this.dedos.clear();
    }
    abajo(ev) {
      const T = this.T;
      if (!T || T.fin || !this.activo) return;
      try { this.cv.setPointerCapture(ev.pointerId); } catch (e) { /* ese dedo ya no está */ }
      const p = this.punto(ev);
      // Sin guía, hasta acabar el primer trazo, poner el dedo empieza la letra otra vez, colocada donde lo pone
      // (un toque perdido o un falso comienzo no estorban); salvo si sigue por donde iba o si otro dedo está
      // dibujando (entonces este es la palma o un dedo de más: no borra nada)
      if (this.modo === 'oculto' && T.i === 0 && !this.dibujando() && !this.sigue(p)) {
        T.j = 0; T.dx = this.anclar(p); T.ult = null;
      }
      this.dedos.set(ev.pointerId, { k: T.tinta.push([p]) - 1, p, largo: 0 });
      this.avanzar(p);
      this.dibujar();
    }
    mover(ev) {
      const T = this.T;
      const d = this.dedos.get(ev.pointerId);
      if (!T || T.fin || !d) return;
      const p = this.punto(ev);
      d.largo += Math.hypot(p[0] - d.p[0], p[1] - d.p[1]);
      d.p = p;
      T.tinta[d.k].push(p);
      this.avanzar(p);
      this.dibujar();
    }
    arriba(ev) {
      const d = this.dedos.get(ev.pointerId);
      if (!d) return;
      this.dedos.delete(ev.pointerId);
      if (this.T && d.largo >= 8) this.T.ult = d.p; // por si vuelve a poner el dedo ahí (sigue())
    }
  }

  // =====================================================
  // TRAZAR (números y letras)
  // =====================================================
  const DIGITOS = [...'0123456789'];
  // Qué letras se ven según el modo: ABC → mayúsculas; abc → minúsculas; Abc → las dos.
  // Las minúsculas van en el mismo orden (a e i o u m p l s...) y solo las que ya tienen trazos.
  // (Si aún no hay ninguna minúscula, se enseñan las mayúsculas.)
  function letrasTrazar() {
    const modo = modoLetra();
    const minus = C.ORDEN_LETRAS.map((c) => c.toLowerCase()).filter(tieneGlifo);
    const verMinus = modo !== 'mayus' && minus.length > 0;
    return { mayus: modo !== 'minus' || !verMinus ? C.ORDEN_LETRAS : [], minus: verMinus ? minus : [] };
  }
  // Orden del botón ➡️: el de lo que se ve en la rejilla
  function secuenciaTrazar() {
    const { mayus, minus } = letrasTrazar();
    return [...DIGITOS, ...mayus, ...minus];
  }

  function pintarRejillas() {
    const hechos = new Set(dato('trazados', [])); // por carácter: la 'm' y la 'M' son distintas
    const crear = (caja, titulo, lista) => {
      caja.innerHTML = '';
      caja.hidden = !lista.length;
      if (titulo) titulo.hidden = !lista.length;
      lista.forEach((c) => {
        const b = document.createElement('button');
        b.textContent = c;
        if (hechos.has(c)) b.classList.add('hecho');
        b.addEventListener('click', () => empezarTrazo(c));
        caja.appendChild(b);
      });
    };
    const { mayus, minus } = letrasTrazar();
    crear($('#rejilla-numeros'), null, DIGITOS);
    crear($('#rejilla-letras'), $('#titulo-mayus'), mayus);
    crear($('#rejilla-minus'), $('#titulo-minus'), minus);
  }

  const principal = new Trazador($('#lienzo'), { modo: 'completo', pauta: 'auto', alTerminar: terminarTrazo });
  let actual = null; // carácter que se está trazando

  function empezarTrazo(c) {
    actual = c;
    ir('trazar');
    principal.cargar(c);
    hablar(C.trazar.empezar(c));
  }
  function ajustarLienzo() { principal.ajustar(); }
  window.addEventListener('resize', () => {
    if (vista === 'trazar') principal.ajustar();
    trazadores.forEach((t) => t.ajustar());
  });

  async function terminarTrazo(c) {
    pip(880);
    const hechos = new Set(dato('trazados', []));
    hechos.add(c);
    guardarDato('trazados', [...hechos]);
    ganarEstrella();
    fiesta();
    principal.dibujar();
    await hablar(C.trazar.fin(c));
    if (actual !== c || vista !== 'trazar') return;
    await esperar(250);
    if (actual === c && vista === 'trazar') hablar(bravo()); // puede haberse ido mientras tanto
  }

  $('#trazar-oir').addEventListener('click', () => actual && hablar(principal.T && principal.T.fin ? C.trazar.fin(actual) : C.trazar.empezar(actual)));
  $('#trazar-borrar').addEventListener('click', () => actual && empezarTrazo(actual));
  $('#trazar-sig').addEventListener('click', () => {
    if (!actual) return;
    const sec = secuenciaTrazar();
    let i = sec.indexOf(actual);
    if (i < 0) i = sec.indexOf(casoTrazo(actual)); // por si se cambió el tipo de letra (P → p)
    empezarTrazo(sec[(i + 1) % sec.length]);
  });

  // =====================================================
  // JUEGOS CON RONDAS
  // =====================================================
  const CONS_NIVEL = [['m'], ['m', 'p'], ['m', 'p', 'l', 's', 't']];
  let ronda = 0; // para cancelar rondas viejas
  let repetir = () => {};
  let juego = null;
  let anterior = null;

  $('#juego-oir').addEventListener('click', () => repetir());
  $('#juego-pista').addEventListener('click', () => {
    const t = trazadores.find((x) => x.activo && x.T && !x.T.fin);
    if (t) t.pista();
  });

  // Sílabas: Buscar / Escribir y con / sin guía (se recuerda por niño)
  const modoSilabas = () => dato('modo-silabas', 'buscar');
  const conGuia = () => dato('guia', true);
  function pintarModos() {
    $('#modos-dias').hidden = juego !== 'dias';
    document.querySelectorAll('[data-dias]').forEach((b) => b.classList.toggle('activo', b.dataset.dias === modoDias()));
    const enSilabas = juego === 'silabas';
    $('#modos').hidden = !enSilabas;
    const escribir = enSilabas && modoSilabas() === 'escribir';
    document.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('activo', enSilabas && b.dataset.modo === modoSilabas()));
    $('#btn-guia').hidden = !escribir;
    $('#btn-guia').textContent = conGuia() ? '✅ Con guía' : '⬜ Sin guía';
    $('#juego-pista').hidden = !escribir;
  }
  document.querySelectorAll('[data-modo]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (modoSilabas() === b.dataset.modo) return;
      guardarDato('modo-silabas', b.dataset.modo);
      abrirJuego('silabas');
    })
  );
  $('#btn-guia').addEventListener('click', () => {
    guardarDato('guia', !conGuia());
    pintarModos();
    nuevaRonda();
  });

  // texto = valor interno (la respuesta se compara con él, no con lo que se ve)
  function ficha(texto, alOir, { inicial = true } = {}) {
    const b = document.createElement('button');
    b.className = 'ficha';
    letrero(b, texto, { inicial });
    if (alOir) {
      const o = document.createElement('span');
      o.className = 'oir';
      o.textContent = '🔊';
      o.addEventListener('click', (ev) => { ev.stopPropagation(); alOir(); });
      b.appendChild(o);
    }
    return b;
  }

  function sinRepetir(lista) {
    const opciones = lista.length > 1 ? lista.filter((x) => x !== anterior) : lista;
    anterior = azar(opciones);
    return anterior;
  }
  // La respuesta correcta y dos más, mezcladas
  const conOtras = (meta, lista, n = 2) => barajar([meta, ...barajar(lista.filter((x) => x !== meta)).slice(0, n)]);

  async function acierto(r, ...frases) {
    pip(880);
    ganarEstrella();
    fiesta();
    for (const [i, f] of frases.entries()) {
      if (i) await esperar(350);
      await hablar(f);
      if (r !== ronda) return;
    }
    await esperar(500);
    if (r === ronda && vista === 'juego') nuevaRonda();
  }
  function fallo(b) {
    b.classList.remove('mal');
    void b.offsetWidth;
    b.classList.add('mal');
    pip(220);
    hablar(azar(C.comun.animo));
  }

  function nuevaRonda() {
    const r = ++ronda;
    limpiarTrazadores();
    const escena = $('#escena');
    const opciones = $('#opciones');
    escena.innerHTML = '';
    opciones.innerHTML = '';
    const ronda_ = { r, escena, opciones };
    ({ sonidos: rondaSonidos, silabas: modoSilabas() === 'escribir' ? rondaEscribir : rondaBuscar, palabras: rondaPalabras,
      contar: rondaContar, colores: rondaColores, letras: rondaLetras, dias: rondaDias })[juego](ronda_);
    repetir();
  }

  // ---------- Sonidos ----------
  function rondaSonidos({ r, escena, opciones }) {
    const letras = C.NIVELES[nivelActual()].letras;
    const letra = sinRepetir(letras);
    const [palabra, emoji] = azar(C.PALABRAS_INICIO[letra]);
    escena.innerHTML = '<div class="dibujo"></div>';
    escena.firstChild.textContent = emoji;
    conOtras(letra, letras).forEach((l) => {
      const b = ficha(l);
      b.addEventListener('click', () => {
        if (l === letra) { b.classList.add('bien'); acierto(r, C.sonidos.acierto(palabra, letra)); }
        else fallo(b);
      });
      opciones.appendChild(b);
    });
    repetir = () => hablar(C.sonidos.pregunta(palabra));
  }

  // ---------- Sílabas: buscar ----------
  const silabasNivel = () => C.SILABAS.filter((s) => CONS_NIVEL[nivelActual()].includes(s[0]));
  function rondaBuscar({ r, escena, opciones }) {
    const posibles = silabasNivel();
    const meta = sinRepetir(posibles);
    const misma = barajar(posibles.filter((s) => s[0] === meta[0] && s !== meta))[0];
    const otra = barajar(C.SILABAS.filter((s) => s !== meta && s !== misma && s[1] === meta[1]))[0]
      || barajar(C.SILABAS.filter((s) => s !== meta && s !== misma))[0];
    escena.innerHTML = '<div class="dibujo">👂</div>';
    barajar([meta, misma, otra]).forEach((s) => {
      const b = ficha(s, () => hablar(C.silabas.pregunta(s)));
      b.addEventListener('click', () => {
        if (s === meta) { b.classList.add('bien'); acierto(r, bravo()); }
        else fallo(b);
      });
      opciones.appendChild(b);
    });
    repetir = () => hablar(C.silabas.pregunta(meta));
  }

  // ---------- Sílabas: escribir ----------
  // Cada letra en su recuadro con la pauta de 4 líneas: MA / ma / Ma según el tipo de letra.
  // (Si alguna minúscula aún no tiene trazos, la sílaba entera va en mayúsculas.)
  let escribiendo = null; // sílaba de la ronda (para repintarla si cambia el tipo de letra)
  function rondaEscribir({ r, escena }, meta = sinRepetir(silabasNivel())) {
    escribiendo = meta;
    let letras = [...comoLetra(meta)];
    if (!letras.every(tieneGlifo)) letras = [...meta.toUpperCase()];
    const modo = conGuia() ? 'guia' : 'oculto';
    escena.innerHTML = '<div class="cuaderno"></div>';
    const cuaderno = escena.firstChild;
    const cajas = letras.map((L, i) => {
      const caja = document.createElement('div');
      caja.className = 'lienzo-caja' + (i === 0 ? ' activa' : ' espera');
      const cv = document.createElement('canvas');
      caja.appendChild(cv);
      cuaderno.appendChild(caja);
      const tz = new Trazador(cv, {
        modo, pauta: true,
        alTerminar: async () => {
          pip(880);
          caja.classList.remove('activa');
          tz.dibujar();
          const siguiente = cajas[i + 1];
          if (siguiente) {
            siguiente.caja.classList.remove('espera');
            siguiente.caja.classList.add('activa');
            siguiente.tz.activar(true);
            hablar(C.FONEMA[L.toLowerCase()]);
          } else {
            await hablar(C.FONEMA[L.toLowerCase()]);
            if (r !== ronda) return;
            await esperar(500);
            if (r === ronda) acierto(r, meta, bravo());
          }
        },
      });
      tz.activo = i === 0;
      trazadores.push(tz);
      return { caja, tz, L };
    });
    requestAnimationFrame(() => cajas.forEach((c) => { c.tz.ajustar(); c.tz.cargar(c.L); }));
    repetir = () => hablar(C.silabas.escribir(meta));
  }
  // La misma sílaba otra vez, con el nuevo tipo de letra (sin volver a decirla)
  function rehacerEscritura() {
    if (!escribiendo || !$('#escena .cuaderno')) return; // la ronda aún no ha empezado: ya saldrá con la letra nueva
    if (trazadores.length && trazadores.every((t) => t.T && t.T.fin)) return; // ya está escrita: la siguiente saldrá con la letra nueva
    const r = ++ronda;
    limpiarTrazadores();
    $('#escena').innerHTML = '';
    $('#opciones').innerHTML = '';
    rondaEscribir({ r, escena: $('#escena'), opciones: $('#opciones') }, escribiendo);
  }

  // ---------- Palabras ----------
  function rondaPalabras({ r, escena, opciones }) {
    const posibles = nivelActual() < 2 ? C.PALABRAS.filter((w) => w.s.length === 2) : C.PALABRAS;
    const w = sinRepetir(posibles);
    escena.innerHTML = '<div class="dibujo"></div><div class="huecos"></div>';
    escena.querySelector('.dibujo').textContent = w.e;
    const huecos = escena.querySelector('.huecos');
    w.s.forEach(() => { const h = document.createElement('div'); h.className = 'hueco'; huecos.appendChild(h); });
    const extra = azar(C.SILABAS.filter((s) => !w.s.includes(s)));
    let pos = 0;
    // En mixto solo la primera sílaba de la palabra lleva mayúscula: "Pa" + "to" (y la de despiste, en minúscula)
    barajar([...w.s.map((s, i) => [s, i === 0]), [extra, false]]).forEach(([s, inicial]) => {
      const b = ficha(s, null, { inicial });
      b.addEventListener('click', async () => {
        if (pos >= w.s.length) return;
        if (s !== w.s[pos]) return fallo(b);
        b.classList.add('usada');
        const h = huecos.children[pos];
        letrero(h, s, { inicial: pos === 0 });
        h.classList.add('lleno');
        pos++;
        pip(660);
        await hablar(s);
        if (pos === w.s.length && r === ronda) {
          // Hueco para que el niño la diga, y luego la palabra entera
          await esperar(1000);
          if (r === ronda) acierto(r, C.palabras.fin(w.p), bravo());
        }
      });
      opciones.appendChild(b);
    });
    repetir = () => hablar(C.palabras.pregunta(w.p));
  }

  // ---------- Peques: contar ----------
  function rondaContar({ r, escena, opciones }) {
    const n = sinRepetir([1, 2, 3, 4, 5]);
    const cosa = azar(temaActual.deco.filter((e) => e !== '☁️'));
    escena.innerHTML = '<div class="monton"></div>';
    const monton = escena.firstChild;
    let contadas = 0;
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button');
      b.className = 'cosa';
      b.textContent = cosa;
      b.addEventListener('click', () => {
        if (b.classList.contains('contada')) return;
        contadas++;
        b.classList.add('contada');
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = contadas;
        b.appendChild(num);
        hablar(C.NUMEROS[contadas]);
      });
      monton.appendChild(b);
    }
    conOtras(n, [1, 2, 3, 4, 5]).forEach((x) => {
      const b = ficha(x);
      b.addEventListener('click', () => {
        if (x === n) { b.classList.add('bien'); acierto(r, C.trazar.fin(String(n)), bravo()); }
        else fallo(b);
      });
      opciones.appendChild(b);
    });
    repetir = () => hablar(C.contar.pregunta);
  }

  // ---------- Peques: colores ----------
  function rondaColores({ r, escena, opciones }) {
    const meta = sinRepetir(C.COLORES);
    escena.innerHTML = '<div class="bote">🎨</div>';
    conOtras(meta, C.COLORES).forEach((c) => {
      const b = document.createElement('button');
      b.className = 'color';
      b.style.background = c.hex;
      b.setAttribute('aria-label', c.id);
      b.addEventListener('click', () => {
        if (c === meta) { b.classList.add('bien'); acierto(r, C.colores.acierto(c.id), bravo()); }
        else fallo(b);
      });
      opciones.appendChild(b);
    });
    repetir = () => hablar(C.colores.pregunta(meta.id));
  }

  // ---------- Peques: ¿dónde está la letra? ----------
  function rondaLetras({ r, escena, opciones }) {
    const meta = sinRepetir(C.LETRAS_PEQUES);
    escena.innerHTML = '<div class="dibujo">🔍</div>';
    conOtras(meta, C.LETRAS_PEQUES).forEach((c) => {
      const b = ficha(c);
      b.addEventListener('click', () => {
        if (c === meta) { b.classList.add('bien'); acierto(r, C.trazar.fin(c), bravo()); }
        else fallo(b);
      });
      opciones.appendChild(b);
    });
    repetir = () => hablar(C.letras.pregunta(meta));
  }

  // =====================================================
  // DÍAS DE LA SEMANA (con la rutina de Leo)
  // =====================================================
  const D = C.DIAS;
  const nombreDia = (i) => C.dias.nombre(D[(i + 7) % 7]);
  const modoDias = () => dato('modo-dias', 'hoy');
  document.querySelectorAll('[data-dias]').forEach((b) =>
    b.addEventListener('click', () => { guardarDato('modo-dias', b.dataset.dias); pintarModos(); nuevaRonda(); })
  );
  // Dice varias frases seguidas con una pausa; null = silencio (el hueco de "¿qué falta?")
  async function decir(r, ...frases) {
    for (const [i, f] of frases.entries()) {
      if (r !== ronda) return;
      if (i) await esperar(300);
      if (f === null) await esperar(700);
      else await hablar(f);
    }
  }
  function vagon(i, { oir = false, clase = '' } = {}) {
    const d = D[(i + 7) % 7];
    const b = document.createElement('button');
    b.className = 'vagon ' + clase;
    b.style.setProperty('--c', d.color);
    b.dataset.dia = (i + 7) % 7;
    b.innerHTML = '<span class="ico"></span><span class="nom"></span><span class="ruedas"></span>';
    b.querySelector('.ico').textContent = d.emoji;
    letrero(b.querySelector('.nom'), d.nombre);
    if (oir) {
      const o = document.createElement('span');
      o.className = 'oir';
      o.textContent = '🔊';
      o.addEventListener('click', (ev) => { ev.stopPropagation(); hablar(C.dias.nombre(d)); });
      b.appendChild(o);
    }
    return b;
  }
  const hueco = (texto = '') => {
    const h = document.createElement('div');
    h.className = 'vagon hueco-vagon';
    h.textContent = texto;
    return h;
  };
  const locomotora = () => {
    const l = document.createElement('div');
    l.className = 'locomotora';
    l.textContent = '🚂';
    return l;
  };
  const hoyIndice = () => (new Date().getDay() + 6) % 7; // lunes = 0

  function rondaDias(args) {
    ({ hoy: diasHoy, tren: diasTren, falta: diasFalta, cole: diasCole, toca: diasToca })[modoDias()](args);
  }

  // 📅 Hoy es… mañana es…
  function diasHoy({ r, escena, opciones }) {
    const h = hoyIndice();
    escena.innerHTML = '<div class="hoy"><div class="hoy-col"><b></b></div><div class="hoy-col manana"><b></b></div></div>';
    const [colHoy, colMan] = escena.querySelectorAll('.hoy-col');
    letrero(colHoy.firstChild, 'hoy');
    letrero(colMan.firstChild, 'mañana');
    colHoy.appendChild(vagon(h, { clase: 'grande' }));
    colMan.appendChild(vagon(h + 1));
    const etiqueta = document.createElement('div');
    etiqueta.className = 'etiqueta-cole';
    etiqueta.append(D[h].cole ? '🏫 ' : '🎉 ', letrero(document.createElement('span'), D[h].cole ? 'Hay cole' : 'Fin de semana'));
    colHoy.appendChild(etiqueta);
    const b = document.createElement('button');
    b.className = 'btn-principal';
    b.textContent = '🚂 ¡A jugar con el tren!';
    b.addEventListener('click', () => { guardarDato('modo-dias', 'tren'); pintarModos(); nuevaRonda(); });
    opciones.appendChild(b);
    repetir = () => decir(r, C.dias.hoyEs, nombreDia(h), C.dias.mananaEs, nombreDia(h + 1));
  }

  // 🚂 Ordena los 7 vagones
  function diasTren({ r, escena, opciones }) {
    escena.innerHTML = '<div class="tren"></div>';
    const tren = escena.firstChild;
    tren.appendChild(locomotora());
    const huecos = D.map(() => tren.appendChild(hueco()));
    huecos[0].classList.add('siguiente');
    let pos = 0;
    barajar(D.map((_, i) => i)).forEach((i) => {
      const v = vagon(i, { oir: true });
      v.addEventListener('click', async () => {
        if (pos >= 7) return;
        if (i !== pos) return fallo(v);
        v.classList.add('usada');
        huecos[pos].replaceWith(vagon(i, { clase: 'puesto' }));
        pos++;
        if (huecos[pos]) huecos[pos].classList.add('siguiente');
        pip(660);
        await hablar(nombreDia(i));
        if (pos === 7 && r === ronda) {
          tren.classList.add('arranca');
          acierto(r, C.dias.todos, bravo());
        }
      });
      opciones.appendChild(v);
    });
    repetir = () => hablar(C.dias.tren);
  }

  // ❓ ¿Qué día falta? (la semana da la vuelta: después del domingo, lunes)
  function diasFalta({ r, escena, opciones }) {
    const inicio = sinRepetir([0, 1, 2, 3, 4, 5, 6]);
    const k = azar([1, 1, 2]); // casi siempre falta el del medio
    const meta = (inicio + k) % 7;
    escena.innerHTML = '<div class="tren"></div>';
    const tren = escena.firstChild;
    tren.appendChild(locomotora());
    const piezas = [0, 1, 2].map((j) => tren.appendChild(j === k ? hueco('?') : vagon(inicio + j, { clase: 'puesto' })));
    conOtras(meta, D.map((_, i) => i)).forEach((i) => {
      const v = vagon(i, { oir: true });
      v.addEventListener('click', () => {
        if (i !== meta) return fallo(v);
        piezas[k].replaceWith(vagon(i, { clase: 'puesto' }));
        v.classList.add('bien');
        acierto(r, nombreDia(i), bravo());
      });
      opciones.appendChild(v);
    });
    repetir = () => decir(r, C.dias.falta, ...[0, 1, 2].map((j) => (j === k ? null : nombreDia(inicio + j))));
  }

  // 🏫 ¿Cole o fin de semana?
  function diasCole({ r, escena, opciones }) {
    const i = sinRepetir([0, 1, 2, 3, 4, 5, 6, 5, 6]); // salen más los del fin de semana
    escena.appendChild(vagon(i, { oir: true, clase: 'grande' }));
    [['cole', '🏫', 'Hay cole', true], ['finde', '🎉', 'Fin de semana', false]].forEach(([id, emoji, texto, esCole]) => {
      const b = document.createElement('button');
      b.className = 'tarjeta respuesta-cole ' + id;
      b.innerHTML = '<span class="emoji"></span><span></span>';
      b.firstChild.textContent = emoji;
      letrero(b.lastChild, texto);
      b.addEventListener('click', () => {
        if (D[i].cole !== esCole) return fallo(b);
        b.classList.add('bien');
        acierto(r, D[i].cole ? C.dias.hayCole : C.dias.finde, bravo());
      });
      opciones.appendChild(b);
    });
    repetir = () => decir(r, nombreDia(i), C.dias.cole);
  }

  // ⚽ ¿Qué día toca…? (su rutina)
  function diasToca({ r, escena, opciones }) {
    const t = sinRepetir(C.dias.toca);
    escena.innerHTML = '<div class="dibujo"></div>';
    escena.firstChild.textContent = D[t.dias[0]].emoji;
    const encontrados = new Set();
    D.forEach((_, i) => {
      const v = vagon(i, { oir: true });
      v.addEventListener('click', () => {
        if (encontrados.has(i)) return;
        if (!t.dias.includes(i)) return fallo(v);
        encontrados.add(i);
        v.classList.add('bien');
        if (encontrados.size === t.dias.length) acierto(r, ...t.dias.map(nombreDia), bravo());
        else { pip(660); hablar(nombreDia(i)); }
      });
      opciones.appendChild(v);
    });
    repetir = () => hablar(t.pregunta);
  }

  // =====================================================
  // VÍDEO DE PRESENTACIÓN (se ve solo la primera vez; luego, con el botón)
  // =====================================================
  const intro = $('#intro');
  const video = $('#intro-video');
  function abrirIntro(src = 'media/intro.mp4') {
    if (!video.src.endsWith(src)) { video.src = src; video.poster = src.replace('.mp4', '.jpg'); }
    intro.hidden = false;
    video.currentTime = 0;
    video.play().catch(() => { /* sin toque previo: el niño pulsa ▶ */ });
  }
  // 🎬 en Días: mientras se ve el vídeo se cancela la ronda (que no hable encima); al cerrarlo, ronda nueva
  let rondaTrasVideo = false;
  function cerrarIntro() {
    video.pause();
    intro.hidden = true;
    guardado.escribir('intro-vista', true);
    if (rondaTrasVideo) {
      rondaTrasVideo = false;
      if (vista === 'juego' && juego === 'dias') nuevaRonda();
    }
  }
  $('#btn-video').addEventListener('click', () => abrirIntro());
  $('#btn-video-dias').addEventListener('click', () => { ronda++; rondaTrasVideo = true; abrirIntro('media/dias.mp4'); });
  $('#intro-saltar').addEventListener('click', cerrarIntro);
  video.addEventListener('ended', cerrarIntro);

  ir('inicio');
  if (!guardado.leer('intro-vista', false)) abrirIntro();
})();
