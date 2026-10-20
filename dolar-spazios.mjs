// Lee el "Dólar Spazios Ingreso" de spazios.com.ar/indices2 y lo guarda en Supabase.
// Lo ejecuta la acción programada de GitHub (.github/workflows/dolar-spazios.yml).
// Variables necesarias (GitHub → Settings → Secrets and variables → Actions):
//   SUPABASE_URL          ej. https://abcdefghijk.supabase.co
//   SUPABASE_SERVICE_KEY  clave "service_role" (solo en GitHub, nunca en la página)

const FUENTE = 'https://spazios.com.ar/indices2/';
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

const num = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const isoDe = s => { const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s; };

export function leerCotizaciones(html) {
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#8211;|&ndash;/g, '-').replace(/\s+/g, ' ');
  const re = /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\s+\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  const filas = new Map(); let m;
  while ((m = re.exec(texto))) {
    const fecha = isoDe(m[1]); const ingreso = num(m[2]); const egreso = num(m[3]);
    if (ingreso > 100 && egreso >= ingreso && !filas.has(fecha)) filas.set(fecha, {fecha, ingreso, egreso});
  }
  return [...filas.values()];
}

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Faltan los secretos SUPABASE_URL o SUPABASE_SERVICE_KEY en GitHub.');
  const res = await fetch(FUENTE, { headers: { 'User-Agent': 'Mozilla/5.0 (Onboarding PAI; actualizacion dolar)', 'Accept-Language': 'es-AR,es' } });
  if (!res.ok) throw new Error(`La página de Spazios respondió ${res.status}.`);
  const cot = leerCotizaciones(await res.text());
  if (!cot.length) throw new Error('No se encontró la tabla de cotizaciones en la página de Spazios (puede haber cambiado el diseño).');

  const existentes = await sb('onb_docs?col=eq.dolar&select=id,data');
  const mapa = new Map((existentes || []).map(x => [x.id, x.data]));
  const nuevos = cot.filter(c => { const e = mapa.get(c.fecha); if (!e) return true; if (e.fuente === 'manual') return false; return e.ingreso !== c.ingreso || e.egreso !== c.egreso; });
  if (nuevos.length) {
    const ahora = new Date().toISOString();
    await sb('onb_docs?on_conflict=col,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(nuevos.map(c => ({ col: 'dolar', id: c.fecha, data: { ...c, fuente: 'spazios.com.ar/indices2', actualizado: ahora }, updated_at: ahora }))) });
  }
  const ult = cot.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  console.log(`Listo: ${nuevos.length} fecha(s) agregadas o actualizadas. Último dólar Spazios ingreso: ${ult.fecha} → ${ult.ingreso}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
