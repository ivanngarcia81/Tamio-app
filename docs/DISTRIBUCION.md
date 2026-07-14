# Distribución de Tamio (Fase 0)

Cómo generar el instalador `.dmg` de Tamio e instalarlo en las Macs de las
tesoreras y la secretaria. **Solo Apple Silicon (M1 o posterior), macOS 11+,
sin firma de Apple por ahora.**

---

## 1. Generar el instalador (en la Mac de desarrollo)

```bash
cd ~/Desktop/tesoreria-mac-
git pull
npm install
npm run dist
```

La primera vez tarda varios minutos (compila Rust en modo release). Al
terminar, el instalador queda en:

```
src-tauri/target/release/bundle/dmg/Tamio_1.0.0_aarch64.dmg
```

> El número (`1.0.0`) sale del campo `version` de `src-tauri/tauri.conf.json`.

## 2. Instalar en cada Mac

1. Pasar el `.dmg` por AirDrop, USB o correo.
2. Doble clic al `.dmg` → arrastrar **Tamio** a la carpeta **Aplicaciones**.
3. Expulsar el disco del `.dmg`.

### Primera apertura (app sin firma)

Como la app aún no está firmada por Apple, macOS la bloquea la primera vez.
Solo hay que hacerlo **una vez por Mac**:

- **macOS 15 (Sequoia) o posterior:** doble clic → aparece la advertencia →
  ir a **Ajustes del Sistema → Privacidad y seguridad**, bajar hasta el final
  y pulsar **"Abrir de todos modos"**.
- **macOS 13/14:** clic derecho sobre Tamio en Aplicaciones → **Abrir** →
  **Abrir**.
- Alternativa por Terminal (cualquier versión):
  `xattr -cr /Applications/Tamio.app`

Después de eso la app abre normal con doble clic.

## 3. Datos

Cada Mac guarda su propia base de datos local en
`~/Library/Application Support/com.tesoreria.app/`. Instalar o actualizar la
app **nunca toca esos datos**. Mientras no exista el backend, las Macs no se
sincronizan entre sí: usar **Configuración → Respaldo** para exportar/importar
si hace falta mover datos.

## 4. Publicar una actualización

1. Subir el número de `version` en `src-tauri/tauri.conf.json` (y de paso en
   `package.json` y `src-tauri/Cargo.toml` para mantenerlos iguales).
2. Repetir el paso 1 (`npm run dist`).
3. En cada Mac: abrir el nuevo `.dmg` y arrastrar Tamio a Aplicaciones,
   **reemplazando** la versión anterior. Los datos se conservan.
4. La advertencia de seguridad vuelve a aparecer una vez por ser una app nueva
   sin firma.

## 5. Más adelante (con el backend)

- **Firma + notarización de Apple** (Apple Developer, $99/año): elimina la
  advertencia de la primera apertura.
- **Auto-updater de Tauri**: la app se actualizaría sola; requiere la firma.

> ⚠️ El `identifier` (`com.tesoreria.app`) **no debe cambiarse nunca**: la
> carpeta de datos depende de él. El nombre visible es "Tamio", pero el
> identificador interno se queda como está.
