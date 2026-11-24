# lf-holder-metrics

Datos de telemetría opt-in del plugin `lf` (`lefebvriano-holder`). Los informes llegan como issues abiertas por `/lf:telemetry send` y una GitHub Action los valida y archiva aquí.

## Qué se recoge

Un informe agregado y anónimo por envío (schema 1, lista blanca en [`schema/telemetry-schema.json`](schema/telemetry-schema.json)):

- versión del plugin, variante (`private`/`public`), perfil y frecuencia;
- periodo cubierto (`from`/`to`);
- cuentas de sesiones, peticiones y turnos, y tokens (entrada, salida, caché);
- contexto del primer turno y % de sesiones con autocompact;
- número de `ask`/`deny` de permisos y de errores de hooks.

**Nunca** texto de conversaciones, rutas, nombres de proyecto ni ids de sesión. Cualquier clave fuera del schema aborta el envío en el cliente y se rechaza aquí.

La issue la abre la cuenta de GitHub de quien envía, así que esa cuenta es visible. El envío es siempre manual, con vista previa (`/lf:telemetry preview`) y confirmación. Se desactiva con `/lf:telemetry off`.

## Estructura de los datos

```
<proyecto>/<versión>/<timestamp>-<issue>/report.json
```

- `<proyecto>`: `lefebvriano-holder` (variante `private`) o `lefebvriano-holder-public` (`public`).
- `<versión>`: `plugin_version` del informe, p. ej. `1.0.2`.
- `<timestamp>`: `period.to` en formato compacto (`20261124T101500Z`); `<issue>` es el número de la issue de origen y evita colisiones.

## Ingesta

`.github/workflows/ingest.yml` se dispara al abrir una issue cuyo título empieza por `telemetry `:

1. `scripts/ingest.mjs` extrae el bloque ` ```json `, lo valida contra el schema y escribe `report.json`.
2. Si es válido, hace commit en `main` y cierra la issue como completada; si no, comenta los errores y la cierra como no planificada.

El cuerpo de la issue se trata como entrada no confiable: se lee del fichero del evento, nunca se interpola en un shell, y la ruta de salida se construye solo con campos validados.

## Mantenimiento

- `schema/telemetry-schema.json` y `validate()` de `scripts/ingest.mjs` son copia de `plugins/lf/scripts/` del arnés: al cambiar el schema allí, actualizar aquí.
- Probar en local: `GITHUB_EVENT_PATH=<evento.json> node scripts/ingest.mjs` (con `GITHUB_OUTPUT` sin definir, imprime el resultado por stdout).
- Etiqueta `telemetry`: la usa el cliente al crear la issue. Los envíos desde cuentas sin rol *Triage* pueden no poder aplicarla.
