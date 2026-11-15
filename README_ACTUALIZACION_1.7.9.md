# YouTube Transcript v1.7.9 — corrección del menú de tres puntos

## Por qué no funcionaba v1.7.8

En el Home de YouTube se emplean tarjetas de video del tipo `yt-lockup-view-model` y botones con
la clase `ytLockupMetadataViewModelMenuButton`. El código v1.7.8 no reconocía esa clase.
Además, YouTube puede mostrar los menús como `yt-sheet-view-model` + `yt-list-view-model`,
y v1.7.8 solo soportaba `ytd-menu-popup-renderer`.

## Instalación sobre v1.7.8 (sin perder datos)

1. **Cierra todas las pestañas de YouTube** y haz una copia de tu carpeta actual de la extensión.
2. Descomprime este ZIP. Abre la carpeta `parche` y copia TODO su contenido al interior
   de la misma carpeta donde ya están el `manifest.json`, `popup.html`, `content.js` y `images/`
   de YouTube Transcript v1.7.8.
3. Acepta **reemplazar** `manifest.json`, `background.js`, `home-menu/home-menu.js` y
   `home-menu/home-menu.css`, y conserva los demás archivos. No copies solo el archivo ZIP
   dentro de la carpeta: hay que extraer el contenido y combinar las carpetas.
4. En `chrome://extensions`, activa el modo desarrollador si no lo está, pulsa **Recargar**
   en YouTube Transcript. Confirma que la versión dice **1.7.9**.
5. Abre `https://www.youtube.com/` y prueba el menú ⋮ de un video de la página inicial.

No elimines la extensión ni la cargues desde una carpeta diferente si deseas conservar el
mismo ID y su almacenamiento local. La actualización no modifica el popup, los historiales
ni los procesos por lotes.

## Si sigue sin verse (diagnóstico rápido)

Con el menú de tres puntos abierto, pulsa F12, abre **Consola**, pega la expresión siguiente
y envíame su resultado. No recopila cookies, nombres de usuario ni transcripciones:

```js
(() => ({
  version: document.documentElement.dataset.ytTranscriptMenuVersion || 'script no cargado',
  estado: document.documentElement.dataset.ytTranscriptMenuState || 'sin estado',
  botones: document.querySelectorAll('.ytLockupMetadataViewModelMenuButton button, ytd-menu-renderer button').length,
  menusNuevos: document.querySelectorAll('ytd-popup-container yt-sheet-view-model').length,
  menusClasicos: document.querySelectorAll('ytd-menu-popup-renderer').length,
  opciones: document.querySelectorAll('.transcript-home-menu-item').length
}))()
```

Si `script no cargado`, verifica la ruta de `home-menu/home-menu.js` y revisa los errores en
`chrome://extensions` > YouTube Transcript > **Errores**. Si el estado queda en
`video-id-not-found` o `waiting-for-popup`, el HTML de tu variante de YouTube requiere un
ajuste adicional. Puedes copiar solo las etiquetas y clases del elemento del menú, sin
compartir cookies, tokens o datos de cuenta.

## Pruebas de esta actualización

- `node --check home-menu/home-menu.js`
- `node --check home-menu/background.js`
- `node --check background.js`
- `node tests/test-home-menu-background.js`
- `python tests/test-home-menu-browser.py` (Playwright + Chromium instalados)

Las pruebas de DOM se ejecutan con interfaces simuladas de ambas generaciones de YouTube.
No fue posible comprobar la integración en tu sesión real: YouTube tiene variantes de interfaz
según el navegador y la cuenta.
