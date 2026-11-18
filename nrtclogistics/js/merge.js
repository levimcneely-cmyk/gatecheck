// NRTC Logistics Hub — three-way merge, so two people editing the same trip don't erase each other.
// base = the last copy this browser saw on the server, mine = this browser now, theirs = the server now.
// Whatever only one side changed is kept; when both changed the same thing, this browser's edit wins.
"use strict";
(function (root) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  // Lists of records merge by their id (items, co-ops) or name (team); anything else is a plain value list
  const keyOf = (x) => (isObj(x) ? (x.id != null ? `id:${x.id}` : x.name != null ? `name:${x.name}` : null) : null);
  const keyed = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => keyOf(x) != null);

  function merge3(base, mine, theirs) {
    if (same(mine, theirs)) return mine;
    if (same(mine, base)) return theirs;   // only they changed it
    if (same(theirs, base)) return mine;   // only I changed it
    // both changed it: go inside where we can
    if (isObj(mine) && isObj(theirs)) {
      const b = isObj(base) ? base : {}, out = {};
      new Set([...Object.keys(theirs), ...Object.keys(mine)]).forEach((k) => {
        const v = merge3(b[k], mine[k], theirs[k]);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    if (Array.isArray(mine) && Array.isArray(theirs)) {
      const b = Array.isArray(base) ? base : [];
      if ((keyed(mine) || !mine.length) && (keyed(theirs) || !theirs.length) && (keyed(b) || !b.length) && (mine.length || theirs.length)) return mergeKeyed(b, mine, theirs);
      if ([...mine, ...theirs, ...b].every((x) => !isObj(x) && !Array.isArray(x))) return mergeSet(b, mine, theirs);
    }
    return mine; // same value changed on both sides: latest edit here wins
  }
  function mergeKeyed(base, mine, theirs) {
    const map = (arr) => new Map(arr.map((x) => [keyOf(x), x]));
    const B = map(base), M = map(mine), T = map(theirs);
    const order = [...theirs.map(keyOf), ...mine.map(keyOf).filter((k) => !T.has(k))];
    const out = [];
    order.forEach((k) => {
      const inB = B.has(k), inM = M.has(k), inT = T.has(k);
      if (inM && inT) { out.push(merge3(B.get(k), M.get(k), T.get(k))); return; }
      if (inM && !inT) { if (inB && same(M.get(k), B.get(k))) return; out.push(M.get(k)); return; } // they deleted it (unless I edited it) / I added it
      if (!inM && inT) { if (inB && same(T.get(k), B.get(k))) return; out.push(T.get(k)); }           // I deleted it (unless they edited it) / they added it
    });
    return out;
  }
  function mergeSet(base, mine, theirs) {
    const has = (arr, x) => arr.some((y) => same(x, y));
    const removed = (x) => has(base, x) && (!has(mine, x) || !has(theirs, x));
    const out = [];
    [...theirs, ...mine].forEach((x) => { if (!removed(x) && !has(out, x)) out.push(x); });
    return out;
  }

  root.merge3 = merge3;
  if (typeof module !== "undefined") module.exports = { merge3 };
})(typeof window !== "undefined" ? window : globalThis);
