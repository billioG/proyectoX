# Privacidad y consentimiento

Cómo trata la plataforma los datos de menores y de sus familias, y el modelo de consentimiento en papel para escuelas sin celular.
Este documento describe el funcionamiento técnico: **no es asesoría legal**; la política pública está en [privacidad.html](../privacidad.html).

## Qué hace la plataforma

| Qué | Dónde |
|---|---|
| Política de privacidad pública | `privacidad.html` (enlazada desde el login y el Portal de padres) |
| Consentimiento de padres con fecha y versión | Portal de padres: "Acepto / No acepto" (`migrations/guardian-consent.sql`) |
| Si el padre no acepta, no recibe avisos | `enqueue_guardian_notification` lo filtra |
| El docente ve el estado del consentimiento | Ficha de padres del alumno |
| La IA solo recibe el primer nombre | `js/mascot-widget.js`, `js/ai-service.js` |

Pendiente:

- [ ] Alumnos **sin padre registrado**: la escuela puede recoger el consentimiento en papel (modelo abajo) y el docente registra al padre después (`record_guardian_paper_consent`, `migrations/guardian-paper-consent.sql`).

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
