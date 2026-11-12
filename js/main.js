/* Sole Society: everything interactive.
   Data comes from Supabase when js/config.js has the project URL and public key:
   catalogue, accounts (Supabase Auth), wishlist, orders, saved addresses and contact
   messages. Without it, the catalogue falls back to js/products.js and account,
   checkout and contact say the database isn't connected. The basket always lives in
   this browser (localStorage) until checkout. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var euro = function (n) { return "€" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
  var show = function (el, on) { if (el) el.hidden = !on; };

  var FREE_OVER = 50;
  /* The design system only says delivery is free over €50. Set the charge for
     smaller orders here and in place_order() in supabase/schema.sql; null shows "To be confirmed". */
  var DELIVERY_UNDER_FREE = null;
  var DEPT_NAMES = { women: "Women", men: "Men", kids: "Kids" };
  var DEPT_PAGES = { women: "women.html", men: "men.html", kids: "kids.html" };
  var TYPES = { boots: "Boots", trainers: "Trainers", school: "School shoes", formal: "Formal", socks: "Socks" };
  var TYPE_PAGES = { boots: "boots.html", trainers: "trainers.html", school: "school-shoes.html", socks: "socks.html" };
  var CONV = { "4": "UK 4 = EU 37 = US 6", "5": "UK 5 = EU 38 = US 7", "6": "UK 6 = EU 39 = US 8",
    "7": "UK 7 = EU 40.5 = US 9", "8": "UK 8 = EU 42 = US 10", "10": "UK 10 = EU 44.5 = US 12" };
  var HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
  var TRUCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
  var RET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>';
  /* Page name, e.g. "account.html". Netlify serves pretty URLs (/account), so add .html back. */
  function pageOf(path) {
    var p = String(path || "").split(/[?#]/)[0].split("/").pop() || "index.html";
    return p.indexOf(".") < 0 ? p + ".html" : p;
  }
  var here = pageOf(location.pathname);

  /* ---------- storage ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("ss-" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("ss-" + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem("ss-" + k); } catch (e) {} }
  };
  var basket = store.get("basket", []);
  var wish = store.get("wishlist", []);

  /* ---------- Supabase ---------- */
  var CFG = window.SS_CONFIG || {};
  var db = null;
  try {
    if (CFG.supabaseUrl && CFG.supabaseKey && window.supabase && window.supabase.createClient) {
      db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    }
  } catch (e) { console.warn("Supabase could not start:", e); }
  var user = null;
  var NO_DB = "The shop database isn't connected yet, so this can't be saved. See supabase/README.md.";

  function friendly(err) {
    var m = (err && (err.message || err.error_description)) || "Something went wrong. Please try again.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Can't reach the shop database. Check your connection and try again.";
    return m;
  }

  /* ---------- catalogue ---------- */
  var PRODUCTS = [], BY = {};
  var byPos = function (a, b) { return (a.position || 0) - (b.position || 0); };
  function fromDb(r) {
    return {
      slug: r.slug, brand: r.brand, name: r.name, type: r.type, depts: r.departments || [],
      price: +r.price, was: r.was_price != null ? +r.was_price : null,
      rating: r.rating != null ? +r.rating : null, reviews: r.review_count, breakdown: r.rating_breakdown,
      badge: r.badge, widths: r.widths && r.widths.length ? r.widths : ["Standard"], dots: r.swatch_dots,
      colours: (r.product_colours || []).slice().sort(byPos).map(function (c) { return { name: c.name, hex: c.hex, family: c.family, img: c.image }; }),
      images: (r.product_images || []).slice().sort(byPos).map(function (i) { return i.url; }),
      sizes: (r.product_sizes || []).slice().sort(byPos).map(function (s) { return { size: s.size, stock: s.stock }; }),
      sampleReviews: (r.reviews || []).map(function (v) { return { stars: v.stars, title: v.title, body: v.body, sample: v.is_sample }; })
    };
  }
  function finish(p) {
    p.href = "product.html?p=" + encodeURIComponent(p.slug);
    p.img = p.images[0] || (p.colours[0] && p.colours[0].img) || "images/placeholder-banner-seasonal-boots.svg";
    if (!p.dots || !p.dots.length) p.dots = p.colours.map(function (c) { return c.hex; });
    return p;
  }
  var CACHE = "ss-catalogue-v1", TTL = 5 * 60 * 1000;
  function loadCatalogue() {
    var local = function () { return (window.SS_PRODUCTS || []).map(function (p) { return JSON.parse(JSON.stringify(p)); }); };
    if (!db) return Promise.resolve(local());
    try { var c = JSON.parse(sessionStorage.getItem(CACHE)); if (c && Date.now() - c.t < TTL) return Promise.resolve(c.d); } catch (e) {}
    return db.from("products").select("*, product_colours(*), product_images(*), product_sizes(*), reviews(*)")
      .eq("active", true).order("sort_order").order("name")
      .then(function (res) {
        if (res.error) throw res.error;
        var d = res.data.map(fromDb);
        try { sessionStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
        return d;
      })
      .catch(function (err) { console.warn("Using the offline catalogue:", err); return local(); });
  }

  /* ---------- shared markup ---------- */
  function stars(r) { var f = Math.round(r); return "★★★★★".slice(0, f) + "☆☆☆☆☆".slice(0, 5 - f); }
  function priceHTML(p) {
    return '<span class="price' + (p.was ? " sale" : "") + '"><b>' + euro(p.price) + "</b>" + (p.was ? '<s><span class="sr-only">was </span>' + euro(p.was) + "</s>" : "") + "</span>";
  }
  function badgeHTML(p) { return p.badge ? '<span class="badge ' + p.badge + '">' + (p.badge === "new" ? "New" : "Sale") + "</span>" : ""; }
  function cardHTML(p) {
    var n = p.dots.length;
    return '<article class="card" data-product="' + esc(p.slug) + '"><div class="tile"><a href="' + p.href + '" tabindex="-1" aria-hidden="true"><img src="' + esc(p.img) + '" alt="" width="800" height="800" loading="lazy"></a>' + badgeHTML(p) +
      '<button class="wish" type="button" data-wish="' + esc(p.slug) + '" aria-pressed="false" aria-label="Save ' + esc(p.name) + ' to wishlist">' + HEART + "</button></div>" +
      '<span class="c-brand">' + esc(p.brand) + '</span><h2 class="c-name"><a href="' + p.href + '">' + esc(p.name) + "</a></h2>" +
      (p.rating ? '<span class="rate"><span class="stars" aria-hidden="true">' + stars(p.rating) + "</span>" + p.rating + " (" + p.reviews + ')<span class="sr-only"> out of 5, ' + p.reviews + " reviews</span></span>" : "") +
      priceHTML(p) + '<span class="cdots">' + p.dots.map(function (c) { return '<i style="background:' + esc(c) + '"></i>'; }).join("") + (n > 1 ? n + " colours" : "1 colour") + "</span></article>";
  }

  /* ---------- header ---------- */
  function setCount(sel, n) {
    $$(sel).forEach(function (el) { el.textContent = n; if (el.classList.contains("count")) el.hidden = n === 0; });
  }
  function firstName(n) { return (n || "").trim().split(/\s+/)[0]; }
  function refreshHeader() {
    setCount("[data-basket-count]", basket.reduce(function (a, i) { return a + i.qty; }, 0));
    setCount("[data-wish-count]", wish.length);
    var name = user && ((user.user_metadata && firstName(user.user_metadata.full_name)) || "Account");
    $$("[data-account-label]").forEach(function (el) { el.textContent = user ? name : "Sign in"; });
  }
  $$(".dept a").forEach(function (a) { if (pageOf(a.getAttribute("href")) === here) a.setAttribute("aria-current", "page"); });

  /* ---------- sign-in required for basket, wishlist and checkout ---------- */
  var REASONS = {
    basket: "Please sign in to add items to your basket.",
    wishlist: "Please sign in to save items to your wishlist.",
    checkout: "Please sign in to check out."
  };
  function safeNext(n) { return /^[a-z0-9-]+\.html(\?[^\s#]*)?(#[\w-]*)?$/i.test(n || "") ? n : null; }
  /* Returns true (and sends the visitor to sign in) when the shop database is on and nobody is signed in. */
  function requireLogin(reason) {
    if (!db || user) return false;
    location.href = "account.html?reason=" + reason + "&next=" + encodeURIComponent(here + location.search + location.hash);
    return true;
  }

  /* ---------- search ---------- */
  var CATS = [
    { name: "Women", href: "women.html", test: function (p) { return p.depts.indexOf("women") > -1; } },
    { name: "Men", href: "men.html", test: function (p) { return p.depts.indexOf("men") > -1; } },
    { name: "Kids", href: "kids.html", test: function (p) { return p.depts.indexOf("kids") > -1; } },
    { name: "School shoes", href: "school-shoes.html", test: function (p) { return p.type === "school"; } },
    { name: "Boots", href: "boots.html", test: function (p) { return p.type === "boots"; } },
    { name: "Trainers", href: "trainers.html", test: function (p) { return p.type === "trainers"; } },
    { name: "Socks", href: "socks.html", test: function (p) { return p.type === "socks"; } },
    { name: "Sale", href: "sale.html", test: function (p) { return !!p.was; } }
  ];
  function searchText(p) {
    return [p.name, p.brand, TYPES[p.type] || "", p.depts.map(function (d) { return DEPT_NAMES[d] || d; }).join(" "),
      p.colours.map(function (c) { return c.name; }).join(" ")].join(" ").toLowerCase();
  }
  function matchesQuery(p, q) {
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return searchText(p).indexOf(w) > -1; });
  }
  var q = $("#q"), sugg = $("#sugg");
  function hl(text, term) {
    var i = text.toLowerCase().indexOf(term);
    if (i < 0 || !term) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + term.length)) + "</mark>" + esc(text.slice(i + term.length));
  }
  function closeSugg() { if (sugg) { sugg.hidden = true; q.setAttribute("aria-expanded", "false"); } }
  function renderSugg() {
    var term = q.value.trim().toLowerCase();
    if (term.length < 2) return closeSugg();
    var cats = CATS.filter(function (c) { return c.name.toLowerCase().indexOf(term) > -1; });
    var prods = PRODUCTS.filter(function (p) { return matchesQuery(p, term); }).slice(0, 4);
    if (!cats.length && !prods.length) return closeSugg();
    var h = "";
    if (cats.length) h += "<p>Categories</p>" + cats.map(function (c) {
      return '<a class="s-row" href="' + c.href + '"><span>' + hl(c.name, term) + "</span><span>" + PRODUCTS.filter(c.test).length + "</span></a>";
    }).join("");
    if (prods.length) h += "<p>Products</p>" + prods.map(function (p) {
      return '<a class="s-row" href="' + p.href + '"><span>' + hl(p.name, term) + "</span><span>" + euro(p.price) + "</span></a>";
    }).join("");
    sugg.innerHTML = h; sugg.hidden = false; q.setAttribute("aria-expanded", "true");
  }
  if (q && sugg) {
    q.addEventListener("input", renderSugg);
    q.addEventListener("focus", renderSugg);
    q.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSugg();
      if (e.key === "ArrowDown" && !sugg.hidden) { var f = $("a", sugg); if (f) { e.preventDefault(); f.focus(); } }
    });
    sugg.addEventListener("keydown", function (e) {
      var links = $$("a", sugg), i = links.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? links[i - 1] : q).focus(); }
      if (e.key === "Escape") { closeSugg(); q.focus(); }
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".search")) closeSugg(); });
    var sp = new URLSearchParams(location.search).get("q");
    if (sp && here === "search.html") q.value = sp;
  }

  /* ---------- basket (this browser) ---------- */
  function itemKey(i) { return [i.slug, i.colour, i.size, i.width].join("|"); }
  function itemImg(i, p) {
    var c = p.colours.filter(function (c) { return c.name === i.colour; })[0];
    return (c && c.img) || p.img;
  }
  function lineMeta(item, p) {
    var bits = [item.colour, "UK " + item.size];
    if (p && p.widths.length > 1) bits.push(item.width);
    return bits.join(" · ");
  }
  function liveBasket() { return basket.filter(function (i) { return BY[i.slug]; }); }
  function totals() {
    var sub = liveBasket().reduce(function (a, i) { return a + BY[i.slug].price * i.qty; }, 0);
    var free = sub >= FREE_OVER, del = free ? 0 : DELIVERY_UNDER_FREE;
    return { sub: sub, free: free, del: del, total: sub + (del || 0) };
  }
  function saveBasket() { store.set("basket", basket); renderBasket(); refreshHeader(); }
  function renderBasket() {
    var t = totals();
    $$("[data-lines]").forEach(function (box) {
      box.innerHTML = basket.map(function (item, idx) {
        var p = BY[item.slug]; if (!p) return "";
        return '<div class="line" data-idx="' + idx + '">' +
          '<a class="tile" href="' + p.href + '" tabindex="-1" aria-hidden="true"><img src="' + esc(itemImg(item, p)) + '" alt="" width="64" height="64"></a>' +
          '<div><h3><a href="' + p.href + '">' + esc(p.name) + "</a></h3><p>" + esc(lineMeta(item, p)) + "</p>" +
          '<span class="qty"><button type="button" data-qty="-1" aria-label="Decrease quantity of ' + esc(p.name) + '">−</button>' +
          '<input type="number" name="qty[' + esc(itemKey(item)) + ']" value="' + item.qty + '" min="1" max="9" inputmode="numeric" aria-label="Quantity of ' + esc(p.name) + '">' +
          '<button type="button" data-qty="1" aria-label="Increase quantity of ' + esc(p.name) + '">+</button></span></div>' +
          '<div class="rt">' + euro(p.price * item.qty) + '<button type="button" data-remove>Remove</button></div></div>';
      }).join("");
    });
    var empty = liveBasket().length === 0;
    $$("[data-empty]").forEach(function (el) { el.hidden = !empty; });
    $$("[data-totals]").forEach(function (el) { el.hidden = empty; });
    $$("[data-free]").forEach(function (el) { el.hidden = empty || !t.free; });
    $$("[data-subtotal]").forEach(function (el) { el.textContent = euro(t.sub); });
    $$("[data-delivery]").forEach(function (el) { el.textContent = t.free ? "Free" : (t.del == null ? "To be confirmed" : euro(t.del)); });
    $$("[data-total]").forEach(function (el) { el.textContent = euro(t.total); });
    renderSummary();
  }
  function addToBasket(item) {
    var k = itemKey(item), found = basket.filter(function (i) { return itemKey(i) === k; })[0];
    if (found) found.qty = Math.min(9, found.qty + item.qty); else basket.unshift(item);
    saveBasket();
  }
  document.addEventListener("click", function (e) {
    var line = e.target.closest(".line[data-idx]");
    if (!line) return;
    var idx = +line.dataset.idx;
    var step = e.target.closest("[data-qty]");
    if (step) { basket[idx].qty = Math.min(9, Math.max(1, basket[idx].qty + +step.dataset.qty)); saveBasket(); }
    if (e.target.closest("[data-remove]")) {
      var inDrawer = !!e.target.closest("#basket");
      basket.splice(idx, 1); saveBasket();
      if (inDrawer) $("#basket .dr-h button").focus();
    }
  });
  document.addEventListener("change", function (e) {
    var line = e.target.closest(".line[data-idx]");
    if (line && e.target.matches("input")) {
      var n = parseInt(e.target.value, 10);
      if (!n || n < 1) basket.splice(+line.dataset.idx, 1); else basket[+line.dataset.idx].qty = Math.min(9, n);
      saveBasket();
    }
  });
  $$("[data-basket-form]").forEach(function (f) {
    f.addEventListener("submit", function (e) { e.preventDefault(); if (liveBasket().length) location.href = "checkout.html"; });
  });

  /* drawer */
  var drawer = $("#basket"), scrim = $(".scrim"), lastFocus = null;
  function openBasket() {
    if (!drawer) return;
    closeSugg();
    lastFocus = document.activeElement;
    drawer.hidden = false; scrim.hidden = false;
    document.body.classList.add("no-scroll");
    $(".dr-h button", drawer).focus();
  }
  function closeBasket() {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true; scrim.hidden = true;
    document.body.classList.remove("no-scroll");
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }
  $$("[data-open-basket]").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); openBasket(); }); });
  $$("[data-close-basket]").forEach(function (b) { b.addEventListener("click", closeBasket); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeBasket();
    if (e.key === "Tab" && drawer && !drawer.hidden) {
      var f = $$("a[href],button:not([disabled]),input", drawer).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- wishlist (this browser, synced to the account when signed in) ---------- */
  function syncWishButtons() {
    $$("[data-wish]").forEach(function (b) {
      var on = wish.indexOf(b.dataset.wish) > -1, p = BY[b.dataset.wish];
      b.setAttribute("aria-pressed", String(on));
      if (p) b.setAttribute("aria-label", on ? "Remove " + p.name + " from wishlist" : "Save " + p.name + " to wishlist");
    });
  }
  function wishChanged() { store.set("wishlist", wish); syncWishButtons(); refreshHeader(); renderWishlist(); }
  function pullWishlist() {
    if (!db || !user || !PRODUCTS.length) return Promise.resolve();
    return db.from("wishlist_items").select("product_slug").then(function (res) {
      if (res.error) throw res.error;
      var remote = res.data.map(function (r) { return r.product_slug; });
      var missing = wish.filter(function (s) { return remote.indexOf(s) < 0 && BY[s]; });
      wish = remote.concat(missing);
      wishChanged();
      if (missing.length) return db.from("wishlist_items").upsert(missing.map(function (s) { return { user_id: user.id, product_slug: s }; }), { onConflict: "user_id,product_slug", ignoreDuplicates: true });
    }).catch(function (err) { console.warn("Wishlist sync failed:", err); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-wish]");
    if (!b) return;
    if (requireLogin("wishlist")) return;
    var s = b.dataset.wish, i = wish.indexOf(s);
    if (i > -1) wish.splice(i, 1); else wish.unshift(s);
    wishChanged();
    if (db && user) {
      var req = i > -1 ? db.from("wishlist_items").delete().eq("product_slug", s) : db.from("wishlist_items").insert({ user_id: user.id, product_slug: s });
      req.then(function (res) { if (res.error) console.warn("Wishlist save failed:", res.error); });
    }
  });
  function renderWishlist() {
    var grid = $("[data-wishlist-grid]");
    if (!grid) return;
    var items = wish.map(function (s) { return BY[s]; }).filter(Boolean);
    grid.innerHTML = items.map(cardHTML).join("");
    show($("[data-wish-empty]"), items.length === 0);
    $("[data-wish-summary]").textContent = items.length ? items.length + " saved" : "";
    syncWishButtons();
  }

  /* ---------- home ---------- */
  function renderHome() {
    var tests = { women: CATS[0].test, men: CATS[1].test, kids: CATS[2].test, school: CATS[3].test, boots: CATS[4].test, socks: CATS[6].test };
    $$("[data-cat-count]").forEach(function (el) {
      var n = PRODUCTS.filter(tests[el.dataset.catCount]).length;
      el.textContent = n + (n === 1 ? " style" : " styles");
    });
    /* a photo on each category tile: a preferred style if it's in the catalogue, else the first match */
    var PICK = { women: "burren-leather-chelsea-boot", men: "linden-co-leather-oxford", kids: "little-dash-light-up-runner",
      school: "little-dash-touch-fasten-school-shoe", boots: "burren-suede-chelsea-boot", socks: "kettle-ribbed-socks-3-pack" };
    $$("[data-cat-img]").forEach(function (img) {
      var k = img.dataset.catImg, p = (BY[PICK[k]] && tests[k](BY[PICK[k]])) ? BY[PICK[k]] : PRODUCTS.filter(tests[k])[0];
      if (p) { img.src = p.img; img.hidden = false; }
    });
    /* product rows */
    var rows = {
      top: PRODUCTS.filter(function (p) { return p.rating; }).sort(function (a, b) { return b.rating - a.rating || (b.reviews || 0) - (a.reviews || 0); }),
      sale: PRODUCTS.filter(function (p) { return p.was; }),
      "new": PRODUCTS.filter(function (p) { return p.badge === "new"; })
    };
    $$("[data-home-row]").forEach(function (sec) {
      var list = (rows[sec.dataset.homeRow] || []).slice(0, 4);
      $("[data-row-grid]", sec).innerHTML = list.map(cardHTML).join("");
      sec.hidden = list.length === 0;
    });
    syncWishButtons();
  }

  /* ---------- product page (product.html?p=slug) ---------- */
  function renderProduct() {
    var box = $("[data-product-page]");
    if (!box) return;
    var slug = new URLSearchParams(location.search).get("p"), p = BY[slug];
    if (!p) {
      box.innerHTML = '<div class="lh"><h1>We couldn\'t find that style</h1></div><p class="empty">It may have sold out or moved. <a href="index.html">Continue shopping</a></p>';
      document.title = "Not found | Sole Society";
      return;
    }
    document.title = p.name + " | Sole Society";
    var meta = $('meta[name="description"]');
    if (meta) meta.setAttribute("content", p.name + " by " + p.brand + ", " + euro(p.price) + (p.was ? " (was " + euro(p.was) + ")" : "") + ". Free delivery in Ireland over €50 and free returns within 30 days.");
    var dept = p.depts[0], crumbs = '<a href="index.html">Home</a>';
    if (dept && DEPT_PAGES[dept]) crumbs += ' / <a href="' + DEPT_PAGES[dept] + '">' + DEPT_NAMES[dept] + "</a>";
    crumbs += " / " + (TYPE_PAGES[p.type] ? '<a href="' + TYPE_PAGES[p.type] + '">' + TYPES[p.type] + "</a>" : esc(TYPES[p.type] || p.type)) + " / " + esc(p.name);
    var thumbs = p.images.length > 1 ? '<div class="thumbs" aria-label="Product views">' + p.images.map(function (u, i) {
      return '<button type="button" aria-pressed="' + (i === 0) + '" data-view="' + esc(u) + '"><img src="' + esc(u) + '" alt="" width="72" height="72"><span class="sr-only">View ' + (i + 1) + "</span></button>";
    }).join("") + "</div>" : "";
    var first = p.colours[0] || { name: "", hex: "#000000" };
    var cols = p.colours.map(function (c, i) {
      var img = c.img || (i === 0 ? p.img : "");
      return '<label><input type="radio" name="colour" value="' + esc(c.name) + '"' + (i === 0 ? " checked" : "") + ' data-colour-label="' + esc(c.name) + '"' + (img ? ' data-colour-image="' + esc(img) + '"' : "") +
        '><i style="background:' + esc(c.hex) + '"></i><span class="sr-only">' + esc(c.name) + "</span></label>";
    }).join("");
    var LABEL = { "in": "In stock", low: "Low stock", out: "Out of stock" };
    var sizes = p.sizes.map(function (s) {
      var lab = LABEL[s.stock] || "";
      return '<label class="size' + (s.stock === "low" ? " low" : "") + (s.stock === "out" ? " out" : "") + '"><input type="radio" name="size" value="' + esc(s.size) + '"' + (s.stock === "out" ? " disabled" : "") + " required><b>" + esc(s.size) + "</b>" + (lab ? "<small>" + lab + "</small>" : "") + "</label>";
    }).join("");
    var widths = p.widths.length > 1
      ? '<fieldset><legend class="lbl"><span>Width</span></legend><div class="widths">' + p.widths.map(function (w, i) { return '<label><input type="radio" name="width" value="' + esc(w) + '"' + (i === 0 ? " checked" : "") + ">" + esc(w) + "</label>"; }).join("") + "</div></fieldset>"
      : '<input type="hidden" name="width" value="' + esc(p.widths[0]) + '">';
    var rate = p.rating ? '<span class="rate"><span class="stars" aria-hidden="true">' + stars(p.rating) + "</span>" + p.rating + " · " + (p.sampleReviews.length ? '<a href="#reviews">' + p.reviews + " reviews</a>" : p.reviews + " reviews") + "</span>" : "";
    var reviews = "";
    if (p.sampleReviews.length) {
      var bars = (p.breakdown || []).map(function (b) { return "<div>" + b.stars + '<i style="--w:' + b.pct + '%"></i>' + b.count + "</div>"; }).join("");
      reviews = '<section class="reviews" id="reviews" aria-labelledby="reviews-title"><div class="rv-sum"><h2 id="reviews-title">Reviews</h2>' +
        (p.rating ? "<b>" + p.rating + '</b><div class="rate" style="margin-top:6px"><span class="stars" aria-hidden="true">' + stars(p.rating) + "</span>" + p.reviews + " reviews</div>" : "") +
        (bars ? '<div class="bars" aria-label="Rating breakdown">' + bars + "</div>" : "") + "</div><div>" +
        p.sampleReviews.map(function (r) {
          return '<article class="rv"><div class="rv-h"><span class="stars" aria-label="' + r.stars + ' out of 5">' + stars(r.stars) + "</span><h3>" + esc(r.title) + "</h3>" + (r.sample !== false ? '<span class="sample">Sample review</span>' : "") + "</div><p>" + esc(r.body) + "</p></article>";
        }).join("") + "</div></section>";
    }
    box.innerHTML = '<nav class="crumbs" aria-label="Breadcrumb">' + crumbs + "</nav>" +
      '<div class="pdp-in"><div class="gal' + (thumbs ? "" : " gal-one") + '">' + thumbs + '<div class="tile"><img data-main-image src="' + esc(p.img) + '" alt="' + esc(p.name + " in " + first.name.toLowerCase()) + '" width="800" height="800">' + badgeHTML(p) +
      '<button class="wish" type="button" data-wish="' + esc(p.slug) + '" aria-pressed="false">' + HEART + "</button></div></div>" +
      '<form class="buy" name="add-to-basket" action="basket.html" method="get" data-add-to-basket><input type="hidden" name="product" value="' + esc(p.slug) + '">' +
      '<div><span class="c-brand">' + esc(p.brand) + '</span><h1 id="product-title">' + esc(p.name) + "</h1>" + rate + "</div>" + priceHTML(p) +
      '<fieldset><legend class="lbl"><span>Colour: <span data-colour-name>' + esc(first.name) + '</span></span></legend><div class="cols">' + cols + "</div></fieldset>" +
      '<fieldset><legend class="lbl"><span>' + (p.type === "socks" ? "UK size" : "Select UK size") + '</span><a href="help.html#size-guide">Size guide (UK, EU, US)</a></legend><div class="sizes">' + sizes +
      '</div><span class="conv" data-conv aria-live="polite"></span><span class="form-msg" data-size-msg role="alert" hidden>Please choose a size.</span></fieldset>' + widths +
      '<div class="atb"><button class="btn btn-action" type="submit">Add to basket</button><button class="btn btn-ghost" type="button" data-wish="' + esc(p.slug) + '" aria-pressed="false">' + HEART + "</button></div>" +
      '<div class="assure"><div>' + TRUCK + "<span><b>Free delivery</b> over €50, 2–3 working days in Ireland. Order by 2pm for dispatch today.</span></div><div>" + RET + "<span><b>Free returns</b> within 30 days. Print a label or drop off at any parcel point.</span></div></div>" +
      '<div class="pay"><span>Pay with</span><span class="pm">VISA</span><span class="pm">Mastercard</span><span class="pm">Apple Pay</span><span class="pm">Google Pay</span><span>· test mode only</span></div></form></div>' + reviews;
    bindProduct(p);
  }
  function bindProduct(product) {
    var buy = $("[data-add-to-basket]");
    var conv = $("[data-conv]"), main = $("[data-main-image]"), msg = $("[data-size-msg]");
    buy.addEventListener("change", function (e) {
      var t = e.target;
      if (t.name === "size") { conv.textContent = CONV[t.value] || ""; msg.hidden = true; }
      if (t.name === "colour") {
        $("[data-colour-name]").textContent = t.dataset.colourLabel;
        if (t.dataset.colourImage) {
          main.src = t.dataset.colourImage;
          $$(".thumbs button").forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === 0)); });
        }
        main.alt = product.name + " in " + t.dataset.colourLabel.toLowerCase();
      }
    });
    $$(".thumbs button").forEach(function (b, i) {
      b.addEventListener("click", function () {
        $$(".thumbs button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        var c = $('input[name="colour"]:checked', buy);
        main.src = (i === 0 && c && c.dataset.colourImage) ? c.dataset.colourImage : b.dataset.view;
      });
    });
    var sizes = $$('input[name="size"]:not([disabled])', buy);
    if (sizes.length === 1) sizes[0].checked = true;
    buy.addEventListener("submit", function (e) {
      e.preventDefault();
      if (requireLogin("basket")) return;
      var size = $('input[name="size"]:checked', buy);
      if (!size) { msg.hidden = false; if (sizes[0]) sizes[0].focus(); return; }
      var colour = $('input[name="colour"]:checked', buy);
      addToBasket({ slug: product.slug, colour: colour ? colour.value : "", size: size.value, width: buy.elements.width.value, qty: 1 });
      openBasket();
    });
    buy.addEventListener("invalid", function (e) { e.preventDefault(); msg.hidden = false; }, true);
    syncWishButtons();
  }

  /* ---------- listings ---------- */
  function renderListing() {
    var listing = $("[data-listing]");
    if (!listing) return;
    var form = $("#filters"), grid = $("[data-grid]");
    show($("[data-loading]", listing), false);
    grid.innerHTML = PRODUCTS.map(cardHTML).join("");
    var brands = PRODUCTS.map(function (p) { return p.brand; }).filter(function (b, i, a) { return a.indexOf(b) === i; }).sort();
    $("[data-brands]", form).innerHTML = brands.map(function (b) {
      return '<label class="chk"><input type="checkbox" name="brand" value="' + esc(b) + '" data-label="' + esc(b) + '"><i></i>' + esc(b) + "<em data-count></em></label>";
    }).join("");
    var cards = $$("[data-product]", grid);
    var isSale = listing.hasAttribute("data-sale"), isSearch = listing.hasAttribute("data-search");
    var params = new URLSearchParams(location.search), query = (params.get("q") || "").trim();
    var GROUPS = ["department", "size", "brand", "colour", "type", "width"];
    var sortSel = $('select[name="sort"]');
    if (GROUPS.concat(["price_min", "price_max", "sort"]).some(function (k) { return params.has(k); })) {
      $$('input[type="checkbox"]', form).forEach(function (i) { i.checked = params.getAll(i.name).indexOf(i.value) > -1; });
      ["price_min", "price_max"].forEach(function (k) { if (params.has(k)) form.elements[k].value = params.get(k); });
      if (params.has("sort")) sortSel.value = params.get("sort");
    }
    function sizeCovers(p, s) {
      return p.sizes.some(function (ps) {
        var m = String(ps.size).match(/^(\d+)\D+(\d+)$/);
        return ps.stock !== "out" && (m ? (+s >= +m[1] && +s <= +m[2]) : ps.size === s);
      });
    }
    var TEST = {
      department: function (p, v) { return p.depts.indexOf(v) > -1; },
      size: sizeCovers,
      brand: function (p, v) { return p.brand === v; },
      colour: function (p, v) { return p.colours.some(function (c) { return c.family === v; }); },
      type: function (p, v) { return p.type === v; },
      width: function (p, v) { return p.widths.indexOf(v) > -1; }
    };
    function state() {
      var s = {};
      GROUPS.forEach(function (g) { s[g] = $$('input[name="' + g + '"]:checked', form).map(function (i) { return i.value; }); });
      var mn = parseFloat(form.elements.price_min.value), mx = parseFloat(form.elements.price_max.value);
      s.min = isNaN(mn) ? null : mn; s.max = isNaN(mx) ? null : mx;
      return s;
    }
    function matches(p, s) {
      if (isSale && !p.was) return false;
      if (isSearch && query && !matchesQuery(p, query)) return false;
      if (s.min != null && p.price < s.min) return false;
      if (s.max != null && p.price > s.max) return false;
      return GROUPS.every(function (g) { return !s[g].length || s[g].some(function (v) { return TEST[g](p, v); }); });
    }
    var SORTS = {
      "best-selling": function (a, b) { return a.i - b.i; },
      "price-asc": function (a, b) { return a.p.price - b.p.price || a.i - b.i; },
      "price-desc": function (a, b) { return b.p.price - a.p.price || a.i - b.i; },
      "newest": function (a, b) { return ((b.p.badge === "new") - (a.p.badge === "new")) || a.i - b.i; },
      "top-rated": function (a, b) { return (b.p.rating || 0) - (a.p.rating || 0) || (b.p.reviews || 0) - (a.p.reviews || 0) || a.i - b.i; }
    };
    var order = cards.map(function (c, i) { return { el: c, p: BY[c.dataset.product], i: i }; });
    function apply() {
      var s = state(), shown = 0;
      order.slice().sort(SORTS[sortSel.value] || SORTS["best-selling"]).forEach(function (o) {
        var ok = matches(o.p, s);
        o.el.hidden = !ok; if (ok) shown++;
        grid.appendChild(o.el);
      });
      $("[data-result-count]").textContent = shown + (shown === 1 ? " style" : " styles");
      show($("[data-no-results]"), shown === 0);
      $$(".chk input", form).forEach(function (i) {
        var em = $("[data-count]", i.parentNode); if (!em) return;
        var one = {}; Object.keys(s).forEach(function (k) { one[k] = s[k]; });
        one[i.name] = [i.value];
        em.textContent = PRODUCTS.filter(function (p) { return matches(p, one); }).length;
      });
      $("[data-size-count]").textContent = s.size.length ? s.size.length + " selected" : "";
      var chips = $$('input[type="checkbox"]:checked', form).map(function (i) {
        return '<button class="chip" type="button" data-unset-name="' + esc(i.name) + '" data-unset-value="' + esc(i.value) + '" aria-label="Remove filter: ' + esc(i.dataset.label) + '">' + esc(i.dataset.label) + " ×</button>";
      });
      if (s.min != null || s.max != null) chips.push('<button class="chip" type="button" data-unset-price aria-label="Remove price filter">€' + (s.min != null ? s.min : 0) + "–€" + (s.max != null ? s.max : "any") + " ×</button>");
      $("[data-chips]").innerHTML = chips.join("");
      $$(".rbar [data-clear-filters]").forEach(function (b) { b.hidden = chips.length === 0; });
      if (isSearch) {
        $("[data-search-summary]").textContent = query ? shown + (shown === 1 ? " result" : " results") + " for “" + query + "”" : "Type in the search box to find shoes, brands or sizes.";
        document.title = (query ? "“" + query + "”: search" : "Search") + " | Sole Society";
      }
      syncWishButtons();
    }
    function pushURL() {
      var s = state(), u = new URLSearchParams();
      if (query) u.set("q", query);
      GROUPS.forEach(function (g) { s[g].forEach(function (v) { u.append(g, v); }); });
      if (s.min != null) u.set("price_min", s.min);
      if (s.max != null) u.set("price_max", s.max);
      if (sortSel.value !== "best-selling") u.set("sort", sortSel.value);
      try { history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : "")); } catch (e) {}
    }
    form.addEventListener("change", function () { apply(); pushURL(); });
    form.addEventListener("input", function (e) { if (e.target.type === "number") apply(); });
    sortSel.addEventListener("change", function () { apply(); pushURL(); });
    var tog = $(".f-toggle");
    function toggleFilters(open) { form.classList.toggle("open", open); tog.setAttribute("aria-expanded", String(open)); }
    if (tog) tog.addEventListener("click", function () { toggleFilters(!form.classList.contains("open")); });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); apply(); pushURL();
      if (form.classList.contains("open")) { toggleFilters(false); grid.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    listing.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-unset-name]");
      if (chip) {
        $$('input[name="' + chip.dataset.unsetName + '"]', form).forEach(function (i) { if (i.value === chip.dataset.unsetValue) i.checked = false; });
        apply(); pushURL(); return;
      }
      if (e.target.closest("[data-unset-price]")) { form.elements.price_min.value = ""; form.elements.price_max.value = ""; apply(); pushURL(); return; }
      if (e.target.closest("[data-clear-filters]")) {
        $$('input[type="checkbox"]', form).forEach(function (i) { i.checked = false; });
        form.elements.price_min.value = ""; form.elements.price_max.value = "";
        apply(); pushURL();
      }
    });
    apply();
  }

  /* ---------- checkout ---------- */
  var orderPlaced = false;
  function renderSummary() {
    var box = $("[data-summary-lines]");
    if (!box) return;
    box.innerHTML = liveBasket().map(function (i) {
      var p = BY[i.slug];
      return '<div class="sline"><img src="' + esc(itemImg(i, p)) + '" alt="" width="48" height="48"><div><b>' + esc(p.name) + "</b><span>" + esc(lineMeta(i, p)) + " · Qty " + i.qty + "</span></div><b>" + euro(p.price * i.qty) + "</b></div>";
    }).join("");
    if (!orderPlaced) {
      var empty = liveBasket().length === 0;
      show($("[data-checkout]"), !empty);
      show($("[data-checkout-empty]"), empty);
    }
  }
  function initCheckout() {
    var co = $("[data-checkout-form]");
    if (!co) return;
    if (requireLogin("checkout")) return;
    var msg = $("[data-checkout-msg]"), btn = $('button[type="submit"]', co);
    show($("[data-save-address]"), !!user);
    if (db && user) {
      co.elements.email.value = co.elements.email.value || user.email || "";
      co.elements.full_name.value = co.elements.full_name.value || (user.user_metadata && user.user_metadata.full_name) || "";
      db.from("addresses").select("*").order("created_at", { ascending: false }).limit(1).then(function (res) {
        var a = res.data && res.data[0]; if (!a) return;
        ["full_name", "address_1", "address_2", "town", "county", "eircode", "phone"].forEach(function (k) { if (a[k] && !co.elements[k].value) co.elements[k].value = a[k]; });
      });
    }
    co.addEventListener("submit", function (e) {
      e.preventDefault();
      msg.hidden = true;
      if (!liveBasket().length) return;
      if (!db) { msg.textContent = NO_DB; msg.hidden = false; return; }
      var f = co.elements, address = {};
      ["full_name", "address_1", "address_2", "town", "county", "eircode", "phone"].forEach(function (k) { address[k] = f[k].value.trim(); });
      btn.disabled = true; btn.textContent = "Placing order…";
      db.rpc("place_order", {
        p_email: f.email.value.trim(), p_address: address,
        p_items: liveBasket().map(function (i) { return { slug: i.slug, colour: i.colour, size: i.size, width: i.width, qty: i.qty }; }),
        p_save_address: !!(user && f.save_address.checked)
      }).then(function (res) {
        btn.disabled = false; btn.textContent = "Place order";
        if (res.error) { msg.textContent = friendly(res.error); msg.hidden = false; return; }
        orderPlaced = true;
        basket = []; saveBasket();
        var done = $("[data-order-done]");
        done.innerHTML = "<h2>Thanks" + (address.full_name ? ", " + esc(firstName(address.full_name)) : "") + ". Your order " + esc(res.data.order_number) + " is placed.</h2>" +
          "<p>Total " + euro(res.data.total) + ". Test mode: no card is charged, and no real order was taken.</p>" +
          "<p>" + (user ? '<a class="btn btn-action" href="account.html#orders">See order history</a> ' : "") + '<a class="btn btn-ghost" href="index.html">Continue shopping</a></p>';
        done.hidden = false;
        show($("[data-checkout]"), false);
        show($("[data-checkout-empty]"), false);
        done.focus();
      });
    });
  }

  /* ---------- account ---------- */
  function authMsg(text, isError) {
    var m = $("[data-auth-msg]"); if (!m) return;
    m.textContent = text || ""; m.hidden = !text;
    m.classList.toggle("ok", !!text && !isError);
  }
  var recovering = false;
  function renderAccount() {
    var out = $("[data-signed-out]");
    if (!out) return;
    var inn = $("[data-signed-in]"), reset = $("[data-reset-form]"), np = $("[data-new-password]");
    if (!db) { show($("[data-no-db]"), true); [out, inn, reset, np].forEach(function (el) { show(el, false); }); return; }
    show(np, recovering);
    show(out, !user && !recovering && reset.hidden);
    show(inn, !!user && !recovering);
    /* sign-in, reset and new-password forms are a centred card; the signed-in account view is full width */
    var pageEl = $("[data-account-page]"); if (pageEl) pageEl.classList.toggle("auth-page", !user || recovering);
    var params = new URLSearchParams(location.search);
    if (!user && !recovering) {
      var why = REASONS[params.get("reason")];
      if (why && !$("[data-auth-msg]").textContent) authMsg(why, true);
      $$(".auth-switch a").forEach(function (a) { if (location.search) a.setAttribute("href", "register.html" + location.search); });
    }
    if (user && !recovering && safeNext(params.get("next"))) { location.replace(safeNext(params.get("next"))); return; }
    if (!user || recovering) return;
    $("[data-account-email]").textContent = user.email;
    db.from("orders").select("order_number, created_at, total, delivery_fee, status, order_items(product_name, colour, size, width, qty, unit_price)")
      .order("created_at", { ascending: false }).then(function (res) {
        if (res.error) { authMsg(friendly(res.error), true); return; }
        $("[data-orders]").innerHTML = res.data.map(function (o) {
          return '<article class="order"><div class="order-h"><b>' + esc(o.order_number) + "</b><span>" + new Date(o.created_at).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) + "</span><span>" + esc(o.status) + "</span><b>" + euro(o.total) + "</b></div><ul>" +
            (o.order_items || []).map(function (i) { return "<li>" + esc(i.product_name) + " · " + esc(i.colour) + " · UK " + esc(i.size) + (i.width !== "Standard" ? " · " + esc(i.width) : "") + " · Qty " + i.qty + "</li>"; }).join("") + "</ul></article>";
        }).join("");
        show($("[data-orders-empty]"), res.data.length === 0);
        if (location.hash === "#orders") $("#orders").scrollIntoView();
      });
    loadAddresses();
  }
  function loadAddresses() {
    db.from("addresses").select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { authMsg(friendly(res.error), true); return; }
      $("[data-addresses]").innerHTML = res.data.map(function (a) {
        return '<article class="addr"><p>' + [a.full_name, a.address_1, a.address_2, a.town, a.county, a.eircode, a.phone].filter(Boolean).map(esc).join("<br>") +
          '</p><button class="clear" type="button" data-remove-address="' + a.id + '">Remove</button></article>';
      }).join("");
      show($("[data-addresses-empty]"), res.data.length === 0);
      if (location.hash === "#addresses") $("#addresses").scrollIntoView();
    });
  }
  function busy(form, on, label) {
    var b = $('button[type="submit"]', form);
    if (on) { b.dataset.label = b.textContent; b.textContent = label; } else if (b.dataset.label) b.textContent = b.dataset.label;
    b.disabled = on;
  }
  function initAccount() {
    if (!$("[data-signed-out]")) return;
    var si = $("[data-sign-in]"), rs = $("[data-reset-form]"), np = $("[data-new-password]");
    var accountURL = new URL("account.html", location.href).href;
    si.addEventListener("submit", function (e) {
      e.preventDefault(); authMsg("");
      busy(si, true, "Signing in…");
      db.auth.signInWithPassword({ email: si.elements.email.value.trim(), password: si.elements.password.value }).then(function (res) {
        busy(si, false);
        if (res.error) return authMsg(friendly(res.error), true);
        si.reset();
      });
    });
    $("[data-show-reset]").addEventListener("click", function () { authMsg(""); show($("[data-signed-out]"), false); show(rs, true); rs.elements.email.focus(); });
    $("[data-hide-reset]").addEventListener("click", function () { authMsg(""); show(rs, false); renderAccount(); });
    rs.addEventListener("submit", function (e) {
      e.preventDefault();
      busy(rs, true, "Sending…");
      db.auth.resetPasswordForEmail(rs.elements.email.value.trim(), { redirectTo: accountURL }).then(function (res) {
        busy(rs, false);
        if (res.error) return authMsg(friendly(res.error), true);
        authMsg("If that email has an account, a reset link is on its way.");
      });
    });
    np.addEventListener("submit", function (e) {
      e.preventDefault();
      busy(np, true, "Saving…");
      db.auth.updateUser({ password: np.elements.password.value }).then(function (res) {
        busy(np, false);
        if (res.error) return authMsg(friendly(res.error), true);
        recovering = false; np.reset();
        authMsg("Your password has been changed.");
        renderAccount();
      });
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-sign-out]")) {
        db.auth.signOut().then(function () {
          wish = []; store.del("wishlist"); wishChanged();
          basket = []; saveBasket();
          authMsg("You're signed out.");
        });
      }
      var ra = e.target.closest("[data-remove-address]");
      if (ra) db.from("addresses").delete().eq("id", ra.dataset.removeAddress).then(function (res) { if (res.error) authMsg(friendly(res.error), true); else loadAddresses(); });
    });
  }

  /* ---------- register page (register.html) ---------- */
  function renderRegister() {
    var wrap = $("[data-register-wrap]");
    if (!wrap) return;
    if (!db) { show($("[data-no-db]"), true); show(wrap, false); return; }
    show(wrap, !user);
    show($("[data-already-in]"), !!user);
  }
  function initRegister() {
    var rg = $("[data-register]");
    if (!rg) return;
    rg.addEventListener("submit", function (e) {
      e.preventDefault(); authMsg("");
      busy(rg, true, "Creating account…");
      db.auth.signUp({ email: rg.elements.email.value.trim(), password: rg.elements.password.value,
        options: { data: { full_name: rg.elements.full_name.value.trim() }, emailRedirectTo: new URL("account.html", location.href).href } }).then(function (res) {
        busy(rg, false);
        if (res.error) return authMsg(friendly(res.error), true);
        if (res.data.session) { location.href = safeNext(new URLSearchParams(location.search).get("next")) || "account.html"; return; }
        rg.reset();
        show($("[data-register-wrap]"), false);
        authMsg("Check your email: we've sent a link to confirm your account. After confirming, you'll be signed in.");
      });
    });
  }

  /* ---------- contact form ---------- */
  function initContact() {
    var c = $("[data-contact]");
    if (!c) return;
    var m = $("[data-contact-msg]");
    c.addEventListener("submit", function (e) {
      e.preventDefault();
      var say = function (t, ok) { m.textContent = t; m.hidden = false; m.classList.toggle("ok", ok); };
      if (!db) return say("This form isn't connected to the shop database yet, so your message wasn't sent.", false);
      busy(c, true, "Sending…");
      var f = c.elements;
      db.from("contact_messages").insert({ name: f.name.value.trim(), email: f.email.value.trim(), order_number: f.order_number.value.trim() || null, message: f.message.value.trim() })
        .then(function (res) {
          busy(c, false);
          if (res.error) return say(friendly(res.error), false);
          c.reset(); say("Thanks, your message has been sent.", true);
        });
    });
  }

  /* ---------- start ---------- */
  var session = db ? db.auth.getSession().then(function (r) { user = r.data.session ? r.data.session.user : null; }).catch(function () {}) : Promise.resolve();
  refreshHeader();
  Promise.all([loadCatalogue(), session]).then(function (r) {
    PRODUCTS = r[0].map(finish);
    BY = {}; PRODUCTS.forEach(function (p) { BY[p.slug] = p; });
    renderBasket(); refreshHeader();
    renderHome(); renderListing(); renderProduct(); renderWishlist(); syncWishButtons();
    initCheckout(); initContact();
    if (db) { initAccount(); initRegister(); }
    renderAccount(); renderRegister();
    pullWishlist();
  });
  if (db) {
    db.auth.onAuthStateChange(function (event, s) {
      /* Supabase advises against awaiting other calls inside this callback, so defer the work. */
      setTimeout(function () {
        var was = user && user.id;
        user = s ? s.user : null;
        if (event === "PASSWORD_RECOVERY") recovering = true;
        refreshHeader();
        if ((user && user.id) !== was) { renderAccount(); renderRegister(); pullWishlist(); show($("[data-save-address]"), !!user); }
        else if (event === "PASSWORD_RECOVERY") renderAccount();
      }, 0);
    });
  }
  window.addEventListener("storage", function () {
    basket = store.get("basket", []); wish = store.get("wishlist", []);
    renderBasket(); refreshHeader(); syncWishButtons(); renderWishlist();
  });
})();
