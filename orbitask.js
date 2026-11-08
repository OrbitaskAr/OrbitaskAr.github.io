/* =========================================================
   ÓRBITASK — lógica de la aplicación
   ---------------------------------------------------------
   Archivos del sitio:
     index.html          · estructura
     orbitask.css        · estilos
     orbitask.js         · este archivo
     orbitask-sync.js    · sincronización con Firebase
   ========================================================= */

/* ---------------------------------------------------------
   1. CONFIGURACIÓN
   --------------------------------------------------------- */

// Dirección de la base en la nube (la misma que usa orbitask-sync.js)
const FIREBASE_URL = "https://orbitask-50d1c-default-rtdb.firebaseio.com";

// Cuentas que existen siempre, incluso después de reiniciar los usuarios:
//   admin1 → usuario común de prueba
//   admin2 → no entra a la aplicación, entra al panel de control
const CUENTAS_FIJAS = {
    admin1: { usuario: "admin1", clave: "1234", mail: "" },
    admin2: { usuario: "admin2", clave: "4321", mail: "" }
};

const USUARIO_PANEL  = "admin2";
const CLAVE_CUENTAS  = "orbitask_cuentas";

/* ---------- verificación del mail (EmailJS) ----------
   EmailJS manda el mail con el código desde el navegador, sin
   servidor. Las tres claves salen del panel de emailjs.com:
   la pública, el servicio y la plantilla. */
const EMAILJS_PUBLICA   = "3zz4JiMKC3BDiEFKC";
const EMAILJS_SERVICIO  = "service_iq5p3nn";
const EMAILJS_PLANTILLA = "template_5q1z247";   // el código de verificación

/* El mail de "hace una semana que no entrás" no se manda desde acá:
   lo manda GitHub solo, una vez por día, con .github/recordatorios.mjs.
   Los tres textos y la plantilla (template_7ht61rs) viven en ese archivo. */

const CODIGO_VALE_MS    = 10 * 60 * 1000;   // el código dura 10 minutos
const ESPERA_REENVIO_MS = 30 * 1000;        // mínimo entre dos envíos
const MAX_INTENTOS      = 5;

// ===== MODO DISEÑO — poner en false antes de publicar =====
const MODO_DISENO = true;

// El botón ? repite el tutorial guiado sobre la página.
// En true usa en cambio la versión en ventana (las diapositivas del dialog).
const TUTORIAL_CON_VENTANAS = false;

// Mascotas espaciales disponibles: al entrar por primera vez se sortea
// una y queda asignada para siempre
const MASCOTAS = [
    {
        id: "catarsis",
        nombre: "CATARSIS",
        descripcion: "Gato-ciervo",
        gif: "https://ik.imagekit.io/ui9le8s20/catarsis.gif"
    },
    {
        id: "hurlin",
        nombre: "HURLIN",
        descripcion: "Hurón-mago",
        gif: "https://ik.imagekit.io/ui9le8s20/pixil-gif-drawing%20(2).gif"
    },
    {
        id: "frog",
        nombre: "FROG",
        descripcion: "Perro-fuego",
        gif: "https://ik.imagekit.io/ui9le8s20/I%2010-09-26%20pp.gif"
    }
];

// Colores de urgencia (4 = muy urgente ... 1 = nada urgente)
const COLORES_URGENCIA = { 4: "#FF4D4D", 3: "#FF9A3C", 2: "#FFE14D", 1: "#5BE38C" };

// --- vida ---
const VALORES_COMUNES  = [3, 5, 10, 12, 15];
const VALOR_BRONCE     = 20;    // cada tanto
const VALOR_ORO        = 50;    // todavía más raro
const PROB_ORO         = 0.02;  // 2%
const PROB_BRONCE      = 0.10;  // 10%

// La barra pierde un 10% cada 24 horas
const DECAIMIENTO_POR_SEGUNDO = 10 / (24 * 60 * 60);

// --- anti-trampa ---
const MAX_DESMARCADAS   = 3;            // veces que se puede devolver una tarea a pendientes
const ALIMENTOS_SEGUIDOS = 5;           // alimentaciones antes del descanso
const DESCANSO_MS        = 30 * 60 * 1000;   // 30 minutos

// --- amenaza espacial ---
const AMENAZA = {
    // cada amenaza se programa a 48, 120 o 168 horas, sorteado
    esperas:       [48, 120, 168].map(horas => horas * 60 * 60 * 1000),
    duracionAtaque: 10 * 60 * 1000,   // cuánto dura el ataque si no llegaste al nivel
    avisoCerca:     60 * 60 * 1000,   // desde cuándo el contador se pone en alerta
    mensajeDetenido:     8 * 1000     // cuánto queda el cartel "ataque detenido"
};

function esperaDeAmenaza(){
    return AMENAZA.esperas[Math.floor(Math.random() * AMENAZA.esperas.length)];
}

const EFECTOS_ATAQUE = [
    { id: "letras", nombre: "Letras desordenadas" },
    { id: "alien",  nombre: "Categorías alienígenas" },
    { id: "mono",   nombre: "Página monocromática" }
];

/* ---------------------------------------------------------
   2. TEXTOS DEL TUTORIAL (una sola fuente para las dos versiones)
   --------------------------------------------------------- */

const IMG_MODULOS = "https://dthezntil550i.cloudfront.net/0q/latest/0q2210030121066210017806817/ea891afb-19ce-49ac-80bc-5acaa711246d.png";

const PASOS_TUTORIAL = [
    {
        id: "1",
        selector: null,
        imagen: "logo-completo.png",
        html: `<h2>¡Bienvenid@ viajer@ espacial{nombre}!</h2>
               <p>ÓRBITASK es tu herramienta para registrar y administrar tus tareas, en sus dos formatos: web y físico.</p>
               <p>Cada tarea que completás le da vida a una mascota espacial que te acompaña, pero si se te acumulan sin hacer, se va debilitando.</p>
               <p>Te mostramos paso a paso cómo funciona todo.</p>`
    },
    {
        id: "2",
        selector: "#seccion_QBy",
        imagen: "https://ik.imagekit.io/ui9le8s20/catarsis.gif",
        html: `<h2>Tu mascota</h2>
               <p>Al entrar por primera vez, la página te asigna una mascota al azar, y es la que te acompaña de ahí en más: no se elige ni se cambia.</p>
               <p>Acá, en el centro de la página, la vas a ver siempre: es la protagonista, porque todo lo demás existe para mantenerla con vida.</p>
               <p>Pero no come sola: depende enteramente de vos y de las tareas que vayas completando.</p>`
    },
    {
        id: "3",
        selector: "#zona_vida",
        imagen: IMG_MODULOS,
        html: `<h2>Barra de vida y nivel</h2>
               <p>Justo debajo de la mascota está su barra de vida, que te muestra cuánta le queda con un porcentaje exacto.</p>
               <p>Esa vida baja sola con el paso del tiempo, aunque no hagas nada. Por eso hay que ir completando tareas y alimentándola seguido.</p>
               <p>A la derecha de la barra tenés el nivel: cada vez que la barra se llena del todo, sube un nivel y arranca de nuevo.</p>`
    },
    {
        id: "4",
        selector: "#lista_pendientes",
        imagen: IMG_MODULOS,
        html: `<h2>Lista de pendientes</h2>
               <p>Esta es tu lista de pendientes, con todo lo que te falta hacer. Al pulsar el botón de +, podés agregar una tarea nueva cuando quieras.</p>
               <p>Cada fila tiene un círculo de color que marca la urgencia y un símbolo con la categoría. Si tocás el nombre de una tarea, se abre para que la edites.</p>
               <p>Y cuando la termines, marcá el cuadrado de la izquierda: la tarea se va de pendientes y pasa directo a realizados.</p>
               <button type="button" class="boton_texto" data-extra="1">Ver cómo se registra una tarea</button>`
    },
    {
        id: "5",
        selector: "#lista_realizados",
        imagen: IMG_MODULOS,
        html: `<h2>Lista de realizados</h2>
               <p>Acá en realizados quedan todas las tareas que ya terminaste. ¡Un gusto verlas acumularse!</p>
               <p>Cada una tiene a su lado un corazón con un valor de vida. Al pulsarlo, tu mascota lo come y la tarea se borra para siempre.</p>
               <p>¿Te equivocaste al marcar una? Desmarcá el cuadrado y vuelve a pendientes, sin drama. Eso sí, solo se puede hacer tres veces.</p>`
    },
    {
        id: "6",
        selector: "#contador_amenaza",
        imagen: "logo-completo.png",
        html: `<h2>Amenaza espacial</h2>
               <p>Cada tanto aparece una amenaza espacial, y el contador de la barra de arriba te avisa cuánto falta para que llegue.</p>
               <p>Cada amenaza le exige un nivel a tu mascota: si ya lo alcanzó, te protege sin problema; si todavía no, pierde de golpe una parte de su vida — y lo vas a notar también vos, porque la pantalla se desordena un poco (letras que se mezclan y cosas así).</p>`
    },
    {
        id: "7",
        selector: null,
        imagen: "cohete-orbita.png",
        html: `<h2>¡A la órbita!</h2>
               <p>¡Y con esto ya sabés lo esencial! Cargar tareas, marcarlas y mantener viva a tu mascota.</p>
               <p>Si en algún momento querés repasar, el botón de pregunta de la barra de arriba repite este tutorial desde cero.</p>
               <p>Buena suerte, viajero espacial.</p>`
    },
    {
        id: "extra",
        selector: "#agregar_item",
        imagen: IMG_MODULOS,
        html: `<h2>Registrar una tarea</h2>
               <p>Al pulsar el botón de +, se abre una ventana con varios campos. El nombre es lo único obligatorio; la descripción es opcional, por si querés anotar algún detalle.</p>
               <p>Desplegando el primer menú elegís qué tan urgente es, con cuatro niveles y un color para cada uno. Eso es lo que decide el orden de la lista: las más apuradas quedan arriba.</p>
               <p>El segundo menú es la categoría, cada una con su propio símbolo, para que de un vistazo sepas de qué se trata cada tarea.</p>`
    }
];

const PASOS_PRINCIPALES = PASOS_TUTORIAL.filter(p => p.id !== "extra");

/* El tutorial saluda con el nombre que la persona eligió al registrarse.
   En los textos se escribe {nombre} y acá se reemplaza. */
function nombreParaMostrar(){
    const cuenta = (typeof buscarCuenta === "function") ? buscarCuenta(usuarioActual) : null;
    if(cuenta && cuenta.nombre) return cuenta.nombre;
    return usuarioActual || "";
}

function textoDelPaso(paso){
    const nombre = nombreParaMostrar();
    return paso.html.split("{nombre}").join(nombre ? " " + nombre : "");
}

/* ---------------------------------------------------------
   3. ESTADO
   --------------------------------------------------------- */

let usuarioActual = null;
let estado = null;
let idEnEdicion = null;
let mascotaPendienteDeRevelar = false;
let relojGeneral = null;

const claveDe = (usuario) => "orbitask_" + usuario;

// la sesión abierta vive en la pestaña: al recargar sigue adentro,
// y al cerrar la pestaña se termina
const CLAVE_SESION = "orbitask_sesion";

function recordarSesion(usuario){
    try{ sessionStorage.setItem(CLAVE_SESION, usuario); }catch(e){ /* ignorar */ }
}

function olvidarSesion(){
    try{ sessionStorage.removeItem(CLAVE_SESION); }catch(e){ /* ignorar */ }
}

function sesionAbierta(){
    try{ return sessionStorage.getItem(CLAVE_SESION) || ""; }catch(e){ return ""; }
}

function estadoInicial(){
    const mascota = MASCOTAS[Math.floor(Math.random() * MASCOTAS.length)];
    return {
        mascotaId: mascota.id,
        vida: 0,
        nivel: 0,
        tareas: [],
        ultimoTick: Date.now(),
        tutorialVisto: false,
        mascotaRevelada: false,
        alimentosSeguidos: 0,
        descansoHasta: 0,
        amenaza: null
    };
}

function guardarEstado(){
    if(!usuarioActual || !estado) return;
    try{
        localStorage.setItem(claveDe(usuarioActual), JSON.stringify(estado));
    }catch(e){
        console.warn("No se pudo guardar el estado:", e);
    }
}

function cargarEstado(usuario){
    try{
        const crudo = localStorage.getItem(claveDe(usuario));
        if(crudo) return JSON.parse(crudo);
    }catch(e){
        console.warn("No se pudo leer el estado:", e);
    }
    return null;
}

function mascotaDelUsuario(){
    return MASCOTAS.find(m => m.id === estado.mascotaId) || MASCOTAS[0];
}

/* ---------------------------------------------------------
   4. CUENTAS: alta, ingreso y guardado

   Las cuentas viven en dos lados a la vez:
     - en este navegador (localStorage), para entrar al instante
     - en Firebase, para que la misma cuenta sirva en otra compu,
       en el celular y en el aparato físico
   --------------------------------------------------------- */

let cuentas        = {};     // { usuario: { usuario, clave, mail, creada, ultimoIngreso, ingresos } }
let borradoCuentas = null;   // promesa del borrado en la nube, tras un reinicio
let falloNube      = "";     // por qué no se pudo hablar con la base, si pasó

const RE_USUARIO = /^[a-z0-9._-]{3,20}$/;
const RE_MAIL    = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// errores de tipeo frecuentes: se avisan en vez de dejar pasar el mail
const TIPEOS_MAIL = {
    "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com",
    "gmail.con": "gmail.com", "gmaill.com": "gmail.com", "gamil.com": "gmail.com",
    "hotmai.com": "hotmail.com", "hotmial.com": "hotmail.com", "hotmail.con": "hotmail.com",
    "hotmil.com": "hotmail.com", "outlok.com": "outlook.com", "outloo.com": "outlook.com",
    "yahho.com": "yahoo.com", "yaho.com": "yahoo.com", "iclod.com": "icloud.com",
    "icloud.co": "icloud.com", "live.con": "live.com"
};

function normalizar(nombre){
    return String(nombre || "").trim().toLowerCase();
}

function leerCuentas(){
    let guardadas = {};
    try{
        const crudo = localStorage.getItem(CLAVE_CUENTAS);
        if(crudo) guardadas = JSON.parse(crudo) || {};
    }catch(e){
        console.warn("No se pudieron leer las cuentas:", e);
    }

    cuentas = Object.assign({}, guardadas);

    // las dos cuentas fijas siempre están, y su clave no se puede cambiar
    Object.keys(CUENTAS_FIJAS).forEach(u => {
        cuentas[u] = Object.assign(
            { creada: 0, ultimoIngreso: 0, ingresos: 0 },
            cuentas[u],
            CUENTAS_FIJAS[u],
            { fija: true }
        );
    });

    return cuentas;
}

function guardarCuentas(){
    try{
        localStorage.setItem(CLAVE_CUENTAS, JSON.stringify(cuentas));
    }catch(e){
        console.warn("No se pudieron guardar las cuentas:", e);
    }
    subirCuentas();
}

function subirCuentas(){
    const esperar = borradoCuentas || Promise.resolve();

    esperar.then(() => fetch(FIREBASE_URL + "/cuentas.json", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuentas)
    })).catch(e => console.warn("[nube] no se pudieron subir las cuentas:", e));
}

/* trae las cuentas de la nube y las junta con las de este navegador:
   así una cuenta creada en el celular o en el aparato sirve acá */
