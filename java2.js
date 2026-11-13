// Variables globales
let isPlaying = false;          // la música está sonando
let musicStarted = false;       // ya pasó el segundo 5 del video
let musicUnlocked = false;      // el audio quedó habilitado con el toque (iOS)
let carouselTimer = null;

// Segundo del video en el que arranca la música
const MUSIC_START_AT = 5;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    initializeCountdown();
    initializeCarousel();
    initializeIntro();
    initializeMusicControls();
    initializeParallax();
    initializeGuestGreeting();
    initializeLayers(); // después del saludo: depende de si la sección de invitados se muestra
});

// Sección de saludo personalizado por invitado/familia, leída desde la URL.
// Formatos soportados:
//   ?invitados=Juan Arias,Yerianny Arias,Valery Arias
//   ?familia=Arias
// Muestra un badge con el total, título "Invitados", el número de
// acompañantes (si aplica) y cada nombre como fila con colores intercalados
// de la paleta dorada del sitio, ciclando si hay más de 4 nombres.
function initializeGuestGreeting() {
    const params = new URLSearchParams(window.location.search);
    const invitadosParam = params.get('invitados');
    const familiaParam = params.get('familia');

    const section = document.getElementById('guestSection');
    const badge = document.getElementById('guestBadge');
    const subtitle = document.getElementById('guestSubtitle');
    const greeting = document.getElementById('guestGreeting');
    if (!section || !badge || !subtitle || !greeting) return;

    let names = [];

    if (invitadosParam) {
        // URLSearchParams ya decodifica: un segundo decodeURIComponent rompía
        // la página si un nombre traía el signo %
        names = invitadosParam.split(',').map(n => n.trim()).filter(Boolean);
    } else if (familiaParam) {
        names = [`Familia ${familiaParam.trim()}`];
    }

    if (names.length === 0) return;

    // Badge con el total de invitados
    badge.textContent = names.length;

    // Subtítulo de acompañantes: solo tiene sentido cuando hay más de un
    // nombre individual (no aplica al formato "Familia X")
    const companions = invitadosParam ? names.length - 1 : 0;
    if (companions > 0) {
        subtitle.textContent = `(${companions} acompañante${companions > 1 ? 's' : ''})`;
        subtitle.style.display = 'block';
    } else {
        subtitle.style.display = 'none';
    }

    // Limpiar contenido previo
    greeting.innerHTML = '';

    names.forEach((name, index) => {
        const nameSpan = document.createElement('span');
        const colorIndex = (index % 4) + 1;
        nameSpan.className = `guest-name color-${colorIndex}`;
        nameSpan.textContent = name;
        greeting.appendChild(nameSpan);
    });

    section.style.display = 'block';
}

// Capas alternadas: a las secciones visibles (sin contar el footer) les
// asigna arriba / abajo / arriba... La primera siempre va arriba para
// montarse sobre la portada.
function initializeLayers() {
    const layers = Array.from(document.querySelectorAll('.layers > .layer:not(.footer)'))
        .filter(el => getComputedStyle(el).display !== 'none');
    layers.forEach((el, i) => {
        el.classList.remove('layer--up', 'layer--down', 'layer--last');
        el.classList.add(i % 2 === 0 ? 'layer--up' : 'layer--down');
        if (i === layers.length - 1) el.classList.add('layer--last');
    });
    const footer = document.querySelector('.layers > .footer');
    if (footer) {
        const lastIsUp = layers.length % 2 === 1;
        footer.classList.toggle('layer--after-up', lastIsUp);
        // Si la última es hundida, el footer se eleva con ola propia y
        // esa última sección conserva su sombra inferior
        footer.classList.toggle('footer--raised', !lastIsUp);
        if (!lastIsUp && layers.length) layers[layers.length - 1].classList.remove('layer--last');
    }
}

