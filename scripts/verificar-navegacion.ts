// La barra inferior del teléfono, comprobada rol por rol.
//
// `npm run verificar-navegacion`.
//
// Por qué merece una prueba: la barra tiene cinco ranuras y su contenido
// depende del rol, así que hay tres barras distintas y ninguna se ve mirando
// el código de una. Los fallos aquí son del tipo silencioso —una pestaña que
// lleva a una pantalla que ese rol no puede abrir, o el centro ocupado por la
// Bandeja para quien no puede verla— y en pantalla se manifiestan como
// "a veces no funciona".

import {
  AREAS, ACCIONES_CREAR, accionesCrearVisibles, areaDeRuta, areasVisibles,
  barraDeRol, primeraSeccion, seccionesVisibles,
} from "../src/navegacion";
import { puedeVer, RUTAS_SECRETARIA, RUTAS_TESORERIA, type Role } from "../src/role";

let fallos = 0;
const chk = (a: unknown, b: unknown, q: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) console.log(`  ✓ ${q}`);
  else { fallos++; console.error(`  ✗ ${q}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); }
};

const ROLES: Role[] = ["administrador", "tesorero", "secretaria"];
const rutas = (rol: Role) => barraDeRol(rol).map((r) => r.destino.ruta);

console.log("\nLa lista no se ha desincronizado de role.ts");
chk(AREAS[0]!.secciones.map((s) => s.ruta), [...RUTAS_TESORERIA], "Tesorería tiene las mismas rutas");
chk(AREAS[1]!.secciones.map((s) => s.ruta), [...RUTAS_SECRETARIA], "Secretaría tiene las mismas rutas");

console.log("\nNinguna pestaña lleva a donde ese rol no puede entrar");
for (const rol of ROLES) {
  const malas = rutas(rol).filter((r) => !puedeVer(rol, r));
  chk(malas, [], `${rol}: todas sus pestañas son accesibles`);
  const seccionesMalas = areasVisibles(rol)
    .flatMap((a) => seccionesVisibles(a, rol))
    .filter((s) => !puedeVer(rol, s.ruta));
  chk(seccionesMalas, [], `${rol}: todas sus secciones del carrusel son accesibles`);
}

console.log("\nLa barra cabe: cinco ranuras como mucho, y ninguna repetida");
for (const rol of ROLES) {
  const r = rutas(rol);
  chk(r.length <= 5, true, `${rol}: ${r.length} ranuras`);
  chk(new Set(r).size, r.length, `${rol}: sin destinos repetidos`);
}

console.log("\nCada rol tiene la barra que se diseñó");
chk(rutas("administrador"), ["/", "/ingresos", "/bandeja", "/membresia", "/configuracion"],
    "administrador: las dos áreas, con la Bandeja en el centro");
chk(rutas("tesorero"), ["/", "/ingresos", "/bandeja", "/depositos", "/configuracion"],
    "tesorero: su área, la Bandeja y el atajo del depósito");
chk(rutas("secretaria"), ["/", "/membresia", "/inbox", "/reportes", "/configuracion"],
    "secretaria: su area primero, Mensajes en el centro (NO puede ver la Bandeja)");
chk(barraDeRol("secretaria")[3]!.destino.clave, "nav.reportes",
    "y la pantalla que toma prestada de Tesorería se llama por su nombre, no \"Tesorería\"");
chk(puedeVer("secretaria", "/bandeja"), false, "y en efecto la Bandeja le está vedada");

console.log("\nEl atajo NO saca la sección del carrusel");
for (const [rol, atajo] of [["tesorero", "/depositos"], ["secretaria", "/reportes"]] as const) {
  const enCarrusel = areasVisibles(rol).flatMap((a) => seccionesVisibles(a, rol)).map((s) => s.ruta);
  chk(enCarrusel.includes(atajo), true, `${rol}: ${atajo} sigue estando en el carrusel`);
}

console.log("\nTocar un área aterriza en una pantalla de verdad");
for (const rol of ROLES) {
  for (const a of areasVisibles(rol)) {
    const destino = primeraSeccion(a, rol);
    chk(puedeVer(rol, destino) && destino !== "/", true, `${rol} → ${a.id} abre ${destino}`);
  }
}

console.log("\nEl carrusel sabe a qué área pertenece cada pantalla");
chk(areaDeRuta("/gastos")?.id, "tesoreria", "/gastos es de Tesorería");
chk(areaDeRuta("/cartas")?.id, "secretaria", "/cartas es de Secretaría");
for (const suelta of ["/", "/inbox", "/ayuda", "/configuracion"]) {
  chk(areaDeRuta(suelta), null, `${suelta} no pertenece a ningún área`);
}

console.log("\nLa hoja de crear solo ofrece lo que el rol puede hacer");
chk(accionesCrearVisibles("administrador").length, ACCIONES_CREAR.length, "administrador: las ocho");
chk(accionesCrearVisibles("tesorero").map((a) => a.id), ["ingreso", "gasto", "deposito"],
    "tesorero: solo lo de Tesorería");
chk(accionesCrearVisibles("secretaria").map((a) => a.id), ["miembro", "servicio", "acta", "carta", "evento"],
    "secretaria: solo lo de Secretaría");

console.log(fallos === 0
  ? `\n✔ la navegación es coherente en los tres roles.\n`
  : `\n✗ ${fallos} fallo(s) en la navegación.\n`);
process.exit(fallos ? 1 : 0);
