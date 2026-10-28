// TC Lawn Care Plus LLC — owner panel logic (owner.html only).
// This page is unlinked from the public page: customers browsing the site
// never see that an owner side exists. The login + password still guard
// everything behind it.
(function () {
  "use strict";
  var ownerLogin = sessionStorage.getItem("tcOwnerLogin") || "";
  var ownerPassword = sessionStorage.getItem("tcOwnerPassword") || "";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dingLabel(s) {
    if (s === "sent") return "Email ding: sent";
    if (s === "failed") return "Email ding: didn't go out";
    if (s === "not_configured") return "Email ding: not set up yet";
    return "Email ding: on its way";
  }
  function ownerHeaders() { return { "Content-Type": "application/json", "x-owner-login": ownerLogin, "x-owner-password": ownerPassword }; }
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
    if (j.loginSet) {
      $("owner-login-title").textContent = "Owner login";
      $("owner-login-note").textContent = "Log in to see bookings.";
      if (ownerLogin && ownerPassword) {
        fetch("/api/owner/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: ownerLogin, password: ownerPassword }) })
          .then(function (r) { return r.json(); }).then(function (v) { if (v.ok) unlockOwner(); });
      }
    } else {
      $("owner-login-title").textContent = "Set your owner login";
      $("owner-login-note").textContent = "No owner login is set yet. Choose a login and a password now — only you will use them to open the owner side.";
    }
  }).catch(function () {});
  $("owner-login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var login = e.target.login.value;
    var password = e.target.password.value;
    fetch("/api/owner/status").then(function (r) { return r.json(); }).then(function (j) {
      if (!j.loginSet) {
        return fetch("/api/owner/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: login, password: password }) })
          .then(function (r) { return r.json().then(function (x) { return { ok: r.ok, x: x }; }); })
          .then(function (res) {
            if (!res.ok) { $("owner-login-status").textContent = res.x.error || "Could not set the login."; return; }
            ownerLogin = login; ownerPassword = password;
            sessionStorage.setItem("tcOwnerLogin", login); sessionStorage.setItem("tcOwnerPassword", password);
            unlockOwner();
          });
      }
      return fetch("/api/owner/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: login, password: password }) })
        .then(function (r) { return r.json(); }).then(function (v) {
          if (!v.ok) { $("owner-login-status").textContent = "That login or password is incorrect."; return; }
          ownerLogin = login; ownerPassword = password;
          sessionStorage.setItem("tcOwnerLogin", login); sessionStorage.setItem("tcOwnerPassword", password);
          unlockOwner();
        });
    }).catch(function () { $("owner-login-status").textContent = "Could not reach the owner side. Try again."; });
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
})();
