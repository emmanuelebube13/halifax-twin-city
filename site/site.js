// Theme switch and story filter. The page works fully without this script.
(function () {
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("hdt-theme", next); } catch (e) {}
    });
  }

  var buttons = document.querySelectorAll(".tide-filter button");
  var rows = document.querySelectorAll("#tide li");
  Array.prototype.forEach.call(buttons, function (btn) {
    btn.addEventListener("click", function () {
      var f = btn.getAttribute("data-filter");
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      Array.prototype.forEach.call(rows, function (r) { r.hidden = f !== "all" && r.getAttribute("data-sector") !== f; });
    });
  });
})();