function bajarCuentas(){
    if(borradoCuentas) return Promise.resolve(cuentas);

    return fetch(FIREBASE_URL + "/cuentas.json?cacheBust=" + Date.now())
        .then(r => {
            if(!r.ok){
                falloNube = "La base de datos respondió " + r.status +
                            (r.status === 401 || r.status === 403
                                ? ": vencieron las reglas de Firebase"
                                : "");
                return null;
            }
            falloNube = "";
            return r.json();
        })
        .then(remotas => {
            if(remotas && typeof remotas === "object"){
                Object.keys(remotas).forEach(u => {
                    const remota = remotas[u];
                    if(!remota || !remota.clave) return;

                    if(!cuentas[u]) cuentas[u] = remota;
                    else if((remota.ultimoIngreso || 0) > (cuentas[u].ultimoIngreso || 0))
                        cuentas[u] = Object.assign({}, cuentas[u], remota);

                    /* el recordatorio por mail lo puede haber mandado GitHub:
                       gana la fecha de aviso más nueva, así no se repite */
                    if((remota.ultimoAviso || 0) > (cuentas[u].ultimoAviso || 0))
                        cuentas[u].ultimoAviso = remota.ultimoAviso;
                });

                // la clave de las fijas manda siempre la de acá
                Object.keys(CUENTAS_FIJAS).forEach(u => {
                    cuentas[u] = Object.assign({}, cuentas[u], CUENTAS_FIJAS[u], { fija: true });
                });

                try{ localStorage.setItem(CLAVE_CUENTAS, JSON.stringify(cuentas)); }catch(e){}
            }
            return cuentas;
        })
        .catch(e => {
            console.warn("[nube] no se pudieron bajar las cuentas:", e);
            return cuentas;
        });
}

function buscarCuenta(usuario){
    return cuentas[normalizar(usuario)] || null;
}

/* ---------- revisión del mail ----------
   Sin un servidor no se puede comprobar que la casilla exista de verdad
   (para eso habría que mandarle un mail de confirmación). Lo que sí se
   revisa acá es que el formato sea correcto, que el dominio tenga forma
   de dominio real y que no sea un error de tipeo conocido. */

function revisarMail(mail){
    const limpio = normalizar(mail);

    if(limpio === "")            return "Escribí tu mail.";
    if(!RE_MAIL.test(limpio))    return "Ese mail no tiene un formato válido. Tiene que ser algo como nombre@gmail.com";

    const partes  = limpio.split("@");
    const dominio = partes[1];

    if(TIPEOS_MAIL[dominio])
        return "¿No habrás querido escribir " + partes[0] + "@" + TIPEOS_MAIL[dominio] + "?";

    const terminacion = dominio.split(".").pop();
    if(terminacion.length < 2 || dominio.indexOf(".") < 1)
        return "El dominio de ese mail no parece real.";

    return "";
}

/* ---------- mandar el código por mail ---------- */

let registroPendiente = null;   // { usuario, mail, clave, codigo, vence, intentos, ultimoEnvio }

function prepararEmailJS(){
    if(typeof emailjs === "undefined") return false;

    try{
        emailjs.init({ publicKey: EMAILJS_PUBLICA });   // versión 4
        return true;
    }catch(e){
        try{
            emailjs.init(EMAILJS_PUBLICA);              // versiones viejas
            return true;
        }catch(e2){
            console.warn("No se pudo preparar EmailJS:", e2);
            return false;
        }
    }
}

function codigoNuevo(){
    return String(Math.floor(100000 + Math.random() * 900000));
}

/* Se mandan varios nombres para el mismo dato (email, to_email, ...)
   porque cada plantilla de EmailJS usa el suyo: así funciona sin
   importar cómo esté armada. Los que la plantilla no use se ignoran. */
function mandarCodigo(mail, usuario, codigo){
    if(typeof emailjs === "undefined")
        return Promise.reject(new Error("La librería de mails no cargó."));

    return emailjs.send(EMAILJS_SERVICIO, EMAILJS_PLANTILLA, {
        email:      mail,
        to_email:   mail,
        user_email: mail,
        reply_to:   mail,
        to_name:    usuario,
        user_name:  usuario,
        name:       usuario,
        from_name:  "ORBITASK",
        codigo:     codigo,
        code:       codigo,
        passcode:   codigo,
        subject:    "Tu codigo de ORBITASK",
        message:    "Tu codigo de verificacion de ORBITASK es " + codigo +
                    ". Vence en 10 minutos."
    });
}

leerCuentas();
bajarCuentas();
prepararEmailJS();

/* ---------------------------------------------------------
   4 bis. PANTALLA DE INGRESO (pestañas ingresar / registrarme)
   --------------------------------------------------------- */

const pantallaLogin  = document.getElementById("pantalla_login");
const app            = document.getElementById("app");
const panelAdmin     = document.getElementById("panel_admin");
const formLogin      = document.getElementById("form_login");
const formRegistro   = document.getElementById("form_registro");
const loginError     = document.getElementById("login_error");
const registroError  = document.getElementById("registro_error");
const tituloAcceso   = document.getElementById("titulo_caja_login");
const pestanaLogin   = document.getElementById("pestana_login");
const pestanaRegistro= document.getElementById("pestana_registro");
const formCodigo     = document.getElementById("form_codigo");
const codigoError    = document.getElementById("codigo_error");
const campoCodigo    = document.getElementById("codigo_ingresado");

function mostrarPestanaAcceso(cual){
    const esRegistro = (cual === "registro");
    const esCodigo   = (cual === "codigo");

    formLogin.hidden    = esRegistro || esCodigo;
    formRegistro.hidden = !esRegistro;
    formCodigo.hidden   = !esCodigo;

    pestanaLogin.classList.toggle("activa", !esRegistro && !esCodigo);
    pestanaRegistro.classList.toggle("activa", esRegistro || esCodigo);

    tituloAcceso.textContent = esCodigo   ? "Revisá tu mail"
                             : esRegistro ? "Crear cuenta"
                             :              "Iniciar sesión";

    loginError.classList.remove("visible");
    registroError.classList.remove("visible");
    codigoError.classList.remove("visible");
}

pestanaLogin.addEventListener("click", () => mostrarPestanaAcceso("login"));
pestanaRegistro.addEventListener("click", () => mostrarPestanaAcceso("registro"));

// vuelve a mostrar la pantalla de ingreso sin romper su maquetado en dos
// paneles (antes se forzaba display:flex y se desarmaba la grilla)
function mostrarLogin(){
    pantallaLogin.style.removeProperty("display");
    pantallaLogin.hidden = false;
    document.getElementById("login_usuario").value = "";
    document.getElementById("login_clave").value   = "";
    formRegistro.reset();
    formCodigo.reset();
    registroPendiente = null;
    mostrarPestanaAcceso("login");
}

function ocultarLogin(){
    pantallaLogin.style.display = "none";
}

function avisarLogin(texto){
    loginError.textContent = texto;
    loginError.classList.add("visible");
}

function avisarRegistro(texto){
    registroError.textContent = texto;
    registroError.classList.add("visible");
}

function avisarCodigo(texto){
    codigoError.textContent = texto;
    codigoError.classList.add("visible");
}

/* ---------- ingresar ---------- */

formLogin.addEventListener("submit", function(evento){
    evento.preventDefault();

    const usuario = normalizar(document.getElementById("login_usuario").value);
    const clave   = document.getElementById("login_clave").value;

    if(entrarSiCoincide(usuario, clave)) return;

    // puede ser una cuenta creada en otro dispositivo: se busca en la nube
    avisarLogin("Buscando la cuenta...");

    bajarCuentas().then(() => {
        if(entrarSiCoincide(usuario, clave)) return;

        const cuenta = buscarCuenta(usuario);
        avisarLogin(cuenta ? "La contraseña no es correcta."
                           : "No existe ningún usuario con ese nombre.");
        document.getElementById("login_clave").value = "";
    });
});

function entrarSiCoincide(usuario, clave){
    const cuenta = buscarCuenta(usuario);
    if(!cuenta || cuenta.clave !== clave) return false;

    loginError.classList.remove("visible");
    iniciarSesion(usuario);
    return true;
}

/* ---------- registrarse ---------- */

formRegistro.addEventListener("submit", function(evento){
    evento.preventDefault();

    const nombreTal = document.getElementById("registro_usuario").value.trim();
    const usuario   = normalizar(nombreTal);
    const mail      = normalizar(document.getElementById("registro_mail").value);
    const clave   = document.getElementById("registro_clave").value;
    const clave2  = document.getElementById("registro_clave2").value;

    if(!RE_USUARIO.test(usuario)){
        avisarRegistro("El usuario va de 3 a 20 caracteres, con letras, números, punto, guion o guion bajo (sin espacios).");
        return;
    }

    if(buscarCuenta(usuario)){
        avisarRegistro("Ese nombre de usuario ya está tomado. Probá con otro.");
        return;
    }

    const problemaMail = revisarMail(mail);
    if(problemaMail){ avisarRegistro(problemaMail); return; }

    if(clave.length < 6){
        avisarRegistro("La contraseña tiene que tener al menos 6 caracteres.");
        return;
    }

    if(clave !== clave2){
        avisarRegistro("Las dos contraseñas no coinciden.");
        return;
    }

    // antes de dar de alta, se revisa que nadie haya tomado el nombre en otro lado
    avisarRegistro("Creando tu cuenta...");

    bajarCuentas().then(() => {
        if(buscarCuenta(usuario)){
            avisarRegistro("Ese nombre de usuario ya está tomado. Probá con otro.");
            return;
        }

        // todo en orden: se manda el código al mail y se pide
        registroPendiente = {
            usuario:     usuario,
            nombre:      nombreTal,
            mail:        mail,
            clave:       clave,
            codigo:      "",
            vence:       0,
            intentos:    0,
            ultimoEnvio: 0
        };

        enviarCodigoPendiente(true);
    });
});

/* Manda (o vuelve a mandar) el código del registro en curso. */
function enviarCodigoPendiente(primeraVez){
    if(!registroPendiente) return;

    const espera = ESPERA_REENVIO_MS - (Date.now() - registroPendiente.ultimoEnvio);
    if(!primeraVez && espera > 0){
        avisarCodigo("Esperá " + Math.ceil(espera / 1000) + " segundos para pedir otro código.");
        return;
    }

    const codigo = codigoNuevo();

    registroPendiente.codigo      = codigo;
    registroPendiente.vence       = Date.now() + CODIGO_VALE_MS;
    registroPendiente.intentos    = 0;
    registroPendiente.ultimoEnvio = Date.now();

    if(primeraVez) avisarRegistro("Mandando el código a tu mail...");
    else           avisarCodigo("Mandando otro código...");

    mandarCodigo(registroPendiente.mail, registroPendiente.usuario, codigo)
        .then(() => {
            document.getElementById("mail_destino").textContent = registroPendiente.mail;
            mostrarPestanaAcceso("codigo");
            campoCodigo.value = "";
            campoCodigo.focus();
        })
        .catch(error => {
            console.warn("[mail] no se pudo enviar:", error);

            const detalle = (error && (error.text || error.message)) ? (" (" + (error.text || error.message) + ")") : "";
            const aviso = "No pudimos mandarte el mail" + detalle +
                          ". Fijate que el mail esté bien escrito y que tengas internet, y probá de nuevo.";

            if(formCodigo.hidden){
                registroPendiente = null;
                avisarRegistro(aviso);
            }else{
                avisarCodigo(aviso);
            }
        });
}

/* ---------- paso 2: el código ---------- */

formCodigo.addEventListener("submit", function(evento){
    evento.preventDefault();

    if(!registroPendiente){
        mostrarPestanaAcceso("registro");
        return;
    }

    const escrito = campoCodigo.value.trim();

    if(Date.now() > registroPendiente.vence){
        avisarCodigo("Ese código venció. Pedí uno nuevo con «Reenviar código».");
        return;
    }

    if(escrito !== registroPendiente.codigo){
        registroPendiente.intentos++;

        if(registroPendiente.intentos >= MAX_INTENTOS){
            avisarCodigo("Demasiados intentos. Pedí un código nuevo.");
            registroPendiente.vence = 0;
        }else{
            avisarCodigo("El código no coincide. Te quedan " +
                         (MAX_INTENTOS - registroPendiente.intentos) + " intentos.");
        }

        campoCodigo.value = "";
        return;
    }

    // código correcto: recién ahora se crea la cuenta
    const datos = registroPendiente;
    registroPendiente = null;

    cuentas[datos.usuario] = {
        usuario:        datos.usuario,
        nombre:         datos.nombre || datos.usuario,
        clave:          datos.clave,
        mail:           datos.mail,
        mailVerificado: true,
        creada:         Date.now(),
        ultimoIngreso:  0,
        ingresos:       0,
        tutorialPendiente: true     // se le muestra una vez y nunca más
    };

    guardarCuentas();

    codigoError.classList.remove("visible");
    formRegistro.reset();
    formCodigo.reset();

    iniciarSesion(datos.usuario);
});

document.getElementById("boton_reenviar").addEventListener("click", function(){
    enviarCodigoPendiente(false);
});

document.getElementById("boton_volver_registro").addEventListener("click", function(){
    registroPendiente = null;
    mostrarPestanaAcceso("registro");
});

/* ---------------------------------------------------------
   4 ter. ENTRAR Y SALIR
   --------------------------------------------------------- */

function iniciarSesion(usuario, retomada){
    const cuenta = buscarCuenta(usuario);

    // al recargar la pestaña no se cuenta como un ingreso nuevo
    if(cuenta && !retomada){
        if(!cuenta.creada) cuenta.creada = Date.now();
        cuenta.ultimoIngreso = Date.now();
        cuenta.ingresos = (cuenta.ingresos || 0) + 1;
        guardarCuentas();
    }

    // admin2 no entra a la aplicación: entra al panel de control
    if(usuario === USUARIO_PANEL){
        recordarSesion(usuario);
        ocultarLogin();
        abrirPanelAdmin();
        return;
    }

    usuarioActual = usuario;
    recordarSesion(usuario);
    cargarFoto(usuario);

    const guardado = cargarEstado(usuario);
    const primerIngreso = (guardado === null);

    estado = guardado || estadoInicial();

    // completa campos que puedan faltar en estados viejos
    if(typeof estado.vida  !== "number")  estado.vida  = 0;
    if(typeof estado.nivel !== "number")  estado.nivel = 0;
    if(!Array.isArray(estado.tareas))     estado.tareas = [];
    if(!estado.mascotaId)                 estado.mascotaId = MASCOTAS[0].id;
    if(typeof estado.alimentosSeguidos !== "number") estado.alimentosSeguidos = 0;
    if(typeof estado.descansoHasta !== "number")     estado.descansoHasta = 0;
    if(!estado.amenaza)                   estado.amenaza = nuevaAmenaza();

    aplicarDecaimiento();

    ocultarLogin();
    app.hidden = false;

    pintarMascota();
    renderizarListas();
    actualizarBarraVida();
    actualizarAmenaza();
    guardarEstado();

    /* El tutorial guiado arranca solo en el primer ingreso de la cuenta.
       De ahí en más, solo si la persona toca el botón del menú.

       Se mira la cuenta y no los datos de este navegador: los ingresos
       viajan con la cuenta por la nube, así que quien ya entró alguna vez
       no lo vuelve a ver aunque abra la página en otro aparato o se le
       hayan borrado los datos del navegador. */
    if(cuenta && !cuenta.tutorialVisto && estado.tutorialVisto){
        // ya lo había visto antes de que esto se anotara en la cuenta
        cuenta.tutorialVisto = true;
        guardarCuentas();
    }

    /* La marca la pone el registro y la saca el tutorial al abrirse, así
       que esto es cierto exactamente una vez en la vida de la cuenta. */
    if(cuenta && cuenta.tutorialPendiente){
        mascotaPendienteDeRevelar = !estado.mascotaRevelada;
        setTimeout(() => iniciarTutorialVisual(), 350);
    }

    if(relojGeneral) clearInterval(relojGeneral);
    relojGeneral = setInterval(tickGeneral, 1000);
}

function cerrarSesion(){
    olvidarSesion();
    guardarEstado();
    if(relojGeneral) clearInterval(relojGeneral);
    cerrarTutorialVisual(false);
    quitarEfectoAtaque();        // que no se lleve el ataque a la pantalla de ingreso
    usuarioActual = null;
    estado = null;
    fotoActual = "";
    pintarFoto();
    app.hidden = true;
    panelAdmin.hidden = true;
    mostrarLogin();
}

document.getElementById("boton_salir").addEventListener("click", cerrarSesion);
document.getElementById("boton_salir_admin").addEventListener("click", cerrarSesion);

/* ---------------------------------------------------------
   4 quater. PANEL DE CONTROL (admin2)

   Junta dos cosas: el registro de cuentas y el estado de cada
   usuario (sus tareas, su mascota y su nivel). Los busca primero
   en la nube, y lo que no encuentre lo completa con lo que haya
   guardado en este navegador.
   --------------------------------------------------------- */

