// Resumen diario por email para la responsable de onboarding.
// Lo ejecuta la acción programada de GitHub (.github/workflows/resumen-diario.yml) cada mañana.
// Secretos necesarios (GitHub → Settings → Secrets and variables → Actions):
//   SUPABASE_URL          ej. https://abcdefghijk.supabase.co   (el mismo del dólar)
//   SUPABASE_SERVICE_KEY  clave "service_role"                  (la misma del dólar)
//   SMTP_USER             cuenta de Gmail que envía, ej. onboarding.liniers@gmail.com
//   SMTP_PASS             "contraseña de aplicación" de esa cuenta de Gmail (16 letras)
//   MAIL_TO               a quién le llega; varios separados por coma
// Opcionales: SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), PAGE_URL (link de la página).

import nodemailer from 'nodemailer';

const E = process.env;
const TZ = 'America/Argentina/Buenos_Aires';
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const pad = n => String(n).padStart(2, '0');
function addMonths(s, n) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1 + n, 1); const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(Math.min(d, dim))}`; }
function diffDays(a, b) { const pa = a.split('-').map(Number), pb = b.split('-').map(Number); return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000); }
const fdc = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—';
const fm = n => '$ ' + new Intl.NumberFormat('es-AR', {maximumFractionDigits: 0}).format(Math.round(n || 0));
const fu = n => 'US$ ' + new Intl.NumberFormat('es-AR', {maximumFractionDigits: 0}).format(Math.round(n || 0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const diaLargo = f => { const [y, m, d] = f.split('-').map(Number); return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`; };

// Mismos compromisos que en la página (las entrevistas viejas tienen un solo seguimiento).
function comps(e) {
  if (Array.isArray(e.compromisos)) return e.compromisos;
  if (e.seguimiento !== 'si' || !(e.seguimientoTipo || e.seguimientoDetalle)) return [];
  const mon = e.seguimientoMoneda || 'ARS';
  return [{id: 'c0', tipo: e.seguimientoTipo || 'otro', detalle: e.seguimientoDetalle || '', fecha: e.seguimientoFecha || '', monto: e.seguimientoMonto || 0, moneda: mon, ars: mon === 'MIX' ? e.seguimientoArs || 0 : 0, usd: mon === 'ARS' ? 0 : e.seguimientoMontoUsd || 0, resuelto: !!e.seguimientoResuelto}];
}
const conMonto = k => ['ahorro', 'incremento'].includes(k.tipo) && (k.monto || 0) > 0;
const montoTxt = k => k.moneda === 'MIX' ? `${fm(k.ars)} + ${fu(k.usd)}` : k.moneda === 'USD' && k.usd ? fu(k.usd) : fm(k.monto);
const TIPO = {ahorro: 'Ahorro', incremento: 'Incremento', otro: 'Pendiente'};

