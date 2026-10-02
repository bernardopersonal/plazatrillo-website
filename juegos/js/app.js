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
    ['estrellas', 'trazados', 'nivel'].forEach((k) => guardado.borrar(k + '-' + id));
    perfiles = cargarPerfiles();
  }
  const dato = (k, def) => guardado.leer(k + '-' + perfil.id, def);
  const guardarDato = (k, v) => guardado.escribir(k + '-' + perfil.id, v);

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
    window.scrollTo(0, 0);
    if (destino === 'trazar') ajustarLienzo();
  }
  $('#btn-atras').addEventListener('click', () => {
    ronda++;
    limpiarTrazadores();
    ir(PADRE[vista]);
  });

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
  };
  const esPeque = () => perfil.edad <= C.EDAD_PEQUES;

  function prepararMenu() {
    const lista = esPeque() ? ['trazar', 'contar', 'colores', 'letras'] : ['trazar', 'sonidos', 'silabas', 'palabras'];
    const caja = $('#juegos');
    caja.classList.toggle('peques', esPeque());
    caja.innerHTML = '';
    lista.forEach((id, i) => {
      const b = document.createElement('button');
      b.className = 'tarjeta t' + (i + 1) + (esPeque() && id === 'trazar' ? ' ancha' : '');
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
      pintarRejillas();
      ir('elegir');
      hablar(C.trazar.intro);
      return;
    }
    juego = id;
    ir('juego');
    pintarModos();
    const r = ++ronda;
    limpiarTrazadores();
    $('#escena').innerHTML = '';
    $('#opciones').innerHTML = '';
    await hablar(introJuego());
    if (r === ronda) nuevaRonda();
  }
  function introJuego() {
    if (juego === 'silabas' && modoSilabas() === 'escribir') return C.silabas.introEscribir;
    return C[juego].intro;
  }

  // =====================================================
  // TRAZADOR: motor de trazado (Trazar y escribir sílabas)
  // modo 'completo': guía + bolita siempre (Trazar)
  // modo 'guia':     letra clarita; la bolita sale con la pista
  // modo 'oculto':   hoja en blanco; con la pista sale la letra y la bolita
  // =====================================================
  const ESPERA_PISTA = 5000; // ms sin avanzar antes de enseñar la pista
  let trazadores = [];
  function limpiarTrazadores() { trazadores.forEach((t) => t.destruir()); trazadores = []; }

  class Trazador {
    constructor(lienzo, opciones = {}) {
      this.cv = lienzo;
      this.ctx = lienzo.getContext('2d');
      this.op = opciones;
      this.activo = true;
      this.T = null;
      lienzo.addEventListener('pointerdown', (ev) => this.abajo(ev));
      lienzo.addEventListener('pointermove', (ev) => this.mover(ev));
      ['pointerup', 'pointercancel'].forEach((e) => lienzo.addEventListener(e, () => { if (this.T) this.T.abajo = false; }));
    }
    get tol() { return { completo: 12, guia: 13, oculto: 16 }[this.op.modo || 'completo']; }
    cargar(c) {
      const trazos = window.Trazos.GLIFOS[c];
      this.T = {
        c, i: 0, j: 0, tinta: [], abajo: false, fin: false,
        guias: trazos.map((t) => window.Trazos.puntos(t)),
        ctrl: trazos.map((t) => window.Trazos.controles(t)),
      };
      this.conPista = (this.op.modo || 'completo') === 'completo';
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
    }
    dibujar() {
      const T = this.T;
      const ctx = this.ctx;
      const k = this.cv.width / 100;
      const t = temaActual;
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      if (!T) return;
      ctx.lineCap = ctx.lineJoin = 'round';
      const modo = this.op.modo || 'completo';

      if (this.op.renglones) {
        ctx.strokeStyle = t.tinta; ctx.globalAlpha = 0.18; ctx.lineWidth = 0.8 * k;
        [15, 85].forEach((y) => { ctx.beginPath(); ctx.moveTo(4 * k, y * k); ctx.lineTo(96 * k, y * k); ctx.stroke(); });
        ctx.setLineDash([2 * k, 2 * k]);
        ctx.beginPath(); ctx.moveTo(4 * k, 50 * k); ctx.lineTo(96 * k, 50 * k); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }

      const verGuia = modo !== 'oculto' || this.conPista || T.fin;
      if (verGuia) {
        T.guias.forEach((g) => {
          ctx.globalAlpha = modo === 'completo' ? 1 : 0.55;
          this.camino(g); ctx.strokeStyle = t.guia; ctx.lineWidth = 15 * k; ctx.stroke();
          ctx.globalAlpha = 1;
          if (modo === 'completo' || this.conPista) {
            this.camino(g); ctx.setLineDash([2 * k, 3 * k]); ctx.strokeStyle = t.tinta; ctx.globalAlpha = 0.3;
            ctx.lineWidth = 1.2 * k; ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
          }
        });
      }

      T.ctrl.forEach((cp, n) => {
        const hasta = n < T.i ? cp.length : n === T.i ? T.j : 0;
        if (hasta > 1) { this.camino(cp, hasta); ctx.strokeStyle = t.acento; ctx.lineWidth = 11 * k; ctx.stroke(); }
      });

      ctx.strokeStyle = t.c2; ctx.globalAlpha = 0.45; ctx.lineWidth = 4 * k;
      T.tinta.forEach((tr) => { this.camino(tr); ctx.stroke(); });
      ctx.globalAlpha = 1;

      if (T.fin || !this.activo || !this.conPista) return;

      // Bolita que marca por dónde seguir, con flecha
      const cp = T.ctrl[T.i];
      const [x, y] = cp[Math.min(T.j, cp.length - 1)];
      const [nx, ny] = cp[Math.min(T.j + 3, cp.length - 1)];
      ctx.fillStyle = '#3fbf7f';
      ctx.beginPath(); ctx.arc(x * k, y * k, 6.5 * k, 0, Math.PI * 2); ctx.fill();
      if (nx !== x || ny !== y) {
        ctx.save();
        ctx.translate(x * k, y * k); ctx.rotate(Math.atan2(ny - y, nx - x));
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(4 * k, 0); ctx.lineTo(-2.5 * k, -3.2 * k); ctx.lineTo(-2.5 * k, 3.2 * k); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    punto(ev) {
      const r = this.cv.getBoundingClientRect();
      return [((ev.clientX - r.left) / r.width) * 100, ((ev.clientY - r.top) / r.height) * 100];
    }
    avanzar(p) {
      const T = this.T;
      const cp = T.ctrl[T.i];
      const antes = T.j;
      for (let n = T.j; n < Math.min(T.j + 5, cp.length); n++) {
        if (Math.hypot(p[0] - cp[n][0], p[1] - cp[n][1]) < this.tol) T.j = n + 1;
      }
      if (T.j !== antes) this.reloj();
      if (T.j >= cp.length) {
        T.i++; T.j = 0; T.abajo = false;
        if (T.i >= T.ctrl.length) {
          T.fin = true; T.tinta = [];
          clearTimeout(this._reloj);
          if (this.op.alTerminar) this.op.alTerminar(T.c);
        } else pip(660);
      }
    }
    abajo(ev) {
      if (!this.T || this.T.fin || !this.activo) return;
      this.cv.setPointerCapture(ev.pointerId);
      this.T.abajo = true;
      const p = this.punto(ev);
      this.T.tinta.push([p]);
      this.avanzar(p);
      this.dibujar();
    }
    mover(ev) {
      if (!this.T || !this.T.abajo || this.T.fin) return;
      const p = this.punto(ev);
      this.T.tinta[this.T.tinta.length - 1].push(p);
      this.avanzar(p);
      this.dibujar();
    }
  }

  // =====================================================
  // TRAZAR (números y letras)
  // =====================================================
  const SECUENCIA = [...'0123456789', ...C.ORDEN_LETRAS];

  function pintarRejillas() {
    const hechos = new Set(dato('trazados', []));
    const crear = (caja, lista) => {
      caja.innerHTML = '';
      lista.forEach((c) => {
        const b = document.createElement('button');
        b.textContent = c;
        if (hechos.has(c)) b.classList.add('hecho');
        b.addEventListener('click', () => empezarTrazo(c));
        caja.appendChild(b);
      });
    };
    crear($('#rejilla-numeros'), [...'0123456789']);
    crear($('#rejilla-letras'), C.ORDEN_LETRAS);
  }

  const principal = new Trazador($('#lienzo'), { modo: 'completo', alTerminar: terminarTrazo });
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
    if (actual === c && vista === 'trazar') { await esperar(250); hablar(bravo()); }
  }

  $('#trazar-oir').addEventListener('click', () => actual && hablar(principal.T && principal.T.fin ? C.trazar.fin(actual) : C.trazar.empezar(actual)));
  $('#trazar-borrar').addEventListener('click', () => actual && empezarTrazo(actual));
  $('#trazar-sig').addEventListener('click', () => {
    if (!actual) return;
    empezarTrazo(SECUENCIA[(SECUENCIA.indexOf(actual) + 1) % SECUENCIA.length]);
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

  function ficha(texto, alOir) {
    const b = document.createElement('button');
    b.className = 'ficha';
    b.textContent = String(texto).toUpperCase();
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
      contar: rondaContar, colores: rondaColores, letras: rondaLetras })[juego](ronda_);
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
  function rondaEscribir({ r, escena }) {
    const meta = sinRepetir(silabasNivel());
    const letras = meta.toUpperCase().split('');
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
        modo, renglones: true,
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
            acierto(r, meta, bravo());
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
    barajar([...w.s, extra]).forEach((s) => {
      const b = ficha(s);
      b.addEventListener('click', async () => {
        if (pos >= w.s.length) return;
        if (s !== w.s[pos]) return fallo(b);
        b.classList.add('usada');
        const h = huecos.children[pos];
        h.textContent = s.toUpperCase();
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
  // VÍDEO DE PRESENTACIÓN (se ve solo la primera vez; luego, con el botón)
  // =====================================================
  const intro = $('#intro');
  const video = $('#intro-video');
  function abrirIntro() {
    intro.hidden = false;
    video.currentTime = 0;
    video.play().catch(() => { /* sin toque previo: el niño pulsa ▶ */ });
  }
  function cerrarIntro() {
    video.pause();
    intro.hidden = true;
    guardado.escribir('intro-vista', true);
  }
  $('#btn-video').addEventListener('click', abrirIntro);
  $('#intro-saltar').addEventListener('click', cerrarIntro);
  video.addEventListener('ended', cerrarIntro);

  ir('inicio');
  if (!guardado.leer('intro-vista', false)) abrirIntro();
})();
