(() => {
  const root = document.documentElement;
  const toggle = document.querySelector('#themeToggle');
  const page = document.body.dataset.page || normalizePath(window.location.pathname);
  const storedTheme = window.localStorage.getItem('theme');

  root.dataset.theme = storedTheme === 'dark' ? 'dark' : 'light';
  setActiveNav(page);
  renderThemeToggle();

  if (toggle) {
    toggle.addEventListener('click', () => {
      const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = nextTheme;
      window.localStorage.setItem('theme', nextTheme);
      renderThemeToggle();
    });
  }

  function setActiveNav(currentPage) {
    document.querySelectorAll('[data-nav]').forEach((link) => {
      const isActive = link.dataset.nav === currentPage;
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function renderThemeToggle() {
    if (!toggle) return;
    const isDark = root.dataset.theme === 'dark';
    const icon = toggle.querySelector('.theme-icon');
    const label = toggle.querySelector('.theme-label');

    if (icon) icon.textContent = isDark ? '☼' : '☾';
    if (label) label.textContent = isDark ? '浅色' : '深色';
  }

  function normalizePath(pathname) {
    const clean = pathname.replace(/\/+$/, '').replace(/^\//, '');
    return clean || 'home';
  }
})();
