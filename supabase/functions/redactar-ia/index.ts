// Edge Function `redactar-ia` — redacta el cuerpo de una carta con Claude.
//
// La clave de Anthropic vive AQUÍ (como secreto de Supabase), nunca en la app.
// Desplegar:
//   supabase functions deploy redactar-ia
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// La app la invoca con supabase.functions.invoke("redactar-ia", { body }).
// El usuario debe estar autenticado (Supabase verifica el JWT por defecto).
//
// Regla de oro: esta función redacta CARTAS (texto), nunca calcula ni inventa
// cifras de dinero. No recibe montos ni datos financieros.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TIPOS: Record<string, { es: string; en: string }> = {
  recomendacion: { es: "carta de recomendación", en: "letter of recommendation" },
  certificacion: { es: "carta de certificación", en: "certification letter" },
  constanciaActivo: { es: "constancia de miembro activo", en: "proof of active membership" },
  buenaConducta: { es: "carta de buena conducta", en: "good-conduct letter" },
  presentacion: { es: "carta de presentación", en: "letter of introduction" },
  invitacion: { es: "carta de invitación", en: "invitation letter" },
  agradecimiento: { es: "carta de agradecimiento", en: "thank-you letter" },
  autorizacion: { es: "carta de autorización", en: "authorization letter" },
  solicitud: { es: "carta de solicitud", en: "request letter" },
  nombramiento: { es: "carta de nombramiento", en: "appointment letter" },
  reconocimiento: { es: "carta de reconocimiento", en: "recognition letter" },
  constanciaServicio: { es: "constancia de servicio", en: "proof of service" },
  traslado: { es: "carta de traslado", en: "transfer letter" },
  personalizada: { es: "carta", en: "letter" },
};

