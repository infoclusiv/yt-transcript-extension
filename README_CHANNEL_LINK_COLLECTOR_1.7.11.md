# Integración: Channel Link Collector · v1.7.11

Se añade una modalidad **Recopilar enlaces de canal** sin cambiar los gestores existentes de transcripción por canal, por enlaces ni Watch Later.

## Acceso

1. Instala o actualiza la extensión desde la carpeta raíz que contiene `manifest.json`.
2. Abre `https://www.youtube.com/@canal/videos` en una pestaña de Chrome.
3. Desde el popup, pulsa **Recopilar enlaces de canal**, o usa la nueva opción en la navegación de los gestores.
4. Selecciona la pestaña Videos; pulsa **Recopilar canal** para recorrer los videos disponibles o **Solo visibles** para recopilar las tarjetas cargadas.
5. Filtra por antigüedad (fecha relativa aproximada), busca títulos, excluye videos y copia lotes de hasta 50 enlaces, una URL por línea, para NotebookLM.

## Integración

- `channel-links/scanner.js`: script de contenido independiente. Lee únicamente la sección Videos de canales, valida IDs de 11 caracteres, conserva los enlaces descubiertos en un Map mientras se desplaza, acepta cancelación y reporta progreso. No modifica los scripts de transcripción.
- `channel-links/collector.html`, `collector.css`, `collector.js`: gestor de recopilación, revisión y copiado.
- `manifest.json`: registra el script de contenido y actualiza la versión a 1.7.11.
- `popup.html` + `channel-batch/popup-link.js`: agrega acceso desde el popup.
- Gestores existentes: agregan un enlace de navegación a la nueva modalidad.

## Datos y comportamiento

Los resultados se guardan en `chrome.storage.local`, bajo una clave independiente por URL canónica del canal. Se conservan exclusiones y marcas de videos cuyos enlaces se copiaron. Los duplicados se comparan por ID de video. El historial de transcripciones en IndexedDB no se toca.

**Importante:** una marca de copia solo indica que el enlace se escribió en el portapapeles; no prueba que NotebookLM importó la fuente. El límite de 50 es un ajuste intencional del flujo, no un límite universal de los planes NotebookLM.

## Alcance y limitaciones

- Solo recopila la pestaña **Videos**, no Shorts ni Streams; las modalidades actuales del proyecto continúan encargándose de esos casos.
- La antigüedad se basa en etiquetas relativas de YouTube (por ejemplo «hace 3 meses»), no en una fecha de publicación exacta. Los valores guardados pueden quedar desactualizados; vuelve a escanear el canal para actualizarlos.
- La finalización del scroll significa que no se observaron más elementos en la interfaz durante varias rondas; **no garantiza** que YouTube haya entregado todo el catálogo.
- YouTube puede cambiar sus elementos HTML y su carga diferida. Si queda un marcador de continuación visible, el sistema advierte que la exploración puede estar incompleta.
- El escaneo depende de una pestaña de YouTube abierta y cargada. Para canales muy grandes, el almacenamiento local de Chrome también impone límites.
- No se consultan endpoints remotos propios ni se necesitan nuevas claves de API.

## Comprobaciones realizadas

- Revisados el manifiesto, el popup y las rutas de navegación existentes.
- Sintaxis JavaScript de `scanner.js`, `collector.js` y `popup-link.js`: correcta.
- Todos los identificadores DOM usados por el nuevo gestor existen en `collector.html`.
- El manifiesto referencia el escáner; el popup tiene botón y manejador.

**Pendiente de validar en Chrome real:** escaneo de canales pequeños y grandes, carga incremental, pestañas en segundo plano, copiado al portapapeles y regresiones del popup. No se afirma que la funcionalidad esté probada extremo a extremo en YouTube.
