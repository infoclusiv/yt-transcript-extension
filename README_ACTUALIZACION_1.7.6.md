# YouTube Transcript 1.7.6 — Extraer transcripciones pegando enlaces

## Nueva modalidad: «Por enlaces»

Desde el popup de la extensión, selecciona **Transcribir videos por enlaces**, o abre el gestor «Por canal» y cambia a la pestaña **Por enlaces**.

1. Pega una URL por línea, o varias separadas por espacios o comas. Se admiten enlaces `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`, `youtube.com/live/...` y enlaces `embed` válidos. Puedes mezclar videos de diferentes canales.
2. Pulsa **Añadir a la lista** para preparar la cola en varias tandas, o **Extraer todas las transcripciones** para añadir los enlaces escritos y comenzar inmediatamente.
3. La extracción se realiza **secuencialmente**, reutilizando el motor de subtítulos de la extensión original. Las pausas entre videos se pueden configurar en 3, 5 o 10 segundos (5 por defecto). Estas pausas no garantizan evitar restricciones de YouTube.
4. La lista registra `Completado`, `Pendiente` o `Sin transcripción / error`. Un video sin subtítulos se registra como error y no interrumpe los demás. Se detiene ante bloqueos de acceso o varios errores consecutivos.
5. Pulsa **Descargar ZIP de todas** para guardar un `.txt` por video con subtítulos, `indice.csv`, `errores.csv` y `LEEME.txt`, o **Descargar JSONL** para usar el texto con otros sistemas.
6. Si necesitas otra colección, pulsa **Nueva lista**. Las anteriores permanecen accesibles en **Listas anteriores**. Las listas y transcripciones viven en IndexedDB local del perfil de Chrome, no en la nube.

Los enlaces duplicados se omiten sin sobrescribir las transcripciones guardadas. Puedes pausar y reanudar sin volver a extraer videos completados. Si un video falló, **Reintentar errores** volverá a intentarlo. Mientras haya fallos, también puedes descargar los resultados que sí se obtuvieron.

## Instalación conservando datos previos

Si utilizas **v1.7.5**, instala el archivo **parche**: descomprímelo y copia el **contenido de la carpeta `parche/`** encima de la carpeta de la extensión que ya cargas desde `chrome://extensions`, reemplazando archivos cuando corresponda. En `chrome://extensions` pulsa **Recargar**.

**No desinstales la extensión ni la vuelvas a cargar desde otra carpeta** si necesitas conservar las transcripciones anteriores. El almacenamiento está ligado al ID y perfil de la extensión. Se preservan las funciones de transcripción individual y por canal. Antes de actualizar, descarga un ZIP de respaldo de tus transcripciones importantes.

Para instalaciones completamente nuevas, descomprime el ZIP **completo**, visita `chrome://extensions`, activa **Modo de desarrollador** y usa **Cargar descomprimida**, eligiendo la carpeta que contiene `manifest.json`.

## Consideraciones

- Requiere mantener abierta la pestaña del gestor durante la extracción. No es una tarea en segundo plano.
- Solo obtiene subtítulos accesibles existentes en YouTube. No convierte audio en texto.
- YouTube puede limitar las solicitudes o cambiar su interfaz. HTTP 403/429 no se soluciona garantizadamente con pausas.
- Las transcripciones de «Por canal» y «Por enlaces» se almacenan en listas separadas; la interfaz del canal no mezcla las listas manuales.
- Esta versión se validó con pruebas locales simuladas de cola, persistencia, URLs, extracción compartida y generación ZIP. La disponibilidad real de subtítulos en videos externos depende de YouTube.
