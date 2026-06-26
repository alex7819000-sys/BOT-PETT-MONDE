// dashboard/public/js/app.js
(function () {
  // Confirmation avant les actions destructrices
  document.querySelectorAll('[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // Auto-dismiss des bandeaux "sauvegardé"
  document.querySelectorAll('.toast-saved').forEach((el) => {
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 2500);
  });

  // Auto-refresh léger de la page d'overview (stats quasi temps réel)
  const auto = document.querySelector('[data-autorefresh]');
  if (auto) {
    const ms = Number(auto.getAttribute('data-autorefresh')) || 30000;
    setTimeout(() => window.location.reload(), ms);
  }
})();
