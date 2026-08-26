/* annotate.js — hold Alt/Option and draw over anything on a slide (circle it,
   scribble on it); on release, a structured context snippet is copied to the
   clipboard, ready to paste into Claude Code. Or: select text normally and
   press "c" to copy the selection with the same slide context. */
(function () {
  var holding = false, drawing = false, pts = [];
  var canvas = document.createElement('canvas');
  canvas.id = 'annot';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:999;pointer-events:none';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  function size() {
    var d = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * d; canvas.height = innerHeight * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--loop').trim() || '#E08A3C';
  }
  size(); addEventListener('resize', size);

  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;left:50%;bottom:56px;transform:translateX(-50%);' +
    'z-index:1000;background:var(--panel,#161C24);color:var(--ink,#ECEAE3);' +
    'border:1px solid var(--loop,#E08A3C);border-radius:8px;padding:8px 16px;' +
    'font:12px ui-monospace,Menlo,monospace;letter-spacing:.06em;opacity:0;' +
    'transition:opacity .25s;pointer-events:none';
  document.body.appendChild(toast);
  var toastT;
  function say(msg) {
    toast.textContent = msg; toast.style.opacity = '1';
    clearTimeout(toastT); toastT = setTimeout(function(){ toast.style.opacity = '0'; }, 1800);
  }

  function slideInfo() {
    var s = document.querySelector('body.slides .slide.active') ||
            document.querySelector('.slide');
    if (!s) return { label: 'unknown slide' };
    var all = [].slice.call(document.querySelectorAll('.slide'));
    var n = all.indexOf(s) + 1;
    var h = s.querySelector('h1,h2');
    return { el: s, label: 'slide ' + (n < 10 ? '0' + n : n) + ' · #' + (s.id || '?') +
             (h ? ' · "' + h.innerText.replace(/\s+/g, ' ').trim() + '"' : '') };
  }

  function pathFor(el) {
    var bits = [], e = el, hops = 0;
    while (e && e.nodeType === 1 && hops < 4 && !e.classList.contains('slide')) {
      var t = e.tagName.toLowerCase();
      if (e.id) { bits.unshift(t + '#' + e.id); break; }
      var cls = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/)[0];
      var sibs = e.parentElement ? [].filter.call(e.parentElement.children,
        function (c) { return c.tagName === e.tagName; }) : [];
      bits.unshift(t + (cls ? '.' + cls : '') +
        (sibs.length > 1 ? ':nth(' + (sibs.indexOf(e) + 1) + ')' : ''));
      e = e.parentElement; hops++;
    }
    return bits.join(' > ');
  }

  var PICK = 'li,p,h1,h2,h3,figcaption,td,th,.stat,.cell,.qa,.kicker,img,text,tspan';
  function collect(points) {
    var seen = [], out = [];
    canvas.style.pointerEvents = 'none';
    points.forEach(function (pt) {
      var els = document.elementsFromPoint(pt[0], pt[1]) || [];
      for (var i = 0; i < els.length; i++) {
        var hit = els[i].closest ? els[i].closest(PICK) : null;
        if (hit && seen.indexOf(hit) === -1 &&
            !hit.closest('.hud') && hit.id !== 'annot') {
          seen.push(hit);
          var txt = hit.tagName === 'IMG' ? '[image: ' + (hit.alt || hit.src) + ']'
            : (hit.innerText || hit.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt) out.push({ el: hit, txt: txt.slice(0, 500) });
          break;
        }
      }
    });
    // drop items fully contained in another collected item
    return out.filter(function (a) {
      return !out.some(function (b) { return b !== a && b.el.contains(a.el); });
    });
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  }

  function compose(kind, items) {
    var info = slideInfo();
    var lines = ['[deck-context · ' + info.label + ' · ' + kind + ']'];
    items.forEach(function (it, i) {
      lines.push((i + 1) + '. <' + pathFor(it.el) + '> "' + it.txt + '"');
    });
    lines.push('-- requested change: ');
    return lines.join('\n');
  }

  /* --- hold Alt + draw --- */
  addEventListener('keydown', function (e) {
    if (e.key === 'Alt' && !holding) {
      holding = true; canvas.style.pointerEvents = 'auto';
      document.body.style.cursor = 'crosshair';
    }
    /* plain "c" with a live text selection = copy selection with context */
    if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var sel = String(getSelection && getSelection() || '').trim();
      if (sel) {
        var node = getSelection().anchorNode;
        var el = node && (node.nodeType === 1 ? node : node.parentElement);
        copyText(compose('selected text',
          [{ el: el || document.body, txt: sel.replace(/\s+/g, ' ').slice(0, 800) }]));
        say('selection + context copied — paste into Claude Code');
        e.preventDefault();
      }
    }
  });
  addEventListener('keyup', function (e) {
    if (e.key === 'Alt') {
      holding = false; drawing = false;
      canvas.style.pointerEvents = 'none';
      document.body.style.cursor = '';
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  });
  addEventListener('blur', function () {   // Alt-Tab away etc.
    holding = false; drawing = false;
    canvas.style.pointerEvents = 'none';
    document.body.style.cursor = '';
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (!holding) return;
    drawing = true; pts = [[e.clientX, e.clientY]];
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    pts.push([e.clientX, e.clientY]);
    ctx.lineTo(e.clientX, e.clientY); ctx.stroke();
  });
  canvas.addEventListener('pointerup', function () {
    if (!drawing) return;
    drawing = false;
    /* sample the stroke + interior grid of its bounding box */
    var xs = pts.map(function (p) { return p[0]; }),
        ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs),
        y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
    var sample = pts.filter(function (_, i) { return i % 4 === 0; });
    for (var gx = 0; gx <= 4; gx++)
      for (var gy = 0; gy <= 4; gy++)
        sample.push([x0 + (x1 - x0) * gx / 4, y0 + (y1 - y0) * gy / 4]);
    var items = collect(sample);
    canvas.style.pointerEvents = holding ? 'auto' : 'none';
    if (items.length) {
      copyText(compose('circled', items));
      say(items.length + ' element' + (items.length > 1 ? 's' : '') +
          ' + context copied — paste into Claude Code');
    } else {
      say('nothing under the stroke');
    }
    setTimeout(function () { ctx.clearRect(0, 0, innerWidth, innerHeight); }, 500);
  });
})();
