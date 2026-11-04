/* ==================================================================
   ÓRBITASK — recordatorios automáticos por mail

   Esto NO corre en la página: lo corre GitHub una vez por día, solo
   (ver .github/workflows/recordatorios.yml). Por eso funciona aunque
   nadie tenga la página abierta.

   Lo que hace, en orden:
     1. le pide a Firebase la lista de cuentas
     2. se queda con las que hace más de una semana que no entran
        y a las que no se les avisó en los últimos siete días
     3. averigua qué mascota le tocó a cada una
     4. sortea uno de los tres mensajes y lo manda por EmailJS
     5. anota la fecha del aviso en Firebase, para no repetirlo

   Las dos llaves de EmailJS salen de los "secrets" del repositorio,
   nunca del código: EMAILJS_PUBLICA y EMAILJS_PRIVADA.
   ================================================================== */

const FIREBASE_URL = process.env.FIREBASE_URL
    || "https://orbitask-50d1c-default-rtdb.firebaseio.com";

const EMAILJS_URL = process.env.EMAILJS_URL
    || "https://api.emailjs.com/api/v1.0/email/send";

const EMAILJS_SERVICIO     = "service_iq5p3nn";
const EMAILJS_RECORDATORIO = "template_7ht61rs";

const EMAILJS_PUBLICA = process.env.EMAILJS_PUBLICA || "";
const EMAILJS_PRIVADA = process.env.EMAILJS_PRIVADA || "";

const SEMANA_MS     = 7 * 24 * 60 * 60 * 1000;
const CUENTAS_FIJAS = ["admin1", "admin2"];
const ESPERA_MS     = 1500;   // EmailJS acepta un mail por segundo

/* Las mascotas, igual que en orbitask.js.
   Si agregás una allá, agregala acá también. */
const MASCOTAS = [
    { id: "catarsis", nombre: "CATARSIS", gif: "https://ik.imagekit.io/ui9le8s20/catarsis.gif" },
    { id: "hurlin",   nombre: "HURLIN",   gif: "https://ik.imagekit.io/ui9le8s20/pixil-gif-drawing%20(2).gif" },
    { id: "frog",     nombre: "FROG",     gif: "https://ik.imagekit.io/ui9le8s20/pixil-gif-drawing%20(1).gif" }
];

/* Los tres mensajes. Se sortea uno por persona.
   {nombre} es quien recibe el mail y {mascota} su animal espacial.
   Este es el único lugar donde viven: para cambiar un texto, se cambia acá. */
const RECORDATORIOS = [
    {
        asunto: "{nombre}, alguien pregunta por vos en la órbita",
        cuerpo: "¡Hola {nombre}! Una semana sin pasar por ÓRBITASK. Récord personal, pero no del bueno.\n\n" +
                "{mascota} se acostumbró a esperarte, aunque preferiría no tener que hacerlo.\n\n" +
                "Volvé cuando puedas, viajero espacial. Con una tarea tachada volvemos a estar como antes. ¡Dale que podés!"
    },
    {
        asunto: "¡{mascota} tiene hambre, {nombre}!",
        cuerpo: "Viajero espacial: hace siete días que no pasás por tu órbita, y en esta galaxia se paga la comida tachando tareas.\n\n" +
                "{mascota} ya revisó la lista de pendientes tres veces, por si las dudas.\n\n" +
                "Entrá un minuto y dale un bocadito. ¡Vos podés, {nombre}!"
    },
    {
        asunto: "Tu {mascota} anda bajito de energía",
        cuerpo: "¡Hola {nombre}! Pasó una semana y la barra de vida de {mascota} ya no está tan llena como antes.\n\n" +
                "No es grave todavía, pero tampoco conviene dejarla bajar más. Sería una pena que la historia termine así.\n\n" +
                "Entrá, tachá algo y devolvele las fuerzas, viajero espacial. ¡Seguí así!"
    }
];

/* ------------------------------------------------------------------ */

const dormir = (ms) => new Promise(ok => setTimeout(ok, ms));

async function traerCuentas(){
    const r = await fetch(FIREBASE_URL + "/cuentas.json?cacheBust=" + Date.now());
    if(!r.ok) throw new Error("Firebase respondió " + r.status + " al pedir las cuentas");

    const cuentas = await r.json();
    if(!cuentas || typeof cuentas !== "object") return {};
    return cuentas;
}

