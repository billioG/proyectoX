# Imagen de microSD del nodo escolar

Cómo preparar **una microSD maestra** y copiarla a las demás, de modo que instalar el nodo en una escuela nueva sea:
grabar la tarjeta, escribir el token en un archivo de texto, meterla en la Raspberry y encender.

> **Estado de esta función.** Los scripts (`school-node/imagen/`) tienen pruebas automáticas que simulan el primer
> encendido con carpetas temporales. **No se han probado todavía en una Raspberry real.** Antes de usarla en una escuela,
> haz el recorrido completo (secciones 1 a 3) con una microSD y una Raspberry de preparación y confirma la sección 4.

## ¿Imagen o instalador?

| | Instalador (`install.sh`) | Imagen maestra |
|---|---|---|
| Necesita internet en la escuela | Sí, de 10 a 20 minutos | No para arrancar (sí para sincronizar) |
| Lo hace | Alguien con SSH o teclado | Cualquier persona con una computadora y un lector de microSD |
| Pasos por escuela | Instalar + token + verificar | Grabar + escribir el token + encender |
| Mantenimiento | `install.sh --update` | Igual: `install.sh --update` (la imagen solo sirve para el primer arranque) |

Si ya tienes la Raspberry en la mano y hay internet, el instalador sigue siendo lo más simple. La imagen vale la pena
cuando vas a preparar **varios nodos** o la escuela tiene internet muy lento.

## 1. Preparar la microSD maestra (una sola vez)

Necesitas una Raspberry Pi 4 con internet y **una microSD pequeña (8 o 16 GB)**: mientras más chica, más rápida de
copiar. Usa siempre el **mismo nombre de usuario** (el que elijas aquí quedará en todas las copias).

1. En **Raspberry Pi Imager**: *Raspberry Pi OS Lite (64-bit)*. En la configuración: nombre de equipo `quetzal`, usuario y
   contraseña de administrador (anótalos en un lugar seguro), **activar SSH**, país Wi-Fi GT y zona horaria
   `America/Guatemala`.
