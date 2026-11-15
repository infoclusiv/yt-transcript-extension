# YouTube Transcript v1.7.7 — Watch Later

Se incorpora una cuarta modalidad: **Transcribir desde Watch Later**. Se mantienen las tres opciones anteriores: video individual, canal completo y enlaces pegados.

## Uso

1. Inicia sesión en YouTube desde el mismo perfil de Chrome donde tienes instalada la extensión.
2. Abre el popup de YouTube Transcript y pulsa **Transcribir desde Watch Later**. También encontrarás la modalidad en las pestañas del gestor por canal y por enlaces.
3. Pulsa **Sincronizar Watch Later**. La extensión reutiliza una pestaña de `https://www.youtube.com/playlist?list=WL` si ya está abierta o crea una pestaña temporal. Lee los elementos que YouTube muestra en tu sesión y desplaza la página para intentar descubrir el resto. **No utiliza la API privada de YouTube, no extrae cookies y no modifica tu playlist.**
4. En la lista importada, usa el **buscador** para filtrar por título/canal, selecciona los videos uno por uno con sus casillas o pulsa **Seleccionar resultados** para marcar los que coinciden con el filtro actual. **Desmarcar resultados** también respeta el filtro.
5. Pulsa **Extraer seleccionados**. La extracción es secuencial (pausas de 3, 5 o 10 segundos), almacena cada transcripción localmente y anota los casos sin subtítulos o con error. Puedes pausar y reanudar los seleccionados pendientes.
6. Pulsa **Descargar ZIP** (un TXT por video, `indice.csv` y `errores.csv`) o **Descargar JSONL**. La descarga incluye solo transcripciones completadas de los videos que estén **seleccionados** en ese momento.
7. Puedes repetir **Sincronizar Watch Later** para incorporar videos nuevos. Los registros que ya existían, sus transcripciones, sus errores y las casillas seleccionadas se conservan. También puedes usar **Nueva colección** para aislar distintos conjuntos de videos, por ejemplo si alternas cuentas de YouTube en un perfil de Chrome.

## Instalación mediante parche (v1.7.6 → 1.7.7)

1. Antes de actualizar, descarga un ZIP de respaldo de tus transcripciones importantes.
2. Extrae `youtube-transcript-parche-v1.7.7.zip`.
3. Copia **todo el contenido de `parche/`** en tu carpeta actual de la extensión y reemplaza los archivos correspondientes.
4. En `chrome://extensions`, pulsa **Recargar** sobre la misma instalación. **No desinstales la extensión ni cargues una copia distinta desde otra carpeta** si necesitas mantener el almacenamiento local asociado a su ID.

Para instalación desde cero, descomprime el ZIP completo y utiliza **Cargar descomprimida** sobre la carpeta que contiene `manifest.json`.

## Limitaciones y privacidad

- No es necesario abrir DevTools ni pegar códigos en la consola.
- Watch Later es una lista **privada**, por lo que debe abrirse con tu sesión de YouTube iniciada; la extensión no puede leerla desde otra cuenta o navegador.
- YouTube carga los videos de la playlist bajo demanda. Si la interfaz cambia, se solicita iniciar sesión o deja de cargar más elementos, la sincronización puede quedar incompleta. En ese caso se informa al usuario, sin eliminar los videos ya importados.
- Se requiere mantener abierta la pestaña del gestor durante la sincronización y la extracción. La extensión puede abrir o activar una pestaña de YouTube para hacer la lectura y cerrará únicamente las pestañas temporales que ella misma abrió.
- No se elimina nada de Watch Later y la selección no modifica los videos guardados en YouTube.
- El motor existente solo obtiene subtítulos que YouTube ofrece para cada video; no transcribe audio sin subtítulos.
- Las colecciones y transcripciones se almacenan **localmente** en IndexedDB, en el perfil de Chrome; no se sincronizan a la nube por esta función.
- Las pruebas automatizadas cubren HTML/DOM simulado, controles de selección, persistencia, sincronización repetida, resultados sin subtítulos y exportación. No sustituyen una prueba real con una cuenta de YouTube iniciada.
