# Corrección 1.7.3 — HTTP 403 durante exploración del canal

## Problema detectado

La edición 1.7.2 detenía el procesamiento de todos los videos encontrados cuando el endpoint no oficial de paginación del canal devolvía HTTP 403. Este código de respuesta no demuestra por sí solo que la visualización de videos y sus transcripciones también esté bloqueada. Por ejemplo, podían haberse guardado 32 videos, todos pendientes, pero la extracción nunca empezaba.

## Cambios

- El motor de descubrimiento identifica si la solicitud fallida era la página del canal o una página adicional de paginación.
- Ante fallos de descubrimiento (incluido 403, excepto 429), se intenta un único recorrido alternativo de la página normal del canal: abre una pestaña de YouTube y se desplaza por las tarjetas cargadas por la propia interfaz. No cambia IP, no sortea inicios de sesión ni ejecuta solicitudes repetidas al endpoint denegado.
- Si ambos métodos de listado fallan con 403, no se vuelve a llamar automáticamente al endpoint denegado durante esa sesión; **sí se extraen las transcripciones de los videos ya encontrados**, uno por uno.
- HTTP 429 mantiene una pausa preventiva de todo el proceso. Otros problemas durante la extracción individual mantienen sus protecciones anteriores.
- **Procesar pendientes** ya no vuelve a explorar el canal automáticamente. Para reintentar descubrir otros videos, usa **Buscar videos nuevos**.
- Se conserva el indicador de «secciones por revisar» y las incidencias de listado: un conteo parcial no se presenta como el total verdadero del canal.

## INSTALACIÓN DE LA CORRECCIÓN SIN PERDER LOS 32 VIDEOS

**Recomendado:** usa `youtube-transcript-parche-v1.7.3.zip`, NO desinstales tu extensión actual.

1. Ubica la carpeta de la v1.7.2 que ya cargaste en `chrome://extensions` (ver **Detalles** de esa instalación).
2. Descomprime el parche y copia **los archivos y carpetas interiores de `parche/`** encima de tu carpeta existente, conservando la misma ruta. Acepta reemplazos de archivos. No borres otros archivos.
3. En `chrome://extensions` haz clic en **Recargar** sobre la extensión modificada.
4. Abre el gestor: deben permanecer los 32 videos encontrados, porque IndexedDB permanece en la misma instalación/ID de extensión.
5. Pulsa **Procesar pendientes**. No se intentará de nuevo la página de paginación bloqueada. Para explorar más, usa **Buscar videos nuevos** por separado.

**Importante:** no uses «Quitar» para instalarla de cero si necesitas conservar el progreso. Tampoco cargues una carpeta en una ruta distinta, pues Chrome puede asignar otro ID de extensión local y con ello otra IndexedDB.

## Versión completa

`youtube-transcript-canal-v1.7.3-completa.zip` contiene todos los archivos, para instalaciones nuevas. Al actualizar una instalación existente, utiliza el **parche** anterior.

## Limitaciones

- No se ha verificado el comportamiento en vivo con un canal real en YouTube; se probó la lógica con simulaciones locales, incluida la regresión de HTTP 403.
- El scroll depende de cómo YouTube presente sus tarjetas y puede terminar con una lista incompleta en ciertos canales. Se preserva la lista existente y los fallos se registran cuando se detectan.
- Si YouTube impide abrir los videos o acceder a sus subtítulos, esta modificación no puede garantizar que la extracción funcione. Deben existir subtítulos disponibles.
- Las transcripciones y resultados permanecen en el perfil de Chrome mientras la extensión siga instalada y sus datos no se borren. Exporta los resultados cuando sea posible.
