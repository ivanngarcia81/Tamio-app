// Las reglas de seguridad de `invitar-usuario`, comprobadas sobre el código.
//
// `npm run verificar-invitacion`.
//
// Por qué una prueba estática y no una de comportamiento: la función corre en
// Deno contra un proyecto de Supabase de verdad, así que no se puede ejecutar
// aquí. Pero sus tres reglas se pueden leer en el código, y son de las que al
// romperse **no dan ningún error**: la aplicación seguiría funcionando y solo
// se notaría el día que alguien entre en la iglesia de otro.
//
// La peor de las tres es la primera. Si el `church_id` llegara a leerse del
// cuerpo de la petición, cualquiera con una cuenta podría meterse en la
// congregación que quisiera escribiendo su identificador — y en el código se
// vería como un parámetro más, inofensivo.

import { readFileSync } from "node:fs";

const RUTA = "supabase/functions/invitar-usuario/index.ts";
const src = readFileSync(RUTA, "utf8");

// Solo el código: los comentarios hablan de estas reglas y darían falsos
// positivos en las dos direcciones.
const codigo = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !/^\s*\/\//.test(l))
  .join("\n");

let fallos = 0;
const chk = (ok, q, detalle) => {
  if (ok) console.log(`  ✓ ${q}`);
  else { fallos++; console.error(`  ✗ ${q}${detalle ? `\n      ${detalle}` : ""}`); }
};

console.log(`\nReglas de ${RUTA}`);

// --- Regla 1: la iglesia NO viaja en la petición -----------------------------
const leeIglesiaDelCuerpo = /cuerpo\.\s*(church_id|churchId|iglesia)/.test(codigo);
chk(!leeIglesiaDelCuerpo,
    "la iglesia NUNCA se lee del cuerpo de la petición",
    "hay un `cuerpo.church_id` (o equivalente): eso es una puerta trasera");

chk(/const iglesia = yo\.church_id/.test(codigo),
    "la iglesia sale del perfil de quien invita");

// El cuerpo solo puede aportar estos tres campos.
const delCuerpo = [...codigo.matchAll(/cuerpo\.(\w+)/g)].map((m) => m[1]);
const permitidos = new Set(["email", "rol", "nombre"]);
const colados = [...new Set(delCuerpo)].filter((c) => !permitidos.has(c));
chk(colados.length === 0,
    `el cliente solo aporta ${[...permitidos].join(", ")}`,
    `se leen además: ${colados.join(", ")}`);

// --- Regla 2: solo un administrador invita -----------------------------------
chk(/yo\.rol !== "administrador"/.test(codigo) && /403/.test(codigo),
    "solo un administrador puede invitar, y si no lo es responde 403");

chk(/\.eq\("id", invitador\.id\)/.test(codigo),
    "el rol se comprueba contra el perfil guardado, no contra lo que diga el cliente");

// --- Regla 3: a nadie se le roba de su iglesia -------------------------------
chk(/perfil\?\.church_id && perfil\.church_id !== iglesia/.test(codigo),
    "un correo que ya pertenece a otra iglesia se rechaza");

// --- Los roles son los de acceso, no los del directorio ----------------------
const roles = /const ROLES = \[([^\]]+)\]/.exec(codigo)?.[1] ?? "";
for (const r of ["tesorero", "secretaria", "administrador"]) {
  chk(roles.includes(`"${r}"`), `el rol ${r} está permitido`);
}
for (const r of ["pastor", "auditor", "consejo", "otro"]) {
  chk(!roles.includes(`"${r}"`), `el rol ${r} NO: es del directorio local, no da acceso`);
}

// --- La trampa del disparador ------------------------------------------------
chk(/iglesiaHuerfana/.test(codigo) && /iglesias"\)\.delete\(\)/.test(codigo),
    "se recoge la iglesia huérfana que crea el disparador al_crear_usuario",
    "sin esto, cada invitación deja una iglesia vacía en la tabla para siempre");

chk(/count: "exact", head: true/.test(codigo),
    "y antes de borrarla se comprueba que no le quede ningún perfil");

// --- La clave de servicio no se filtra ---------------------------------------
chk(!/json\([^)]*service/.test(codigo),
    "la clave service_role nunca sale en una respuesta");

console.log(fallos === 0
  ? `\n✔ las reglas de la invitación siguen en pie.\n`
  : `\n✗ ${fallos} regla(s) rota(s) en la invitación.\n`);
process.exit(fallos ? 1 : 0);
