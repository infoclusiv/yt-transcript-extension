# YouTube Transcript v1.7.8 — Copiar transcripción desde el inicio

## Qué cambia

Cuando se abre el menú de tres puntos de una tarjeta de video en la **página principal de YouTube**, aparece una nueva opción integrada: **Copiar transcripción** (o **Copy transcript** si la interfaz de YouTube está en inglés).

Al pulsarla, la extensión:

1. Identifica el video específico seleccionado, sin navegar el feed principal.
2. Abre una pestaña **inactiva y temporal** para utilizar **el mismo motor de subtítulos** que emplean actualmente los módulos de videos por lotes.
3. Cierra la pestaña temporal tanto si la extracción funciona como si falla.
4. Copia el texto plano de la transcripción al portapapeles automáticamente.
5. Muestra un aviso breve de éxito/error. Si Chrome rechaza el portapapeles, ofrece **Copiar ahora** para reintentar con un clic.

No modifica el popup, el panel lateral, los procesos por canal/enlaces/Watch Later ni sus datos guardados. No usa un servicio de transcripción externo, no transcribe audio sin subtítulos y no envía el texto a un servicio adicional por esta función.

## Instalar el parche sin perder el ID ni los datos

**NO desinstales la extensión existente ni la sustituyas por otra carpeta si quieres conservar sus datos locales.**

1. Haz una copia de seguridad de la carpeta de la extensión actual y de las transcripciones importantes que tengas guardadas.
2. Descomprime el ZIP `youtube-transcript-parche-v1.7.8.zip`.
3. Copia **el contenido de `parche/`** dentro de la **misma carpeta** de la extensión v1.7.7, donde está su `manifest.json`. Acepta reemplazar `manifest.json` y `background.js` y permite crear `home-menu/`.
4. Abre `chrome://extensions`, busca YouTube Transcript y pulsa **Recargar**. Si Chrome muestra que la extensión requiere permiso para modificar lo copiado en el portapapeles, apruébalo. Esta versión solo añade el permiso `clipboardWrite`, no `clipboardRead`.
5. Recarga `https://www.youtube.com/` (Ctrl+R), abre los tres puntos de un video y pulsa **Copiar transcripción** / **Copy transcript**.
6. Pega con Ctrl+V donde desees.

## Archivos nuevos y modificados

- `manifest.json` (versión 1.7.8, permiso `clipboardWrite`, CSS y content script en YouTube).
- `background.js` (únicamente importa el motor existente y el nuevo listener).
- `home-menu/home-menu.js` (reconoce tarjetas, menú y copia con feedback).
- `home-menu/home-menu.css` (estilos con variables de temas claro/oscuro de YouTube).
- `home-menu/background.js` (extracción bajo petición desde un ID validado).
- `tests/test-home-menu-background.js` (tests del listener; Node.js).
- `tests/test-home-menu-browser.py` (tests DOM con Chromium simulado; requiere `playwright` para Python).

## Pruebas

- `node --check background.js`
- `node --check home-menu/background.js`
- `node --check home-menu/home-menu.js`
- `node tests/test-home-menu-background.js`
- `python tests/test-home-menu-browser.py` (requiere Playwright + Chromium instalado)

Las pruebas de DOM se realizaron contra una **interfaz simulada**, no contra YouTube en vivo. YouTube cambia su HTML con frecuencia; si el menú ya no utiliza `ytd-menu-popup-renderer`, habrá que ajustar el selector del nuevo módulo. La funcionalidad de extracción sigue dependiendo de que YouTube ofrezca subtítulos y permita obtenerlos.

## Si no aparece la nueva opción

Comprueba primero que estés en `https://www.youtube.com/` (Inicio), que la extensión esté recargada y que hayas recargado la pestaña de YouTube. Si sigue sin aparecer, abre la consola de Chrome en el Home, pulsa los tres puntos de un video y ejecuta:

```js
console.table({
  tarjetas: document.querySelectorAll('ytd-rich-grid-media').length,
  menues: document.querySelectorAll('ytd-menu-popup-renderer').length,
  opcionesInsertadas: document.querySelectorAll('.transcript-home-menu-item').length
});
```

Esos conteos, junto con una captura del menú abierto, sirven para adaptar la integración al HTML que YouTube esté mostrando en ese momento; no hace falta extraer datos privados ni cookies.