const cuerpoTabla  = document.getElementById("cuerpo_tabla");
const estadoAdmin  = document.getElementById("estado_admin");

function abrirPanelAdmin(){
    panelAdmin.hidden = false;
    pintarFechaPanel();
    cargarPanelAdmin();
}

function bajarEstados(){
    return fetch(FIREBASE_URL + "/usuarios.json?cacheBust=" + Date.now())
        .then(r => {
            if(!r.ok){
                falloNube = "La base de datos respondió " + r.status +
                            (r.status === 401 || r.status === 403
                                ? ": vencieron las reglas de Firebase"
                                : "");
                return null;
            }
            return r.json();
        })
        .then(remotos => remotos || {})
        .catch(e => {
            falloNube = "No se pudo llegar a la base de datos (" + (e && e.message ? e.message : "sin conexión") + ")";
            return {};
        });
}

function cargarPanelAdmin(){
    estadoAdmin.textContent = "Actualizando...";
    estadoAdmin.classList.remove("con_problema");
    falloNube = "";

    contarQuejasNuevas();

    Promise.all([bajarCuentas(), bajarEstados()]).then(function(resultados){
        pintarTablaAdmin(resultados[1] || {});

        if(falloNube){
            estadoAdmin.textContent = falloNube;
            estadoAdmin.classList.add("con_problema");
            console.warn("[nube]", falloNube);
        }else{
            estadoAdmin.textContent = "Actualizado a las " + soloHora(Date.now());
        }
    });
}

document.getElementById("boton_refrescar").addEventListener("click", cargarPanelAdmin);

function fechaCompleta(ms){
    if(!ms) return "—";
    const f = new Date(ms);
    const dos = (n) => (n < 10 ? "0" : "") + n;
    return dos(f.getDate()) + "/" + dos(f.getMonth() + 1) + "/" + f.getFullYear() +
           " " + dos(f.getHours()) + ":" + dos(f.getMinutes());
}

function fechaCorta(ms){
    if(!ms) return "—";
    const f = new Date(ms);
    const dos = (n) => String(n).padStart(2, "0");
    return dos(f.getDate()) + "/" + dos(f.getMonth() + 1) + "/" + dos(f.getFullYear() % 100) +
           " " + dos(f.getHours()) + ":" + dos(f.getMinutes());
}

function soloHora(ms){
    const f = new Date(ms);
    return String(f.getHours()).padStart(2, "0") + ":" + String(f.getMinutes()).padStart(2, "0");
}

function esDeHoy(ms){
    if(!ms) return false;
    const hoy = new Date();
    const f   = new Date(ms);
    return f.getDate() === hoy.getDate() && f.getMonth() === hoy.getMonth() &&
           f.getFullYear() === hoy.getFullYear();
}

let estadosDelPanel = {};      // último estado leído de cada usuario
let relojPanel      = null;    // refresca los temporizadores cada segundo

function pintarTablaAdmin(estadosRemotos){
    estadosDelPanel = estadosRemotos || {};
    cuerpoTabla.innerHTML = "";

    let totalPendientes = 0;
    let totalRealizadas = 0;
    let entraronHoy     = 0;

    const lista = Object.keys(cuentas).sort(function(a, b){
        const fa = cuentas[a].fija ? 1 : 0;
        const fb = cuentas[b].fija ? 1 : 0;
        if(fa !== fb) return fb - fa;                                   // las fijas, arriba
        return (cuentas[b].ultimoIngreso || 0) - (cuentas[a].ultimoIngreso || 0);
    });

    lista.forEach(function(u){
        const cuenta  = cuentas[u];
        const esPanel = (u === USUARIO_PANEL);

        // admin2 no juega: no tiene tareas, ni mascota, ni amenazas
        const est    = esPanel ? null : (estadosDelPanel[u] || cargarEstado(u) || null);
        const tareas = (est && Array.isArray(est.tareas)) ? est.tareas : [];

        const pendientes = tareas.filter(t => !t.hecha).length;
        const realizadas = tareas.filter(t =>  t.hecha).length;

        if(est){
            totalPendientes += pendientes;
            totalRealizadas += realizadas;
        }
        if(esDeHoy(cuenta.ultimoIngreso)) entraronHoy++;

        const fila = document.createElement("tr");
        if(esPanel) fila.className = "fila_panel";

        /* ---- usuario ---- */
        const tdUsuario = document.createElement("td");
        tdUsuario.className = "celda_usuario";
        tdUsuario.textContent = cuenta.usuario;
        tdUsuario.title = "Ver el detalle de este usuario";
        tdUsuario.addEventListener("click", () => abrirDetalle(u));
        if(cuenta.fija){
            const chapa = document.createElement("span");
            chapa.className = "chapa_fila " + (esPanel ? "panel" : "fija");
            chapa.textContent = esPanel ? "panel" : "fijo";
            tdUsuario.appendChild(chapa);
        }
        fila.appendChild(tdUsuario);

        /* ---- contraseña y mail ---- */
        const tdClave = document.createElement("td");
        tdClave.className = "celda_clave";
        tdClave.textContent = cuenta.clave;
        fila.appendChild(tdClave);

        const tdMail = document.createElement("td");
        tdMail.className = "celda_mail" + (cuenta.mailVerificado ? " verificado" : "");
        tdMail.textContent = cuenta.mail ? ((cuenta.mailVerificado ? "\u2713 " : "") + cuenta.mail) : "—";
        fila.appendChild(tdMail);

        /* ---- mascota, nivel y vida, todo junto ---- */
        const tdMascota = document.createElement("td");
        tdMascota.className = "celda_mascota";

        if(!est){
            tdMascota.textContent = "—";
        }else{
            const mascota = MASCOTAS.find(m => m.id === est.mascotaId);
            const vida    = Math.max(0, Math.min(100, Math.round(est.vida || 0)));

            const nombre = document.createElement("span");
            nombre.className = "nombre_mascota_tabla";
            nombre.textContent = (mascota ? mascota.nombre : "—") + "  ·  NIVEL " + (est.nivel || 0);

            const barra = document.createElement("span");
            barra.className = "barra_vida_tabla";
            const relleno = document.createElement("span");
            relleno.style.width = vida + "%";
            barra.appendChild(relleno);

            const texto = document.createElement("span");
            texto.className = "vida_tabla";
            texto.textContent = vida + "% de vida";

            tdMascota.appendChild(nombre);
            tdMascota.appendChild(barra);
            tdMascota.appendChild(texto);
        }
        fila.appendChild(tdMascota);

        /* ---- tareas ---- */
        const tdPend = document.createElement("td");
        tdPend.className = "col_numero";
        tdPend.textContent = est ? String(pendientes) : "—";
        fila.appendChild(tdPend);

        const tdReal = document.createElement("td");
        tdReal.className = "col_numero";
        tdReal.textContent = est ? String(realizadas) : "—";
        fila.appendChild(tdReal);

        /* ---- amenaza: el botón es el temporizador ---- */
        const tdAmenaza = document.createElement("td");

        if(!est){
            tdAmenaza.textContent = "—";
            tdAmenaza.className = "col_numero";
        }else{
            const amenaza  = est.amenaza || {};
            const enPausa  = !!amenaza.pausada;
            const atacando = (amenaza.atacandoHasta || 0) > Date.now();

            const caja = document.createElement("div");
            caja.className = "celda_amenaza";

            /* el temporizador: tocarlo frena las amenazas, y tocarlo otra
               vez las vuelve a poner en marcha */
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "boton_amenaza" + (enPausa ? " pausada" : (atacando ? " atacando" : ""));
            boton.dataset.usuario  = u;
            boton.dataset.llega    = amenaza.llegaEn || 0;
            boton.dataset.atacando = amenaza.atacandoHasta || 0;
            boton.dataset.pausada  = enPausa ? "1" : "0";
            boton.title = enPausa ? "Las amenazas están frenadas. Pulsá para que vuelvan a correr."
                                  : "Pulsá para frenar las amenazas de este usuario hasta nuevo aviso.";
            boton.textContent = etiquetaAmenaza(boton);

            boton.addEventListener("click", function(){
                cambiarAmenaza(u, enPausa ? "activar" : "pausar");
            });

            /* la otra opción: cortar la de ahora y dejar que venga la próxima */
            const saltar = document.createElement("button");
            saltar.type = "button";
            saltar.className = "boton_saltar_amenaza";
            saltar.textContent = atacando ? "Cortar el ataque" : "Hasta la próxima";
            saltar.title = atacando
                ? "Termina el ataque de ahora y programa la amenaza siguiente"
                : "Cancela la amenaza que viene y programa la siguiente";
            saltar.disabled = enPausa;
            saltar.addEventListener("click", function(){
                cambiarAmenaza(u, "saltar");
            });

            caja.append(boton, saltar);
            tdAmenaza.appendChild(caja);
        }
        fila.appendChild(tdAmenaza);

        /* ---- fechas ---- */
        const tdAlta = document.createElement("td");
        tdAlta.className = "celda_fecha";
        tdAlta.textContent = fechaCorta(cuenta.creada);
        fila.appendChild(tdAlta);

        const tdUltimo = document.createElement("td");
        tdUltimo.className = "celda_fecha";
        tdUltimo.textContent = fechaCorta(cuenta.ultimoIngreso);
        fila.appendChild(tdUltimo);

        /* ---- borrar ---- */
        const tdBorrar = document.createElement("td");
        tdBorrar.className = "celda_borrar";

        if(cuenta.fija){
            tdBorrar.textContent = "";
        }else{
            const tacho = document.createElement("button");
            tacho.type = "button";
            tacho.className = "boton_tacho";
            tacho.title = "Eliminar este usuario";
            tacho.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
                              ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                              '<path d="M3 6h18"/><path d="M8 6V4h8v2"/>' +
                              '<path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg>';
            tacho.addEventListener("click", () => pedirConfirmacionBorrado(tdBorrar, u));
            tdBorrar.appendChild(tacho);
        }
        fila.appendChild(tdBorrar);

        cuerpoTabla.appendChild(fila);
    });

    if(lista.length === 0){
        const fila = document.createElement("tr");
        const td   = document.createElement("td");
        td.colSpan = 10;
        td.className = "tabla_vacia";
        td.textContent = "Todavía no hay usuarios registrados.";
        fila.appendChild(td);
        cuerpoTabla.appendChild(fila);
    }

    document.getElementById("dato_usuarios").textContent   = lista.length;
    document.getElementById("dato_pendientes").textContent = totalPendientes;
    document.getElementById("dato_realizadas").textContent = totalRealizadas;
    document.getElementById("dato_activos").textContent    = entraronHoy;

    arrancarRelojPanel();
    pintarFechaPanel();

    if(campoBuscar && !campoBuscar.hidden) filtrarTabla(campoBuscar.value);
}

/* ---------- el temporizador de cada fila, al segundo ---------- */

function etiquetaAmenaza(boton){
    if(boton.dataset.pausada === "1") return "EN PAUSA";

    // mientras el ataque ocurre se dice eso, con lo que le falta para terminar
    const atacando = Number(boton.dataset.atacando || 0);
    if(atacando > Date.now()) return "EN PROCESO  " + formatearTiempo(atacando - Date.now());

    const llega = Number(boton.dataset.llega || 0);
    if(!llega) return "sin programar";

    const falta = llega - Date.now();
    return (falta <= 0) ? "EN PROCESO" : formatoLargo(falta);
}

function arrancarRelojPanel(){
    if(relojPanel) clearInterval(relojPanel);

    relojPanel = setInterval(function(){
        if(panelAdmin.hidden){ clearInterval(relojPanel); relojPanel = null; return; }
        document.querySelectorAll(".boton_amenaza").forEach(b => {
            b.textContent = etiquetaAmenaza(b);
        });
        pintarFechaPanel();
    }, 1000);
}

/* la línea de abajo del título del panel: usuario, día y hora */
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_ANO   = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                     "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function pintarFechaPanel(){
    const campo = document.getElementById("chapa_sub");
    if(!campo) return;

    const ahora = new Date();
    const dos   = (n) => (n < 10 ? "0" : "") + n;

    campo.textContent = USUARIO_PANEL + "  ·  " +
        DIAS_SEMANA[ahora.getDay()] + " " + ahora.getDate() + " de " + MESES_ANO[ahora.getMonth()] +
        "  ·  " + dos(ahora.getHours()) + ":" + dos(ahora.getMinutes());
}

/* ---------- frenar o volver a activar las amenazas ---------- */

function cambiarAmenaza(usuario, accion){
    const est = estadosDelPanel[usuario] || cargarEstado(usuario);
    if(!est){ estadoAdmin.textContent = "Ese usuario todavía no tiene datos"; return; }

    const copia = JSON.parse(JSON.stringify(est));
    if(!copia.amenaza) copia.amenaza = { atacandoHasta: 0, detenidoHasta: 0, efecto: null, nivelNecesario: (copia.nivel || 0) + 1 };

    if(accion === "pausar"){
        copia.amenaza.pausada       = true;
        copia.amenaza.atacandoHasta = 0;
        copia.amenaza.detenidoHasta = 0;
    }else{
        /* "activar" y "saltar" hacen lo mismo con los datos: dejan de
           atacar y programan la amenaza siguiente. La diferencia es de
           dónde venían: una estaba en pausa y la otra en curso. */
        copia.amenaza.pausada        = false;
        copia.amenaza.atacandoHasta  = 0;
        copia.amenaza.detenidoHasta  = 0;
        copia.amenaza.efecto         = null;
        copia.amenaza.llegaEn        = Date.now() + esperaDeAmenaza();
        copia.amenaza.nivelNecesario = (copia.nivel || 0) + 1;
    }

    copia.rev    = Date.now();
    copia.origen = "panel";

    const QUE_HACE = { pausar: "Frenando", activar: "Activando", saltar: "Cortando" };
    estadoAdmin.textContent = (QUE_HACE[accion] || "Cambiando") + " las amenazas de " + usuario + "...";

    fetch(FIREBASE_URL + "/usuarios/" + usuario + ".json", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copia)
    }).then(() => {
        estadosDelPanel[usuario] = copia;
        pintarTablaAdmin(estadosDelPanel);
        estadoAdmin.textContent =
              accion === "pausar" ? "Amenazas frenadas para " + usuario
            : accion === "saltar" ? "Cortada la amenaza de " + usuario + ": ya está programada la próxima"
            :                       "Amenazas activadas para " + usuario;
    }).catch(e => {
        console.warn("[nube] no se pudo cambiar la amenaza:", e);
        estadoAdmin.textContent = "No se pudo guardar el cambio";
    });
}

/* ---------- eliminar un usuario ---------- */

function pedirConfirmacionBorrado(celda, usuario){
    celda.innerHTML = "";

    const caja = document.createElement("div");
    caja.className = "confirma_borrado";

    const texto = document.createElement("span");
    texto.textContent = "¿Borrar?";

    const si = document.createElement("button");
    si.type = "button";
    si.className = "confirma_si";
    si.textContent = "SÍ";
    si.addEventListener("click", () => borrarUsuario(usuario));

    const no = document.createElement("button");
    no.type = "button";
    no.className = "confirma_no";
    no.textContent = "NO";
    no.addEventListener("click", () => pintarTablaAdmin(estadosDelPanel));

    caja.appendChild(texto);
    caja.appendChild(si);
    caja.appendChild(no);
    celda.appendChild(caja);
}

/* Saca al usuario de todos lados: de este navegador y de la nube.
   Lo usan el tachito del panel de admin2 y el botón de "borrar mi
   cuenta" de Mi cuenta. */
function borrarDatosDeUsuario(usuario){
    if(!cuentas[usuario] || cuentas[usuario].fija) return false;

    delete cuentas[usuario];
    delete estadosDelPanel[usuario];
    guardarCuentas();                  // el PUT de /cuentas lo saca del registro

    try{
        localStorage.removeItem(claveDe(usuario));
        localStorage.removeItem(CLAVE_FOTO + usuario);
    }catch(e){ /* ignorar */ }

    fetch(FIREBASE_URL + "/usuarios/" + usuario + ".json", { method: "DELETE" })
        .catch(e => console.warn("[nube] no se pudo borrar el usuario:", e));
    fetch(FIREBASE_URL + "/fotos/" + usuario + ".json", { method: "DELETE" })
        .catch(() => {});

    return true;
}