// =========================================================
// Intro: sobre animado
// - Se toca para abrir (el toque es el gesto que permite sonido en iOS/Android)
// - En el segundo 5 del video arranca la música
// - Al terminar el video entra directo a la invitación con una transición
// =========================================================
function initializeIntro() {
    const intro = document.getElementById('intro');
    const video = document.getElementById('introVideo');
    if (!intro || !video) return;

    let started = false;
    let finished = false;

    const start = () => {
        if (started) return;
        started = true;
        intro.classList.add('is-playing');
        intro.setAttribute('aria-label', 'Abriendo la invitación');

        // Habilitar la música DENTRO del toque (requisito de iOS Safari)
        unlockMusic();

        video.muted = false;
        const p = video.play();
        if (p && p.catch) {
            p.catch(() => {
                // Si el video no se puede reproducir con sonido, se intenta en silencio;
                // si tampoco, se entra directo a la invitación con la música.
                video.muted = true;
                video.play().catch(() => { startMusic(); finish(); });
            });
        }
    };

    const finish = () => {
        if (finished) return;
        finished = true;
        startMusic(); // por si el video duró menos de 5 s o falló
        showWelcome(revealInvitation);
    };

    intro.addEventListener('click', start);
    intro.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
    });

    video.addEventListener('timeupdate', () => {
        if (!musicStarted && video.currentTime >= MUSIC_START_AT) startMusic();
    });
    video.addEventListener('ended', finish);
    video.addEventListener('error', () => { if (started) finish(); });

    // Seguro: si el video se queda trabado, entrar igual
    video.addEventListener('playing', () => {
        const ms = ((video.duration || 8) - video.currentTime + 2.5) * 1000;
        clearTimeout(video._safety);
        video._safety = setTimeout(finish, ms);
    });
}


// =========================================================
// Mensaje especial: después del video y antes de la invitación.
// Las letras aparecen una a una (como si se escribiera). "Omitir" entra
// directo a la invitación; al terminar aparece "Ver invitación".
// =========================================================
function showWelcome(onDone) {
    const box = document.getElementById('welcome');
    const textBox = document.getElementById('welcomeText');
    if (!box || !textBox) { onDone(); return; }

    // Nombre del invitado si la URL trae ?invitados= o ?familia=
    const params = new URLSearchParams(window.location.search);
    const inv = params.get('invitados'), fam = params.get('familia');
    const forEl = document.getElementById('welcomeFor');
    let who = '';
    if (inv) {
        const n = inv.split(',').map(x => x.trim()).filter(Boolean);
        who = n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : (n[0] || '');
    } else if (fam) {
        who = 'Familia ' + fam.trim();
    }
    if (forEl && who) {
        forEl.textContent = 'Para ';
        const st = document.createElement('strong');
        st.textContent = who;
        forEl.appendChild(st);
        forEl.style.display = 'block';
    }

    // Partir cada párrafo en letras (sin mover el diseño: el texto ya ocupa su lugar)
    const chars = [];
    textBox.querySelectorAll('p').forEach((p, pi) => {
        const txt = p.textContent;
        p.textContent = '';
        for (const c of txt) {
            const sp = document.createElement('span');
            sp.className = 'wl-ch';
            sp.textContent = c;
            p.appendChild(sp);
            chars.push({ el: sp, c, endOfPara: false, para: p });
        }
        if (chars.length) chars[chars.length - 1].endOfPara = true;
    });

    const caret = document.createElement('span');
    caret.className = 'wl-caret';
    caret.setAttribute('aria-hidden', 'true');

    let i = 0, timer = null, autoTimer = null, closed = false;

    // Ajusta el tamaño de letra para que el mensaje completo quepa en una pantalla
    const card = box.querySelector('.welcome-card');
    const fit = () => {
        if (!card) return;
        const cs = getComputedStyle(card);
        const avail = card.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const kids = [...card.children].filter(el => getComputedStyle(el).display !== 'none');
        if (!kids.length) return;
        const need = () => {
            const top = kids[0].getBoundingClientRect().top;
            const last = kids[kids.length - 1].getBoundingClientRect().bottom;
            return last - top;
        };
        let fs = Math.min(18, Math.max(12, card.clientWidth / 22));
        card.style.fontSize = fs + 'px';
        while (need() > avail && fs > 9) { fs -= 0.5; card.style.fontSize = fs + 'px'; }
    };

    const AUTO_MS = 5000;   // espera tras terminar el texto antes de abrir solo
    const done = (fast) => {
        clearTimeout(timer);
        chars.forEach(o => o.el.classList.add('on'));
        caret.remove();
        box.classList.add('is-done');
        // Si el texto apareció de golpe (movimiento reducido), dar tiempo de leer
        const wait = fast === true ? 20000 : AUTO_MS;
        box.style.setProperty('--auto-ms', wait + 'ms');
        box.classList.add('is-auto');
        autoTimer = setTimeout(leave, wait);
    };

    const leave = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        clearTimeout(autoTimer);
        window.removeEventListener('resize', fit);
        onDone();                       // arranca el velo y la portada
        box.classList.add('is-leaving');
        setTimeout(() => {
            box.classList.remove('is-open', 'is-leaving');
            box.setAttribute('aria-hidden', 'true');
            box.style.display = 'none';
        }, 950);
    };

    const step = () => {
        if (i >= chars.length) { done(); return; }
        const o = chars[i++];
        o.el.classList.add('on');
        o.el.after(caret);
        let d = 38;
        if (o.c === ',') d = 260;
        if (o.c === '.') d = 560;
        if (o.endOfPara) d = 820;
        timer = setTimeout(step, d);
    };

    document.getElementById('welcomeSkip').addEventListener('click', leave);
    document.getElementById('welcomeContinue').addEventListener('click', leave);

    box.style.display = 'flex';
    void box.offsetWidth;
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener('resize', fit);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { done(true); return; }
    timer = setTimeout(step, 1300);   // pausa breve tras el título
}

