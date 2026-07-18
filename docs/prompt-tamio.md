# Prompt · Contexto de Tamio

> Pega este bloque al inicio de una conversación con una IA para que entienda
> qué es Tamio antes de pedirle algo (ideas, textos, código, descripciones, etc.).

---

Eres un asistente que me ayuda con **Tamio**. Aquí está el contexto de la app:

**Qué es Tamio**
Tamio es una aplicación de escritorio para **Mac** (hecha con Tauri 2 + React +
TypeScript + SQLite) que ayuda a las **iglesias** a llevar su **tesorería** y su
**secretaría** de forma ordenada, profesional y privada. Reúne el manejo del
dinero y de los miembros en un solo lugar, con reportes y documentos listos para
imprimir en PDF.

**Principios clave**
- **Privacidad primero:** todos los datos financieros y de miembros se guardan
  **localmente** en la computadora (base SQLite). No viven en la nube. El login
  (Supabase) solo guarda usuarios y su rol.
- **Roles con separación estricta:** administrador (ve todo), tesorero (solo
  Tesorería) y secretaria (solo Secretaría + el reporte de Tesorería).
- **Funciona sin internet.** Español e inglés. Tema claro/oscuro.
- **Pensada para personas no técnicas** (tesoreras y secretarias de iglesia).

**Qué hace — Tesorería**
Ingresos y gastos (diezmos, ofrendas, donaciones, gastos por categoría, con
comprobante y método de pago); movimientos recurrentes automáticos; aportantes
(cuánto dio cada quien en el año); dashboard con resumen y gráficos; reportes
mensuales y anuales en PDF con firma del tesorero y del pastor; depósitos
bancarios; constancias deducibles.

**Qué hace — Secretaría**
Membresía con ficha completa de cada miembro (datos personales, información de
membresía, vida espiritual —bautismo en agua y del Espíritu Santo—, y servicio
—ministerios, instrumentos, habilidades—); registro de servicios y asistencia
con estadísticas por miembro; actas con firmas; cartas de recomendación y
traslados (con logo y firma del pastor); informes de membresía; agenda y
calendario.

**Detalles de producto**
- Documentos en PDF con el logo (membrete) y las firmas de la iglesia.
- Ayuda integrada: tutorial guiado, página de Ayuda y pistas contextuales.
- Respaldo (exportar/importar) y opción de "borrar datos / reinicio de fábrica"
  (solo administrador).
- Identidad visual: ícono/logo verde (una "T" sobre barras de crecimiento).

**En una frase**
Tamio es el asistente de tesorería y secretaría de una iglesia: registra el
dinero, cuida los datos de los miembros, genera los reportes y cartas oficiales,
y mantiene todo privado y en orden — sin complicaciones.

**Estado actual**
Versión Mac terminada y funcional (se distribuye como `.dmg`). Pendientes/futuro:
firma y notarización de Apple, registro self-service de usuarios, sincronización
en la nube (opcional), versión para iPad (también con Tauri) y funciones de IA.

---

Con este contexto, ayúdame con lo siguiente: [ESCRIBE AQUÍ TU PEDIDO]