function borrarUsuario(usuario){
    if(!borrarDatosDeUsuario(usuario)) return;

    estadoAdmin.textContent = "Usuario " + usuario + " eliminado";
    pintarTablaAdmin(estadosDelPanel);
}

/* ---------------------------------------------------------
   4 quinquies. MODO DISEÑO — BORRAR ANTES DE PUBLICAR

   Borra todas las cuentas creadas y el progreso de todos los
   usuarios, y deja solo admin1 y admin2.
   --------------------------------------------------------- */

document.getElementById("boton_reset_dev").addEventListener("click", function(){
    if(!confirmarReinicio()) return;
});

/* El botón vive en el panel de admin2. Pide confirmación en la misma
   barra, para no borrar todo de un dedazo. */
let reinicioEnEspera = false;

function confirmarReinicio(){
    if(!reinicioEnEspera){
        reinicioEnEspera = true;
        estadoAdmin.textContent = "Tocá otra vez el botón ↺ para borrar TODOS los usuarios";
        estadoAdmin.classList.add("con_problema");

        setTimeout(function(){
            if(!reinicioEnEspera) return;
            reinicioEnEspera = false;
            estadoAdmin.classList.remove("con_problema");
            estadoAdmin.textContent = "Reinicio cancelado";
        }, 6000);

        return false;
    }

    reinicioEnEspera = false;
    estadoAdmin.classList.remove("con_problema");
    reiniciarTodo();
    return true;
}

function reiniciarTodo(){
    Object.keys(cuentas).forEach(u => {
        try{
            localStorage.removeItem(claveDe(u));
            localStorage.removeItem(CLAVE_FOTO + u);
        }catch(e){ /* ignorar */ }
    });

    try{ localStorage.removeItem(CLAVE_CUENTAS); }catch(e){ /* ignorar */ }

    borradoCuentas = fetch(FIREBASE_URL + "/cuentas.json", { method: "DELETE" })
        .then(() => { borradoCuentas = null; })
        .catch(e => { borradoCuentas = null; console.warn("[nube] no se pudieron borrar las cuentas:", e); });

    fetch(FIREBASE_URL + "/usuarios.json", { method: "DELETE" }).catch(() => {});
    fetch(FIREBASE_URL + "/fotos.json",    { method: "DELETE" }).catch(() => {});

    cuentas = {};
    leerCuentas();

    estadoAdmin.textContent = "Listo: quedaron solo admin1 y admin2";
    setTimeout(cargarPanelAdmin, 1200);
}

/* ---------------------------------------------------------
   5. MASCOTA, BARRA DE VIDA Y NIVEL
   --------------------------------------------------------- */

function pintarMascota(){
    const m = mascotaDelUsuario();
    document.getElementById("gif_mascota").src = m.gif;
    document.getElementById("gif_mascota").alt = m.nombre + " — " + m.descripcion;
    document.getElementById("nombre_mascota").textContent = m.nombre;
}

let animandoSubidaNivel = false;

function actualizarBarraVida(){
    const porcentaje = Math.max(0, Math.min(100, estado.vida));

    if(!animandoSubidaNivel){
        document.getElementById("barra_vida_relleno").style.width = porcentaje + "%";
        document.getElementById("barra_vida_texto").textContent = Math.round(porcentaje) + "%";
    }

    document.getElementById("contador_nivel").textContent = "NIVEL " + estado.nivel;
}

function alimentar(puntos){
    const nivelAnterior = estado.nivel;

    estado.vida += puntos;
    while(estado.vida >= 100){
        estado.vida -= 100;
        estado.nivel += 1;
    }

    animarGananciaDeVida(puntos, estado.nivel > nivelAnterior);
    actualizarBarraVida();
    guardarEstado();
}

function animarGananciaDeVida(puntos, subioDeNivel){
    const barra = document.getElementById("barra_vida");
    const zona  = document.getElementById("zona_vida");
    const nivel = document.getElementById("contador_nivel");
    const tipo  = tipoDeValor(puntos);

    barra.classList.remove("ganando", "bronce", "oro");
    void barra.offsetWidth;
    barra.classList.add("ganando");
    if(tipo) barra.classList.add(tipo);
    setTimeout(() => barra.classList.remove("ganando", "bronce", "oro"), 900);

    const flota = document.createElement("span");
    flota.className = "flota_vida" + (tipo ? " " + tipo : "");
    flota.textContent = "+" + puntos;
    zona.appendChild(flota);
    setTimeout(() => flota.remove(), 1050);

    if(subioDeNivel){
        const relleno = document.getElementById("barra_vida_relleno");

        animandoSubidaNivel = true;
        relleno.style.width = "100%";
        document.getElementById("barra_vida_texto").textContent = "100%";

        setTimeout(() => {
            relleno.style.transition = "none";
            relleno.style.width = "0%";
            void relleno.offsetWidth;
            relleno.style.transition = "";
            animandoSubidaNivel = false;
            actualizarBarraVida();
        }, 620);

        nivel.classList.remove("subio");
        void nivel.offsetWidth;
        nivel.classList.add("subio");
        setTimeout(() => nivel.classList.remove("subio"), 1050);
    }
}

// la barra pierde un 30% cada 24 horas, también mientras no estás
function aplicarDecaimiento(){
    const ahora = Date.now();
    const desde = estado.ultimoTick || ahora;
    const segundos = Math.max(0, (ahora - desde) / 1000);
    estado.ultimoTick = ahora;

    if(segundos <= 0) return;

    estado.vida -= segundos * DECAIMIENTO_POR_SEGUNDO;

    while(estado.vida < 0){
        if(estado.nivel > 0){
            estado.nivel -= 1;
            estado.vida += 100;
        }else{
            estado.vida = 0;
            break;
        }
    }
}

// reloj único: decaimiento + amenaza + estado de los corazones
function tickGeneral(){
    aplicarDecaimiento();
    actualizarBarraVida();
    actualizarAmenaza();
    actualizarCorazones();
    guardarEstado();
}

/* ---------------------------------------------------------
   6. LISTAS DE TAREAS
   --------------------------------------------------------- */

const ulPendientes = document.getElementById("ul_pendientes");
const ulRealizados = document.getElementById("ul_realizados");

function valorDeVidaAleatorio(){
    const sorteo = Math.random();
    if(sorteo < PROB_ORO)                return VALOR_ORO;
    if(sorteo < PROB_ORO + PROB_BRONCE)  return VALOR_BRONCE;
    return VALORES_COMUNES[Math.floor(Math.random() * VALORES_COMUNES.length)];
}

function tipoDeValor(valor){
    if(valor === VALOR_ORO)    return "oro";
    if(valor === VALOR_BRONCE) return "bronce";
    return "";
}

function nuevoId(){
    return "t" + Date.now() + Math.floor(Math.random() * 1000);
}

// ¿los corazones están en descanso? (anti-trampa)
function enDescanso(){
    return Date.now() < (estado.descansoHasta || 0);
}

function restanteDescanso(){
    return Math.max(0, (estado.descansoHasta || 0) - Date.now());
}

function renderizarListas(){
    ulPendientes.innerHTML = "";
    ulRealizados.innerHTML = "";

    const pendientes = estado.tareas
        .filter(t => !t.hecha)
        .sort((a, b) => (b.urgencia - a.urgencia) || (a.creada - b.creada));

    const realizados = estado.tareas
        .filter(t => t.hecha)
        .sort((a, b) => (b.completada || 0) - (a.completada || 0));

    if(pendientes.length === 0){
        ulPendientes.innerHTML = '<li class="lista_vacia">Todavía no cargaste tareas. Pulsá el + para empezar.</li>';
    }else{
        pendientes.forEach(t => ulPendientes.appendChild(crearLi(t, false)));
    }

    if(realizados.length === 0){
        ulRealizados.innerHTML = '<li class="lista_vacia">Acá van a aparecer las tareas que completes.</li>';
    }else{
        realizados.forEach(t => ulRealizados.appendChild(crearLi(t, true)));
    }
}

// orden visual: checkbox · nombre · círculo de urgencia · símbolo de categoría [· corazón]
function crearLi(tarea, esRealizado){
    const li = document.createElement("li");
    li.dataset.id = tarea.id;

    const usadas    = tarea.desmarcadas || 0;
    const restantes = MAX_DESMARCADAS - usadas;
    const bloqueada = esRealizado && restantes <= 0;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!tarea.hecha;

    if(!esRealizado){
        check.title = "Marcar como realizada";
    }else if(bloqueada){
        check.disabled = true;
        check.title = "Ya devolviste esta tarea a pendientes " + MAX_DESMARCADAS + " veces. No se puede devolver de nuevo.";
    }else{
        check.title = "Devolver a pendientes (te quedan " + restantes + " de " + MAX_DESMARCADAS + ")";
    }

    check.addEventListener("change", () => alternarHecha(tarea.id, check.checked));

    const nombre = document.createElement("span");
    nombre.className = "item_nombre";
    nombre.textContent = nombreVisible(tarea);
    nombre.title = tarea.descripcion ? tarea.descripcion : "Pulsá para editar";
    nombre.addEventListener("click", () => abrirEdicion(tarea.id));

    const circulo = document.createElement("span");
    circulo.className = "circulo_urgencia";
    circulo.style.backgroundColor = COLORES_URGENCIA[tarea.urgencia] || COLORES_URGENCIA[2];
    circulo.title = "Urgencia";

    const simbolo = document.createElement("span");
    simbolo.className = "simbolo_categoria";
    simbolo.textContent = categoriaVisible(tarea);
    simbolo.title = "Categoría";

    if(bloqueada) li.classList.add("item_bloqueado");

    li.append(check, nombre, circulo, simbolo);

    if(esRealizado){
        const tipo = tipoDeValor(tarea.valor);
        const corazon = document.createElement("button");
        corazon.type = "button";
        corazon.className = "boton_corazon" + (tipo ? " " + tipo : "");
        corazon.dataset.valor = tarea.valor;
        corazon.textContent = "♥+" + tarea.valor;
        corazon.addEventListener("click", (e) => {
            e.stopPropagation();
            sacarGloboDescanso(li);
            if(enDescanso()){ avisarDescanso(li); return; }
            mostrarConfirmCorazon(li, tarea);
        });

        corazon.addEventListener("mouseenter", () => { if(enDescanso()) globoDescanso(corazon, li); });
        corazon.addEventListener("mouseleave", () => sacarGloboDescanso(li));
        li.appendChild(corazon);
        pintarCorazon(corazon);
    }

    return li;
}

// pone el corazón gris mientras dura el descanso
function pintarCorazon(corazon){
    const valor = corazon.dataset.valor;
    if(enDescanso()){
        corazon.classList.add("descansando");
        corazon.textContent = "♥ " + formatearTiempo(restanteDescanso());
        corazon.title = "Tu mascota está llena y no quiere más comida por ahora. " +
                        "Podés volver a alimentarla en " + formatearTiempo(restanteDescanso()) + ".";
    }else{
        corazon.classList.remove("descansando");
        corazon.textContent = "♥+" + valor;
        corazon.title = (Number(valor) === VALOR_ORO)    ? "¡Corazón dorado! Vale " + VALOR_ORO + " de vida"
                      : (Number(valor) === VALOR_BRONCE) ? "¡Corazón de bronce! Vale " + VALOR_BRONCE + " de vida"
                      : "Alimentar a tu mascota";
    }
}

function actualizarCorazones(){
    document.querySelectorAll("#ul_realizados .boton_corazon").forEach(pintarCorazon);
}

function textoDescanso(){
    return "Tu mascota está llena. Comió " + ALIMENTOS_SEGUIDOS +
           " tareas seguidas y necesita hacer la digestión: si siguiera comiendo " +
           "sin parar, subiría de nivel infinitamente. Vuelve a tener hambre en " +
           formatearTiempo(restanteDescanso()) + ".";
}

function avisarDescanso(li){
    cerrarConfirms();
    const caja = document.createElement("div");
    caja.className = "confirm_corazon";
    caja.innerHTML =
        '<p><strong>Está llena.</strong> ' + textoDescanso().replace("Tu mascota está llena. ", "") + '</p>' +
        '<div class="fila_botones"><button type="button" class="confirm_no">Entendido</button></div>';
    caja.querySelector(".confirm_no").addEventListener("click", (e) => { e.stopPropagation(); cerrarConfirms(); });
    li.appendChild(caja);
}

/* Globo que aparece al pasar el mouse por un corazón en descanso. */
function globoDescanso(corazon, li){
    if(li.querySelector(".globo_descanso")) return;

    const globo = document.createElement("div");
    globo.className = "globo_descanso";
    globo.textContent = textoDescanso();
    li.appendChild(globo);
}

function sacarGloboDescanso(li){
    const g = li.querySelector(".globo_descanso");
    if(g) g.remove();
}

/* Para esperas de días: 2d 06h, 06h 13m o 13:45 */
function formatoLargo(ms){
    const total = Math.max(0, Math.floor(ms / 1000));
    const dias  = Math.floor(total / 86400);
    const horas = Math.floor((total % 86400) / 3600);
    const min   = Math.floor((total % 3600) / 60);
    const seg   = total % 60;
    const dos   = (n) => String(n).padStart(2, "0");

    if(dias  > 0) return dias + "d " + dos(horas) + ":" + dos(min) + ":" + dos(seg);
    if(horas > 0) return dos(horas) + ":" + dos(min) + ":" + dos(seg);
    return dos(min) + ":" + dos(seg);
}

function formatearTiempo(ms){
    const total = Math.max(0, Math.ceil(ms / 1000));
    const min = Math.floor(total / 60);
    const seg = total % 60;
    return String(min).padStart(2, "0") + ":" + String(seg).padStart(2, "0");
}

function alternarHecha(id, hecha){
    const tarea = estado.tareas.find(t => t.id === id);
    if(!tarea) return;

    if(!hecha){
        const usadas = tarea.desmarcadas || 0;
        if(usadas >= MAX_DESMARCADAS){
            renderizarListas();
            return;
        }
        tarea.desmarcadas = usadas + 1;
    }

    tarea.hecha = hecha;

    if(hecha){
        tarea.valor = valorDeVidaAleatorio();
        tarea.completada = Date.now();
    }else{
        tarea.valor = null;
        tarea.completada = null;
    }

    guardarEstado();
    renderizarListas();
}

/* ---------- confirm emergente del corazón ---------- */

function cerrarConfirms(){
    document.querySelectorAll(".confirm_corazon").forEach(c => c.remove());
}

function mostrarConfirmCorazon(li, tarea){
    const yaAbierto = li.querySelector(".confirm_corazon");
    cerrarConfirms();
    if(yaAbierto) return;

    const tipo = tipoDeValor(tarea.valor);

    const caja = document.createElement("div");
    caja.className = "confirm_corazon" + (tipo ? " " + tipo : "");
    caja.innerHTML =
        (tipo ? '<p class="aviso_especial ' + tipo + '">' +
                (tipo === "oro" ? "¡Corazón dorado!" : "¡Corazón de bronce!") + '</p>' : '') +
        '<p>Una vez que alimentes a tu animal espacial con esta tarea, la tarea se borra. ¿Seguimos?</p>' +
        '<div class="fila_botones">' +
            '<button type="button" class="confirm_no">Cancelar</button>' +
            '<button type="button" class="confirm_si' + (tipo ? ' ' + tipo : '') + '">Alimentar ♥+' + tarea.valor + '</button>' +
        '</div>';

    caja.querySelector(".confirm_no").addEventListener("click", (e) => {
        e.stopPropagation();
        cerrarConfirms();
    });

    caja.querySelector(".confirm_si").addEventListener("click", (e) => {
        e.stopPropagation();
        cerrarConfirms();

        alimentar(tarea.valor);
        estado.tareas = estado.tareas.filter(t => t.id !== tarea.id);

        // anti-trampa: tras N alimentaciones seguidas, los corazones descansan
        estado.alimentosSeguidos = (estado.alimentosSeguidos || 0) + 1;
        if(estado.alimentosSeguidos >= ALIMENTOS_SEGUIDOS){
            estado.alimentosSeguidos = 0;
            estado.descansoHasta = Date.now() + DESCANSO_MS;
        }

        guardarEstado();
        renderizarListas();
    });

    li.appendChild(caja);
}

