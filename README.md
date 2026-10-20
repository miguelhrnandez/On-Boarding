# Onboarding PAI · versión web (GitHub Pages + Supabase)

Checklist de onboarding, entrevistas, avisos, comisiones y panel de la responsable.
La página se publica en GitHub Pages, los datos quedan en Supabase y el dólar Spazios
se actualiza solo con una acción programada de GitHub.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página completa. |
| `config.js` | La URL y la clave pública de Supabase. Es el único archivo que hay que editar. |
| `supabase.sql` | Crea las tablas, los permisos y el PIN de la responsable, y carga los datos que ya había en la versión de Claude. |
| `scripts/dolar-spazios.mjs` | Lee el "Dólar Spazios Ingreso" de spazios.com.ar/indices2 y lo guarda en Supabase. |
| `.github/workflows/dolar-spazios.yml` | Ejecuta ese script todos los días a las 11:47 y a las 17:47 (hora de Buenos Aires). |

## Paso 1 · Supabase

1. Entrar a supabase.com y abrir un proyecto. Puede ser uno nuevo o el que ya usas: las tablas se llaman `onb_docs` y `onb_pin`, así que no chocan con otras.
2. Ir a **SQL Editor → New query**, pegar todo el contenido de `supabase.sql` y tocar **Run**.
3. Ir a **Project Settings → API** y copiar:
   - **Project URL** (ej. `https://abcdefghijk.supabase.co`)
   - La clave **anon public**
   - La clave **service_role** (esta es secreta; se usa solo en el paso 3)

## Paso 2 · GitHub Pages

1. Abrir `config.js` y pegar la **Project URL** y la clave **anon public**.
2. Crear un repositorio en GitHub y subir todos los archivos **respetando las carpetas**. La carpeta `.github/workflows` tiene que quedar tal cual.
3. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**.
4. En uno o dos minutos la página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`. Ese es el link para el equipo.

## Paso 3 · Actualización automática del dólar

1. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**. Crear dos secretos:
   - `SUPABASE_URL` → la Project URL
   - `SUPABASE_SERVICE_KEY` → la clave **service_role**
2. Ir a la pestaña **Actions → Dólar Spazios → Run workflow** para probarlo una vez. Si termina en verde, ya queda funcionando solo todos los días.
3. En la página, el dólar aparece arriba a la derecha. Si pasan más de 4 días sin cotización nueva, la fecha se marca en naranja.

Si un día falla (por ejemplo, si Spazios cambia su página), la responsable puede cargar la cotización a mano en **Ajustes → Dólar Spazios**. La actualización automática no pisa las cotizaciones cargadas a mano.

## Primer uso

- La responsable entra, toca **Cambiar → Soy la responsable** y crea su PIN (de 4 a 6 números).
- En **Ajustes** carga los asesores OB, los asesores de ventas, las sucursales y las metas.
- Cada asesor OB entra con el link y elige su nombre.

## A tener en cuenta

- **Seguridad:** cualquiera que tenga el link puede usar la página. El PIN protege el modo responsable dentro de la página. Alguien con conocimientos técnicos podría escribir en la base usando la clave pública. Es el mismo nivel que el sistema de ventas. Si hace falta más control, se puede agregar un inicio de sesión con usuario y contraseña (Supabase Auth).
- **GitHub pausa las acciones programadas** si el repositorio pasa 60 días sin cambios. Si el dólar deja de actualizarse, entrar a **Actions** y tocar **Enable workflow**.
- **Supabase gratuito** pausa los proyectos sin actividad durante una semana. Con el uso diario y la actualización del dólar no debería pasar.
- **La clave service_role nunca va en `config.js`**: solo en los secretos de GitHub.
