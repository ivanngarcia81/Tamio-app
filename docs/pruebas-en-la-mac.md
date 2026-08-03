# Pruebas pendientes en la Mac (anotado el 3 de agosto de 2026)

Lista para hacerse en casa, en orden. Todo junto toma unos 20–30 minutos.

---

## 0. Ponerse al día (siempre primero)

1. Cierra Tamio del todo: **Cmd+Q**.
2. Pega en la Terminal:

```
cd /Users/ivangarcia/Desktop/tesoreria-mac- && git pull origin main && npm install && npm run tauri build -- --bundles app && open src-tauri/target/release/bundle/macos/Tamio.app
```

3. Tamio se abre solo al final. En **Configuración → Restaurar** debe verse
   la línea "Compilación del …" con la fecha de hoy.

---

## 1. Comprobaciones rápidas (5 minutos)

- [ ] **Los dos CSV.** Configuración → Respaldo: exportar el CSV de
      movimientos y el de miembros. Los dos deben llegar a Documentos y
      abrirse bien en Numbers (acentos y ñ correctos).
- [ ] **Un comprobante viejo.** Abre un gasto de hace semanas que tenga
      comprobante y verifica que el archivo se ve.
- [ ] **Colores del donut.** En Reportes, el color de cada rebanada debe
      coincidir con el chip de su categoría en la leyenda.
- [ ] **Foco con Tab.** Abre cualquier modal (Nuevo gasto) y recorre los
      controles con Tab: el anillo de foco debe verse en cada uno.
- [ ] **Formulario de Nuevo miembro.** La sección "Servicio y habilidades"
      debe aparecer PLEGADA con una flecha; al editar un miembro existente,
      abierta. Plegada con datos dentro debe decir "N marcados".
- [ ] **Nuevo culto.** Los motivos de ausencia ya no aparecen al abrir: sale
      el botón "Anotar motivos" en la cabecera de Ausentes. Y al guardar con
      todo en cero debe salir la confirmación "¿Guardar sin asistencia?".

## 2. El recorrido con la consola (punto 5.5 de la auditoría, ~15 min)

Es el ejercicio que destapó los bugs de esta semana. Con calma:

1. En la Terminal, dentro de la carpeta del proyecto:

```
npm run tauri dev
```

2. Cuando abra la ventana, haz clic derecho dentro de la app →
   **Inspeccionar elemento** → pestaña **Consola** (o Cmd+Opción+I).
3. Pasea por TODAS las pantallas, abriendo y cerrando cosas: Inicio,
   Movimientos, Miembros, Depósitos, Reportes, Bandeja, Mensajes, Membresía,
   Actas, Cultos, Certificados, Informes, Agenda, Configuración y Ayuda.
   Abre un modal en cada una, cancela, vuelve a abrir, guarda algo de prueba
   y bórralo.
4. **Lo que se busca:** cualquier texto ROJO en la consola o en la Terminal.
   Si sale algo, captura de pantalla o copiar/pegar, y mandarlo tal cual.
5. Ojo: en `tauri dev` el restaurar cierra la app pero NO la reabre solo
   (el binario no vive dentro de un .app). Eso es normal ahí, no es un bug.
6. Para salir: Ctrl+C en la Terminal.

## 3. Opcional: renovar la copia de /Applications

La copia vieja de /Applications fue la que nos hizo perder tres intentos.
Para que el Tamio del Dock traiga todos los arreglos:

1. Termina el paso 0 (así el .app recién compilado está fresco).
2. En la Terminal: `open src-tauri/target/release/bundle/macos/`
3. Arrastra **Tamio.app** a la carpeta Aplicaciones y acepta **Reemplazar**.

---

Con esto queda cerrada la lista de pruebas de ojo de la 1.0. Lo que salga
del recorrido 5.5 se reporta y se decide; lo demás espera a Apple.
