import type { EspnAutofillData } from './espnExport';

/**
 * Generates the self-contained page script for ESPN's *Input Offline Draft
 * Results* page — the "auto-fill" half of the ESPN export (phase 2). It embeds
 * the draft data and, on the ESPN page, shows a small panel that types each
 * pick's name into the right cell and fires ESPN's autocomplete; the user clicks
 * the matching dropdown row (so we never depend on ESPN's dropdown markup) and
 * hits "Fill next" to advance.
 *
 * Delivered two ways from the same source: pasted into the browser console
 * (bypasses page CSP — the reliable path) or saved as a `javascript:`
 * bookmarklet (convenient, but a strict ESPN CSP can block it).
 *
 * Techniques chosen to survive not being able to test against ESPN's live DOM:
 *  - inputs are found SPATIALLY (cluster by x into columns, sort by y into
 *    rounds) rather than by ESPN class names, and re-detected each team;
 *  - values are set through the native HTMLInputElement value setter + an
 *    `input` event, which is what a React-controlled input actually listens to;
 *  - the panel is built with createElement + .style only (no innerHTML / inline
 *    handlers / inline style attrs), so a strict style-src/script-src can't trip
 *    it once it's running.
 */

// The page-side program as a readable IIFE. `__DATA__` is replaced with the
// serialized payload. Authored in ES5-ish plain JS (no backticks) so it drops
// straight into a console paste or a javascript: URL unchanged.
const PAGE_SCRIPT = String.raw`(function(){
  var PID = "dl-espn-autofill";
  var prev = document.getElementById(PID);
  if (prev) { prev.style.display = "block"; return; }
  var DATA = __DATA__;
  if (!DATA || !DATA.teams || !DATA.teams.length) { alert("Draft Lobby: no draft data in this script."); return; }

  // React-controlled inputs ignore el.value = x; go through the native setter
  // and dispatch the input event their onChange is bound to.
  function setValue(el, val){
    try {
      var d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (d && d.set) d.set.call(el, val); else el.value = val;
    } catch (e) { el.value = val; }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isCand(el){
    if (!el || el.tagName !== "INPUT") return false;
    var t = (el.getAttribute("type") || "text").toLowerCase();
    if (["hidden","checkbox","radio","submit","button","file","range","color","date"].indexOf(t) >= 0) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 8) return false;
    var ph = (el.placeholder || "").toLowerCase();
    return ph.indexOf("player") >= 0 || ph.indexOf("name") >= 0 || ph.indexOf("search") >= 0;
  }

  // Cluster candidate inputs by horizontal center into columns, each sorted top
  // to bottom — the visual team-by-round grid, independent of DOM order/classes.
  function buildGrid(){
    var all = [].slice.call(document.querySelectorAll("input")).filter(isCand);
    var cols = [];
    all.forEach(function(el){
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var f = null;
      for (var i=0;i<cols.length;i++){ if (Math.abs(cols[i].x - cx) < 40){ f = cols[i]; break; } }
      if (!f){ f = { x: cx, items: [] }; cols.push(f); }
      f.items.push({ el: el, y: r.top });
    });
    cols.sort(function(a,b){ return a.x - b.x; });
    return cols.map(function(c){ return c.items.sort(function(a,b){ return a.y - b.y; }).map(function(o){ return o.el; }); });
  }
  function locate(grid, el){
    for (var c=0;c<grid.length;c++){ var r = grid[c].indexOf(el); if (r >= 0) return { c: c, r: r }; }
    return null;
  }

  var grid = buildGrid();
  var lastFocused = null;
  document.addEventListener("focusin", function(e){ if (isCand(e.target)) lastFocused = e.target; }, true);

  var teamI = 0, pickI = 0, colIdx = null, rowIdx = null;

  // ---- panel ----
  function el(tag, parent){ var e = document.createElement(tag); if (parent) parent.appendChild(e); return e; }
  function primary(b){ b.style.background="#3fd6a5"; b.style.color="#08150f"; b.style.border="0"; b.style.borderRadius="8px"; b.style.padding="10px"; b.style.fontWeight="700"; b.style.fontSize="13px"; b.style.cursor="pointer"; }
  function ghost(b){ b.style.background="#1b1e2b"; b.style.color="#e8eaf2"; b.style.border="1px solid #2e3347"; b.style.borderRadius="7px"; b.style.padding="7px"; b.style.fontSize="12px"; b.style.cursor="pointer"; }

  var box = el("div"); box.id = PID;
  var bs = box.style;
  bs.position="fixed"; bs.right="16px"; bs.bottom="16px"; bs.zIndex="2147483647"; bs.width="300px"; bs.boxSizing="border-box";
  bs.background="#12141d"; bs.color="#e8eaf2"; bs.fontFamily="system-ui,-apple-system,sans-serif"; bs.fontSize="13px"; bs.lineHeight="1.45";
  bs.border="1px solid #2e3347"; bs.borderRadius="12px"; bs.padding="14px"; bs.boxShadow="0 12px 40px rgba(0,0,0,.5)";

  var head = el("div", box); head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center"; head.style.marginBottom="10px";
  var title = el("strong", head); title.textContent = "Draft Lobby → ESPN"; title.style.fontSize="13px"; title.style.color="#3fd6a5";
  var hide = el("button", head); hide.textContent = "✕"; ghost(hide); hide.style.padding="2px 7px"; hide.onclick = function(){ box.style.display = "none"; };

  var sel = el("select", box); sel.style.width="100%"; sel.style.margin="0 0 10px"; sel.style.padding="7px"; sel.style.boxSizing="border-box"; sel.style.background="#1b1e2b"; sel.style.color="#e8eaf2"; sel.style.border="1px solid #2e3347"; sel.style.borderRadius="7px"; sel.style.fontWeight="700";
  DATA.teams.forEach(function(t,i){ var o = el("option", sel); o.value=String(i); o.textContent=(i+1)+". "+t.name; });
  sel.onchange = function(){ selectTeam(parseInt(sel.value,10)); };

  var cur = el("div", box); cur.style.minHeight="40px"; cur.style.marginBottom="4px";
  var fill = el("button", box); fill.textContent = "Fill next pick"; primary(fill); fill.style.width="100%"; fill.onclick = fillNext;

  var row2 = el("div", box); row2.style.display="flex"; row2.style.gap="6px"; row2.style.marginTop="6px";
  var back = el("button", row2); back.textContent="← Back"; ghost(back); back.style.flex="1"; back.onclick = goBack;
  var skip = el("button", row2); skip.textContent="Skip →"; ghost(skip); skip.style.flex="1"; skip.onclick = function(){ advance(); render(); };

  var stat = el("div", box); stat.style.marginTop="10px"; stat.style.fontSize="12px"; stat.style.color="#8a94a6"; stat.style.minHeight="30px";

  function setStatus(t){ stat.textContent = t; }
  function clear(node){ while (node.firstChild) node.removeChild(node.firstChild); }

  function render(){
    var team = DATA.teams[teamI];
    sel.value = String(teamI);
    clear(cur);
    if (pickI >= team.picks.length){
      var d = el("div", cur); d.textContent = "✓ " + team.name + " done (" + team.picks.length + " picks)"; d.style.fontWeight="700"; d.style.color="#3fd6a5";
      var n = el("div", cur); n.textContent = "Pick the next team above."; n.style.color="#8a94a6"; n.style.fontSize="12px";
      return;
    }
    var p = team.picks[pickI];
    var l1 = el("div", cur); l1.textContent = "Round " + p.r + " · " + p.name; l1.style.fontWeight="700"; l1.style.fontSize="14px";
    var l2 = el("div", cur); l2.textContent = "in ESPN click the [" + p.team + " " + p.pos + "] row"; l2.style.color="#8a94a6"; l2.style.fontSize="12px";
    var prog = el("div", cur); prog.textContent = (pickI) + " / " + team.picks.length + " filled"; prog.style.color="#8a94a6"; prog.style.fontSize="11px"; prog.style.marginTop="3px";
  }

  function advance(){ pickI++; if (colIdx !== null && rowIdx !== null) rowIdx++; }
  function goBack(){ if (pickI > 0){ pickI--; if (rowIdx !== null) rowIdx--; } render(); }

  function selectTeam(i){
    teamI = i; pickI = 0; colIdx = null; rowIdx = null;
    setStatus("Click " + DATA.teams[i].name + "'s Round 1 cell in ESPN, then press Fill next.");
    render();
  }

  function fillNext(){
    var team = DATA.teams[teamI];
    if (pickI >= team.picks.length){ setStatus("✓ That team is done — pick the next one above."); return; }
    var target;
    if (colIdx === null){
      grid = buildGrid();
      var src = (lastFocused && document.contains(lastFocused)) ? lastFocused : null;
      var pos = src ? locate(grid, src) : null;
      if (!pos){ setStatus("First click " + team.name + "'s Round 1 cell in ESPN, then press Fill next."); return; }
      colIdx = pos.c; rowIdx = pos.r;
    } else {
      rowIdx = rowIdx + 1;
    }
    target = grid[colIdx] && grid[colIdx][rowIdx];
    if (!target){ setStatus("No input below in this column — end of roster? Re-click a cell to retarget."); colIdx = null; return; }
    var p = team.picks[pickI];
    target.focus();
    setValue(target, p.name);
    setStatus("Typed “" + p.name + "”. Click [" + p.team + " " + p.pos + "] in ESPN, then Fill next.");
    pickI++;
    render();
  }

  document.body.appendChild(box);
  selectTeam(0);
})();`;

function scriptWithData(data: EspnAutofillData): string {
  // Function replacer, NOT a string — a string replacement would treat `$` in a
  // team/player name (e.g. "Ca$h") as a special pattern and corrupt the payload.
  return PAGE_SCRIPT.replace('__DATA__', () => JSON.stringify(data));
}

/** The paste-into-the-browser-console form (bypasses the page's CSP). */
export function buildEspnAutofillScript(data: EspnAutofillData): string {
  return scriptWithData(data);
}

/** The `javascript:` bookmarklet form of the same script. */
export function buildEspnBookmarklet(data: EspnAutofillData): string {
  return 'javascript:' + encodeURIComponent(scriptWithData(data));
}