document.addEventListener("click", function(e){
    if(!e.target.closest(".confirm_corazon") && !e.target.closest(".boton_corazon")){
        cerrarConfirms();
    }
});

/* ---------------------------------------------------------
   7. DIALOG AGREGAR / EDITAR ITEM
   --------------------------------------------------------- */

const dialogItem       = document.getElementById("agregar_item");
const formItem         = document.getElementById("form_item");
const inputNombre      = document.getElementById("primera_barra");
const inputDescripcion = document.getElementById("segunda_barra");
const selectUrgencia   = document.getElementById("select_urgencia");
const selectCategoria  = document.getElementById("select_categoria");
const tituloFormItem   = document.getElementById("titulo_form_item");
const botonBorrarItem  = document.getElementById("boton_borrar_item");

document.getElementById("boton").addEventListener("click", function(){
    idEnEdicion = null;
    tituloFormItem.textContent = "NUEVA TAREA";
    formItem.reset();
    selectUrgencia.value  = "2";
    selectCategoria.value = "⭐";
    botonBorrarItem.classList.remove("visible");
    dialogItem.showModal();
    inputNombre.focus();
});

function abrirEdicion(id){
    const tarea = estado.tareas.find(t => t.id === id);
    if(!tarea) return;

    idEnEdicion = id;
    tituloFormItem.textContent = "EDITAR TAREA";
    inputNombre.value      = tarea.nombre;
    inputDescripcion.value = tarea.descripcion || "";
    selectUrgencia.value   = String(tarea.urgencia);
    selectCategoria.value  = tarea.categoria || "⭐";
    botonBorrarItem.classList.add("visible");
    dialogItem.showModal();
    inputNombre.focus();
}

formItem.addEventListener("submit", function(evento){
    evento.preventDefault();

    const nombre = inputNombre.value.trim();
    if(nombre === ""){ inputNombre.focus(); return; }

    if(idEnEdicion){
        const tarea = estado.tareas.find(t => t.id === idEnEdicion);
        if(tarea){
            tarea.nombre      = nombre;
            tarea.descripcion = inputDescripcion.value.trim();
            tarea.urgencia    = parseInt(selectUrgencia.value, 10);
            tarea.categoria   = selectCategoria.value;
        }
    }else{
        estado.tareas.push({
            id:          nuevoId(),
            nombre:      nombre,
            descripcion: inputDescripcion.value.trim(),
            urgencia:    parseInt(selectUrgencia.value, 10),
            categoria:   selectCategoria.value,
            hecha:       false,
            valor:       null,
            desmarcadas: 0,
            creada:      Date.now(),
            completada:  null
        });
    }

    guardarEstado();
    renderizarListas();
    dialogItem.close();
});

botonBorrarItem.addEventListener("click", function(){
    if(!idEnEdicion) return;
    estado.tareas = estado.tareas.filter(t => t.id !== idEnEdicion);
    guardarEstado();
    renderizarListas();
    dialogItem.close();
});

/* ---------------------------------------------------------
   8. AMENAZA ESPACIAL
   --------------------------------------------------------- */

const cajaAmenaza    = document.getElementById("contador_amenaza");
const amenazaTitulo  = document.getElementById("amenaza_titulo");
const amenazaTiempo  = document.getElementById("amenaza_tiempo");
const amenazaNivel   = document.getElementById("amenaza_nivel");

let rotacionEfecto = 0;

function nuevaAmenaza(){
    return {
        llegaEn: Date.now() + esperaDeAmenaza(),
        nivelNecesario: (estado ? estado.nivel : 0) + 1,
        atacandoHasta: 0,
        efecto: null,
        detenidoHasta: 0
    };
}

function actualizarAmenaza(){
    const a = estado.amenaza;
    const ahora = Date.now();

    // 0. el panel de control la dejó en pausa
    if(a.pausada){
        quitarEfectoAtaque();
        cajaAmenaza.className = "esperando";
        amenazaTitulo.textContent = "AMENAZA ESPACIAL";
        amenazaTiempo.textContent = "--";
        amenazaNivel.textContent  = "EN PAUSA";
        return;
    }

    // 1. ataque en curso
    if(a.atacandoHasta > ahora){

        // si tu mascota alcanzó el nivel mientras te atacaban, te protege
        // y el ataque se corta en el acto
        if(estado.nivel >= a.nivelNecesario){
            quitarEfectoAtaque();
            a.atacandoHasta = 0;
            a.detenidoHasta = ahora + AMENAZA.mensajeDetenido;
            guardarEstado();
            actualizarAmenaza();
            return;
        }

        cajaAmenaza.className = "atacando";
        amenazaTitulo.textContent = "ATAQUE ESPACIAL EN PROCESO";
        amenazaTiempo.textContent = formatearTiempo(a.atacandoHasta - ahora);
        const ef = EFECTOS_ATAQUE.find(e => e.id === a.efecto);
        amenazaNivel.textContent = ef ? ef.nombre.toUpperCase() : "";
        aplicarEfectoAtaque(a.efecto);
        return;
    }

    // 2. el ataque acaba de terminar
    if(a.atacandoHasta && a.atacandoHasta <= ahora){
        quitarEfectoAtaque();
        Object.assign(a, nuevaAmenaza());
        guardarEstado();
    }

    // 3. cartel de "ataque detenido"
    if(a.detenidoHasta > ahora){
        quitarEfectoAtaque();
        cajaAmenaza.className = "detenido";
        amenazaTitulo.textContent = "ATAQUE ESPACIAL DETENIDO";
        amenazaTiempo.textContent = "✔";
        amenazaNivel.textContent = "TU MASCOTA LO FRENÓ";
        return;
    }

    if(a.detenidoHasta && a.detenidoHasta <= ahora){
        a.detenidoHasta = 0;
        Object.assign(a, nuevaAmenaza());
        guardarEstado();
    }

    // 4. la amenaza llegó: se resuelve y se repinta en el acto
    if(ahora >= a.llegaEn){
        if(estado.nivel >= a.nivelNecesario){
            a.detenidoHasta = ahora + AMENAZA.mensajeDetenido;
        }else{
            a.efecto = EFECTOS_ATAQUE[Math.floor(Math.random() * EFECTOS_ATAQUE.length)].id;
            a.atacandoHasta = ahora + AMENAZA.duracionAtaque;
            aplicarEfectoAtaque(a.efecto);
        }
        guardarEstado();
        actualizarAmenaza();
        return;
    }

    // 5. cuenta regresiva: acá no hay ataque, así que la página tiene que
    //    verse normal sí o sí
    quitarEfectoAtaque();

    const falta = a.llegaEn - ahora;
    cajaAmenaza.className = (falta <= AMENAZA.avisoCerca) ? "cerca" : "esperando";
    amenazaTitulo.textContent = "AMENAZA ESPACIAL";
    amenazaTiempo.textContent = formatoLargo(falta);
    amenazaNivel.textContent  = "NIVEL NECESARIO " + a.nivelNecesario;
}

/* ---------- efectos del ataque ---------- */

let efectoActivo = null;
const letrasRevueltas = new Map();   // id de tarea -> nombre desordenado

function aplicarEfectoAtaque(efecto){
    if(efectoActivo === efecto) return;
    quitarEfectoAtaque();
    efectoActivo = efecto;

    if(efecto === "mono")   document.body.classList.add("ataque_mono");
    if(efecto === "letras") document.body.classList.add("ataque_letras");

    renderizarListas();
}

function quitarEfectoAtaque(){
    /* se mira también el body y no solo la variable: si quedó una marca
       de una sesión anterior, hay que sacarla igual */
    const marcado = document.body.classList.contains("ataque_mono") ||
                    document.body.classList.contains("ataque_letras");
    if(!efectoActivo && !marcado) return;

    efectoActivo = null;
    letrasRevueltas.clear();
    document.body.classList.remove("ataque_mono", "ataque_letras");
    if(estado) renderizarListas();
}

function nombreVisible(tarea){
    if(efectoActivo !== "letras") return tarea.nombre;

    if(!letrasRevueltas.has(tarea.id)){
        letrasRevueltas.set(tarea.id, desordenar(tarea.nombre));
    }
    return letrasRevueltas.get(tarea.id);
}

// desordena las letras de cada palabra, dejando espacios y signos en su lugar
function desordenar(texto){
    return texto.split(" ").map(palabra => {
        const letras = palabra.split("");
        for(let i = letras.length - 1; i > 0; i--){
            const j = Math.floor(Math.random() * (i + 1));
            [letras[i], letras[j]] = [letras[j], letras[i]];
        }
        return letras.join("");
    }).join(" ");
}

function categoriaVisible(tarea){
    if(efectoActivo === "alien") return "👽";
    return tarea.categoria || "⭐";
}

/* Los botones de prueba de la amenaza ya no existen: las amenazas se
   manejan desde el panel de control de admin2, usuario por usuario. */

/* ---------------------------------------------------------
   9. TUTORIAL EN VENTANA (botón ?)
   --------------------------------------------------------- */

const dialogTutorial  = document.getElementById("tutorial_dialog");
const dialogImagen    = document.getElementById("dialog_imagen");
const dialogTexto     = document.getElementById("dialog_texto");
const dialogPaso      = document.getElementById("dialog_paso");
const dialogAnterior  = document.getElementById("dialog_anterior");
const dialogSiguiente = document.getElementById("dialog_siguiente");

let indiceDialog = 0;
let dialogEnExtra = false;

function pasoDialogActual(){
    return dialogEnExtra
        ? PASOS_TUTORIAL.find(p => p.id === "extra")
        : PASOS_PRINCIPALES[indiceDialog];
}

function pintarDialogTutorial(){
    const paso = pasoDialogActual();

    dialogImagen.src = paso.imagen;
    dialogImagen.alt = "";
    dialogTexto.innerHTML = textoDelPaso(paso);

    dialogPaso.textContent = dialogEnExtra
        ? "información extra"
        : (indiceDialog + 1) + " / " + PASOS_PRINCIPALES.length;

    dialogAnterior.hidden = (!dialogEnExtra && indiceDialog === 0);

    const botonExtra = dialogTexto.querySelector("[data-extra]");
    if(botonExtra){
        botonExtra.addEventListener("click", () => {
            dialogEnExtra = true;
            pintarDialogTutorial();
        });
    }
}

function abrirTutorialDialog(){
    indiceDialog = 0;
    dialogEnExtra = false;
    pintarDialogTutorial();
    if(!dialogTutorial.open) dialogTutorial.showModal();
}

dialogSiguiente.addEventListener("click", function(){
    if(dialogEnExtra){
        dialogEnExtra = false;
        indiceDialog = PASOS_PRINCIPALES.findIndex(p => p.id === "5");
        pintarDialogTutorial();
        return;
    }
    if(indiceDialog < PASOS_PRINCIPALES.length - 1){
        indiceDialog++;
        pintarDialogTutorial();
    }else{
        dialogTutorial.close();
    }
});

dialogAnterior.addEventListener("click", function(){
    if(dialogEnExtra){
        dialogEnExtra = false;
        indiceDialog = PASOS_PRINCIPALES.findIndex(p => p.id === "4");
        pintarDialogTutorial();
        return;
    }
    if(indiceDialog > 0){
        indiceDialog--;
        pintarDialogTutorial();
    }
});

document.getElementById("dialog_saltar").addEventListener("click", () => dialogTutorial.close());

// el botón ? repite el tutorial guiado sobre la propia página.
// Poné TUTORIAL_CON_VENTANAS en true si alguna vez querés la versión en ventana.
document.getElementById("botontut").addEventListener("click", function(){
    if(TUTORIAL_CON_VENTANAS) abrirTutorialDialog();
    else                      iniciarTutorialVisual();
});

document.getElementById("botontut2").addEventListener("click", function(){
    document.getElementById("tutorial_agenda").showModal();
});

document.getElementById("botoninfo").addEventListener("click", function(){
    document.getElementById("dialog_info").showModal();
});

document.querySelectorAll(".boton_cerrar").forEach(boton => {
    boton.addEventListener("click", function(){
        const d = document.getElementById(boton.dataset.cerrar);
        if(d) d.close();
    });
});

/* ---------------------------------------------------------
   10. TUTORIAL VISUAL (primer ingreso)
   --------------------------------------------------------- */

const capaVisual      = document.getElementById("tutorial_visual");
const foco            = document.getElementById("foco");
const globo           = document.getElementById("globo_visual");
const visualTexto     = document.getElementById("visual_texto");
const visualPaso      = document.getElementById("visual_paso");
const visualAnterior  = document.getElementById("visual_anterior");
const visualSiguiente = document.getElementById("visual_siguiente");

let indiceVisual = 0;
let visualEnExtra = false;
let tutorialVisualActivo = false;
let acomodarAlPaso = false;       // solo al cambiar de paso se mueve la página

const ANCHO_CELULAR = 720;        // el mismo corte que usa el CSS

function iniciarTutorialVisual(){
    /* se anota en cuanto se abre, no al terminarlo: si la persona lo
       saltea, tampoco le vuelve a aparecer sola */
    const cuenta = buscarCuenta(usuarioActual);
    if(cuenta && (!cuenta.tutorialVisto || cuenta.tutorialPendiente)){
        cuenta.tutorialVisto = true;
        delete cuenta.tutorialPendiente;
        guardarCuentas();
    }

    indiceVisual = 0;
    visualEnExtra = false;
    tutorialVisualActivo = true;
    capaVisual.hidden = false;

    /* En celular hace falta poder bajar más de lo normal: así cualquier
       sector puede subir hasta el hueco libre de arriba, en vez de quedar
       atrapado al pie de la página. El aire extra lo pone el CSS con esta
       clase, y se saca al cerrar. */
    document.body.classList.add("tutorial_abierto");

    pintarPasoVisual();
    window.addEventListener("resize", reubicarVisual);
    window.addEventListener("scroll", reubicarVisual, true);
}

function pasoVisualActual(){
    return visualEnExtra
        ? PASOS_TUTORIAL.find(p => p.id === "extra")
        : PASOS_PRINCIPALES[indiceVisual];
}

function pintarPasoVisual(){
    const paso = pasoVisualActual();

    // la diapositiva extra se explica con la ventana de agregar abierta
    if(paso.id === "extra") abrirVentanaDemo();
    else                    cerrarVentanaDemo();

    // en celular las dos listas son pestañas: se abre la que toca explicar
    if(paso.id === "4" || paso.id === "extra") mostrarPestana("pendientes");
    if(paso.id === "5")                        mostrarPestana("realizados");

    visualTexto.innerHTML = textoDelPaso(paso);
    visualPaso.textContent = visualEnExtra
        ? "información extra"
        : (indiceVisual + 1) + " / " + PASOS_PRINCIPALES.length;

    visualAnterior.hidden = (!visualEnExtra && indiceVisual === 0);

    const botonExtra = visualTexto.querySelector("[data-extra]");
    if(botonExtra){
        botonExtra.addEventListener("click", () => {
            visualEnExtra = true;
            pintarPasoVisual();
        });
    }

    // avisar con un degradé si el texto no entra entero (pasa en celular)
    const bloque = globo.querySelector(".textotutorial");
    if(bloque) bloque.classList.toggle("hay_mas", bloque.scrollHeight > bloque.clientHeight + 4);

    foco.classList.remove("entrando");
    void foco.offsetWidth;
    foco.classList.add("entrando");

    acomodarAlPaso = true;
    reubicarVisual();
}

