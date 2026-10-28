// TC Lawn Care Plus LLC — frontend logic for bookings, reviews, owner side.
(function () {
  "use strict";
  var pickedStars = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function stars(n) { return "★".repeat(n) + "☆".repeat(5 - n); }

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

  loadReviews();
})();
