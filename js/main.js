(function () {
  "use strict";

  // Mobile nav toggle -------------------------------------------------------
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("primary-navigation");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Close mobile menu when a nav link is chosen
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Mark the current page's nav link ----------------------------------------
  var currentPath = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a[href]").forEach(function (link) {
    var href = link.getAttribute("href").split("/").pop();
    if (href === currentPath || (href === "index.html" && currentPath === "")) {
      link.setAttribute("aria-current", "page");
    }
  });

  // Footer year ---------------------------------------------------------------
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Mailing list sign-up ------------------------------------------------------
  // Posts to a Google Apps Script web app (setup/mailing-list.gs) that checks
  // the details again and passes them to the active mailing list provider
  // (a Google Sheet today; switching services doesn't touch this file).
  // Paste the deployed web app URL (it ends in /exec) between the quotes.
  var MAILING_LIST_ENDPOINT = "https://script.google.com/macros/s/AKfycbwXy2pw2b2e07LFEIJDhkVKfbYaG2WE-DWCbXw90GQ6d2bz5ehXZsu3CzHKCfcZFF4q/exec";

  var signupForm = document.querySelector("[data-signup]");
  if (signupForm) {
    var nameInput = signupForm.elements.firstName;
    var emailInput = signupForm.elements.email;
    var consentInput = signupForm.elements.consent;
    var submitBtn = signupForm.querySelector("button[type=submit]");
    var statusEl = signupForm.querySelector(".signup__status");
    var successEl = document.querySelector(".signup__success");
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var GENERIC_ERROR = "Sorry, something went wrong. Please try again in a moment.";

    var setError = function (input, message) {
      var errorEl = document.getElementById(input.id + "-error");
      errorEl.textContent = message;
      errorEl.hidden = !message;
      if (message) {
        input.setAttribute("aria-invalid", "true");
      } else {
        input.removeAttribute("aria-invalid");
      }
    };

    var showStatus = function (message, isError) {
      statusEl.textContent = message;
      statusEl.classList.toggle("is-error", !!isError);
      statusEl.hidden = !message;
    };

    // Returns the first invalid field (to focus), or null when all is well.
    var validate = function () {
      var first = null;
      var check = function (input, message) {
        setError(input, message);
        if (message && !first) first = input;
      };
      var email = emailInput.value.trim();
      check(nameInput, nameInput.value.trim() ? "" : "Please enter your first name.");
      check(
        emailInput,
        !email
          ? "Please enter your email address."
          : EMAIL_RE.test(email)
            ? ""
            : "That email address doesn't look right. Please check it and try again."
      );
      check(consentInput, consentInput.checked ? "" : "Please tick the box so we know you'd like to hear from us.");
      return first;
    };

    signupForm.addEventListener("submit", function (event) {
      event.preventDefault();
      showStatus("");
      var invalid = validate();
      if (invalid) {
        invalid.focus();
        return;
      }
      if (!MAILING_LIST_ENDPOINT) {
        showStatus("Sign-up isn't switched on yet. Please email info@movingwithaskiy.com to join the list.", true);
        return;
      }

      var firstName = nameInput.value.trim();
      var body = new URLSearchParams({
        firstName: firstName,
        email: emailInput.value.trim(),
        consent: "yes",
        consentText: signupForm.querySelector(".signup__consent-text").textContent.trim(),
        website: signupForm.elements.website.value,
        page: window.location.pathname.split("/").pop() || "index.html"
      });

      submitBtn.disabled = true;
      showStatus("Sending\u2026");
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 15000);

      // A form-encoded POST is a "simple" request, so no CORS preflight is needed.
      fetch(MAILING_LIST_ENDPOINT, { method: "POST", body: body, signal: controller.signal })
        .then(function (response) { return response.json(); })
        .then(function (result) {
          if (!result.ok) {
            showStatus(result.error || GENERIC_ERROR, true);
            submitBtn.disabled = false;
            return;
          }
          showStatus("");
          signupForm.hidden = true;
          successEl.textContent =
            "Thank you, " + firstName + "! Check your inbox for an email from us and click the link inside to confirm. You won\u2019t be on the list until you do.";
          successEl.hidden = false;
          successEl.focus();
        })
        .catch(function () {
          showStatus(GENERIC_ERROR, true);
          submitBtn.disabled = false;
        })
        .then(function () { clearTimeout(timeout); });
    });
  }

  // Reveal-on-scroll (progressive enhancement) ---------------------------------
  // Content is visible by default in CSS; we only opt into the fade/slide
  // treatment once JS is confirmed running and able to reveal it again,
  // so a slow, blocked, or failed script never leaves content hidden.
  var revealItems = document.querySelectorAll("[data-reveal]");
  if (revealItems.length && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-reveal");
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  }
})();
