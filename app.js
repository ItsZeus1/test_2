/* ==========================================================================
   js/app.js
   Shared behaviour for every page: mobile nav + a tiny "auth" layer backed
   by localStorage. Swap the AuthStore internals for real API calls later —
   every other file only talks to window.Auth, never to localStorage directly.
   ========================================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "topup_session";

  /* ---------------------------------------------------------------------
     AuthStore — the ONLY place that reads/writes the mock session.
     To attach a real backend (PHP/MySQL, Firebase, etc.) later:
       1. Replace the body of login()/register()/logout() with fetch() calls.
       2. Keep the same method names and return shapes so nothing else
          in the app has to change.
     ------------------------------------------------------------------- */
  const AuthStore = {
    getUser() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.error("AuthStore.getUser failed", err);
        return null;
      }
    },

    // Mock login: in a real backend this would POST to /api/login
    // and store a token/session id instead of the raw user object.
    login({ email }) {
      const user = { email, name: email.split("@")[0] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return user;
    },

    // Mock register: in a real backend this would POST to /api/register.
    register({ username, email }) {
      const user = { email, name: username };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return user;
    },

    logout() {
      localStorage.removeItem(STORAGE_KEY);
    },
  };

  window.Auth = AuthStore;

  /* ---------------------------------------------------------------------
     Reflect auth state into the DOM on every page load.
     Add data-auth="guest"/"user" to <body> and swap .guest-only / .auth-only
     blocks in CSS (see style.css).
     ------------------------------------------------------------------- */
  function paintAuthState() {
    const user = AuthStore.getUser();
    document.body.dataset.auth = user ? "user" : "guest";
    document.querySelectorAll("[data-user-name]").forEach((el) => {
      el.textContent = user ? user.name : "";
    });
  }

  function wireLogoutButtons() {
    document.querySelectorAll("[data-logout]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        AuthStore.logout();
        window.location.href = "index.html";
      });
    });
  }

  /* ---------------------------------------------------------------------
     Mobile nav (hamburger <-> slide-in panel)
     ------------------------------------------------------------------- */
  function wireMobileNav() {
    const toggle = document.querySelector("[data-nav-toggle]");
    const panel = document.querySelector("[data-nav-panel]");
    if (!toggle || !panel) return;

    toggle.addEventListener("click", () => {
      const isOpen = panel.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      document.body.style.overflow = isOpen ? "hidden" : "";
    });

    panel.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        panel.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    paintAuthState();
    wireLogoutButtons();
    wireMobileNav();
  });
})();
