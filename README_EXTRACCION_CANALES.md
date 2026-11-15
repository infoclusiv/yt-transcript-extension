# Extracción por canal — edición local 1.7.5

Esta variante amplía la extensión `1.7.1` recibida con una página de administración para descargar, por lotes, transcripciones disponibles de un canal de YouTube. **No modifica el motor original de extracción individual** y no requiere servicios nuevos, cuenta de pago ni clave personal de la API oficial de YouTube.

## Instalación en Chrome

1. Descomprime `youtube-transcript-canal-v1.7.5-completa.zip`.
2. En Chrome abre `chrome://extensions` y activa **Modo de desarrollador**.
3. Haz clic en **Cargar descomprimida** y selecciona la carpeta que contiene `manifest.json` (en el ZIP, `youtube-transcript-canal-v1.7.5/`).
4. Fija la extensión en la barra de Chrome, haz clic sobre el icono y selecciona **Transcribir canal completo**.

**Importante:** se eliminaron los campos `key` y `update_url` del `manifest.json` original para que esta modificación se instale como **extensión local independiente**, sin reemplazar ni recibir actualizaciones automáticas de la versión procedente de Chrome Web Store. Esto también significa que los ajustes e historial de la extensión anterior no se migran automáticamente a esta instalación, ya que Chrome les asigna almacenamiento separado. El motor original conserva su código y, donde se use, sus servicios/limitaciones preexistentes.

## Uso

1. Escribe la URL del canal, por ejemplo `https://www.youtube.com/@canal`, o solo `@canal`.
2. Selecciona las secciones: Videos, Shorts, Directos archivados.
3. Elige **Todo el canal** o un lote de 25, 50 o 100 videos; ajusta el intervalo entre videos (3, 5 o 10 segundos).
4. Pulsa **Iniciar extracción**. El gestor busca **un grupo de publicaciones**, guarda sus videos, abre una pestaña **silenciada** para extraer sus subtítulos **uno por uno**, y solo después solicita el siguiente grupo. No es necesario hacer clic en videos individuales.
5. Mantén abierta la pestaña del gestor y Chrome. Puedes **Pausar**, **Continuar canal completo**, **Reintentar errores** o **Buscar videos nuevos** en otro momento.
6. Pulsa **Descargar ZIP** para obtener un `.txt` por video, `indice.csv`, `errores.csv` y `LEEME.txt`. O usa **Descargar JSONL** para analizar textos con software o IA.

## Dónde se guarda la información

- Las transcripciones, títulos, estados de error y trabajos se conservan **localmente** en IndexedDB del perfil de Chrome y de esta instalación de la extensión.
- El trabajo de procesamiento se realiza en la página del gestor, no en un servicio externo ni mediante tareas permanentemente activas del navegador.
- Si cierras esa página, el trabajo se detiene; al volver, se recupera como pausado. Los videos completados quedan guardados. Los que habían quedado `processing` vuelven a `pending`.
- Si cambias de perfil de Chrome, los datos no se sincronizan por sí solos. Exporta los resultados antes de desinstalar la extensión o borrar sus datos.
- Cuando se procesa nuevamente un canal, se añaden los videos nuevos y se conservan los ya completados, sin extraerlos otra vez. El botón **Reintentar errores** reintenta solo los errores.

## Alcance y límites

- Solo admite canales accesibles públicamente en YouTube. Los videos borrados, privados, exclusivos de miembros, restringidos o sin subtítulos suelen fallar.
- Este sistema **extrae subtítulos ya disponibles**; no utiliza reconocimiento de audio para fabricar transcripciones de videos sin subtítulos.
- La interfaz de YouTube y sus endpoints internos no son una API pública estable; cambios futuros en la plataforma pueden romper el listado o la extracción. Si la exploración de una sección falla, el gestor muestra que está incompleta y permite reintentar, en lugar de indicar incorrectamente que enumeró todo el canal.
- Los Shorts y directos archivados tienen mayores probabilidades de no contar con subtítulos recuperables.
- Para evitar sobrecarga se ejecuta **un video a la vez**, con un intervalo configurable; las páginas de listado se espacian un mínimo de 5 segundos. La cantidad por sesión se aplica al total de videos intentados durante la sesión, no por página. Se pausa si detecta límites de solicitudes o cinco errores de red consecutivos.
- Los grandes archivos ZIP se generan sin compresión para no depender de librerías externas. La exportación permite descargar todos los completados (hasta 5000 por ZIP) o los últimos 100. Para volúmenes muy altos, usa JSONL o divide la descarga.
- Se mantiene el comportamiento que ya tenía la extensión para mostrar/copiar/exportar transcripciones individuales y sus funciones originales. **No se han realizado pruebas en vivo contra YouTube desde este entorno**; se verificaron por pruebas locales la paginación, formatos de respuesta simulados y la integridad del ZIP. Haz primero una prueba con un canal pequeño.

## Archivos nuevos

- `channel-batch/channel-batch.html` — gestor
- `channel-batch/channel-batch.css` — diseño
- `channel-batch/discovery.js` — lectura de secciones y continuación de videos
- `channel-batch/db.js` — IndexedDB local
- `channel-batch/channel-batch.js` — cola, pestaña silenciada, pausa, reanudación, métricas
- `channel-batch/export.js` — ZIP local y JSONL
- `channel-batch/popup-link.js` — acceso desde el popup original

## Modificados

- `manifest.json` — versión 1.7.5, permiso `tabs`, eliminación de actualización y clave de Web Store
- `popup.html` — botón adicional que abre el gestor

## Pruebas sugeridas tras instalar

1. Prueba un canal pequeño con menos de diez videos y verifica el conteo de la pestaña Videos.
2. Comprueba que al extraer un video con subtítulos se produce su `.txt` dentro del ZIP.
3. Confirma que un video sin subtítulos figura como fallo, sin detener toda la sesión.
4. Pausa y vuelve a abrir el gestor: los completados deben permanecer y solo continuar los pendientes.
5. Prueba un canal con más de 30 videos para verificar que la paginación recupera más que la primera página.

## Arquitectura incremental y actualización 1.7.5

Consulta también `README_ACTUALIZACION_1.7.5.md`. A partir de esta versión se procesan los videos guardados antes de reanudar el listado, y cada página de listado es procesada antes de solicitar la siguiente. Se registran diagnósticos de errores de listado y subtítulos. El usuario puede reintentar explícitamente un listado fallido desde «Buscar videos nuevos».

### Recuperación de canales detenidos en los primeros 32 videos

Al abrir por primera vez un trabajo creado con v1.7.4 o anterior, v1.7.5 reinicia **solo** el estado de exploración. Las filas de videos existentes, transcripciones terminadas y estados de error se conservan en la misma IndexedDB. El usuario pulsa «Continuar canal completo» y se vuelve a recorrer el listado: los videos ya conocidos no se vuelven a transcribir.

La continuación se solicita desde una pestaña ordinaria de YouTube, con el mismo origen de la página, y no desde el origen `chrome-extension://` que utilizaba la versión anterior. Si la solicitud falla, el gestor intenta recorrer la página visual del canal desplazándola como lo haría un usuario; durante ese recorrido puede **abrirse una pestaña visible de YouTube**. Si no se consigue cargar más contenido, se muestra un error y no se declara terminado el canal.

Cuando todavía hay secciones sin explorar, el porcentaje se refiere solo a los videos encontrados. El número total del canal puede ser mayor. Se mantiene el intervalo entre videos y el procesamiento incremental, con la misma persistencia local.
