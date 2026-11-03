/* =========================================================
   ÓRBITASK — sincronización con Firebase
   ---------------------------------------------------------
   Este archivo NO reemplaza nada: se suma a orbitask.js y
   le cambia solo dónde guarda los datos.

   Antes: el estado vivía en el navegador (localStorage).
   Ahora: además se copia a Firebase, así la pantalla ESP32
   puede leerlo, y lo que haga la pantalla vuelve a la página.

   Para que funcione, en index.html tiene que estar esta línea
   JUSTO DEBAJO de la del script principal:

       <script src="orbitask-sync.js" defer></script>

   Si algún día querés desconectar la nube, borrás esa línea y
   la página vuelve a funcionar sola como antes.
   ========================================================= */

(function(){

    "use strict";

    /* ----------------------------------------------------
       CONFIGURACIÓN
       ---------------------------------------------------- */

    const FIREBASE_URL = "https://orbitask-50d1c-default-rtdb.firebaseio.com";

    const CADA_CUANTO_PREGUNTA = 5000;   // ms entre consultas a la nube
    const ESPERA_MINIMA_ENVIO  = 3000;   // ms mínimos entre dos envíos

    /* ----------------------------------------------------
       ESTADO INTERNO DE LA SINCRONIZACIÓN
       ---------------------------------------------------- */

    let ultimaHuella      = null;   // resumen del último estado enviado
    let ultimoEnvio       = 0;      // cuándo se envió por última vez
    let envioPendiente    = null;   // temporizador de envío
    let relojNube         = null;   // temporizador de consulta
    let usuarioEnNube     = null;   // usuario del que estamos sincronizando
    let reinicioReciente  = false;  // se acaba de reiniciar: la nube no manda
    let borradoEnCurso    = null;   // promesa del borrado en Firebase

    const rutaDe = (usuario) => FIREBASE_URL + "/usuarios/" + usuario + ".json";

    /* ----------------------------------------------------
       HUELLA: qué cambios ameritan un envío

       La vida baja de a poquito todo el tiempo, así que si
       mandáramos en cada cambio estaríamos escribiendo una vez
       por segundo. Redondeamos la vida y miramos solo lo que
       importa, para escribir únicamente cuando pasó algo real.
       ---------------------------------------------------- */

    function huellaDe(e){
        if(!e) return null;
        return JSON.stringify({
            tareas:      e.tareas,
            nivel:       e.nivel,
            vida:        Math.round(e.vida),
            mascotaId:   e.mascotaId,
            amenaza:     e.amenaza,
            descanso:    e.descansoHasta,
            alimentos:   e.alimentosSeguidos,
            tutorial:    e.tutorialVisto,
            revelada:    e.mascotaRevelada
        });
    }

    /* ----------------------------------------------------
       ENVIAR A LA NUBE
       ---------------------------------------------------- */

    function enviarAhora(){
        if(!usuarioEnNube || typeof estado === "undefined" || !estado) return;

        const copia = JSON.parse(JSON.stringify(estado));
        copia.rev = Date.now();          // sello para saber cuál versión es más nueva
        copia.origen = "web";

        ultimaHuella = huellaDe(estado);
        ultimoEnvio  = Date.now();
        estado.rev   = copia.rev;

        fetch(rutaDe(usuarioEnNube), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(copia)
        }).catch(e => console.warn("[nube] no se pudo enviar:", e));
    }

    function programarEnvio(){
        if(envioPendiente) return;

        const falta = Math.max(0, ESPERA_MINIMA_ENVIO - (Date.now() - ultimoEnvio));
        envioPendiente = setTimeout(() => {
            envioPendiente = null;
            enviarAhora();
        }, falta);
    }

    /* ----------------------------------------------------
       TRAER DE LA NUBE
       ---------------------------------------------------- */

    function adoptar(remoto){
        // la pantalla (u otro navegador) dejó algo más nuevo: lo tomamos
        Object.keys(estado).forEach(k => { if(!(k in remoto)) delete estado[k]; });
        Object.assign(estado, remoto);

        if(!Array.isArray(estado.tareas)) estado.tareas = [];
        estado.ultimoTick = Date.now();   // el tiempo se cuenta desde ahora

        ultimaHuella = huellaDe(estado);

        try{
            if(typeof pintarMascota      === "function") pintarMascota();
            if(typeof renderizarListas   === "function") renderizarListas();
            if(typeof actualizarBarraVida=== "function") actualizarBarraVida();
            if(typeof actualizarAmenaza  === "function") actualizarAmenaza();
            if(typeof actualizarCorazones=== "function") actualizarCorazones();
        }catch(e){
            console.warn("[nube] error al repintar:", e);
        }
    }

    function consultar(){
        if(!usuarioEnNube || typeof estado === "undefined" || !estado) return;
        if(reinicioReciente) return;

        // no pisamos nada mientras el tutorial guiado está en pantalla
        if(typeof tutorialVisualActivo !== "undefined" && tutorialVisualActivo) return;

        fetch(rutaDe(usuarioEnNube) + "?cacheBust=" + Date.now())
            .then(r => r.ok ? r.json() : null)
            .then(remoto => {
                if(!remoto) return;                       // todavía no hay nada guardado
                if(remoto.origen === "web") return;       // lo escribimos nosotros
                if(!remoto.rev) return;
                if(remoto.rev <= (estado.rev || 0)) return;  // no es más nuevo

                adoptar(remoto);
            })
            .catch(e => console.warn("[nube] no se pudo consultar:", e));
    }

    /* ----------------------------------------------------
       ENGANCHE CON LA PÁGINA

       Se reemplazan guardarEstado y cargarEstado por versiones
       que además hablan con la nube. El resto del código llama
       a esas dos funciones igual que antes y ni se entera.
       ---------------------------------------------------- */

    const guardarOriginal = window.guardarEstado;
    const cargarOriginal  = window.cargarEstado;

    window.guardarEstado = function(){
        if(typeof guardarOriginal === "function") guardarOriginal();

        if(typeof usuarioActual !== "undefined" && usuarioActual){
            // si cambió de usuario, se reinicia la sincronización
            if(usuarioEnNube !== usuarioActual){
                usuarioEnNube = usuarioActual;
                ultimaHuella  = null;
                arrancarReloj();
                primeraLectura();
                return;
            }

            const huella = huellaDe(estado);
            if(huella !== ultimaHuella) programarEnvio();
        }
    };

    window.cargarEstado = function(usuario){
        // devuelve lo que haya en el navegador, para que la página
        // arranque al instante; la versión de la nube llega enseguida
        return (typeof cargarOriginal === "function") ? cargarOriginal(usuario) : null;
    };

    // primera lectura: si en la nube hay algo más nuevo, se adopta
    function primeraLectura(){
        if(!usuarioEnNube) return;

        fetch(rutaDe(usuarioEnNube) + "?cacheBust=" + Date.now())
            .then(r => r.ok ? r.json() : null)
            .then(remoto => {
                if(!remoto || !remoto.rev){
                    enviarAhora();            // la nube está vacía: subimos lo local
                    return;
                }
                if(remoto.rev > (estado.rev || 0)) adoptar(remoto);
                else                              enviarAhora();
            })
            .catch(e => console.warn("[nube] primera lectura falló:", e));
    }

    function arrancarReloj(){
        if(relojNube) clearInterval(relojNube);
        relojNube = setInterval(consultar, CADA_CUANTO_PREGUNTA);
    }

    function cortarSincronizacion(){
        if(relojNube) clearInterval(relojNube);
        if(envioPendiente) clearTimeout(envioPendiente);
        relojNube      = null;
        envioPendiente = null;
        usuarioEnNube  = null;
        ultimaHuella   = null;
    }

    // al cerrar sesión se corta la sincronización
    const botonSalir = document.getElementById("boton_salir");
    if(botonSalir){
        botonSalir.addEventListener("click", cortarSincronizacion);
    }

    /* ----------------------------------------------------
       REINICIAR USUARIOS (modo diseño)

       El botón de la pantalla de login borra lo guardado en el
       navegador. Si no borráramos también lo de la nube, a los
       pocos segundos la página se volvería a bajar los datos
       viejos y el reinicio no serviría de nada.
       ---------------------------------------------------- */

    const botonReset = document.getElementById("boton_reset_dev");
    if(botonReset){
        botonReset.addEventListener("click", function(){
            cortarSincronizacion();

            fetch(FIREBASE_URL + "/usuarios.json", { method: "DELETE" })
                .then(() => console.log("[nube] datos borrados de Firebase"))
                .catch(e => console.warn("[nube] no se pudo borrar:", e));
        });
    }

    console.log("[nube] sincronización con Firebase activa:", FIREBASE_URL);

})();
