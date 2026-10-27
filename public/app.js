// TC Lawn Care Plus LLC — frontend logic for bookings, reviews, owner side.
(function () {
  "use strict";
  var pickedStars = 0;
  var ownerPin = sessionStorage.getItem("tcOwnerPin") || "";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function stars(n) { return "★".repeat(n) + "☆".repeat(5 - n); }
  function dingLabel(s) {
    if (s === "sent") return "Email ding: sent";
    if (s === "failed") return "Email ding: didn't go out";
    if (s === "not_configured") return "Email ding: not set up yet";
    return "Email ding: on its way";
  }

  // ---- Reviews ----------------------------------------------------------
  function renderVisitorReviews(list) {
    var box = $("visitor-reviews");
    if (!list.length) { box.innerHTML = ""; return; }
    box.innerHTML = list.map(function (r) {
      return "<blockquote class='review'><p>" + esc(r.text) + "</p><footer>— " + esc(r.name) +
        " · " + stars(r.stars) + (r.service ? " · " + esc(r.service) : "") + "</footer></blockquote>";
    }).join("");
  }
  function loadReviews() {
    fetch("/api/reviews").then(function (r) { return r.json(); }).then(renderVisitorReviews).catch(function () {});
  }
  document.querySelectorAll("#star-picker button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      pickedStars = Number(btn.getAttribute("data-stars"));
      document.querySelectorAll("#star-picker button").forEach(function (b) {
        b.classList.toggle("on", Number(b.getAttribute("data-stars")) <= pickedStars);
      });
      $("star-label").textContent = pickedStars + " star" + (pickedStars === 1 ? "" : "s") + " picked";
    });
  });
  $("review-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    if (!pickedStars) { $("review-status").textContent = "Please tap 1 to 5 stars first."; return; }
    fetch("/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name.value, service: f.service.value, text: f.text.value, stars: pickedStars }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { $("review-status").textContent = res.j.error || "Could not save the review."; return; }
        $("review-status").textContent = "Thank you — your review is saved.";
        f.reset(); pickedStars = 0;
        document.querySelectorAll("#star-picker button").forEach(function (b) { b.classList.remove("on"); });
        $("star-label").textContent = "Tap 1 to 5 stars";
        loadReviews();
      }).catch(function () { $("review-status").textContent = "Could not save the review. Try again."; });
  });

  // ---- Booking ------------------------------------------------------------
  function bookingSummary(f) {
    return [
      "TC Lawn Care Plus LLC — booking details",
      "Name: " + f.name.value,
      f.phone.value ? "Phone: " + f.phone.value : null,
      "Where it is: " + f.location.value,
      f.yardSize.value ? "Yard size estimate: " + f.yardSize.value : null,
      "What needs done: " + f.workNeeded.value,
      "We will reach out — a team member will reach out, usually within the hour.",
    ].filter(Boolean).join("\n");
  }
  $("booking-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    fetch("/api/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name.value, phone: f.phone.value, location: f.location.value, yardSize: f.yardSize.value, workNeeded: f.workNeeded.value }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { $("booking-status").textContent = res.j.error || "Could not save the booking."; return; }
        f.hidden = true;
        $("booking-success").hidden = false;
        $("booking-success").scrollIntoView({ behavior: "smooth" });
      }).catch(function () { $("booking-status").textContent = "Could not save the booking. Try again."; });
  });
  $("copy-booking").addEventListener("click", function () {
    var text = bookingSummary($("booking-form"));
    function done() { $("booking-status").textContent = "Booking details copied — paste them wherever you like."; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  });
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
  }
  $("book-another").addEventListener("click", function () {
    var f = $("booking-form");
    f.reset(); f.hidden = false; $("booking-success").hidden = true;
  });

  // ---- Owner side ---------------------------------------------------------
  function ownerHeaders() { return { "Content-Type": "application/json", "x-owner-pin": ownerPin }; }
  function renderOwnerBookings(data) {
    $("new-count").textContent = data.newCount
      ? "You have " + data.newCount + " new booking notification" + (data.newCount === 1 ? "" : "s") + "."
      : "No new bookings right now.";
    var box = $("owner-bookings");
    if (!data.bookings.length) { box.innerHTML = "<p class='white'>No bookings yet.</p>"; return; }
    box.innerHTML = data.bookings.map(function (b) {
      return "<div class='booking-card'><p><strong>" + esc(b.name) + "</strong>" +
        (b.status === "new" ? "<span class='badge'>NEW BOOKING</span>" : "") + "</p>" +
        (b.phone ? "<p>Customer phone: " + esc(b.phone) + "</p>" : "") +
        "<p>Where it is: " + esc(b.location) + "</p>" +
        (b.yardSize ? "<p>Yard size estimate: " + esc(b.yardSize) + "</p>" : "") +
        "<p>What needs done: " + esc(b.workNeeded) + "</p>" +
        "<p>Status: " + esc(b.status) + " · <span class='ding'>" + dingLabel(b.dingStatus) + "</span></p>" +
        "<p>Received: " + esc(b.createdAt) + "</p>" +
        "<button class='btn' data-act='seen' data-id='" + b.id + "'>Mark seen</button>" +
        "<button class='btn' data-act='done' data-id='" + b.id + "'>Mark done</button>" +
        "<button class='btn btn-secondary' data-act='remove' data-id='" + b.id + "'>Remove</button></div>";
    }).join("");
    box.querySelectorAll("button[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-act"), id = btn.getAttribute("data-id");
        if (act === "remove") {
          if (!window.confirm("Remove this booking?")) return;
          fetch("/api/owner/bookings/" + id, { method: "DELETE", headers: ownerHeaders() })
            .then(loadOwner).catch(function () {});
        } else {
          fetch("/api/owner/bookings/" + id, { method: "PATCH", headers: ownerHeaders(), body: JSON.stringify({ status: act }) })
            .then(loadOwner).catch(function () {});
        }
      });
    });
  }
  function loadOwner() {
    fetch("/api/owner/bookings", { headers: ownerHeaders() })
      .then(function (r) { return r.json(); }).then(renderOwnerBookings).catch(function () {});
    fetch("/api/owner/ding-email", { headers: ownerHeaders() })
      .then(function (r) { return r.json(); }).then(function (j) {
        $("ding-current").textContent = j.email ? "Current ding email: " + j.email : "No ding email is set yet.";
        if (!j.smtpConfigured) {
          $("ding-current").textContent += " (Email sending is not set up on the host yet, so dings will show as not set up until SMTP is configured.)";
        }
      }).catch(function () {});
  }
  function unlockOwner() {
    $("owner-locked").hidden = true;
    $("owner-unlocked").hidden = false;
    loadOwner();
  }
  fetch("/api/owner/status").then(function (r) { return r.json(); }).then(function (j) {
    if (j.pinSet) {
      $("owner-pin-title").textContent = "Enter owner PIN";
      $("owner-pin-note").textContent = "Enter your owner PIN to see bookings.";
      if (ownerPin) {
        fetch("/api/owner/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: ownerPin }) })
          .then(function (r) { return r.json(); }).then(function (v) { if (v.ok) unlockOwner(); });
      }
    } else {
      $("owner-pin-title").textContent = "Set your owner PIN";
      $("owner-pin-note").textContent = "No owner PIN is set yet. Choose one now — only you will use it to open the owner side.";
    }
  }).catch(function () {});
  $("owner-pin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var pin = e.target.pin.value;
    fetch("/api/owner/status").then(function (r) { return r.json(); }).then(function (j) {
      if (!j.pinSet) {
        return fetch("/api/owner/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin }) })
          .then(function (r) { return r.json().then(function (x) { return { ok: r.ok, x: x }; }); })
          .then(function (res) {
            if (!res.ok) { $("owner-pin-status").textContent = res.x.error || "Could not set the PIN."; return; }
            ownerPin = pin; sessionStorage.setItem("tcOwnerPin", pin); unlockOwner();
          });
      }
      return fetch("/api/owner/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin }) })
        .then(function (r) { return r.json(); }).then(function (v) {
          if (!v.ok) { $("owner-pin-status").textContent = "That PIN is incorrect."; return; }
          ownerPin = pin; sessionStorage.setItem("tcOwnerPin", pin); unlockOwner();
        });
    }).catch(function () { $("owner-pin-status").textContent = "Could not reach the owner side. Try again."; });
  });
  $("ding-email-form").addEventListener("submit", function (e) {
    e.preventDefault();
    fetch("/api/owner/ding-email", { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ email: e.target.email.value }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        $("ding-status").textContent = res.ok ? "Ding email saved." : (res.j.error || "Could not save the ding email.");
        if (res.ok) loadOwner();
      }).catch(function () { $("ding-status").textContent = "Could not save the ding email."; });
  });

  loadReviews();
})();
