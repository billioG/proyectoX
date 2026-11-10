# Hacer privado el repositorio o publicar una copia limpia

Guía para cuando el repositorio deje de ser público (por ejemplo, al tener fondos). **No se ejecuta nada desde aquí:** son pasos que
hace el responsable en GitHub. Reescribir el historial de git es destructivo y nunca se hizo de forma automática.

## Lo que hay que saber antes

- **Lo que ya fue público no se puede recoger.** Cualquier persona pudo clonar o hacer *fork* mientras el repositorio era público, y
  GitHub, buscadores y archivos web pueden conservar copias. Hacerlo privado detiene lo futuro; no borra lo ya copiado.
- **GitHub Pages en un repositorio privado** necesita un plan de pago de GitHub (Pro, Team o superior). En el plan gratuito, al pasar
  a privado **el sitio `clases.yoaprendo.online` deja de publicarse**. Confirma tu plan antes de cambiar nada, o prepara otro hosting.
- **El historial conserva lo que ya se borró de los archivos.** Auditoría del 9/11/2026 sobre los 511 commits:
  - Un valor viejo de `CRON_SECRET` en `migrations/random-events-cron.sql` (commit `6542193` lo quitó del archivo). Ya fue rotado el
    27/09/2026 (ver `PENDIENTES.md`): no sirve, no hay nada que rotar.
  - Documentos de postulación y planificación que ya no están en el árbol actual (`docs/fondos/`, `docs/EQUIPO.md`, `docs/FORMALIZACION.md`).
  - No se encontraron otras claves (IA, GitHub, Resend, claves privadas). La única clave JWT del historial es la `anon`, pública por diseño.
- Si el repositorio sigue público, no vuelvas a subir al repositorio nada de gestión interna: usa un repositorio privado aparte o un
  gestor de documentos.

## Opción A: pasar el mismo repositorio a privado

1. Confirma el plan de Pages (ver arriba) y avisa al equipo.
2. GitHub → Settings → General → *Danger Zone* → **Change repository visibility** → Private.
3. Revisa Settings → Pages: que el sitio y el dominio `CNAME` sigan activos.
4. Revisa quién tiene acceso (Settings → Collaborators) y las claves de despliegue.

Queda el historial completo (lo anterior sigue accesible para quien ya lo copió).

## Opción B: copia limpia sin historial (cuando el repositorio será público y se quiere empezar limpio)

Hazla desde una copia de trabajo; el repositorio actual no se toca hasta el final.

```bash
git clone https://github.com/billioG/proyectoX.git proyectoX-limpio
cd proyectoX-limpio
rm -rf .git
git init -b main
git add -A
git commit -m "Initial public release"
# Crea el repositorio nuevo en GitHub (vacío) y:
git remote add origin https://github.com/<usuario>/<repositorio-nuevo>.git
git push -u origin main
```

Después:

1. Antes de subir, corre el escaneo de secretos sobre la copia (el CI lo hace con `gitleaks`).
2. Configura Pages y el dominio en el repositorio nuevo, y recién entonces archiva o vuelve privado el viejo.
3. Se pierde el historial de commits, el de *issues* y los enlaces a commits del repositorio anterior. `CHANGELOG.md` se conserva.
4. Rota cualquier secreto que haya estado alguna vez en el repositorio viejo (hoy: ninguno vigente).
5. Vuelve a proteger la rama `main` en el repositorio nuevo (ver `CONTRIBUTING.md`).

## Checklist antes de publicar o cambiar de visibilidad

- [ ] `git grep -nE "service_role|PRIVATE KEY|secret"` no muestra valores reales.
- [ ] `js/config.js` solo tiene la URL y la clave `anon`.
- [ ] No hay datos de alumnos reales en `tests/`, `docs/` ni `migrations/` (la demo usa datos inventados).
- [ ] El plan de GitHub permite lo que vas a hacer (Pages privado).
