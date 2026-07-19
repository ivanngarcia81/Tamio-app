# E6 — Pruebas de estrés de la sincronización (dos Macs)

> Objetivo: confirmar que con dos Macs de la misma iglesia **no se pierde ni se
> duplica nada**, incluso con edición simultánea, sin conexión y borrados.
> Piloto: tabla de **miembros**. Usa **datos de prueba**, no reales.

## Preparación
En **las dos Macs**:
```bash
cd ~/Desktop/tesoreria-mac-
git pull origin claude/hello-9v3atw
npm install
npm run tauri dev
```
- Inicia sesión con **el mismo correo** en las dos.
- Verás el indicador de sync en el pie del sidebar. Recuerda: se sincroniza
  sola (al abrir, al guardar, al reconectar, al enfocar la ventana y cada 3 min).
  Puedes **hacer clic en el indicador** para forzarla al instante en cualquier
  prueba.

Marca ✅ / ❌ en cada caso:

## Caso 1 — Alta y llegada
- [ ] Mac A: agrega "Prueba 1". Indicador → Sincronizado.
- [ ] Mac B: enfoca la ventana (o clic en el indicador). Aparece "Prueba 1".

## Caso 2 — Edición que viaja
- [ ] Mac B: edita "Prueba 1", cambia el teléfono. Sincroniza.
- [ ] Mac A: sincroniza. Se ve el teléfono nuevo.

## Caso 3 — Doble sentido (Tesorería ↔ Secretaría)
- [ ] Mac B (Tesorería): agrega un miembro (o visitante). Sincroniza.
- [ ] Mac A (Secretaría): aparece en Membresía.

## Caso 4 — Borrado que se propaga
- [ ] Mac A: borra "Prueba 1" (Tesorería → Miembros → borrar). Sincroniza.
- [ ] Mac B: sincroniza. "Prueba 1" **desaparece** (ya no revive).
- [ ] Deshacer: bórralo otra vez y usa "Deshacer" en el toast → vuelve el mismo
      registro; tras sincronizar, sigue presente en las dos.

## Caso 5 — Conflicto (el más nuevo gana)
- [ ] Deja las dos Macs con el mismo miembro sincronizado.
- [ ] Mac A: cámbiale el nombre a "Ana A". NO sincronices aún.
- [ ] Mac B: cámbiale el nombre a "Ana B" (unos segundos después). NO sincronices.
- [ ] Sincroniza Mac A, luego Mac B, luego Mac A otra vez.
- [ ] Resultado esperado: **gana el cambio más reciente** (el de Mac B, "Ana B")
      en las dos Macs. No hay duplicados ni error.

## Caso 6 — Sin conexión y reconexión
- [ ] Apaga el Wi-Fi de Mac A. El indicador debe decir **Sin conexión**.
- [ ] Mac A (offline): agrega "Prueba Offline". Se guarda local sin problema.
- [ ] Vuelve a encender el Wi-Fi. Al reconectar/enfocar, sincroniza solo.
- [ ] Mac B: aparece "Prueba Offline".

## Caso 7 — Nada se pierde (recuento final)
- [ ] Cuenta los miembros en las dos Macs: deben coincidir.
- [ ] Ningún miembro duplicado (mismo nombre repetido por error).
- [ ] Ningún borrado "revivido".

---

## Qué reportar si algo falla
Anota el **caso** y lo que pasó. Cosas útiles:
- El mensaje del indicador (o el de "Sincronizar ahora" en Ajustes).
- Si hubo error en rojo, cópialo tal cual.
- Si un dato se perdió o duplicó, di en cuál Mac y en qué paso.

## Notas / límites conocidos del piloto
- La propagación entre Macs **no es instantánea**: cada Mac se entera en su
  ciclo (al enfocar la ventana o cada 3 min), o al forzar con el indicador. Para
  "al segundo" haría falta tiempo real (Supabase Realtime), fuera del piloto.
- El conflicto es **por fila** (last-write-wins), no por campo: si dos editan la
  MISMA persona, gana la versión más nueva completa. Como Tesorería y Secretaría
  tocan personas/campos distintos, en la práctica casi no ocurre.
