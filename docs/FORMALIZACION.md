# Paso 2 · Formalizar el proyecto

Lo que piden fondos, gobierno y compradores antes de firmar cualquier cosa:
reglas claras de privacidad, propiedad demostrable y alguien legal con quien
firmar. Este documento es una guía de trabajo, **no asesoría legal**: los
puntos marcados con ⚖️ hay que confirmarlos con un abogado o notario.

## 1. Privacidad y consentimiento ✅ (ya en la plataforma)

| Qué | Dónde |
|---|---|
| Política de privacidad pública | `privacidad.html` (enlazada desde el login y el Portal de padres) |
| Consentimiento de padres con fecha y versión | Portal de padres: "Acepto / No acepto" (`migrations/guardian-consent.sql`) |
| Si el padre no acepta, no recibe avisos | `enqueue_guardian_notification` lo filtra |
| El docente ve el estado del consentimiento | Ficha de padres del alumno |
| La IA solo recibe el primer nombre | `js/mascot-widget.js`, `js/ai-service.js` |

Pendiente:

- [x] Poner el **correo de contacto** del proyecto en `privacidad.html` (`colegios@yoaprendo.online`).
- [ ] ⚖️ Revisar la política con un abogado.
- [ ] Definir qué hacer con alumnos **sin padre registrado**: la escuela puede recoger el consentimiento en papel (modelo abajo) y el docente registrar al padre después.
- [ ] Acuerdo con cada escuela (convenio simple): la escuela autoriza el uso, designa un responsable y se compromete a informar a las familias.

### Modelo de consentimiento en papel

Para escuelas donde los padres no tienen celular con internet:

> Yo, ______________________, padre/madre/encargado de ______________________,
> estudiante de ______ grado, sección ____, de la escuela ______________________,
> autorizo que use la plataforma educativa Quetzal LMS. Entiendo que se
> guardarán su nombre, su clase y su avance para que el docente lo acompañe;
> que no se venden datos ni se muestra publicidad; y que puedo pedir ver,
> corregir o borrar sus datos cuando quiera.
>
> ☐ Quiero recibir avisos por mensaje de texto al número: ______________
>
> Firma: __________________  Fecha: ____/____/______

## 2. Propiedad intelectual

En Guatemala el software está protegido como obra por la **Ley de Derecho de
Autor y Derechos Conexos (Decreto 33-98)** desde que se crea; registrarlo no es
obligatorio, pero da una prueba con fecha que sirve para vender, licenciar o
defenderse.

- [ ] ⚖️ **Registrar el programa** ("programa de ordenador") en el Registro de la Propiedad Intelectual (RPI). Normalmente se presenta una descripción de la obra y una muestra del código.
- [ ] ⚖️ **Registrar la marca** "Quetzal LMS" (nombre y logo) en el RPI. Antes, hacer una búsqueda de antecedentes: "Quetzal" es una palabra muy usada.
- [ ] Guardar la evidencia de autoría que ya existe: historial de git con fechas (desde el 20 de enero de 2026), dominio, capturas.
- [ ] Acuerdo de cesión de derechos con cualquier persona que aporte código, diseño o contenido (ver `CONTRIBUTING.md`).
- [ ] Revisar licencias de terceros incluidas (H5P, Font Awesome, Tailwind, librerías en `vendor/`): todas deben permitir el uso que se le da.

## 3. Licencia del software

Hay que decidir una antes de postular a fondos. Resumen de opciones:

| Opción | Permite vender | Encaja con UNICEF Venture Fund | Encaja con gobierno |
|---|---|---|---|
| Propietaria (todos los derechos reservados) | Sí, el código completo | No | Depende del convenio |
| AGPL-3.0 (abierta, obliga a compartir mejoras) | Se venden servicios, no el código | Sí | Sí |
| MIT (abierta, permisiva) | Se venden servicios | Sí | Sí |
| Núcleo abierto (base abierta + módulos comerciales) | Sí, los módulos | Parcial | Sí |

- [ ] Decidir y agregar el archivo `LICENSE` a la raíz del repositorio.

## 4. Figura legal

Muchos fondos, convenios y donaciones exigen una persona jurídica. Opciones
habituales en Guatemala ⚖️:

| Figura | Dónde se inscribe | Sirve para |
|---|---|---|
| Asociación civil sin fines de lucro | Registro de las Personas Jurídicas (REPEJU), Ministerio de Gobernación, mediante escritura ante notario | Recibir fondos no reembolsables y donaciones, convenios con gobierno y organismos |
| Fundación | Mismo registro; requiere un patrimonio inicial | Igual que la asociación, cuando hay un fondo o donante fundador |
| Empresa individual o sociedad anónima | Registro Mercantil | Vender licencias, servicios y soporte; recibir inversión |

Un camino común es tener **las dos**: una asociación para fondos y
convenios, y una empresa para vender servicios. Mientras tanto, se puede
postular junto a una organización ya constituida (universidad o fundación)
como socio.

- [ ] ⚖️ Consultar con un notario cuál conviene primero y cuánto cuesta.
- [ ] Abrir una cuenta bancaria a nombre de la figura elegida.
- [ ] ⚖️ Inscripción en la SAT y, si se quiere que las donaciones sean deducibles, cumplir sus requisitos.

## Preguntas para llevar al abogado

1. ¿Qué figura legal conviene para recibir fondos no reembolsables y además cobrar servicios?
2. ¿La política de privacidad cubre lo necesario para datos de menores? ¿Qué cambia si trabajamos con escuelas públicas del MINEDUC?
3. ¿Qué debe decir el convenio con cada escuela?
4. ¿Cómo registramos el software y la marca, y cuánto cuesta?
5. Si elegimos una licencia abierta, ¿seguimos pudiendo vender servicios y registrar la marca?
