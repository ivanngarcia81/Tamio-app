# Checklist para cerrar la sincronización

> El código de sincronización ya está hecho para casi toda la app. Lo que falta
> es (1) correr los SQL en Supabase y (2) probar con las dos Macs. Esta lista te
> guía en orden.

## Paso 1 — Correr los SQL en Supabase (una vez cada uno)

En Supabase → **SQL Editor → New query → pega el archivo → Run**. En **orden**
(los primeros son cimiento). Marca ✅ el que ya corriste:

- [ ] `supabase/sync-e1.sql` — iglesias + vínculo usuario↔iglesia *(cimiento)*
- [ ] `supabase/sync-e2-members.sql` — miembros
- [ ] `supabase/sync-t1-transactions.sql` — transacciones
- [ ] `supabase/sync-d1-depositos.sql` — depósitos
- [ ] `supabase/sync-a1-actas.sql` — actas
- [ ] `supabase/sync-c1-cartas-solicitudes.sql` — cartas y solicitudes
- [ ] `supabase/sync-tr1-traslados.sql` — traslados (salida/entrada)
- [ ] `supabase/sync-sv1-servicios.sql` — servicios (registro de cultos)
- [ ] `supabase/sync-ag1-agenda-mensajes.sql` — agenda y mensajes

> En Table Editor deben aparecer todas esas tablas (vacías). Correr un SQL dos
> veces no hace daño (usan `if not exists`).

## Paso 2 — Actualizar las dos Macs

En **cada** Mac:
```bash
cd ~/Desktop/tesoreria-mac-
git pull origin claude/hello-9v3atw
npm install
npm run tauri dev
```
- Inicia sesión con **el mismo correo** en las dos.
- El indicador de sync (pie del sidebar) debe decir **Sincronizado**.

## Paso 3 — Probar cada módulo (crear en A → sincronizar → ver en B)

Marca ✅ lo que viaja bien de una Mac a la otra:

- [ ] **Miembros** (Secretaría → Membresía)
- [ ] **Ingresos / Gastos** (Tesorería) — con el aportante correcto
- [ ] **Depósitos** (Tesorería → Bank deposit) — que cuadren los totales
- [ ] **Actas** (Secretaría → Board minutes)
- [ ] **Cartas y Solicitudes** (Secretaría → Cartas)
- [ ] **Traslados** (Secretaría → Traslados)
- [ ] **Servicios** (Secretaría → Servicios) — el registro del culto
- [ ] **Agenda** (Secretaría → Agenda)
- [ ] **Mensajes** (Inbox) — el buzón entre tesorería y secretaría
- [ ] **Borrar** algo en A → desaparece en B (borrado suave)

## Qué NO se sincroniza todavía (a propósito)

- **Roster de asistencia por miembro** (quién asistió a cada culto). El registro
  del culto sí viaja; el detalle por persona se queda local.
- **Categorías personalizadas** y **plantillas de cartas** (tienen enredos
  propios; se harán con cuidado si se necesitan).
- El **enlace mutuo** carta↔solicitud y traslado↔carta (queda local).

## Si algo falla
Anota el módulo y el mensaje del indicador (o el error en rojo de "Sincronizar
ahora" en Ajustes). Con eso se ubica el problema.

---

Cuando todo el Paso 3 esté ✅, **la sincronización queda concluida y probada**.
El siguiente gran bloque del proyecto es la **suscripción + Apple Developer**
para vender Tamio (ver `docs/planes.md` y `docs/fase-2.md`).
