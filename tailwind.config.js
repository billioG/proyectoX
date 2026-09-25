// Tailwind compilado (antes se usaba cdn.tailwindcss.com en runtime, que
// no se podía cachear bien offline). Si agregás clases nuevas en HTML/JS,
// regenerá css/tailwind.css:
//   npx -y tailwindcss@3.4.17 -c tailwind.config.js -i css/tailwind.src.css -o css/tailwind.css --minify
// El CI falla si css/tailwind.css quedó desactualizado.
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
          DEFAULT: '#00C853',
          dark: '#009624',
        },
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
