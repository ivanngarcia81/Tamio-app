# IA: Redactar cartas con Claude

Primera función de inteligencia artificial de Tamio. En el editor de cartas
aparece un botón **✨ Redactar con IA**: escribes en viñetas lo que la carta
debe decir y la IA redacta el cuerpo formal. Tú lo revisas, ajustas y guardas.

> **Regla de oro:** la IA redacta **texto**, nunca calcula ni inventa cifras de
> dinero. Esta función no recibe montos ni datos financieros.

## Arquitectura (por qué es segura)

La clave de Anthropic **nunca** vive en la app (cualquiera podría extraerla del
`.dmg`). En su lugar:

```
App (Mac) ──▶ Supabase Edge Function `redactar-ia` ──▶ API de Claude
                    (aquí vive la clave, como secreto)
```

La app solo llama a la función; la función guarda la clave y habla con Claude.

## Requisitos

- Proyecto de Supabase ya configurado (el mismo del login/sincronización).
- Una **API key de Anthropic** (console.anthropic.com → API Keys).
- El **CLI de Supabase** instalado en la Mac (`brew install supabase/tap/supabase`).

## Pasos para activarla

### 1. Desplegar la función

Desde la carpeta del proyecto, en la Mac:

```bash
cd ~/Desktop/tesoreria-mac-
supabase login                       # una sola vez
supabase link --project-ref TU_REF   # el ref sale en la URL del panel de Supabase
supabase functions deploy redactar-ia
```

### 2. Guardar la clave como secreto (del lado del servidor)

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...tu-clave...
```

La clave queda en Supabase, nunca en la app.

### 3. Encender la IA en la app

En el archivo `.env` de la raíz del proyecto (junto a las otras variables
`VITE_...`), agrega:

```
VITE_IA_HABILITADA=1
```

Vuelve a compilar / correr:

```bash
npm run tauri dev      # para probar
# o
npm run build          # para el .dmg
```

Si `VITE_IA_HABILITADA` no está en `1`, el botón **no aparece** — la app sigue
funcionando igual que hoy, sin IA.

## Cómo se usa

1. En **Secretaría → Cartas**, abre o crea una carta y elige el tipo.
2. (Opcional) elige el miembro/destinatario para dar contexto a la IA.
3. Pulsa **✨ Redactar con IA**.
4. Escribe en viñetas lo que debe decir, por ejemplo:
   ```
   • Es miembro desde 2019
   • Sirve en el ministerio de alabanza
   • Se traslada por motivos de trabajo
   ```
5. **Generar borrador** → el cuerpo se llena con el texto redactado.
6. Revísalo, ajústalo con la barra de formato y **guarda**.

## Costo

Se paga por uso a Anthropic (fracciones de centavo por carta). A escala de una
iglesia es mínimo, pero es recurrente y necesita conexión a internet (la IA vive
en la nube; el resto de Tamio sigue funcionando sin internet).

## Notas técnicas

- Modelo: `claude-opus-4-8` con *adaptive thinking* (`supabase/functions/redactar-ia/index.ts`).
- La función devuelve HTML simple (`<p>…</p>`) que se inserta en el editor.
- El sistema le prohíbe expresamente inventar cifras, fechas o firmas: el
  encabezado, la fecha, el saludo, la despedida y las firmas los pone la app.
- Cliente: `src/ia.ts` (`iaHabilitada`, `redactarCarta`). Sin conexión o sin la
  bandera, la función no se muestra y no afecta nada de lo existente.