function reubicarVisual(){
    if(!tutorialVisualActivo) return;

    // mover la página se hace una sola vez por paso, no en cada scroll
    const acomodar = acomodarAlPaso;
    acomodarAlPaso = false;

    const paso = pasoVisualActual();
    let objetivo = paso.selector ? document.querySelector(paso.selector) : null;

    // si el elemento está escondido (otra pestaña, ventana sin abrir) se trata
    // como paso sin foco, para no dibujar un recuadro de medida cero
    if(objetivo){
        const medida = objetivo.getBoundingClientRect();
        if(medida.width < 2 || medida.height < 2) objetivo = null;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const celular = vw <= ANCHO_CELULAR;

    // en celular el cartel es una franja fija; lo ubica el CSS, no esta función
    globo.classList.toggle("movil", celular);

    if(!objetivo){
        // paso sin elemento resaltado: globo grande al centro, pantalla oscurecida
        foco.classList.add("sin_foco");
        globo.classList.add("centrado");
        foco.style.top = (vh / 2) + "px";
        foco.style.left = (vw / 2) + "px";
        foco.style.width = "0px";
        foco.style.height = "0px";

        if(celular){
            globo.style.top  = "";
            globo.style.left = "";
            return;
        }

        const g = globo.getBoundingClientRect();
        globo.style.top  = Math.max(12, (vh - g.height) / 2) + "px";
        globo.style.left = Math.max(12, (vw - g.width) / 2) + "px";
        return;
    }

    foco.classList.remove("sin_foco");
    globo.classList.remove("centrado");

    /* ---------- celular ----------
       El cartel ocupa una franja fija abajo, así que la pantalla se
       acomoda sola para que lo que se explica quede entero arriba, en
       el espacio libre. Nadie tiene que scrollear a mano ni el recuadro
       verde termina debajo del cartel. */
    if(celular){
        globo.style.top  = "";
        globo.style.left = "";

        const franja = Math.max(130, vh - (globo.offsetHeight || 250) - 28);

        if(acomodar && typeof objetivo.scrollIntoView === "function"){
            objetivo.scrollIntoView({ block: "center", behavior: "auto" });

            const previa  = objetivo.getBoundingClientRect();
            const destino = (previa.height + 24 <= franja)
                ? (franja - previa.height) / 2     // centrado en el hueco
                : 12;                              // más alto que el hueco: pegado arriba
            const correccion = previa.top - destino;
            if(Math.abs(correccion) > 3) window.scrollBy(0, correccion);
        }

        const caja   = objetivo.getBoundingClientRect();
        const margen = 8;
        const arriba = Math.max(4, caja.top - margen);

        foco.style.top    = arriba + "px";
        foco.style.left   = Math.max(4, caja.left - margen) + "px";
        foco.style.width  = Math.min(vw - 8, caja.width + margen * 2) + "px";
        foco.style.height = Math.max(44, Math.min(caja.height + margen * 2, franja - arriba)) + "px";
        return;
    }

    const r = objetivo.getBoundingClientRect();
    const margen = 10;
    const top    = Math.max(4, r.top - margen);
    const left   = Math.max(4, r.left - margen);
    const ancho  = Math.min(vw - left - 4, r.width + margen * 2);
    const alto   = Math.min(vh - top - 4, r.height + margen * 2);

    foco.style.top    = top + "px";
    foco.style.left   = left + "px";
    foco.style.width  = ancho + "px";
    foco.style.height = alto + "px";

    // el globo se ubica en el lado con más espacio libre
    const g = globo.getBoundingClientRect();
    const gw = g.width || 430;
    const gh = g.height || 300;
    const hueco = 16;

    let gLeft, gTop;

    const espacioDerecha = vw - (left + ancho);
    const espacioIzquierda = left;
    const espacioAbajo = vh - (top + alto);
    const espacioArriba = top;

    if(espacioDerecha >= gw + hueco){
        gLeft = left + ancho + hueco;
        gTop  = top + alto / 2 - gh / 2;
    }else if(espacioIzquierda >= gw + hueco){
        gLeft = left - gw - hueco;
        gTop  = top + alto / 2 - gh / 2;
    }else if(espacioAbajo >= gh + hueco){
        gLeft = left + ancho / 2 - gw / 2;
        gTop  = top + alto + hueco;
    }else if(espacioArriba >= gh + hueco){
        gLeft = left + ancho / 2 - gw / 2;
        gTop  = top - gh - hueco;
    }else if(paso.id === "extra"){
        // en ventanas angostas la muestra queda arriba, así que el cartel
        // se va al pie para taparla lo menos posible
        gLeft = (vw - gw) / 2;
        gTop  = vh - gh - 12;
    }else{
        gLeft = (vw - gw) / 2;
        gTop  = (vh - gh) / 2;
    }

    globo.style.left = Math.round(Math.min(Math.max(12, gLeft), Math.max(12, vw - gw - 12))) + "px";
    globo.style.top  = Math.round(Math.min(Math.max(12, gTop),  Math.max(12, vh - gh - 12))) + "px";
}

visualSiguiente.addEventListener("click", function(){
    if(visualEnExtra){
        visualEnExtra = false;
        indiceVisual = PASOS_PRINCIPALES.findIndex(p => p.id === "5");
        pintarPasoVisual();
        return;
    }
    if(indiceVisual < PASOS_PRINCIPALES.length - 1){
        indiceVisual++;
        pintarPasoVisual();
    }else{
        cerrarTutorialVisual(true);
    }
});

visualAnterior.addEventListener("click", function(){
    if(visualEnExtra){
        visualEnExtra = false;
        indiceVisual = PASOS_PRINCIPALES.findIndex(p => p.id === "4");
        pintarPasoVisual();
        return;
    }
    if(indiceVisual > 0){
        indiceVisual--;
        pintarPasoVisual();
    }
});

document.getElementById("visual_saltar").addEventListener("click", () => cerrarTutorialVisual(true));

function cerrarTutorialVisual(terminado){
    tutorialVisualActivo = false;
    capaVisual.hidden = true;
    cerrarVentanaDemo();
    window.removeEventListener("resize", reubicarVisual);
    window.removeEventListener("scroll", reubicarVisual, true);

    // se saca el aire extra y la página vuelve arriba, donde está la mascota
    document.body.classList.remove("tutorial_abierto");
    globo.classList.remove("movil");
    if(window.innerWidth <= ANCHO_CELULAR) window.scrollTo(0, 0);

    if(!terminado || !estado) return;

    estado.tutorialVisto = true;
    guardarEstado();

    if(mascotaPendienteDeRevelar && !estado.mascotaRevelada){
        mascotaPendienteDeRevelar = false;
        revelarMascota();
    }
}

/* ---------------------------------------------------------
   11. VENTANA DE MASCOTA ASIGNADA (una sola vez)
   --------------------------------------------------------- */

const dialogRevelada = document.getElementById("mascota_revelada");

function revelarMascota(){
    if(!estado || estado.mascotaRevelada) return;   // puede haber cerrado sesión mientras tanto

    const m = mascotaDelUsuario();
    document.getElementById("gif_revelada").src = m.gif;
    document.getElementById("gif_revelada").alt = m.nombre;
    document.getElementById("nombre_revelada").textContent = m.nombre;
    document.getElementById("texto_revelada").textContent =
        m.descripcion + ". Cuidala, alimentala con tus tareas realizadas y llevala al nivel más alto posible.";

    estado.mascotaRevelada = true;
    guardarEstado();
    dialogRevelada.showModal();
}

document.getElementById("boton_revelada").addEventListener("click", function(){
    dialogRevelada.close();
});

/* ---------------------------------------------------------
   11 bis. MI CUENTA: nombre, contraseña y foto de perfil

   La foto se achica a 180 x 180 antes de guardarla, así pesa
   pocos kilobytes. Se guarda aparte de las tareas, en /fotos,
   para que el aparato físico no tenga que descargarla.
   --------------------------------------------------------- */

const CLAVE_FOTO   = "orbitask_foto_";
const dialogCuenta = document.getElementById("dialog_cuenta");
const formCuenta   = document.getElementById("form_cuenta");
const cuentaError  = document.getElementById("cuenta_error");
const cuentaOk     = document.getElementById("cuenta_ok");
const campoNombre  = document.getElementById("cuenta_nombre");
const campoClave   = document.getElementById("cuenta_clave");
const campoClave2  = document.getElementById("cuenta_clave2");

let fotoActual = "";

function avisarCuenta(texto){
    cuentaOk.classList.remove("visible");
    cuentaError.textContent = texto;
    cuentaError.classList.add("visible");
}

function avisarCuentaOk(texto){
    cuentaError.classList.remove("visible");
    cuentaOk.textContent = texto;
    cuentaOk.classList.add("visible");
}

/* ---------- la foto ---------- */

function pintarFoto(){
    const chica   = document.getElementById("foto_perfil_chica");
    const persona = document.getElementById("icono_persona");
    const grande  = document.getElementById("foto_grande");
    const sin     = document.getElementById("sin_foto");
    const hay     = !!fotoActual;

    if(hay) chica.src = fotoActual; else chica.removeAttribute("src");
    chica.style.display   = hay ? "block" : "none";
    persona.style.display = hay ? "none"  : "block";

    if(hay) grande.src = fotoActual; else grande.removeAttribute("src");
    grande.style.display = hay ? "block" : "none";
    sin.style.display    = hay ? "none"  : "flex";
}

function guardarFotoLocal(usuario){
    try{
        if(fotoActual) localStorage.setItem(CLAVE_FOTO + usuario, fotoActual);
        else           localStorage.removeItem(CLAVE_FOTO + usuario);
    }catch(e){
        console.warn("No se pudo guardar la foto en este navegador:", e);
    }
}

function subirFoto(usuario, foto){
    fetch(FIREBASE_URL + "/fotos/" + usuario + ".json", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(foto)
    }).catch(e => console.warn("[nube] no se pudo subir la foto:", e));
}

function borrarFotoNube(usuario){
    fetch(FIREBASE_URL + "/fotos/" + usuario + ".json", { method: "DELETE" })
        .catch(e => console.warn("[nube] no se pudo borrar la foto:", e));
}

