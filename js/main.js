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

  // Contact form (contact.html) -----------------------------------------------
  // Posts to the same Apps Script web app as the mailing list, with
  // form=contact; the script emails the message to the team and logs it in
  // the Sheet. A reply without form: "contact" means the deployed script is an
  // older version that doesn't handle messages yet, so we point people to email.
  var CONTACT_ENDPOINT = MAILING_LIST_ENDPOINT;
  var CONTACT_FALLBACK = "Sorry, your message couldn't be sent. Please email us at info@movingwithaskiy.com.";

  var contactForm = document.querySelector("[data-contact]");
  if (contactForm) {
    var cName = contactForm.elements.name;
    var cEmail = contactForm.elements.email;
    var cTopic = contactForm.elements.topic;
    var cMessage = contactForm.elements.message;
    var cSubmit = contactForm.querySelector("button[type=submit]");
    var cStatus = contactForm.querySelector(".contact-form__status");
    var cSuccess = document.querySelector(".contact-form__success");
    var CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    // Links like contact.html?topic=sponsorship preselect the topic.
    var requestedTopic = (new URLSearchParams(window.location.search).get("topic") || "").replace(/[^a-z]/g, "");
    if (requestedTopic && cTopic.querySelector('option[value="' + requestedTopic + '"]')) {
      cTopic.value = requestedTopic;
    }

    var setContactError = function (input, message) {
      var errorEl = document.getElementById(input.id + "-error");
      errorEl.textContent = message;
      errorEl.hidden = !message;
      if (message) {
        input.setAttribute("aria-invalid", "true");
      } else {
        input.removeAttribute("aria-invalid");
      }
    };

    var showContactStatus = function (message, isError) {
      cStatus.textContent = message;
      cStatus.classList.toggle("is-error", !!isError);
      cStatus.hidden = !message;
    };

    var validateContact = function () {
      var first = null;
      var check = function (input, message) {
        setContactError(input, message);
        if (message && !first) first = input;
      };
      var email = cEmail.value.trim();
      check(cName, cName.value.trim() ? "" : "Please enter your name.");
      check(
        cEmail,
        !email
          ? "Please enter your email address so we can reply."
          : CONTACT_EMAIL_RE.test(email)
            ? ""
            : "That email address doesn't look right. Please check it and try again."
      );
      check(cMessage, cMessage.value.trim() ? "" : "Please write a message.");
      return first;
    };

    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      showContactStatus("");
      var invalid = validateContact();
      if (invalid) {
        invalid.focus();
        return;
      }
      if (!CONTACT_ENDPOINT) {
        showContactStatus(CONTACT_FALLBACK, true);
        return;
      }

      var name = cName.value.trim();
      var body = new URLSearchParams({
        form: "contact",
        name: name,
        email: cEmail.value.trim(),
        organization: contactForm.elements.organization.value.trim(),
        topic: cTopic.value,
        message: cMessage.value.trim(),
        website: contactForm.elements.website.value,
        page: window.location.pathname.split("/").pop() || "contact.html"
      });

      cSubmit.disabled = true;
      showContactStatus("Sending…");
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 15000);

      fetch(CONTACT_ENDPOINT, { method: "POST", body: body, signal: controller.signal })
        .then(function (response) { return response.json(); })
        .then(function (result) {
          if (result.form !== "contact") {
            showContactStatus(CONTACT_FALLBACK, true);
            cSubmit.disabled = false;
            return;
          }
          if (!result.ok) {
            showContactStatus(result.error || CONTACT_FALLBACK, true);
            cSubmit.disabled = false;
            return;
          }
          showContactStatus("");
          contactForm.hidden = true;
          cSuccess.textContent =
            "Thank you, " + name + "! Your message is on its way. We'll reply to " + cEmail.value.trim() + " as soon as we can.";
          cSuccess.hidden = false;
          cSuccess.focus();
        })
        .catch(function () {
          showContactStatus(CONTACT_FALLBACK, true);
          cSubmit.disabled = false;
        })
        .then(function () { clearTimeout(timeout); });
    });
  }

  // Event card photo carousels (templates/event-card.html) --------------------
  // Each [data-carousel] wraps a scroll-snap track of slides, which already
  // swipes and scrolls without JS. With 2+ slides this adds previous/next
  // buttons, one dot per photo, and Left/Right arrow keys on the track.
  document.querySelectorAll("[data-carousel]").forEach(function (carousel) {
    var track = carousel.querySelector(".event-card__track");
    var slides = track ? Array.prototype.slice.call(track.children) : [];
    if (slides.length < 2) return;

    var label = carousel.getAttribute("aria-label") || "Event photos";
    carousel.setAttribute("role", "region");
    carousel.setAttribute("aria-roledescription", "carousel");
    track.setAttribute("tabindex", "0");
    track.setAttribute("aria-label", label + " (use the arrow keys to change photos)");
    slides.forEach(function (slide, i) {
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
      slide.setAttribute("aria-label", (i + 1) + " of " + slides.length);
    });

    var makeButton = function (className, text, ariaLabel) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.setAttribute("aria-label", ariaLabel);
      if (text) button.innerHTML = '<span aria-hidden="true">' + text + "</span>";
      return button;
    };
    var prev = makeButton("event-card__nav event-card__nav--prev", "&#8249;", "Previous photo");
    var next = makeButton("event-card__nav event-card__nav--next", "&#8250;", "Next photo");
    var dotsWrap = document.createElement("div");
    dotsWrap.className = "event-card__dots";
    var dots = slides.map(function (slide, i) {
      var dot = makeButton("event-card__dot", "", "Show photo " + (i + 1) + " of " + slides.length);
      dot.addEventListener("click", function () { goTo(i); });
      dotsWrap.appendChild(dot);
      return dot;
    });
    carousel.appendChild(prev);
    carousel.appendChild(next);
    carousel.appendChild(dotsWrap);

    var current = 0;
    var goTo = function (index) {
      index = Math.max(0, Math.min(slides.length - 1, index));
      track.scrollTo({ left: slides[index].offsetLeft, behavior: getComputedStyle(track).scrollBehavior });
    };
    var update = function () {
      current = Math.round(track.scrollLeft / track.clientWidth);
      prev.disabled = current === 0;
      next.disabled = current === slides.length - 1;
      dots.forEach(function (dot, i) {
        dot.setAttribute("aria-current", i === current ? "true" : "false");
      });
    };

    prev.addEventListener("click", function () { goTo(current - 1); });
    next.addEventListener("click", function () { goTo(current + 1); });
    track.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        goTo(current + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
    var scrollTimer;
    track.addEventListener("scroll", function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(update, 60);
    }, { passive: true });
    window.addEventListener("resize", function () { goTo(current); });
    update();
  });

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
