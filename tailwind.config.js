// Tailwind compilado (antes se usaba cdn.tailwindcss.com en runtime, que
// no se podía cachear bien offline). Si agregás clases nuevas en HTML/JS,
// regenerá css/tailwind.css:
//   npx -y tailwindcss@3.4.17 -c tailwind.config.js -i css/tailwind.src.css -o css/tailwind.css --minify
// El CI falla si css/tailwind.css quedó desactualizado.
const base = require('tailwindcss/colors');

// Colores de marca personalizables por colegio (js/branding.js): cada familia se escribe con variables CSS y su valor de siempre como
// respaldo, así que sin marca propia NADA cambia. Con marca propia, el colegio define 3 colores y la app calcula los 11 tonos:
//   Secundario (--sec-*)  reemplaza índigo, violeta, púrpura y azul.
//   Acento     (--acc-*)  reemplaza ámbar, naranja y amarillo.
// Rojo (peligro) y esmeralda/verde (éxito) NO se tocan: son significados, no marca.
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
const scale = (prefix, family) => Object.fromEntries(STEPS.map((s) => [s, `rgb(var(--${prefix}-${s}, ${rgbOf(base[family][s])}) / <alpha-value>)`]));

module.exports = {
  content: ['./index.html', './js/**/*.js'],
  // Clases armadas con template strings (bonus-system.js) -- el escáner
  // no las ve enteras.
  safelist: ['bg-rose-500/10', 'bg-indigo-500/10', 'text-rose-500', 'text-indigo-500'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          // Variables CSS para poder cambiar el color por colegio en tiempo de ejecución (js/branding.js).
          DEFAULT: 'rgb(var(--primary-rgb, 0 200 83) / <alpha-value>)',
          dark: 'rgb(var(--primary-dark-rgb, 0 150 36) / <alpha-value>)',
        },
        indigo: scale('sec', 'indigo'),
        violet: scale('sec', 'violet'),
        purple: scale('sec', 'purple'),
        blue: scale('sec', 'blue'),
        amber: scale('acc', 'amber'),
        orange: scale('acc', 'orange'),
        yellow: scale('acc', 'yellow'),
        cream: '#F8F5F0',
        secondary: '#64748B',
        accent: '#F59E0B',
        dark: {
          bg: '#0F172A',
          card: '#1E293B',
          border: '#334155',
          text: '#F1F5F9',
        },
      },
      boxShadow: {
        glass: '0 4px 30px rgba(0, 0, 0, 0.05)',
      },
    },
  },
};
