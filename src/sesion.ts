/**
 * sesion.ts — quién tiene la sesión abierta, legible desde donde se escribe.
 *
 * "Registrado por" lo pone la app sola con quien está usándola: nadie lo
 * teclea y nadie puede atribuírselo a otro. Pero quien lo sabe es React
 * (`useSupabaseAuth`, en `App.tsx`) y quien lo necesita es `db.ts`, que no es
 * un componente y no puede leer un contexto.
 *
 * Las dos salidas eran pasar el nombre por parámetro en cada `insert*` —una
 * veintena de puntos de llamada, y el día que alguien añada el veintiuno se le
 * olvidará— o un módulo con un solo escritor y muchos lectores. Es lo segundo.
 * Un valor global es mala idea cuando cualquiera lo escribe; aquí lo escribe
 * **un único sitio** (`App.tsx`, cuando cambia la sesión) y el resto solo lee.
 *
 * En modo local —sin credenciales de Supabase configuradas— no hay sesión y
 * esto se queda en `null`. Entonces los registros nacen sin nombre y la fila
 * "Registrado por" no se pinta: decir "no lo sé" es correcto, y mucho mejor
 * que atribuirle a alguien algo que quizá no hizo.
 */

export interface QuienRegistra {
  /** El nombre tal como está en el perfil. Se guarda como INSTANTÁNEA. */
  nombre: string;
  /** "tesorero" | "secretaria" | "administrador", o lo que traiga el perfil. */
  rol: string | null;
}

let actual: QuienRegistra | null = null;

/** Lo llama `App.tsx` cuando la sesión cambia. Único escritor. */
export function setQuienRegistra(quien: QuienRegistra | null): void {
  actual = quien && quien.nombre.trim() ? { nombre: quien.nombre.trim(), rol: quien.rol } : null;
}

/** Lo leen los `insert*` de `db.ts`. `null` = no se sabe, y eso se respeta. */
export function quienRegistra(): QuienRegistra | null {
  return actual;
}