function cargarFoto(usuario){
    fotoActual = "";

    try{ fotoActual = localStorage.getItem(CLAVE_FOTO + usuario) || ""; }catch(e){}
    pintarFoto();

    const cuenta = buscarCuenta(usuario);
    if(fotoActual || !cuenta || !cuenta.tieneFoto) return;

    // la tiene en la nube pero no en esta compu: se baja
    fetch(FIREBASE_URL + "/fotos/" + usuario + ".json?cacheBust=" + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(dato => {
            if(typeof dato === "string" && dato.length > 20){
                fotoActual = dato;
                guardarFotoLocal(usuario);
                pintarFoto();
            }
        })
        .catch(() => {});
}

document.getElementById("boton_elegir_foto").addEventListener("click", function(){
    document.getElementById("archivo_foto").click();
});

document.getElementById("archivo_foto").addEventListener("change", function(){
    const archivo = this.files && this.files[0];
    this.value = "";
    if(!archivo) return;

    if(archivo.type.indexOf("image/") !== 0){
        avisarCuenta("Ese archivo no es una imagen.");
        return;
    }

    const lector = new FileReader();

    lector.onload = function(){
        const imagen = new Image();

        imagen.onload = function(){
            const LADO = 180;
            const lienzo = document.createElement("canvas");
            lienzo.width = LADO;
            lienzo.height = LADO;

            // se recorta cuadrado desde el centro
            const lado = Math.min(imagen.width, imagen.height);
            const ctx = lienzo.getContext("2d");
            ctx.drawImage(imagen,
                          (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado,
                          0, 0, LADO, LADO);

            fotoActual = lienzo.toDataURL("image/jpeg", 0.82);

            guardarFotoLocal(usuarioActual);
            subirFoto(usuarioActual, fotoActual);

            const cuenta = buscarCuenta(usuarioActual);
            if(cuenta){ cuenta.tieneFoto = true; guardarCuentas(); }

            pintarFoto();
            avisarCuentaOk("Foto actualizada.");
        };

        imagen.onerror = function(){ avisarCuenta("No se pudo leer esa imagen."); };
        imagen.src = lector.result;
    };

    lector.onerror = function(){ avisarCuenta("No se pudo abrir ese archivo."); };
    lector.readAsDataURL(archivo);
});

document.getElementById("boton_quitar_foto").addEventListener("click", function(){
    if(!fotoActual){ avisarCuenta("Todavía no tenés foto."); return; }

    fotoActual = "";
    guardarFotoLocal(usuarioActual);
    borrarFotoNube(usuarioActual);

    const cuenta = buscarCuenta(usuarioActual);
    if(cuenta){ cuenta.tieneFoto = false; guardarCuentas(); }

    pintarFoto();
    avisarCuentaOk("Foto quitada.");
});

/* ---------- abrir la ventana ---------- */

function abrirMiCuenta(){
    const cuenta = buscarCuenta(usuarioActual);
    if(!cuenta) return;

    campoNombre.value  = cuenta.nombre || cuenta.usuario;
    campoClave.value   = "";
    campoClave2.value  = "";

    document.getElementById("cuenta_mail").textContent =
        "Mail: " + (cuenta.mail ? cuenta.mail : "—");

    campoNombre.disabled = !!cuenta.fija;
    campoClave.disabled  = !!cuenta.fija;
    campoClave2.disabled = !!cuenta.fija;

    cuentaError.classList.remove("visible");
    cuentaOk.classList.remove("visible");

    if(cuenta.fija)
        avisarCuentaOk("admin1 y admin2 son cuentas fijas: no se les puede cambiar el nombre ni la contraseña. La foto sí.");

    // la zona de borrado arranca cerrada cada vez, y las cuentas fijas no la ven
    zonaBorrar.hidden              = !!cuenta.fija;
    confirmarBorrado.hidden        = true;
    campoConfirmarBorrado.value    = "";
    borradoError.classList.remove("visible");

    pintarFoto();
    dialogCuenta.showModal();
}

/* ---------- borrar la cuenta y todos sus datos ----------

   Dos pasos a propósito: primero se abre el aviso, y después hay que
   escribir el nombre de usuario. admin1 y admin2 no se pueden borrar. */

const zonaBorrar            = document.getElementById("zona_borrar");
const confirmarBorrado      = document.getElementById("confirmar_borrado");
const campoConfirmarBorrado = document.getElementById("campo_confirmar_borrado");
const borradoError          = document.getElementById("borrado_error");

document.getElementById("boton_borrar_cuenta").addEventListener("click", function(){
    confirmarBorrado.hidden = false;
    borradoError.classList.remove("visible");
    campoConfirmarBorrado.value = "";
    confirmarBorrado.scrollIntoView({ block: "nearest" });
    campoConfirmarBorrado.focus();
});

document.getElementById("boton_cancelar_borrado").addEventListener("click", function(){
    confirmarBorrado.hidden = true;
    borradoError.classList.remove("visible");
});

document.getElementById("boton_borrado_final").addEventListener("click", function(){
    const cuenta = buscarCuenta(usuarioActual);
    if(!cuenta) return;

    if(cuenta.fija){
        borradoError.textContent = "admin1 y admin2 no se pueden borrar.";
        borradoError.classList.add("visible");
        return;
    }

    if(normalizar(campoConfirmarBorrado.value) !== cuenta.usuario){
        borradoError.textContent = "Escribí tu nombre de usuario tal cual para confirmar.";
        borradoError.classList.add("visible");
        return;
    }

    const quien = cuenta.usuario;

    borrarDatosDeUsuario(quien);

    dialogCuenta.close();
    salirDespuesDeBorrar();
    avisarLogin("Se borró la cuenta " + quien + " y todos sus datos.");
});

/* deja la página como recién abierta, sin volver a guardar nada
   del usuario que se acaba de borrar */
function salirDespuesDeBorrar(){
    olvidarSesion();
    if(relojGeneral) clearInterval(relojGeneral);
    cerrarTutorialVisual(false);
    quitarEfectoAtaque();
    usuarioActual = null;
    estado        = null;
    fotoActual    = "";
    pintarFoto();
    app.hidden        = true;
    panelAdmin.hidden = true;
    mostrarLogin();
}

document.getElementById("boton_cuenta").addEventListener("click", abrirMiCuenta);

/* ---------- cambiar el nombre de usuario ---------- */

function renombrarCuenta(viejo, nuevo){
    const cuenta = cuentas[viejo];
    if(!cuenta) return;

    cuentas[nuevo] = Object.assign({}, cuenta, { usuario: nuevo });
    delete cuentas[viejo];

    try{
        const estadoViejo = localStorage.getItem(claveDe(viejo));
        if(estadoViejo) localStorage.setItem(claveDe(nuevo), estadoViejo);
        localStorage.removeItem(claveDe(viejo));

        const fotoVieja = localStorage.getItem(CLAVE_FOTO + viejo);
        if(fotoVieja){
            localStorage.setItem(CLAVE_FOTO + nuevo, fotoVieja);
            localStorage.removeItem(CLAVE_FOTO + viejo);
        }
    }catch(e){
        console.warn("No se pudo mover lo guardado:", e);
    }

    usuarioActual = nuevo;
    guardarCuentas();

    // el estado se sube al nombre nuevo y se borra el viejo de la nube
    if(estado){
        estado.rev = Date.now();
        guardarEstado();
    }

    fetch(FIREBASE_URL + "/usuarios/" + viejo + ".json", { method: "DELETE" })
        .catch(e => console.warn("[nube] no se pudo borrar el usuario viejo:", e));

    if(fotoActual){
        subirFoto(nuevo, fotoActual);
        borrarFotoNube(viejo);
    }
}

/* ---------- guardar los cambios ---------- */

formCuenta.addEventListener("submit", function(evento){
    evento.preventDefault();

    const cuenta = buscarCuenta(usuarioActual);
    if(!cuenta) return;

    if(cuenta.fija){
        avisarCuenta("Esta cuenta es fija: solo se le puede cambiar la foto.");
        return;
    }

    const nombreTal = campoNombre.value.trim();
    const nuevaLlave = normalizar(nombreTal);
    const clave  = campoClave.value;
    const clave2 = campoClave2.value;

    if(!RE_USUARIO.test(nuevaLlave)){
        avisarCuenta("El nombre va de 3 a 20 caracteres, con letras, números, punto, guion o guion bajo (sin espacios).");
        return;
    }

    if(nuevaLlave !== usuarioActual && buscarCuenta(nuevaLlave)){
        avisarCuenta("Ese nombre ya está tomado por otra cuenta.");
        return;
    }

    if(clave || clave2){
        if(clave.length < 6){
            avisarCuenta("La contraseña nueva tiene que tener al menos 6 caracteres.");
            return;
        }
        if(clave !== clave2){
            avisarCuenta("Las dos contraseñas nuevas no coinciden.");
            return;
        }
    }

    const cambioNombre = (nuevaLlave !== usuarioActual);

    cuenta.nombre = nombreTal;
    if(clave) cuenta.clave = clave;

    if(cambioNombre) renombrarCuenta(usuarioActual, nuevaLlave);
    else             guardarCuentas();

    campoClave.value  = "";
    campoClave2.value = "";

    avisarCuentaOk(cambioNombre
        ? "Listo. Desde ahora entrás con el nombre " + usuarioActual + "."
        : (clave ? "Listo, se guardaron el nombre y la contraseña nueva."
                 : "Listo, se guardó el nombre."));
});

/* ---------------------------------------------------------
   11 ter. MENSAJES A LOS CREADORES

   Cada usuario puede mandar un texto y, si quiere, una captura.
   Van a parar a /quejas en la base, y admin2 los lee desde su panel.
   --------------------------------------------------------- */

const dialogQueja  = document.getElementById("dialog_queja");
const formQueja    = document.getElementById("form_queja");
const quejaError   = document.getElementById("queja_error");
const quejaOk      = document.getElementById("queja_ok");
const campoQueja   = document.getElementById("queja_texto");
const tiraCapturas = document.getElementById("tira_capturas");
const contadorQueja= document.getElementById("contador_queja");

const MAX_TEXTO_APORTE  = 500;
const MAX_IMAGENES      = 5;

let imagenesAdjuntas = [];     // hasta cinco, ya achicadas

function pintarContadorQueja(){
    contadorQueja.textContent = campoQueja.value.length + " / " + MAX_TEXTO_APORTE;
}

campoQueja.addEventListener("input", pintarContadorQueja);

function pintarCapturas(){
    tiraCapturas.innerHTML = "";

    imagenesAdjuntas.forEach(function(datos, pos){
        const caja = document.createElement("div");
        caja.className = "captura_chica";

        const img = document.createElement("img");
        img.src = datos;
        img.alt = "imagen " + (pos + 1);
        img.addEventListener("click", () => verFoto(datos));

        const quitar = document.createElement("button");
        quitar.type = "button";
        quitar.className = "quitar_captura";
        quitar.title = "Sacar esta imagen";
        quitar.textContent = "✕";
        quitar.addEventListener("click", function(){
            imagenesAdjuntas.splice(pos, 1);
            pintarCapturas();
        });

        caja.append(img, quitar);
        tiraCapturas.appendChild(caja);
    });

    const quedan = MAX_IMAGENES - imagenesAdjuntas.length;
    document.getElementById("nombre_captura").textContent =
        imagenesAdjuntas.length === 0 ? "Hasta " + MAX_IMAGENES + " imágenes"
      : quedan === 0                  ? "Llegaste a las " + MAX_IMAGENES
      : imagenesAdjuntas.length + " de " + MAX_IMAGENES;

    document.getElementById("boton_captura").disabled = (quedan === 0);
}

document.getElementById("boton_queja").addEventListener("click", function(){
    formQueja.reset();
    imagenesAdjuntas = [];
    pintarCapturas();
    pintarContadorQueja();
    quejaError.classList.remove("visible");
    quejaOk.classList.remove("visible");
    dialogQueja.showModal();
    cargarMisAportes();
});

document.getElementById("boton_captura").addEventListener("click", function(){
    document.getElementById("archivo_captura").click();
});

/* achica la imagen antes de guardarla: 900 px de ancho alcanza
   y así no se infla la base de datos */
function achicarImagen(archivo){
    return new Promise(function(listo, falla){
        const lector = new FileReader();

        lector.onload = function(){
            const imagen = new Image();

            imagen.onload = function(){
                const ANCHO = Math.min(900, imagen.width);
                const alto  = Math.round(imagen.height * (ANCHO / imagen.width));
                const lienzo = document.createElement("canvas");
                lienzo.width = ANCHO;
                lienzo.height = alto;
                lienzo.getContext("2d").drawImage(imagen, 0, 0, ANCHO, alto);
                listo(lienzo.toDataURL("image/jpeg", 0.7));
            };

            imagen.onerror = () => falla(new Error("no se pudo leer la imagen"));
            imagen.src = lector.result;
        };

        lector.onerror = () => falla(new Error("no se pudo abrir el archivo"));
        lector.readAsDataURL(archivo);
    });
}

document.getElementById("archivo_captura").addEventListener("change", function(){
    const elegidos = [...(this.files || [])];
    this.value = "";
    if(elegidos.length === 0) return;

    const lugar = MAX_IMAGENES - imagenesAdjuntas.length;
    const sobran = elegidos.length - lugar;
    const aprocesar = elegidos.slice(0, lugar);

    Promise.all(aprocesar.map(function(archivo){
        if(archivo.type.indexOf("image/") !== 0) return Promise.resolve(null);
        return achicarImagen(archivo).catch(() => null);
    })).then(function(resultados){
        const buenos = resultados.filter(Boolean);
        imagenesAdjuntas = imagenesAdjuntas.concat(buenos);
        pintarCapturas();

        const fallaron = aprocesar.length - buenos.length;
        if(sobran > 0 || fallaron > 0){
            quejaError.textContent =
                (sobran > 0 ? "Se pueden adjuntar " + MAX_IMAGENES + " imágenes como máximo. " : "") +
                (fallaron > 0 ? "Hubo " + fallaron + " archivo(s) que no eran imágenes." : "");
            quejaError.classList.add("visible");
        }else{
            quejaError.classList.remove("visible");
        }
    });
});

formQueja.addEventListener("submit", function(evento){
    evento.preventDefault();

    const texto = campoQueja.value.trim();

    // sin largo mínimo: alcanza con que haya algo, texto o imagen
    if(!texto && imagenesAdjuntas.length === 0){
        quejaError.textContent = "Escribinos algo o adjuntá una imagen.";
        quejaError.classList.add("visible");
        quejaOk.classList.remove("visible");
        return;
    }

    const cuenta = buscarCuenta(usuarioActual);
    const id = "q" + Date.now() + Math.floor(Math.random() * 1000);

    const mensaje = {
        usuario:  usuarioActual || "desconocido",
        nombre:   (cuenta && cuenta.nombre) || usuarioActual || "",
        mail:     (cuenta && cuenta.mail) || "",
        texto:    texto,
        imagenes: imagenesAdjuntas.slice(),
        fecha:    Date.now(),
        leida:    false
    };

    quejaError.classList.remove("visible");
    quejaOk.textContent = "Enviando...";
    quejaOk.classList.add("visible");

    fetch(FIREBASE_URL + "/quejas/" + id + ".json", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mensaje)
    }).then(r => {
        if(!r.ok) throw new Error("respuesta " + r.status);
        quejaOk.textContent = "¡Gracias! Tu mensaje llegó.";
        formQueja.reset();
        imagenesAdjuntas = [];
        pintarCapturas();
        pintarContadorQueja();
        cargarMisAportes();
    }).catch(e => {
        quejaOk.classList.remove("visible");
        quejaError.textContent = "No se pudo enviar (" + e.message + "). Probá de nuevo.";
        quejaError.classList.add("visible");
    });
});

/* ---------- lo que ya mandó esta persona, con la respuesta ---------- */

function cargarMisAportes(){
    const zona  = document.getElementById("mis_aportes");
    const lista = document.getElementById("lista_mis_aportes");
    if(!zona || !usuarioActual) return;

    fetch(FIREBASE_URL + "/quejas.json?cacheBust=" + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(function(datos){
            lista.innerHTML = "";
            if(!datos){ zona.hidden = true; return; }

            const mios = Object.keys(datos)
                .filter(k => datos[k] && datos[k].usuario === usuarioActual)
                .sort((a, b) => (datos[b].fecha || 0) - (datos[a].fecha || 0));

            zona.hidden = (mios.length === 0);

            mios.forEach(function(k){
                const q = datos[k];

                const caja = document.createElement("div");
                caja.className = "mi_aporte";

                const cuando = document.createElement("p");
                cuando.className = "mi_aporte_fecha";
                cuando.textContent = fechaCompleta(q.fecha);
                caja.appendChild(cuando);

                const texto = document.createElement("p");
                texto.className = "mi_aporte_texto";
                texto.textContent = q.texto || "(solo imágenes)";
                caja.appendChild(texto);

                if(q.respuesta && q.respuesta.texto){
                    const resp = document.createElement("p");
                    resp.className = "mi_aporte_respuesta";
                    resp.textContent = "Respuesta de ÓRBITASK: " + q.respuesta.texto;
                    caja.appendChild(resp);
                }else{
                    const esp = document.createElement("p");
                    esp.className = "mi_aporte_espera";
                    esp.textContent = q.leida ? "Leído. Todavía sin respuesta." : "Sin leer todavía.";
                    caja.appendChild(esp);
                }

                lista.appendChild(caja);
            });
        })
        .catch(() => { zona.hidden = true; });
}

/* ---------- una imagen a pantalla completa ---------- */

function verFoto(datos){
    const d = document.getElementById("dialog_foto");
    document.getElementById("foto_grande_aporte").src = datos;
    d.showModal();
}

document.getElementById("foto_grande_aporte").addEventListener("click", function(){
    document.getElementById("dialog_foto").close();
});

/* ---------------------------------------------------------
   11 quater. ADMIN2: BUSCADOR Y BANDEJA DE MENSAJES
   --------------------------------------------------------- */

const campoBuscar = document.getElementById("campo_buscar");

document.getElementById("boton_buscar").addEventListener("click", function(){
    campoBuscar.hidden = !campoBuscar.hidden;
    if(!campoBuscar.hidden) campoBuscar.focus();
    else { campoBuscar.value = ""; filtrarTabla(""); }
});

campoBuscar.addEventListener("input", function(){ filtrarTabla(this.value); });

function filtrarTabla(texto){
    const busca = texto.trim().toLowerCase();

    document.querySelectorAll("#cuerpo_tabla tr").forEach(function(fila){
        if(!busca){ fila.hidden = false; return; }
        fila.hidden = fila.textContent.toLowerCase().indexOf(busca) === -1;
    });
}

/* ---------- detalle de un usuario ---------- */

function abrirDetalle(usuario){
    const cuenta = cuentas[usuario];
    if(!cuenta) return;

    const est    = (usuario === USUARIO_PANEL) ? null : (estadosDelPanel[usuario] || cargarEstado(usuario));
    const tareas = (est && Array.isArray(est.tareas)) ? est.tareas : [];
    const mascota = est ? MASCOTAS.find(m => m.id === est.mascotaId) : null;

    const caja = document.getElementById("caja_detalle");
    caja.innerHTML = "";

    const titulo = document.createElement("h2");
    titulo.className = "titulo_detalle";
    titulo.textContent = cuenta.nombre || cuenta.usuario;
    caja.appendChild(titulo);

    const datos = [
        ["Usuario",        cuenta.usuario],
        ["Contraseña",     cuenta.clave],
        ["Mail",           (cuenta.mail || "—") + (cuenta.mailVerificado ? "  (verificado)" : "")],
        ["Se registró",    fechaCorta(cuenta.creada)],
        ["Último ingreso", fechaCorta(cuenta.ultimoIngreso)],
        ["Ingresos",       String(cuenta.ingresos || 0)],
        ["Mascota",        mascota ? mascota.nombre + " (" + mascota.descripcion + ")" : "—"],
        ["Nivel",          est ? String(est.nivel || 0) : "—"],
        ["Vida",           est ? Math.round(est.vida || 0) + "%" : "—"],
        ["Amenazas",       est ? ((est.amenaza && est.amenaza.pausada) ? "en pausa" : "activas") : "—"]
    ];

    const lista = document.createElement("div");
    lista.className = "datos_detalle";

    datos.forEach(function(par){
        const fila = document.createElement("div");
        const r = document.createElement("span");
        r.className = "rotulo_detalle";
        r.textContent = par[0];
        const v = document.createElement("span");
        v.className = "valor_detalle";
        v.textContent = par[1];
        fila.appendChild(r);
        fila.appendChild(v);
        lista.appendChild(fila);
    });

    caja.appendChild(lista);

    const sub = document.createElement("h3");
    sub.className = "subtitulo_detalle";
    sub.textContent = "Sus tareas (" + tareas.length + ")";
    caja.appendChild(sub);

    if(tareas.length === 0){
        const vacio = document.createElement("p");
        vacio.className = "detalle_vacio";
        vacio.textContent = "No tiene tareas cargadas.";
        caja.appendChild(vacio);
    }else{
        const ul = document.createElement("ul");
        ul.className = "tareas_detalle";

        tareas.forEach(function(t){
            const li = document.createElement("li");
            li.className = t.hecha ? "hecha" : "";
            li.textContent = (t.hecha ? "✔  " : "•  ") + (t.nombre || "(sin nombre)") +
                             (t.hecha && t.valor ? "   ♥+" + t.valor : "");
            ul.appendChild(li);
        });

        caja.appendChild(ul);
    }

    document.getElementById("dialog_detalle").showModal();
}

/* ---------- bandeja de mensajes ----------

   Se guarda la última lectura en memoria para poder filtrar y buscar
   sin volver a pedirle todo a la base en cada tecla.                 */

const dialogQuejasAdmin = document.getElementById("dialog_quejas_admin");
const listaQuejas       = document.getElementById("lista_quejas");
const estadoQuejas      = document.getElementById("estado_quejas");
const buscarQuejas      = document.getElementById("buscar_quejas");

let quejasEnMemoria = {};
let filtroQuejas    = "todos";

/* lo que admin2 puede contestar con un toque, sin escribir */
const RESPUESTAS_RAPIDAS = [
    "¡Gracias por avisar! Ya lo estamos mirando.",
    "Muy buena idea, la anotamos para una próxima versión.",
    "Ya quedó arreglado. Probá de nuevo y contanos cómo te fue.",
    "No logramos reproducirlo. ¿Nos contás paso a paso qué hiciste?"
];

document.getElementById("boton_quejas_admin").addEventListener("click", function(){
    dialogQuejasAdmin.showModal();
    cargarQuejas();
});

buscarQuejas.addEventListener("input", pintarQuejas);

document.querySelectorAll(".filtro_queja").forEach(function(boton){
    boton.addEventListener("click", function(){
        document.querySelectorAll(".filtro_queja").forEach(b => b.classList.remove("activo"));
        boton.classList.add("activo");
        filtroQuejas = boton.dataset.filtro;
        pintarQuejas();
    });
});

function contarQuejasNuevas(){
    fetch(FIREBASE_URL + "/quejas.json?cacheBust=" + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(datos => {
            const burbuja = document.getElementById("burbuja_quejas");
            if(!datos){ burbuja.hidden = true; return; }

            const nuevas = Object.keys(datos).filter(k => datos[k] && !datos[k].leida).length;
            burbuja.hidden = (nuevas === 0);
            burbuja.title  = nuevas + (nuevas === 1 ? " mensaje sin leer" : " mensajes sin leer");
        })
        .catch(() => {});
}

function cargarQuejas(){
    estadoQuejas.textContent = "Cargando...";
    listaQuejas.innerHTML = "";

    fetch(FIREBASE_URL + "/quejas.json?cacheBust=" + Date.now())
        .then(r => {
            if(!r.ok) throw new Error("respuesta " + r.status);
            return r.json();
        })
        .then(datos => {
            quejasEnMemoria = datos || {};
            pintarQuejas();
        })
        .catch(e => {
            estadoQuejas.textContent = "No se pudieron leer los mensajes (" + e.message + ")";
        });
}

/* las imágenes pueden venir de antes, cuando era una sola */
function imagenesDe(q){
    if(Array.isArray(q.imagenes)) return q.imagenes.filter(Boolean);
    return q.imagen ? [q.imagen] : [];
}

function textoBuscable(q){
    return [q.usuario, q.nombre, q.mail, q.texto, fechaCompleta(q.fecha)]
        .filter(Boolean).join(" ").toLowerCase();
}

function pintarQuejas(){
    listaQuejas.innerHTML = "";

    const todas = Object.keys(quejasEnMemoria).filter(k => quejasEnMemoria[k]);
    actualizarResumenQuejas();

    if(todas.length === 0) return;

    const busca = buscarQuejas.value.trim().toLowerCase();

    const claves = todas
        .filter(k => filtroQuejas === "todos" ||
                    (filtroQuejas === "leidos" ? quejasEnMemoria[k].leida : !quejasEnMemoria[k].leida))
        .filter(k => !busca || textoBuscable(quejasEnMemoria[k]).indexOf(busca) >= 0)
        .sort((a, b) => (quejasEnMemoria[b].fecha || 0) - (quejasEnMemoria[a].fecha || 0));

    if(claves.length === 0){
        const vacio = document.createElement("p");
        vacio.className = "quejas_vacio";
        vacio.textContent = busca ? "Ningún mensaje coincide con esa búsqueda."
                                  : "No hay mensajes en esta vista.";
        listaQuejas.appendChild(vacio);
        return;
    }

    claves.forEach(k => listaQuejas.appendChild(armarItemQueja(k, quejasEnMemoria[k])));
}

function guardarCampoQueja(id, campo, valor){
    const cuerpo = {};
    cuerpo[campo] = valor;

    return fetch(FIREBASE_URL + "/quejas/" + id + ".json", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo)
    });
}