async function traerMascota(usuario){
    try{
        const r = await fetch(FIREBASE_URL + "/usuarios/" + encodeURIComponent(usuario) + "/mascotaId.json");
        if(!r.ok) return MASCOTAS[0];

        const id = await r.json();
        return MASCOTAS.find(m => m.id === id) || MASCOTAS[0];
    }catch(e){
        console.warn("   (no se pudo leer la mascota de " + usuario + ": " + e.message + ")");
        return MASCOTAS[0];
    }
}

function inactivos(cuentas){
    const ahora = Date.now();

    return Object.keys(cuentas).filter(function(u){
        const c = cuentas[u];
        if(!c || typeof c !== "object")            return false;
        if(c.fija || CUENTAS_FIJAS.includes(u))    return false;
        if(!c.mail)                                return false;
        if(!c.ultimoIngreso)                       return false;   // nunca entró
        if(ahora - c.ultimoIngreso < SEMANA_MS)    return false;   // entró hace poco
        if(c.ultimoAviso && ahora - c.ultimoAviso < SEMANA_MS) return false;   // ya avisado
        return true;
    });
}

function armarMail(cuenta, mascota){
    const elegido = RECORDATORIOS[Math.floor(Math.random() * RECORDATORIOS.length)];
    const nombre  = cuenta.nombre || cuenta.usuario;

    const reemplazar = (t) => t.split("{nombre}").join(nombre)
                               .split("{mascota}").join(mascota.nombre);

    return {
        email:        cuenta.mail,
        to_email:     cuenta.mail,
        user_email:   cuenta.mail,
        to_name:      nombre,
        user_name:    nombre,
        name:         nombre,
        nombre:       nombre,
        from_name:    "ORBITASK",
        mascota:      mascota.nombre,
        foto_mascota: mascota.gif,
        asunto:       reemplazar(elegido.asunto),
        subject:      reemplazar(elegido.asunto),
        mensaje:      reemplazar(elegido.cuerpo),
        message:      reemplazar(elegido.cuerpo)
    };
}

async function mandar(parametros){
    const r = await fetch(EMAILJS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            service_id:      EMAILJS_SERVICIO,
            template_id:     EMAILJS_RECORDATORIO,
            user_id:         EMAILJS_PUBLICA,
            accessToken:     EMAILJS_PRIVADA,
            template_params: parametros
        })
    });

    if(!r.ok){
        const detalle = (await r.text()).trim();
        throw new Error("EmailJS respondió " + r.status + (detalle ? ": " + detalle : ""));
    }
}

async function anotarAviso(usuario){
    const r = await fetch(FIREBASE_URL + "/cuentas/" + encodeURIComponent(usuario) + ".json", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ultimoAviso: Date.now() })
    });

    if(!r.ok) throw new Error("Firebase respondió " + r.status + " al anotar el aviso");
}

/* ------------------------------------------------------------------ */

async function principal(){
    if(!EMAILJS_PUBLICA || !EMAILJS_PRIVADA){
        console.error("Faltan las llaves de EmailJS.");
        console.error("Cargá EMAILJS_PUBLICA y EMAILJS_PRIVADA como secrets del repositorio.");
        process.exit(1);
    }

    const cuentas = await traerCuentas();
    const total   = Object.keys(cuentas).length;
    const lista   = inactivos(cuentas);

    console.log("Cuentas en la base: " + total);
    console.log("Hace más de una semana que no entran: " + lista.length +
                (lista.length ? " (" + lista.join(", ") + ")" : ""));

    if(lista.length === 0){
        console.log("No hay a quién avisarle hoy.");
        return;
    }

    let enviados = 0;
    const fallados = [];

    for(let i = 0; i < lista.length; i++){
        const u       = lista[i];
        const cuenta  = cuentas[u];
        const mascota = await traerMascota(u);

        try{
            await mandar(armarMail(cuenta, mascota));
            await anotarAviso(u);
            enviados++;
            console.log("✓ " + u + " — mail enviado (" + mascota.nombre + ")");
        }catch(e){
            fallados.push(u);
            console.warn("✗ " + u + " — " + e.message);
        }

        if(i < lista.length - 1) await dormir(ESPERA_MS);
    }

    console.log("");
    console.log("Enviados: " + enviados + " de " + lista.length);

    if(fallados.length) console.log("Fallaron: " + fallados.join(", "));

    // si no salió ni uno, algo está mal de fondo y conviene que GitHub avise
    if(enviados === 0){
        console.error("No se pudo mandar ningún mail.");
        process.exit(1);
    }
}

principal().catch(e => {
    console.error("Se cortó antes de empezar: " + e.message);
    process.exit(1);
});