2. Enciende la Raspberry con cable de red e ingresa por SSH: `ssh TU_USUARIO@quetzal.local`.
3. Revisa que sirve y luego instala en **modo imagen** (instala todo, pero no crea configuración ni sincroniza):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/billioG/proyectoX/main/school-node/install.sh -o install.sh
   bash install.sh --check       # solo revisa: sistema, espacio, memoria e internet
   bash install.sh --image
   ```
4. Deja la tarjeta lista para copiar. **Esto borra los datos de esta Raspberry** (token, estudiantes, redes Wi-Fi
   guardadas, llaves SSH, historial); hazlo solo en la de preparación:
   ```bash
   bash ~/quetzal/school-node/imagen/prepare-image.sh --yes
   sudo poweroff
   ```
5. **No vuelvas a encender esa microSD** antes de copiarla: el primer encendido crearía las llaves y el código de docente
   de *ese* nodo. Si la enciendes por error, repite el paso 4.

Qué deja `prepare-image.sh`:

- El servicio `quetzal-firstboot`, que corre una sola vez en cada nodo nuevo.
- El archivo `quetzal.txt` en la partición de arranque (`/boot/firmware`), la que Windows y Mac ven como una unidad
  llamada **bootfs** al meter la tarjeta.
- Nada de lo que no debe repetirse: sin `config.json`, sin `data/`, sin llaves SSH, sin redes Wi-Fi guardadas, sin
  `machine-id`, sin historial.

## 2. Sacar la imagen

Con la microSD maestra en tu computadora:

- **Windows:** *Win32 Disk Imager* → «Read» a un archivo `quetzal-nodo.img`.
- **Linux/Mac:** `sudo dd if=/dev/sdX of=quetzal-nodo.img bs=4M status=progress` (cambia `/dev/sdX` por la tarjeta; **revisa
  dos veces el nombre**, un error aquí borra otro disco).

Después, achícala y comprímela con **PiShrink** (<https://github.com/Drewsif/PiShrink>), en Linux:

```bash
sudo pishrink.sh -Z quetzal-nodo.img     # genera quetzal-nodo.img.xz
```

PiShrink **no es opcional** si vas a grabar en tarjetas más grandes que la maestra: además de achicar la imagen, hace
que el sistema **use toda la tarjeta nueva** al encender (sin eso, una tarjeta de 64 GB trabajaría con los 8 GB de la
maestra). Guarda el `.img.xz` en un lugar seguro: **contiene el programa y los instaladores, pero ningún dato de
estudiantes ni token**.

## 3. Preparar el nodo de una escuela

1. Graba `quetzal-nodo.img.xz` en la microSD de la escuela con Raspberry Pi Imager: *Usar personalizado* (no cambies las
   opciones avanzadas: usuario y SSH ya vienen de la maestra). Se recomienda tarjeta de **32 GB o más, de marca y
   «high endurance»** (o un SSD por USB).
2. Saca y vuelve a meter la tarjeta en tu computadora. Abre la unidad **bootfs** y edita **`quetzal.txt`** con el Bloc de
   notas:
   ```
   TOKEN=el-token-que-da-el-panel-de-Servidores
   WIFI_SSID=NombreDeLaRedDeLaEscuela      (si usarás Wi-Fi; con cable, déjalo vacío)
   WIFI_PASS=ClaveDeLaRed
   ```
   El token lo copias del panel de administración de Quetzal (Servidores → el nodo de esa escuela), **sin comillas ni
   espacios**. Un token con caracteres raros se ignora (y el nodo igual arranca: se puede pegar después en la pantalla
   del docente).
3. Mete la tarjeta en la Raspberry, conecta cable de red (o confía en el Wi-Fi) y enciende. **Espera 2 a 3 minutos**: el
   primer encendido crea la configuración, genera las llaves SSH y arranca el servicio.
4. Desde otra computadora de la misma red abre **http://quetzal.local**. El **código de docente** quedó escrito en
   **`quetzal-codigo-docente.txt`**, en la misma unidad bootfs (sácala de nuevo y léelo, o míralo por SSH en
   `school-node/config.json`). Guárdalo.
5. El token se borró solo de `quetzal.txt` (queda `(ya usado)`), y la clave del Wi-Fi también.
6. Sigue con el **checklist** (`docs/CHECKLIST_NUEVO_COLEGIO.md`): reservar la IP en el router, imprimir el cartel, etc.

El primer encendido corre **una sola vez**. Si necesitas repetirlo en una tarjeta ya usada: `sudo rm -rf /var/lib/quetzal`
y reinicia (no borra `config.json`: si existe, se respeta).

## 4. Lista de comprobación de la primera imagen (hazla una vez con hardware real)

- [ ] La tarjeta grabada arranca y `http://quetzal.local` abre sin tocar nada más.
- [ ] `quetzal-codigo-docente.txt` aparece en bootfs y el código sirve en el botón «Docente».
- [ ] Dos tarjetas grabadas de la misma imagen tienen **códigos de docente distintos** y **llaves SSH distintas**
      (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` en cada una).
- [ ] Con el token, la primera sincronización termina (chip de estado en «Sincronizado» o la pantalla «Servidor de la
      escuela» en Quetzal).
- [ ] En una tarjeta más grande que la maestra, `df -h /` muestra todo el espacio (PiShrink expandió).
- [ ] `systemctl list-timers quetzal-backup.timer` muestra el respaldo diario.
- [ ] Desde una computadora, `node school-node/herramientas/prueba-de-carga.mjs --url http://quetzal.local --alumnos 20`
      termina en «BIEN» (ver `docs/NODO_LIMITES.md`).

## 5. Actualizar la imagen y los nodos

- **Nodos ya instalados:** `bash ~/quetzal/school-node/install.sh --update` (no hace falta cambiar tarjetas).
- **Imagen:** regenérala solo cuando cambie algo del sistema (versión mayor de Raspberry Pi OS o de Node.js). Las
  tarjetas nuevas se actualizan igual con `--update` al llegar a la escuela. Guarda las imágenes con fecha:
  `quetzal-nodo-2026-11.img.xz`.

## 6. Riesgos y cuidados

- **Todas las copias comparten usuario y contraseña de administrador.** Cámbiala en cada nodo (`passwd`) al instalarlo,
  o usa llaves SSH.
- **Todos los nodos se llaman `quetzal`.** Si dos Raspberries de este tipo comparten una misma red local, sus nombres
  chocan; el proyecto parte de **una Raspberry por escuela**, cada una en su red.
- **Nunca grabes la imagen de una Raspberry que ya está en uso** (con estudiantes): llevaría datos, el token y las llaves
  de esa escuela. Para eso están los respaldos (`docs/NODO_RESPALDO.md`), no la imagen.
- La clave del Wi-Fi escrita en `quetzal.txt` queda legible para quien tenga la tarjeta hasta el primer encendido. Es la
  clave de la red de la escuela, no del proyecto.