export function armarResumen(entrevistas, ajustes, t0 = hoy()) {
  const plazo = e => e.fecha ? addMonths(e.fecha, e.plazoMeses ?? ajustes.plazoMeses ?? 1) : '';
  const fin = entrevistas.filter(e => e.estado === 'final');
  const B = [];
  const rev = fin.filter(e => (e.revision?.estado || 'pendiente') === 'pendiente').sort((a, b) => (a.finalizado || a.fecha || '').localeCompare(b.finalizado || b.fecha || ''));
  B.push({em: '🔍', t: 'Entrevistas para revisar', d: 'Abrirlas y tocar Aprobar u Observar.', items: rev.map(e => [e.cliente || 'Sin nombre', `${e.especialista || '—'} · entrevista del ${fdc(e.fecha)}`])});
  const pagos = fin.flatMap(e => (e.gestiones || []).filter(g => (g.monto || 0) > 0 && g.rev && (g.rev.estado || 'pendiente') === 'pendiente' && g.fecha >= e.fecha && g.fecha <= plazo(e)).map(g => [e.cliente || 'Sin nombre', `${e.especialista || '—'} · ${g.tipo === 'ahorro' ? 'ahorro' : 'incremento'} pagado el ${fdc(g.fecha)} · ${g.moneda === 'USD' && g.montoUsd ? fu(g.montoUsd) : fm(g.monto)}`]));
  B.push({em: '💵', t: 'Pagos posteriores para aprobar', d: 'Lo que el cliente pagó después de la entrevista.', items: pagos});
  const pend = fin.flatMap(e => comps(e).filter(k => !k.resuelto).map(k => ({e, k, lim: plazo(e)})));
  const seg = pend.filter(x => x.k.fecha && x.k.fecha <= t0).sort((a, b) => a.k.fecha.localeCompare(b.k.fecha));
  B.push({em: '⏰', t: 'Seguimientos atrasados o para hoy', d: 'La fecha que pactó el cliente ya llegó.', items: seg.map(({e, k}) => { const d = diffDays(k.fecha, t0); return [e.cliente || '—', `${e.especialista || '—'} · ${conMonto(k) ? `${TIPO[k.tipo]} de ${montoTxt(k)}` : (k.detalle || 'Pendiente').slice(0, 80)} · ${d ? `atrasado ${d} ${d === 1 ? 'día' : 'días'}` : 'para hoy'}`]; })});
  const vence = pend.filter(x => conMonto(x.k) && !(x.k.fecha && x.k.fecha <= t0) && x.lim && x.lim >= t0 && diffDays(t0, x.lim) <= 7 && !(x.k.fecha && x.k.fecha > x.lim)).sort((a, b) => a.lim.localeCompare(b.lim));
  B.push({em: '🤝', t: 'Pactos que vencen esta semana', d: 'Si no pagan antes del límite, esa comisión se pierde.', items: vence.map(({e, k, lim}) => { const q = diffDays(t0, lim); return [e.cliente || '—', `${e.especialista || '—'} · ${k.tipo === 'ahorro' ? 'ahorro' : 'incremento'} de ${montoTxt(k)} · ${q ? `vence en ${q} ${q === 1 ? 'día' : 'días'}` : 'vence hoy'}`]; })});
  const viejo = (() => { const [y, m, d] = t0.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d - 2)); return x.toISOString().slice(0, 10); })();
  const borr = entrevistas.filter(e => e.estado !== 'final' && (e.actualizado || e.creado || '').slice(0, 10) <= viejo);
  B.push({em: '📝', t: 'Borradores olvidados', d: 'Quedaron a medias hace más de 2 días.', items: borr.map(e => [e.cliente || 'Sin nombre', `${e.especialista || '—'} · guardado el ${fdc((e.actualizado || '').slice(0, 10))}`])});
  const total = B.reduce((a, b) => a + b.items.length, 0);
  return {B, total, t0};
}

