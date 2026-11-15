# Actualización v1.7.4 — Exploración y extracción incremental

## Qué cambia

La extensión **no busca primero todo el canal**. Desde esta versión, intercala los pasos:

1. Leer un grupo/página de publicaciones en **Videos**, **Shorts** o **Directos**.
2. Guardar inmediatamente cada video nuevo en IndexedDB.
3. Extraer las transcripciones de ese grupo **de una en una**, usando la pestaña normal de YouTube.
4. Esperar el intervalo seleccionado entre videos y un mínimo de 5 segundos antes de pedir la siguiente página de listado.
5. Repetir con la siguiente página hasta llegar al final, al límite de la sesión o a una pausa.

YouTube ya agrupa los videos en las respuestas de listado; no se hacen solicitudes nuevas para descubrir un video individual después de cada transcripción.

### Sesiones y reanudación

- **Lotes de 25/50/100:** el límite corresponde al **número total de videos intentados durante esa ejecución**, incluso si se consultaron varias páginas o secciones. Errores individuales también cuentan; el mismo video exitoso nunca se repite automáticamente.
- **Todo el canal:** procesa progresivamente mientras haya más videos, subtítulos y acceso de red. No hay garantía de completitud: depende de lo que YouTube exponga.
- **Procesar pendientes:** primero intenta los videos descubiertos que siguen pendientes; cuando ya no quedan, retoma la exploración de secciones incompletas cuya ruta **no** haya quedado marcada con error.
- **Buscar videos nuevos:** reinicia explícitamente el listado y permite reintentar rutas de exploración que habían fallado. No vuelve a transcribir videos exitosos.
- Si cierras la pestaña o Chrome, el trabajo se detiene. Al reabrirlo, los videos que quedaron `processing` vuelven a `pending` y los completados permanecen guardados.

### Protección ante errores

- Un **HTTP 403 del listado** no implica que estén bloqueadas todas las transcripciones. Se registra la ruta afectada, se intenta una vez la exploración por la página visible del canal cuando procede, y se conservan los videos ya procesados. La ruta fallida no se reintenta automáticamente hasta pulsar **Buscar videos nuevos**.
- Un **HTTP 429 de listado**, o indicios de límite de acceso al transcribir, detienen las solicitudes automáticas.
- Los videos sin subtítulos pasan a `failed` y se continúa con los siguientes.
- En **Diagnóstico técnico de solicitudes y errores** puedes revisar las últimas 120 entradas e incluirlas en un reporte. Solo se guardan rutas de solicitud sin cadenas de consulta, no claves de API.

**Importante:** no existe un intervalo garantizado para evitar HTTP 403 o HTTP 429. Si la plataforma no permite ciertas solicitudes, el intervalo no soluciona el problema. El código no intenta evadir esos límites.

## Actualizar SIN perder videos y transcripciones

**Si actualmente tienes la v1.7.2 o v1.7.3, usa `youtube-transcript-parche-v1.7.4.zip`.**

1. Abre `chrome://extensions` y ubica la carpeta instalada actualmente. No pulses **Quitar**.
2. Descomprime el parche. Copia **el contenido de la carpeta `parche/`** encima de los archivos de la misma carpeta donde ya está el `manifest.json`, reemplazando los archivos existentes.
3. En `chrome://extensions`, pulsa **Recargar** en la extensión existente.
4. Abre **Transcribir canal completo**, selecciona el canal previo si hace falta y pulsa **Procesar pendientes**.
5. Si la exploración previa quedó con 403, la lista conocida se procesará primero. Para intentar descubrir publicaciones adicionales, usa **Buscar videos nuevos** de forma explícita.

La actualización no cambia el nombre ni la versión de la base IndexedDB (`channel-transcripts-v1`), de modo que conserva el contenido **si se reemplazan archivos en la misma ruta e ID de extensión**. No traslades la carpeta cargada, pues Chrome podría asignar otro ID y separar los datos.

Para instalaciones nuevas puedes usar `youtube-transcript-canal-v1.7.4-completa.zip` y cargar su carpeta descomprimida desde `chrome://extensions` → **Cargar descomprimida**.

## Verificación local

Se pasaron pruebas automatizadas de validación de URL y formatos de listado, paginación, recuperación tras HTTP 403, alternativa mediante página visible, generación ZIP, intercalado de páginas y videos, cuota global de lote, persistencia de puntos de reanudación y no duplicación de transcripciones.

**No se probó el acceso en vivo al canal del usuario desde Chrome**. La ejecución real depende del comportamiento de YouTube, de los subtítulos disponibles y de los permisos de Chrome. Prueba primero con unos pocos videos y verifica el ZIP antes de una tarea grande.