function nombreTipo(tipo: string, idioma: string): string {
  const t = TIPOS[tipo] ?? TIPOS.personalizada;
  return idioma === "en" ? t.en : t.es;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY no configurada." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    // modo: "carta" (default, devuelve {html}) | "acta" | "resumen" ({texto}).
    const modo = body.modo === "acta" || body.modo === "resumen" ? body.modo : "carta";
    const tipo = String(body.tipo ?? "personalizada");
    const puntos = String(body.puntos ?? "").trim();
    const iglesia = String(body.iglesia ?? "").trim();
    const destinatario = String(body.destinatario ?? "").trim();
    const pastor = String(body.pastor ?? "").trim();
    const idioma = body.idioma === "en" ? "en" : "es";
    const esES = idioma === "es";

    let sistema: string;
    let usuario: string;

    if (modo === "resumen") {
      // Los NÚMEROS vienen ya calculados por la app; la IA solo los narra.
      const datos = String(body.datos ?? "").trim();
      if (!datos) return json({ error: "Faltan los datos del reporte." }, 400);
      sistema = esES
        ? `Eres el asistente de tesorería de una iglesia cristiana. Convierte cifras en un ` +
          `resumen breve en español, listo para leerse en una asamblea: claro, cálido y profesional. ` +
          `REGLA ABSOLUTA: usa ÚNICAMENTE los números que se te dan, tal cual; NUNCA inventes, ` +
          `estimes ni redondees cifras. Máximo dos párrafos, texto plano sin HTML ni listas.`
        : `You are the treasury assistant of a Christian church. Turn figures into a short ` +
          `summary in English, ready to read at an assembly: clear, warm, and professional. ` +
          `ABSOLUTE RULE: use ONLY the numbers provided, exactly as given; NEVER invent, ` +
          `estimate, or round figures. Two paragraphs max, plain text without HTML or lists.`;
      usuario = (esES ? `Resume estas cifras del mes:\n` : `Summarize these monthly figures:\n`) + datos;
    } else if (modo === "acta") {
      if (!puntos) return json({ error: "Faltan los puntos a redactar." }, 400);
      const titulo = String(body.titulo ?? "").trim();
      sistema = esES
        ? `Eres quien redacta las actas de reunión de una iglesia cristiana, en español. ` +
          `A partir de los puntos tratados, escribe el DESARROLLO del acta: prosa formal en ` +
          `tercera persona y en pasado ("se presentó…", "se acordó…"), ordenada y objetiva. ` +
          `NO incluyas encabezado, fecha, lista de asistentes ni firmas: eso lo pone la app. ` +
          `NUNCA inventes cifras, nombres ni acuerdos que no estén en los puntos. ` +
          `Devuelve texto plano en párrafos (sin HTML ni viñetas).`
        : `You write board meeting minutes for a Christian church, in English. From the points ` +
          `discussed, write the BODY of the minutes: formal third-person past-tense prose ` +
          `("it was presented…", "it was agreed…"), orderly and objective. ` +
          `Do NOT include a header, date, attendee list, or signatures: the app adds those. ` +
          `NEVER invent figures, names, or agreements not present in the points. ` +
          `Return plain text paragraphs (no HTML, no bullets).`;
      const ctxA: string[] = [];
      if (iglesia) ctxA.push(esES ? `Iglesia: ${iglesia}.` : `Church: ${iglesia}.`);
      if (titulo) ctxA.push(esES ? `Reunión: ${titulo}.` : `Meeting: ${titulo}.`);
      usuario =
        (esES ? `Redacta el desarrollo del acta.\n` : `Draft the body of the minutes.\n`) +
        (ctxA.length ? (esES ? `Contexto:\n` : `Context:\n`) + ctxA.map((c) => `- ${c}`).join("\n") + `\n` : "") +
        (esES ? `\nPuntos tratados:\n${puntos}` : `\nPoints discussed:\n${puntos}`);
    } else {
      if (!puntos) return json({ error: "Faltan los puntos a redactar." }, 400);
      sistema = esES
        ? `Eres un asistente que redacta cartas formales para una iglesia cristiana en español. ` +
          `Escribe SOLO el cuerpo de la carta (los párrafos centrales), en tono cálido, respetuoso y formal. ` +
          `NO incluyas encabezado, membrete, fecha, saludo inicial, despedida ni firmas: esos los agrega la app. ` +
          `NUNCA inventes cifras de dinero, fechas exactas ni datos que no te den. ` +
          `Devuelve el resultado como HTML simple: uno o varios <p>…</p>, sin estilos, sin <html> ni <body>.`
        : `You are an assistant that drafts formal letters for a Christian church, in English. ` +
          `Write ONLY the body of the letter (the central paragraphs), in a warm, respectful, formal tone. ` +
          `Do NOT include a header, letterhead, date, greeting, closing, or signatures: the app adds those. ` +
          `NEVER invent money figures, exact dates, or data you were not given. ` +
          `Return the result as simple HTML: one or more <p>…</p>, no styles, no <html> or <body>.`;

      const ctx: string[] = [];
      ctx.push(esES ? `Tipo de documento: ${nombreTipo(tipo, idioma)}.` : `Document type: ${nombreTipo(tipo, idioma)}.`);
      if (iglesia) ctx.push(esES ? `Iglesia: ${iglesia}.` : `Church: ${iglesia}.`);
      if (destinatario) ctx.push(esES ? `Destinatario / persona: ${destinatario}.` : `Recipient / person: ${destinatario}.`);
      if (pastor) ctx.push(esES ? `Pastor: ${pastor}.` : `Pastor: ${pastor}.`);

      usuario =
        (esES
          ? `Redacta el cuerpo de una ${nombreTipo(tipo, idioma)}.\n\nContexto:\n`
          : `Draft the body of a ${nombreTipo(tipo, idioma)}.\n\nContext:\n`) +
        ctx.map((c) => `- ${c}`).join("\n") +
        (esES ? `\n\nPuntos que debe incluir:\n${puntos}` : `\n\nPoints it must include:\n${puntos}`);
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1500,
        thinking: { type: "adaptive" },
        system: sistema,
        messages: [{ role: "user", content: usuario }],
      }),
    });

    if (!resp.ok) {
      const detalle = await resp.text().catch(() => "");
      return json({ error: `Anthropic ${resp.status}`, detalle }, 502);
    }

    const data = await resp.json();
    const bloques: any[] = Array.isArray(data?.content) ? data.content : [];
    const texto = bloques
      .filter((b) => b?.type === "text")
      .map((b) => String(b.text ?? ""))
      .join("\n")
      .trim();

    if (!texto) return json({ error: "Respuesta vacía de la IA." }, 502);

    // acta / resumen: texto plano tal cual (van a un <textarea> o a un párrafo).
    if (modo === "acta" || modo === "resumen") {
      return json({ texto: texto.replace(/<[^>]+>/g, "") });
    }

    // carta: HTML simple. Salvaguarda: si vino texto plano, se envuelve en <p>.
    let html = texto;
    if (!/</.test(html)) {
      html = html
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, " ").trim()}</p>`)
        .join("");
    }
    return json({ html });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