export function armarEmail({B, total, t0}, pageUrl) {
  const con = B.filter(b => b.items.length), sin = B.filter(b => !b.items.length);
  const asunto = total ? `Onboarding: ${total} ${total === 1 ? 'cosa' : 'cosas'} para revisar hoy` : 'Onboarding: todo al día';
  const bloque = b => `<tr><td style="padding:16px 20px;border-top:1px solid #E0E1E3">
      <div style="font:700 16px Arial,sans-serif;color:#1E2023">${b.em} ${esc(b.t)} <span style="display:inline-block;min-width:22px;padding:0 7px;border-radius:11px;background:#FDECEB;color:#C41F1C;font-size:13px;text-align:center">${b.items.length}</span></div>
      <div style="font:13px Arial,sans-serif;color:#65686C;margin:2px 0 8px">${esc(b.d)}</div>
      ${b.items.slice(0, 8).map(([a, s]) => `<div style="font:14px Arial,sans-serif;color:#1E2023;padding:5px 0"><b>${esc(a)}</b><br><span style="color:#65686C;font-size:13px">${esc(s)}</span></div>`).join('')}
      ${b.items.length > 8 ? `<div style="font:13px Arial,sans-serif;color:#65686C;padding-top:4px">Y ${b.items.length - 8} más.</div>` : ''}
    </td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#F5F5F6;padding:16px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #E0E1E3;border-radius:12px;overflow:hidden">
    <tr><td style="background:#E62D2A;padding:16px 20px;color:#fff;font:700 13px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase">Más Dueños · Onboarding<div style="font:800 21px Arial,sans-serif;letter-spacing:0;text-transform:none;margin-top:2px">Para revisar hoy</div></td></tr>
    <tr><td style="padding:14px 20px;font:14px Arial,sans-serif;color:#1E2023">${diaLargo(t0)[0].toUpperCase() + diaLargo(t0).slice(1)}. ${total ? `Hay <b>${total}</b> ${total === 1 ? 'cosa que necesita' : 'cosas que necesitan'} tu atención.` : '🎉 Todo al día: no hay nada pendiente.'}</td></tr>
    ${con.map(bloque).join('')}
    ${sin.length ? `<tr><td style="padding:12px 20px;border-top:1px solid #E0E1E3;font:13px Arial,sans-serif;color:#1B7A4A">✓ Al día: ${sin.map(b => esc(b.t.toLowerCase())).join(' · ')}</td></tr>` : ''}
    ${pageUrl ? `<tr><td style="padding:16px 20px 22px;border-top:1px solid #E0E1E3"><a href="${esc(pageUrl)}" style="display:inline-block;background:#E62D2A;color:#fff;text-decoration:none;font:700 15px Arial,sans-serif;padding:11px 20px;border-radius:999px">Abrir el panel</a></td></tr>` : ''}
  </table>
  <p style="max-width:600px;margin:10px auto 0;font:12px Arial,sans-serif;color:#878A8C;text-align:center">Lo manda solo la página de Onboarding PAI todas las mañanas. Los clientes en rojo y el detalle completo están en «Para revisar hoy».</p>
  </body></html>`;
  const texto = [`Para revisar hoy · ${diaLargo(t0)}`, '', ...con.flatMap(b => [`${b.t} (${b.items.length})`, ...b.items.slice(0, 8).map(([a, s]) => `- ${a}: ${s}`), '']), pageUrl ? `Abrir el panel: ${pageUrl}` : ''].join('\n');
  return {asunto, html, texto};
}

async function sb(path) {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/${path}`, {headers: {apikey: E.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_KEY}`}});
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SMTP_USER', 'SMTP_PASS', 'MAIL_TO']) if (!E[k]) throw new Error(`Falta el secreto ${k} en GitHub (Settings → Secrets and variables → Actions).`);
  const t0 = hoy();
  const desde = addMonths(t0.slice(0, 7) + '-01', -3);
  const rows = await sb(`onb_docs?col=eq.entrevistas&select=id,data&data->>fecha=gte.${desde}`);
  const aj = (await sb('onb_docs?col=eq.ajustes&id=eq.general&select=data'))[0]?.data || {};
  const res = armarResumen(rows.map(r => ({id: r.id, ...r.data})), aj, t0);
  if (!res.total && E.SOLO_SI_HAY === 'si') { console.log('Todo al día: no se envía el email.'); return; }
  const [owner, repo] = (E.GITHUB_REPOSITORY || '/').split('/');
  const pageUrl = E.PAGE_URL || (owner && repo ? `https://${owner}.github.io/${repo}/` : '');
  const m = armarEmail(res, pageUrl);
  const tr = nodemailer.createTransport({host: E.SMTP_HOST || 'smtp.gmail.com', port: +(E.SMTP_PORT || 465), secure: +(E.SMTP_PORT || 465) === 465, auth: {user: E.SMTP_USER, pass: E.SMTP_PASS.replace(/\s+/g, '')}});
  await tr.sendMail({from: `"Onboarding PAI" <${E.SMTP_USER}>`, to: E.MAIL_TO, subject: m.asunto, html: m.html, text: m.texto});
  console.log(`Listo: email enviado a ${E.MAIL_TO} · ${res.total} pendientes.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
