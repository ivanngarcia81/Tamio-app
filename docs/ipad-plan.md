# Plan: Tamio para iPad

> Meta futura. Se retoma **después** de cerrar la versión Mac (login con
> Supabase + `.dmg`). No empezar iPad hasta que la versión de escritorio esté
> estable y en uso.

## Por qué es factible
Tamio usa **Tauri 2**, que soporta iOS/iPadOS oficialmente además de macOS. El
mismo código (React + TypeScript + Rust + SQLite) puede compilarse para iPad —
no se reescribe desde cero.

**Se reutiliza tal cual (~70–80%):**
- Lógica de negocio (`db.ts`, cálculos, informes, PDFs).
- Base de datos **SQLite local** (funciona en iOS).
- **Login de Supabase** y roles.
- La mayoría de componentes React y el sistema de diseño ya pulido.
- Traducciones (i18n).

## Prerrequisitos (una sola vez)
- **Cuenta Apple Developer** (~US$99/año) para firmar e instalar en iPad.
- **Mac con Xcode** actualizado (donde se compila).
- Versión Mac terminada (login Supabase + `.dmg`) como base estable.

## Fases

### Fase 0 · Arranque del proyecto iOS *(~medio día)*
- Añadir destino iOS: `npm run tauri ios init`.
- Compilar por primera vez en el **simulador de iPad** (Xcode).
- **Meta:** ver la app abrir en un iPad simulado.

### Fase 1 · Que funcione lo esencial *(1–2 semanas)*
- Verificar en iOS: SQLite local, login Supabase, navegación básica.
- Probar plugins delicados uno por uno: **guardar/imprimir PDF**, **sonidos**,
  **acceso a archivos**. Ajustar los que se porten distinto.
- **Meta:** iniciar sesión, registrar un ingreso y generar un PDF en un iPad real.

### Fase 2 · Interfaz táctil *(2–4 semanas — el grueso del trabajo)*
- Agrandar áreas táctiles (botones, filas, iconos) al estándar de Apple.
- Rediseñar **tablas densas** (Ingresos, Aportantes) para dedo: filas más altas,
  gestos, quizá vista de "tarjetas" en vertical.
- Layout para tamaños de iPad (vertical/horizontal) y teclado en pantalla.
- Aprovechar el sistema de diseño y el responsive ya existentes.
- **Meta:** que se sienta una app de iPad, no una de escritorio forzada.

### Fase 3 · Pulido móvil *(~1 semana)*
- Icono y splash de iPad, orientaciones, modo oscuro nativo.
- Rendimiento y arranque.
- **Meta:** lista para probar en serio.

### Fase 4 · Distribución *(pocos días + espera de Apple)*
- Firmar con la cuenta Developer.
- Subir a **TestFlight** (para tesorero y secretaria antes de nada).
- Opcional después: publicar en **App Store** (revisión ~1–3 días).
- **Meta:** instalarla en los iPad reales por TestFlight.

## Notas clave
- **No se empieza de cero:** el grueso del esfuerzo está en la **experiencia
  táctil** (Fase 2) y el **trámite de Apple**, no en reprogramar.
- **Datos compartidos entre iPad y Mac:** requiere la **Fase 2 de Supabase**
  (sincronización en la nube). Si cada dispositivo trabaja con su SQLite local
  por separado, no hace falta.

## Orden recomendado global
1. Terminar Supabase (login + roles) en la Mac.
2. Generar el `.dmg` e instalar en la otra Mac.
3. Usar la app un tiempo y recoger feedback real.
4. Arrancar Tamio para iPad con este plan.