/* Se actualiza el mensaje en su lugar en vez de redibujar toda la lista:
   si se redibuja, el mensaje que acabás de abrir se vuelve a cerrar. */
function marcarQueja(id, leida, item){
    quejasEnMemoria[id].leida = leida;
    guardarCampoQueja(id, "leida", leida).then(contarQuejasNuevas).catch(() => {});

    if(!item){ pintarQuejas(); return; }

    item.classList.toggle("sin_leer", !leida);

    const etiqueta = item.querySelector(".queja_estado");
    if(etiqueta) etiqueta.textContent = leida ? "leído" : "sin leer";

    const boton = item.querySelector(".queja_marcar");
    if(boton) boton.textContent = leida ? "Marcar como sin leer" : "Marcar como leído";

    actualizarResumenQuejas();
}

function actualizarResumenQuejas(){
    const todas  = Object.keys(quejasEnMemoria).filter(k => quejasEnMemoria[k]);
    const total  = todas.length;
    const leidos = todas.filter(k => quejasEnMemoria[k].leida).length;
    const nuevos = total - leidos;

    estadoQuejas.textContent = total === 0
        ? "Todavía no llegó ningún mensaje."
        : total + (total === 1 ? " mensaje en total" : " mensajes en total") +
          "  ·  " + nuevos + " sin leer  ·  " + leidos + (leidos === 1 ? " leído" : " leídos");
}

function armarItemQueja(id, q){
    const item = document.createElement("div");
    item.className = "queja_item" + (q.leida ? "" : " sin_leer");

    const fotos = imagenesDe(q);

    const cabecera = document.createElement("button");
    cabecera.type = "button";
    cabecera.className = "queja_cabecera";
    cabecera.innerHTML =
        '<span class="queja_usuario">' + (q.nombre || q.usuario || "—") + '</span>' +
        '<span class="queja_fecha">' + fechaCompleta(q.fecha) + '</span>' +
        '<span class="queja_resumen">' + (q.texto || "(solo imágenes)").slice(0, 60) +
        ((q.texto || "").length > 60 ? "..." : "") + '</span>' +
        '<span class="queja_marcas">' +
            (fotos.length ? '<span class="queja_clip">' + fotos.length + ' img</span>' : "") +
            (q.respuesta && q.respuesta.texto ? '<span class="queja_resp">respondido</span>' : "") +
            '<span class="queja_estado">' + (q.leida ? "leído" : "sin leer") + '</span>' +
        '</span>';

    const cuerpo = document.createElement("div");
    cuerpo.className = "queja_cuerpo";
    cuerpo.hidden = true;

    const datos = document.createElement("p");
    datos.className = "queja_datos";
    datos.textContent = "@" + (q.usuario || "—") + (q.mail ? "  ·  " + q.mail : "");
    cuerpo.appendChild(datos);

    const texto = document.createElement("p");
    texto.textContent = q.texto || "(sin texto)";
    cuerpo.appendChild(texto);

    if(fotos.length){
        const tira = document.createElement("div");
        tira.className = "queja_tira";

        fotos.forEach(function(datosImg, pos){
            const img = document.createElement("img");
            img.src = datosImg;
            img.alt = "imagen " + (pos + 1) + " de " + (q.usuario || "");
            img.className = "queja_imagen";
            img.title = "Tocá para verla a pantalla completa";
            img.addEventListener("click", () => verFoto(datosImg));
            tira.appendChild(img);
        });

        cuerpo.appendChild(tira);
    }

    /* ---- responderle ---- */
    const zonaResp = document.createElement("div");
    zonaResp.className = "queja_respuesta";

    if(q.respuesta && q.respuesta.texto){
        const ya = document.createElement("p");
        ya.className = "respuesta_hecha";
        ya.textContent = "Respondido el " + fechaCompleta(q.respuesta.fecha) + ": " + q.respuesta.texto;
        zonaResp.appendChild(ya);
    }

    const rotulo = document.createElement("p");
    rotulo.className = "respuesta_rotulo";
    rotulo.textContent = q.respuesta && q.respuesta.texto ? "Cambiar la respuesta" : "Responderle";
    zonaResp.appendChild(rotulo);

    const rapidas = document.createElement("div");
    rapidas.className = "respuestas_rapidas";

    const campo = document.createElement("textarea");
    campo.className = "campo_respuesta";
    campo.rows = 2;
    campo.maxLength = 400;
    campo.placeholder = "O escribile algo tuyo";
    campo.value = (q.respuesta && q.respuesta.texto) || "";

    RESPUESTAS_RAPIDAS.forEach(function(frase){
        const b = document.createElement("button");
        b.type = "button";
        b.className = "respuesta_rapida";
        b.textContent = frase;
        b.addEventListener("click", () => { campo.value = frase; campo.focus(); });
        rapidas.appendChild(b);
    });

    zonaResp.appendChild(rapidas);
    zonaResp.appendChild(campo);

    const aviso = document.createElement("p");
    aviso.className = "respuesta_aviso";

    const mandar = document.createElement("button");
    mandar.type = "button";
    mandar.className = "respuesta_enviar";
    mandar.textContent = "GUARDAR RESPUESTA";
    mandar.addEventListener("click", function(){
        const dice = campo.value.trim();
        if(!dice){ aviso.textContent = "Escribí algo o elegí una de las de arriba."; return; }

        aviso.textContent = "Guardando...";
        const respuesta = { texto: dice, fecha: Date.now() };

        guardarCampoQueja(id, "respuesta", respuesta)
            .then(r => {
                if(!r.ok) throw new Error("respuesta " + r.status);
                quejasEnMemoria[id].respuesta = respuesta;
                if(!quejasEnMemoria[id].leida) marcarQueja(id, true, item);

                // se marca "respondido" arriba, sin cerrar el mensaje abierto
                if(!item.querySelector(".queja_resp")){
                    const chapa = document.createElement("span");
                    chapa.className = "queja_resp";
                    chapa.textContent = "respondido";
                    const marcas = item.querySelector(".queja_marcas");
                    if(marcas) marcas.insertBefore(chapa, marcas.querySelector(".queja_estado"));
                }

                rotulo.textContent = "Cambiar la respuesta";
                aviso.textContent = "Listo, le va a aparecer cuando abra sus aportes.";
            })
            .catch(e => { aviso.textContent = "No se pudo guardar (" + e.message + ")."; });
    });

    zonaResp.appendChild(mandar);
    zonaResp.appendChild(aviso);
    cuerpo.appendChild(zonaResp);

    /* ---- pie: marcar y borrar ---- */
    const pie = document.createElement("div");
    pie.className = "queja_pie";

    const marcar = document.createElement("button");
    marcar.type = "button";
    marcar.className = "queja_marcar";
    marcar.textContent = q.leida ? "Marcar como sin leer" : "Marcar como leído";
    marcar.addEventListener("click", () => marcarQueja(id, !quejasEnMemoria[id].leida, item));
    pie.appendChild(marcar);

    const borrar = document.createElement("button");
    borrar.type = "button";
    borrar.className = "queja_borrar";
    borrar.textContent = "Borrar este mensaje";
    borrar.addEventListener("click", function(){
        fetch(FIREBASE_URL + "/quejas/" + id + ".json", { method: "DELETE" })
            .then(() => { delete quejasEnMemoria[id]; pintarQuejas(); contarQuejasNuevas(); })
            .catch(() => {});
    });
    pie.appendChild(borrar);

    cuerpo.appendChild(pie);

    cabecera.addEventListener("click", function(){
        cuerpo.hidden = !cuerpo.hidden;
        if(!cuerpo.hidden && !quejasEnMemoria[id].leida) marcarQueja(id, true, item);
    });

    item.appendChild(cabecera);
    item.appendChild(cuerpo);
    return item;
}

/* ---------------------------------------------------------
   12. CELULAR: MENÚ DESPLEGABLE Y PESTAÑAS DE LAS LISTAS

   En escritorio las dos listas se ven al mismo tiempo y los
   botones están sueltos en la barra. En celular, las listas
   pasan a ser dos pestañas y los botones se guardan en el
   menú ☰. Todo el cambio de aspecto lo hace el CSS; acá solo
   se prende y apaga una clase.
   --------------------------------------------------------- */

const seccionLista   = document.getElementById("seccion_lista");
const pestanaPend    = document.getElementById("pestana_pendientes");
const pestanaReal    = document.getElementById("pestana_realizados");
const botonMenuMovil = document.getElementById("menu_movil");
const navBotones     = document.getElementById("nav_botones");

function mostrarPestana(cual){
    const verRealizados = (cual === "realizados");
    seccionLista.classList.toggle("ver_realizados", verRealizados);
    seccionLista.classList.toggle("ver_pendientes", !verRealizados);
    pestanaReal.classList.toggle("activa", verRealizados);
    pestanaPend.classList.toggle("activa", !verRealizados);
}

pestanaPend.addEventListener("click", () => mostrarPestana("pendientes"));
pestanaReal.addEventListener("click", () => mostrarPestana("realizados"));

mostrarPestana("pendientes");

/* ---------- menú ☰ de la barra ---------- */

function cerrarMenuMovil(){
    navBotones.classList.remove("abierto");
    botonMenuMovil.setAttribute("aria-expanded", "false");
}

botonMenuMovil.addEventListener("click", function(e){
    e.stopPropagation();
    const abierto = navBotones.classList.toggle("abierto");
    botonMenuMovil.setAttribute("aria-expanded", abierto ? "true" : "false");
});

// al elegir cualquier botón, el menú se cierra
navBotones.addEventListener("click", cerrarMenuMovil);

document.addEventListener("click", function(e){
    if(!e.target.closest("#zona_nav")) cerrarMenuMovil();
});

/* ---------- rueda de configuración ----------
   Despliega los tres botones de abajo: mi cuenta, información y
   cerrar sesión. En celular la rueda no se usa: los tres botones
   ya están adentro del menú ☰. */

const botonConfig = document.getElementById("boton_config");
const menuConfig  = document.getElementById("menu_config");

function cerrarMenuConfig(){
    menuConfig.classList.remove("abierto");
    botonConfig.setAttribute("aria-expanded", "false");
}

botonConfig.addEventListener("click", function(e){
    e.stopPropagation();
    const abierto = menuConfig.classList.toggle("abierto");
    botonConfig.setAttribute("aria-expanded", abierto ? "true" : "false");
});

// al elegir cualquiera de los tres, se cierra
menuConfig.addEventListener("click", cerrarMenuConfig);

document.addEventListener("click", function(e){
    if(!e.target.closest("#zona_config")) cerrarMenuConfig();
});

/* ---------- la misma rueda, en el panel de admin2 ---------- */

const botonConfigAdmin = document.getElementById("boton_config_admin");
const menuConfigAdmin  = document.getElementById("menu_config_admin");

function cerrarMenuConfigAdmin(){
    menuConfigAdmin.classList.remove("abierto");
    botonConfigAdmin.setAttribute("aria-expanded", "false");
}

botonConfigAdmin.addEventListener("click", function(e){
    e.stopPropagation();
    const abierto = menuConfigAdmin.classList.toggle("abierto");
    botonConfigAdmin.setAttribute("aria-expanded", abierto ? "true" : "false");
});

menuConfigAdmin.addEventListener("click", cerrarMenuConfigAdmin);

document.addEventListener("click", function(e){
    if(!e.target.closest("#zona_config_admin")) cerrarMenuConfigAdmin();
});

/* ---------------------------------------------------------
   12 bis. VENTANA DE MUESTRA DEL TUTORIAL

   En la diapositiva extra se abre la ventana de agregar tareas
   para explicarla con el ejemplo a la vista. Se abre sin modal
   (show en lugar de showModal) para que el cartel del tutorial
   siga encima, y sin poder escribir en ella: es una muestra.
   --------------------------------------------------------- */

function abrirVentanaDemo(){
    if(dialogItem.classList.contains("en_tutorial")) return;

    idEnEdicion = null;
    tituloFormItem.textContent = "NUEVA TAREA";
    formItem.reset();
    selectUrgencia.value  = "2";
    selectCategoria.value = "⭐";
    botonBorrarItem.classList.remove("visible");

    if(dialogItem.open) dialogItem.close();
    dialogItem.classList.add("en_tutorial");
    dialogItem.show();
}

function cerrarVentanaDemo(){
    if(!dialogItem.classList.contains("en_tutorial")) return;
    dialogItem.classList.remove("en_tutorial");
    if(dialogItem.open) dialogItem.close();
}

/* ---------------------------------------------------------
   13. VARIOS
   --------------------------------------------------------- */

/* Si esta pestaña ya tenía una sesión abierta, se vuelve a entrar
   solo: recargar la página no te echa. Cerrar la pestaña sí. */
(function retomarSesion(){
    const guardado = sesionAbierta();
    if(!guardado) return;

    if(!buscarCuenta(guardado)){ olvidarSesion(); return; }

    iniciarSesion(guardado, true);
})();

window.addEventListener("beforeunload", guardarEstado);

document.addEventListener("keydown", function(e){
    if(e.key === "Escape") cerrarConfirms();
});