// Transición elegante: el destello final del video se convierte en un velo de
// luz cálida con destellos dorados, y la portada "se revela" desde la luz.
function revealInvitation() {
    const body = document.body;
    window.scrollTo(0, 0);
    body.classList.remove('intro-active');
    // forzar reflow para que la animación arranque limpia
    void body.offsetWidth;
    body.classList.add('is-revealing');
    playSparkles(3200);

    const musicPlayer = document.getElementById('musicPlayer');
    setTimeout(() => {
        musicPlayer.style.display = 'block';
        musicPlayer.classList.add('is-visible');
    }, 2400);

    setTimeout(() => {
        body.classList.add('intro-done');
        const video = document.getElementById('introVideo');
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    }, 3600);
}

// Destellos dorados que flotan durante la transición (canvas liviano)
function playSparkles(duration) {
    const canvas = document.getElementById('introSparkles');
    if (!canvas || !canvas.getContext) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const count = Math.round(Math.min(70, Math.max(35, (w * h) / 12000)));
    const parts = Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.25 + Math.random() * 1.1;
        return {
            x: w / 2 + (Math.random() - 0.5) * w * 0.35,
            y: h * 0.46 + (Math.random() - 0.5) * h * 0.25,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.5,
            r: 0.8 + Math.random() * 2.2,
            delay: Math.random() * 600,
            life: 1400 + Math.random() * 1600,
            hue: 38 + Math.random() * 10
        };
    });

    const t0 = performance.now();
    const frame = (now) => {
        const t = now - t0;
        ctx.clearRect(0, 0, w, h);
        parts.forEach(p => {
            const age = t - p.delay;
            if (age < 0 || age > p.life) return;
            const k = age / p.life;
            const alpha = Math.sin(Math.PI * k) * 0.9;
            const x = p.x + p.vx * age * 0.06;
            const y = p.y + p.vy * age * 0.06;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, p.r * 4);
            glow.addColorStop(0, `hsla(${p.hue}, 80%, 85%, ${alpha})`);
            glow.addColorStop(0.4, `hsla(${p.hue}, 70%, 60%, ${alpha * 0.45})`);
            glow.addColorStop(1, `hsla(${p.hue}, 70%, 55%, 0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, p.r * 4, 0, Math.PI * 2);
            ctx.fill();
        });
        if (t < duration) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, w, h);
    };
    requestAnimationFrame(frame);
}

// =========================================================
// Música (archivo propio, ya no YouTube)
// =========================================================
function getMusic() { return document.getElementById('bgMusic'); }

// Se llama dentro del toque: deja el audio "autorizado" para que luego,
// en el segundo 5, pueda sonar sin otro toque (iOS lo exige).
function unlockMusic() {
    const music = getMusic();
    if (!music || musicUnlocked) return;
    musicUnlocked = true;
    music.muted = true;
    const p = music.play();
    if (p && p.then) {
        p.then(() => { if (!musicStarted) { music.pause(); music.currentTime = 0; } })
         .catch(() => {});
    }
}

function startMusic() {
    const music = getMusic();
    if (!music || musicStarted) return;
    musicStarted = true;
    music.currentTime = 0;
    music.muted = false;
    fadeInVolume(music, 1800);
    const p = music.play();
    isPlaying = true;
    updateMusicIcon();
    if (p && p.catch) {
        p.catch(() => {
            // El navegador no dejó sonar: el botón queda en pausa y el
            // invitado la activa con un toque.
            isPlaying = false;
            updateMusicIcon();
        });
    }
}

// Subida de volumen suave (en iPhone el volumen lo maneja el sistema y se ignora)
function fadeInVolume(el, ms) {
    try {
        el.volume = 0;
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / ms);
            el.volume = k;
            if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    } catch (e) { /* sin control de volumen */ }
}

function initializeMusicControls() {
    const music = getMusic();
    const toggle = document.getElementById('musicToggle');
    if (!music || !toggle) return;

    toggle.addEventListener('click', toggleMusic);
    music.addEventListener('play', () => { if (!music.muted) { isPlaying = true; updateMusicIcon(); } });
    music.addEventListener('pause', () => { isPlaying = false; updateMusicIcon(); });

    // Pausar si el invitado sale de la página y retomar al volver
    let resumeOnReturn = false;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            resumeOnReturn = isPlaying;
            if (isPlaying) music.pause();
        } else if (resumeOnReturn) {
            music.play().catch(() => {});
        }
    });
}

function toggleMusic() {
    const music = getMusic();
    if (!music) return;
    if (isPlaying) {
        music.pause();
    } else {
        musicStarted = true;
        music.muted = false;
        music.volume = 1;
        music.play().catch(() => {});
    }
}

function updateMusicIcon() {
    const volumeIcon = document.getElementById('volumeIcon');
    
    if (isPlaying) {
        volumeIcon.innerHTML = `
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"></path>
        `;
    } else {
        volumeIcon.innerHTML = `
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
        `;
    }
}

// Countdown
function initializeCountdown() {
    const targetDate = new Date('2027-01-09T16:00:00-04:00').getTime(); // hora de República Dominicana
    
    function updateCountdown() {
        const now = new Date().getTime();
        const difference = targetDate - now;
        
        if (difference > 0) {
            const days = Math.floor(difference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((difference % (1000 * 60)) / 1000);
            
            document.getElementById('days').textContent = days.toString().padStart(2, '0');
            document.getElementById('hours').textContent = hours.toString().padStart(2, '0');
            document.getElementById('minutes').textContent = minutes.toString().padStart(2, '0');
            document.getElementById('seconds').textContent = seconds.toString().padStart(2, '0');
        } else {
            document.getElementById('days').textContent = '00';
            document.getElementById('hours').textContent = '00';
            document.getElementById('minutes').textContent = '00';
            document.getElementById('seconds').textContent = '00';
        }
    }
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// Carrusel: polaroids apiladas. La de arriba se va volando y pasa al fondo.
function initializeCarousel() {
    const stack = document.getElementById('polStack');
    if (!stack) return;
    const cards = [...stack.querySelectorAll('.pol')];
    const dots = [...document.querySelectorAll('#polDots i')];
    const status = document.getElementById('polStatus');
    const n = cards.length;
    let order = cards.map((_, i) => i);   // order[0] = la foto de arriba
    let busy = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const layout = () => {
        order.forEach((ci, depth) => {
            const c = cards[ci];
            c.dataset.depth = Math.min(depth, 3);
            c.style.zIndex = String(n - depth);
        });
        const top = order[0];
        dots.forEach((d, i) => d.classList.toggle('on', i === top));
        if (status) status.textContent = `Foto ${top + 1} de ${n}`;
    };

    const next = (dir = -1) => {
        if (busy) return;
        busy = true;
        const top = cards[order[0]];
        top.style.setProperty('--fly', dir < 0 ? '-135%' : '135%');
        top.style.setProperty('--flyr', dir < 0 ? '-18deg' : '18deg');
        top.classList.add('is-flying');
        top.style.transform = '';
        setTimeout(() => {
            order.push(order.shift());
            top.classList.remove('is-flying');
            top.classList.add('no-anim');
            layout();
            void top.offsetWidth;
            top.classList.remove('no-anim');
            busy = false;
        }, reduce ? 10 : 420);
    };

    const prev = () => {
        if (busy) return;
        busy = true;
        const last = cards[order[n - 1]];
        last.classList.add('no-anim', 'is-flying');
        last.style.setProperty('--fly', '135%');
        last.style.setProperty('--flyr', '18deg');
        order.unshift(order.pop());
        layout();
        void last.offsetWidth;
        last.classList.remove('no-anim', 'is-flying');
        setTimeout(() => { busy = false; }, reduce ? 10 : 420);
    };

    // Arrastrar con el dedo o el mouse
    let startX = null, dx = 0, moved = false;
    stack.addEventListener('pointerdown', (e) => {
        if (busy) return;
        startX = e.clientX; dx = 0; moved = false;
        stack.setPointerCapture(e.pointerId);
        cards[order[0]].classList.add('no-anim');
    });
    stack.addEventListener('pointermove', (e) => {
        if (startX === null) return;
        dx = e.clientX - startX;
        if (Math.abs(dx) > 6) moved = true;
        cards[order[0]].style.transform = `translateX(calc(-50% + ${dx}px)) rotate(${-1 + dx / 18}deg)`;
    });
    const release = () => {
        if (startX === null) return;
        const top = cards[order[0]];
        top.classList.remove('no-anim');
        startX = null;
        if (Math.abs(dx) > 60) { next(dx < 0 ? -1 : 1); }
        else { top.style.transform = ''; if (!moved) next(-1); }   // un toque también pasa la foto
        restartAutoplay();
    };
    stack.addEventListener('pointerup', release);
    stack.addEventListener('pointercancel', () => { if (startX !== null) { cards[order[0]].classList.remove('no-anim'); cards[order[0]].style.transform = ''; startX = null; } });

    document.getElementById('polNext').addEventListener('click', () => { next(-1); restartAutoplay(); });
    document.getElementById('polPrev').addEventListener('click', () => { prev(); restartAutoplay(); });
    stack.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { next(-1); restartAutoplay(); }
        if (e.key === 'ArrowLeft') { prev(); restartAutoplay(); }
    });

    // Avanza sola cada 4.5 s; se reinicia cuando el invitado toca
    function restartAutoplay() {
        clearInterval(carouselTimer);
        if (reduce) return;
        carouselTimer = setInterval(() => { if (!document.hidden) next(-1); }, 4500);
    }

    layout();
    restartAutoplay();
}

// Parallax en la portada (mueve la capa de fondo al hacer scroll)
function initializeParallax() {
    const heroLayer = document.querySelector('.hero .hero-bg');
    if (!heroLayer) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let lastScrollY = window.scrollY || window.pageYOffset;
    let ticking = false;

    const computeSpeed = () => (window.innerWidth <= 768 ? 0.65 : 0.5);

    const render = () => {
        if (prefersReducedMotion.matches) {
            heroLayer.style.transform = 'translate3d(0,0,0)';
        } else {
            const speed = computeSpeed();
            // Tope: nunca desplazar más que el colchón real de la capa (60px fijos,
            // igual al valor definido en CSS), para que no se despegue del contenedor
            // y deje un hueco vacío, sin necesidad de sobredimensionar la imagen.
            const BUFFER_PX = 60;
            let translateY = lastScrollY * speed;
            translateY = Math.max(0, Math.min(BUFFER_PX, translateY));
            heroLayer.style.transform = `translate3d(0, ${Math.round(translateY)}px, 0)`;
        }
        ticking = false;
    };

    const onScroll = () => {
        lastScrollY = window.scrollY || window.pageYOffset;
        if (!ticking) {
            window.requestAnimationFrame(render);
            ticking = true;
        }
    };

    render();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', render);
}

// Funciones de los botones
// Nota: esta es una plantilla de ejemplo. Los botones de "¿Cómo llegar?",
// "Subir foto", "Ver más" (regalo) y "Confirmar asistencia" se dejaron sin
// enlace a propósito (sin onclick en el HTML); cuando se use con datos
// reales, cada uno debe apuntar a su Google Maps, carpeta de Drive,
// método de regalo y Google Form correspondientes.

function showDressCode() {
    const m = document.getElementById('dressModal');
    if (!m) return;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
}

function closeDressCode() {
    const m = document.getElementById('dressModal');
    if (!m) return;
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {
    const m = document.getElementById('dressModal');
    if (m) m.addEventListener('click', (e) => { if (e.target === m) closeDressCode(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDressCode(); });
});

function showTips() {
    showToast("Tips y notas", "Celebración solo para adultos, no niños. La ceremonia inicia a las 4:00 p. m.; te recomendamos llegar 15 minutos antes.");
}

// Sistema de Toast
function showToast(title, message) {
    const toast = document.getElementById('toast');
    const toastContent = document.getElementById('toastContent');
    
    toastContent.innerHTML = `
        <h4 style="color: hsl(var(--brown)); margin-bottom: 0.35rem;">${title}</h4>
        <p style="color: hsl(var(--foreground) / 0.7);">${message}</p>
    `;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Regalo: ventana con los datos bancarios
function showGifts() {
    const m = document.getElementById('giftModal');
    if (!m) return;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
}

function closeGifts() {
    const m = document.getElementById('giftModal');
    if (!m) return;
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
}

function copyAccount() {
    const num = document.getElementById('giftAccount').textContent.trim();
    const btn = document.getElementById('giftCopy');
    const msg = document.getElementById('giftCopied');
    const say = (t, done) => {
        msg.textContent = t;
        btn.classList.toggle('is-copied', !!done);
        clearTimeout(copyAccount._t);
        copyAccount._t = setTimeout(() => { msg.textContent = ''; btn.classList.remove('is-copied'); }, 2200);
    };
    const fallback = () => {
        // Selecciona el número para que el invitado lo copie a mano
        const r = document.createRange();
        r.selectNodeContents(document.getElementById('giftAccount'));
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { if (document.execCommand('copy')) { sel.removeAllRanges(); say('Número copiado', true); return; } } catch (e) {}
        say('Número seleccionado, cópialo', false);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(num).then(() => say('Número copiado', true), fallback);
    } else {
        fallback();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const m = document.getElementById('giftModal');
    if (m) m.addEventListener('click', (e) => { if (e.target === m) closeGifts(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGifts(); });
});
