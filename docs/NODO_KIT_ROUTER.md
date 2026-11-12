# Kit de router + Raspberry: que `quetzal.local` abra en cualquier dispositivo

El objetivo: que en la escuela el docente **solo enchufe el router y la Raspberry**, y los estudiantes escriban
`quetzal.local`. Para eso el router del kit se prepara **una sola vez**, antes de entregarlo. El docente no configura nada.

> **Estado.** El servidor de nombres del nodo (`school-node/dns.js`, desde v1.0.265) tiene pruebas automáticas, incluida
> una que arranca el nodo de verdad y le pregunta por `quetzal.local`. **No se ha probado todavía con un router y tablets
> reales.** Haz la sección 3 con el primer kit antes de entregarlo a una escuela.

## 1. Por qué hace falta

El nombre `quetzal.local` se anuncia por mDNS. Lo entienden iPhone, Windows, Chromebook y Android 12 o posterior.
**Android 11 o anterior no**: pregunta el nombre al servidor de nombres (DNS) que le dio el router, y el router no lo
conoce. Esas tablets solo abrían con la IP.

Desde v1.0.265 la Raspberry trae su propio servidor de nombres. Si el router entrega la IP de la Raspberry como DNS:

- `quetzal.local` abre en **todos** los dispositivos, también en Android viejo.
- Con internet (por ejemplo en la casa del docente), todo lo demás se resuelve igual que siempre: la Raspberry reenvía
  las preguntas al router.
- Sin internet, la Raspberry contesta las comprobaciones con que los celulares deciden si la red «tiene internet», para
  que no abandonen el Wi-Fi de la escuela. Esto ayuda, pero **cada marca se comporta distinto**: si un celular con
  datos móviles insiste en avisar «sin internet», se toca «Mantener conexión» una vez.

Si el router **no** se prepara, nada se rompe: el nodo funciona como antes (mDNS y la IP).

## 2. Preparar el router del kit (una sola vez, unos 10 minutos)

Los nombres de los menús cambian según la marca; se indica qué buscar.

1. **Instala el nodo** en la Raspberry (imagen de microSD o instalador) y conéctala **por cable** a un puerto LAN del
   router. Entra al panel del router (suele ser `http://192.168.0.1` o `http://192.168.1.1`).
2. **Reserva la IP de la Raspberry.** Menú *DHCP → Reserva de direcciones* (o «IP estática por MAC», «Address
   reservation»). Elige el equipo llamado `quetzal` y fíjale una IP, por ejemplo `192.168.0.50`. Anótala.
3. **Entrega esa IP como DNS.** Menú *DHCP → Configuración* (o «DHCP Server»):
   - **DNS primario:** la IP de la Raspberry (`192.168.0.50`).
   - **DNS secundario:** la IP del propio router (`192.168.0.1`). Es el respaldo si la Raspberry está apagada.

   Ojo: es el DNS que el router **reparte a los dispositivos** (sección DHCP/LAN), no el DNS de la conexión a internet
   (sección WAN). Ese no se toca.
4. **Wi-Fi.** Pon el nombre y la clave de la red de la escuela. Desactiva el **aislamiento de clientes** («AP isolation»,
   «aislamiento de AP») si está encendido: las tablets deben poder ver a la Raspberry.
5. **Guarda y reinicia** el router y luego la Raspberry (`sudo reboot`, o apagar y encender).

## 3. Comprobar (una vez por kit)

Con el router **sin internet** (sin cable en el puerto WAN), como estará en la escuela:

- [ ] Desde un celular conectado a ese Wi-Fi, `http://quetzal.local` abre la pantalla de ingreso.
- [ ] Abre `http://quetzal.local/api/node/status` y busca `"dns"`: `listening` muestra la IP reservada y `clients` es
      **mayor que 0**. Si `clients` es 0, el router no está entregando la IP de la Raspberry como DNS (repite el paso 3 y
      reconecta el celular al Wi-Fi para que tome la configuración nueva).
- [ ] Si tienes una tablet con **Android 11 o anterior**, prueba con ella: es el caso que esto arregla.
- [ ] Apaga y enciende router y Raspberry a la vez (como tras un apagón). A los 2 minutos `quetzal.local` vuelve a abrir
      sin tocar nada.
- [ ] Conecta el router a internet: los celulares navegan normal y el nodo sincroniza solo.

Anota el resultado y el modelo del router; si algo no coincide con esta guía, corrígela.

## 4. Lo que hace el docente en la escuela

1. Enchufar el router y la Raspberry (unidos por su cable de red).
2. Esperar 2 minutos.
3. Pedir a los estudiantes que se conecten al Wi-Fi de la escuela y escriban **quetzal.local** (o escaneen el QR del
   cartel).

Para sincronizar, el docente lleva el kit completo a un lugar con internet y conecta el puerto **WAN/Internet** del
router al internet de ese lugar; o lleva solo la Raspberry y la conecta por cable a cualquier router. En los dos casos
sincroniza sola.

## 5. Si algo falla

| Lo que ves | Qué revisar |
|---|---|
| `quetzal.local` no abre en una tablet vieja y sí en las demás | `clients` en 0 en `/api/node/status`: falta el paso 3, o la tablet no ha renovado su conexión (olvidar la red y volver a conectarla). |
| `"dns": null` en `/api/node/status` | El nodo es anterior a v1.0.265, o no es una instalación normal de Raspberry (Windows, Chromebook o puerto distinto de 80). Se puede forzar con `"dns": true` en `config.json`. |
| `"error": "No se pudo abrir el servidor de nombres..."` | Otro programa usa el puerto 53 en la Raspberry, o falta el permiso de puertos: `bash ~/quetzal/school-node/install.sh --update` lo repone. |
| Con internet, las páginas tardan en abrir | La Raspberry está apagada y los dispositivos esperan al DNS secundario. Enciéndela, o revisa que el secundario sea la IP del router. |
| El celular dice «sin internet» y se pasa a datos móviles | Tocar «Mantener conexión» / «Usar esta red de todos modos». En tablets sin chip no pasa. |

## 6. Otras formas de red

- **Router de la escuela, sin prepararlo:** funciona por mDNS y por IP, como antes. Los Android viejos necesitan la IP
  (el cartel `/cartel` la muestra con su QR).
- **Sin router (`install.sh --hotspot`):** la Raspberry crea la red «Quetzal-Escuela» y ya resuelve `quetzal.local` ella
  misma. Sirve para unas 10 a 15 tablets (`docs/NODO_LIMITES.md`).
- **Opciones de `config.json`:** `"dns": true|false` (encender o apagar), `"dnsUpstream": ["192.168.0.1"]` (a quién
  reenviar, si no se quiere el router), `"dnsPort": 53`.
