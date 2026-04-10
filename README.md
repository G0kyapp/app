# AppDeals 🎯

Web funcional que muestra apps del App Store que están gratis, con descuento o con compras integradas (IAP) en oferta.

## Cómo funciona

Usa **dos fuentes de datos reales y gratuitas de Apple**:

1. **iTunes Search API** — Consulta precios reales de apps sin necesidad de API key.
2. **Apple Marketing Tools RSS Feed** — Feeds oficiales de Apple con el top 100 de apps gratis y pagas.

El cruce de estas dos fuentes permite detectar:
- Apps que **bajaron a $0** (gratis hoy)
- Apps con **precio reducido** (descuento)
- Apps con **compras integradas en oferta**

## Archivos

```
appdeals/
├── index.html   — Toda la interfaz
└── app.js       — Lógica de fetching y rendering
```

## Deploy (3 opciones)

### Opción 1 — Netlify (recomendado, gratis)
1. Entrá a https://netlify.com
2. Arrastrá la carpeta `appdeals/` al dashboard
3. Listo, queda online al instante

### Opción 2 — GitHub Pages (gratis)
1. Subí los archivos a un repositorio público en GitHub
2. Entrá a Settings → Pages → Source: main branch
3. Tu sitio queda en `https://tuusuario.github.io/appdeals`

### Opción 3 — Cualquier hosting con archivos estáticos
Subí `index.html` y `app.js` al directorio raíz de tu servidor.

## Personalización

### Cambiar país del App Store
En `app.js`, línea 1:
```js
const COUNTRY = 'us'; // Cambiá a 'ar', 'mx', 'es', 'co', etc.
```

### Agregar apps para monitorear
En `app.js`, agregá IDs al array `SEED_APP_IDS`.
Podés obtener el ID de cualquier app en la URL de la App Store:
`https://apps.apple.com/us/app/nombre-app/id**XXXXXXX**`

### Cambiar símbolo de moneda
```js
const CURRENCY_SYMBOL = '$'; // Cambiá a '€', 'MXN $', etc.
```

## Limitaciones conocidas

- **CORS en desarrollo local**: Las APIs de Apple bloquean peticiones desde `file://`. 
  Usá `npx serve .` para correr un servidor local, o deployá directamente.
  
- **Precios históricos**: La iTunes API solo devuelve el precio actual, no el histórico.
  Para detectar descuentos reales se necesitaría una base de datos propia que guarde precios periódicamente.

- **IAP en oferta**: Apple no expone públicamente qué compras integradas están en oferta
  vía API. La detección actual identifica apps que tienen IAP disponible.

## Para escalar (futuro)

- Cron job que consulta la API cada hora y guarda en una DB → historial de precios real
- Notificaciones por email cuando una app de tu wishlist baja de precio
- Backend propio para eliminar la dependencia del proxy CORS
