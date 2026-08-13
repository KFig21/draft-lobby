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

  // The next cell to fill in a column = the TOP-MOST still-empty input near that
  // column's x. Robust to ESPN turning a filled cell into a chip (it drops out of
  // the input list) or keeping the input (skipped because it now has a value).
  function nextInput(colX){
    var all = [].slice.call(document.querySelectorAll("input")).filter(isCand);
    var inCol = all.filter(function(e){ var r=e.getBoundingClientRect(); return Math.abs((r.left+r.width/2)-colX) < 40; });
    inCol.sort(function(a,b){ return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
    for (var i=0;i<inCol.length;i++){ if (!inCol[i].value || !inCol[i].value.trim()) return inCol[i]; }
    return null;
  }

  function visible(e){ var r = e.getBoundingClientRect(); return r.width>0 && r.height>0 && r.bottom>0 && r.top < (window.innerHeight+240); }

  // Find ESPN's dropdown row for a pick: the SHORTEST visible non-input element
  // whose text contains the player's name AND team abbrev (the team is what tells
  // one "Josh Allen" from another). Shortest = the row itself, not a container.
  function findOption(p){
    var name = (p.name||"").toLowerCase();
    var team = (p.team||"").toLowerCase();
    if (!name) return null;
    var nodes = document.body.getElementsByTagName("*");
    var best = null, bestLen = 99999;
    for (var i=0;i<nodes.length;i++){
      var e = nodes[i];
      var tag = e.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SCRIPT" || tag === "STYLE" || tag === "SELECT") continue;
      var txt = (e.textContent || "").trim().toLowerCase();
      if (txt.length < name.length || txt.length > 70) continue;
      if (txt.indexOf(name) < 0) continue;
      if (team && txt.indexOf(team) < 0) continue;
      if (!visible(e)) continue;
      if (txt.length < bestLen){ best = e; bestLen = txt.length; }
    }
    return best;
  }

  // Click the option the way a real user does: dispatch a full pointer+mouse
  // sequence on the ACTUAL topmost element at the row's center (elementFromPoint),
  // not the row container — a container click often misses the real handler.
  function clickOption(row){
    var r = row.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var tgt = document.elementFromPoint(x, y);
    if (!tgt || box.contains(tgt)) tgt = row; // never click our own panel
    var o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    try { tgt.dispatchEvent(new PointerEvent("pointerdown", o)); } catch(e){}
    try { tgt.dispatchEvent(new MouseEvent("mousedown", o)); } catch(e){}
    try { tgt.dispatchEvent(new PointerEvent("pointerup", o)); } catch(e){}
    try { tgt.dispatchEvent(new MouseEvent("mouseup", o)); } catch(e){}
    try { tgt.dispatchEvent(new MouseEvent("click", o)); } catch(e){}
    try { tgt.click(); } catch(e){}
  }

  // Type a name into a cell, poll for its dropdown row, click it, then VERIFY:
  // a real selection replaces the input cell with a chip, so the input leaves the
  // DOM. If it's still there the click didn't take — report a miss (never a silent
  // "done") so the pick gets flagged for a manual fix.
  function doPick(target, p, done){
    target.focus();
    setValue(target, p.name);
    var tries = 0, MAX = 24; // ~2.9s at 120ms — covers ESPN's query + render
    var iv = setInterval(function(){
      tries++;
      var opt = findOption(p);
      if (opt){
        clearInterval(iv);
        clickOption(opt);
        setTimeout(function(){ done(!document.contains(target)); }, 360);
        return;
      }
      if (tries >= MAX){ clearInterval(iv); done(false); }
    }, 120);
  }

  var lastFocused = null;
  document.addEventListener("focusin", function(e){ if (isCand(e.target)) lastFocused = e.target; }, true);

  var teamI = 0, pickI = 0, colX = null, autoOn = false, busy = false, misses = [];

  // ---- panel ----
  function el(tag, parent){ var e = document.createElement(tag); if (parent) parent.appendChild(e); return e; }
  function primary(b){ b.style.background="#3fd6a5"; b.style.color="#08150f"; b.style.border="0"; b.style.borderRadius="8px"; b.style.padding="10px"; b.style.fontWeight="700"; b.style.fontSize="13px"; b.style.cursor="pointer"; }
  function ghost(b){ b.style.background="#1b1e2b"; b.style.color="#e8eaf2"; b.style.border="1px solid #2e3347"; b.style.borderRadius="7px"; b.style.padding="8px"; b.style.fontSize="12px"; b.style.fontWeight="700"; b.style.cursor="pointer"; }

  var box = el("div"); box.id = PID;
  var bs = box.style;
  bs.position="fixed"; bs.right="16px"; bs.bottom="16px"; bs.zIndex="2147483647"; bs.width="300px"; bs.boxSizing="border-box";
  bs.background="#12141d"; bs.color="#e8eaf2"; bs.fontFamily="system-ui,-apple-system,sans-serif"; bs.fontSize="13px"; bs.lineHeight="1.45";
  bs.border="1px solid #2e3347"; bs.borderRadius="12px"; bs.padding="14px"; bs.boxShadow="0 12px 40px rgba(0,0,0,.5)";

  var head = el("div", box); head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center"; head.style.marginBottom="10px";
  var title = el("strong", head); title.textContent = "Draft Lobby → ESPN"; title.style.fontSize="13px"; title.style.color="#3fd6a5";
  var hide = el("button", head); hide.textContent = "✕"; ghost(hide); hide.style.padding="2px 7px"; hide.onclick = function(){ autoOn=false; box.style.display = "none"; };

  var sel = el("select", box); sel.style.width="100%"; sel.style.margin="0 0 10px"; sel.style.padding="7px"; sel.style.boxSizing="border-box"; sel.style.background="#1b1e2b"; sel.style.color="#e8eaf2"; sel.style.border="1px solid #2e3347"; sel.style.borderRadius="7px"; sel.style.fontWeight="700";
  DATA.teams.forEach(function(t,i){ var o = el("option", sel); o.value=String(i); o.textContent=(i+1)+". "+t.name; });
  sel.onchange = function(){ selectTeam(parseInt(sel.value,10)); };

  var cur = el("div", box); cur.style.minHeight="42px"; cur.style.marginBottom="8px";
  var auto = el("button", box); primary(auto); auto.style.width="100%"; auto.onclick = toggleAuto;
  var fill = el("button", box); ghost(fill); fill.style.width="100%"; fill.style.marginTop="6px"; fill.textContent="Fill one pick"; fill.onclick = function(){ if (!busy && !autoOn) fillNext(); };

  var stat = el("div", box); stat.style.marginTop="10px"; stat.style.fontSize="12px"; stat.style.color="#8a94a6"; stat.style.minHeight="30px";

  function setStatus(t){ stat.textContent = t; }
  function clear(node){ while (node.firstChild) node.removeChild(node.firstChild); }

  function render(){
    var team = DATA.teams[teamI];
    sel.value = String(teamI);
    auto.textContent = autoOn ? "Stop" : "Auto-run team";
    auto.style.background = autoOn ? "#f8577d" : "#3fd6a5";
    auto.style.color = autoOn ? "#fff" : "#08150f";
    fill.disabled = busy || autoOn; fill.style.opacity = (busy || autoOn) ? "0.5" : "1";
    clear(cur);
    var done = pickI >= team.picks.length;
    if (done){
      var d = el("div", cur); d.textContent = "✓ " + team.name + " complete"; d.style.fontWeight="700"; d.style.color="#3fd6a5";
      var n = el("div", cur); n.textContent = "Pick the next team above."; n.style.color="#8a94a6"; n.style.fontSize="12px";
      return;
    }
    var p = team.picks[pickI];
    var l1 = el("div", cur); l1.textContent = "R" + p.r + " · " + p.name; l1.style.fontWeight="700"; l1.style.fontSize="14px";
    var l2 = el("div", cur); l2.textContent = p.team + " " + p.pos; l2.style.color="#8a94a6"; l2.style.fontSize="12px";
    var prog = el("div", cur); prog.textContent = pickI + " / " + team.picks.length + " done"; prog.style.color="#8a94a6"; prog.style.fontSize="11px"; prog.style.marginTop="3px";
  }

  function selectTeam(i){
    autoOn = false; teamI = i; pickI = 0; colX = null; misses = [];
    setStatus("Click " + DATA.teams[i].name + "'s Round 1 cell in ESPN, then Auto-run team.");
    render();
  }

  function finishTeam(){
    autoOn = false;
    if (misses.length){ setStatus("Done — " + misses.length + " need a manual pick: " + misses.join(", ")); }
    else { setStatus("✓ " + DATA.teams[teamI].name + " fully entered. Pick the next team above."); }
    render();
  }

  function fillNext(){
    var team = DATA.teams[teamI];
    if (pickI >= team.picks.length){ finishTeam(); return; }
    if (colX === null){
      var src = (lastFocused && document.contains(lastFocused)) ? lastFocused : null;
      if (!src){ autoOn = false; setStatus("First click " + team.name + "'s Round 1 cell in ESPN, then press a button below."); render(); return; }
      var r = src.getBoundingClientRect(); colX = r.left + r.width/2;
    }
    var target = nextInput(colX);
    if (!target){ autoOn = false; setStatus("No empty cell left in this column."); render(); return; }
    var p = team.picks[pickI];
    busy = true; setStatus("Filling R" + p.r + " " + p.name + "…"); render();
    doPick(target, p, function(ok){
      busy = false;
      if (!ok) misses.push("R" + p.r + " " + p.name);
      pickI++;
      if (pickI >= team.picks.length){ finishTeam(); return; }
      if (autoOn){ render(); setTimeout(fillNext, ok ? 320 : 260); }
      else { setStatus(ok ? ("✓ R" + p.r + " " + p.name) : ("⚠ " + p.name + " — no match; select it in ESPN by hand.")); render(); }
    });
  }

  function toggleAuto(){
    if (busy) return;
    if (autoOn){ autoOn = false; setStatus("Paused."); render(); return; }
    autoOn = true; render(); fillNext();
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
