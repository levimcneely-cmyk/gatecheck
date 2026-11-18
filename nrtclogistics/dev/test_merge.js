// node nrtclogistics/dev/test_merge.js
const assert = require("assert");
const { merge3 } = require("../js/merge.js");
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const base = { id: "t1", title: "Hays", travelers: ["Levi", "Thomas"], coops: [{ id: "c1", name: "WCE" }],
  items: [{ id: "a", type: "flight", to: "DEN" }, { id: "b", type: "hotel", name: "HGI" }] };
const clone = (x) => JSON.parse(JSON.stringify(x));

t("both add different items -> both kept", () => {
  const mine = clone(base); mine.items.push({ id: "h2", type: "hotel", name: "Hampton" });
  const theirs = clone(base); theirs.items.push({ id: "f2", type: "flight", to: "BNA" });
  const m = merge3(base, mine, theirs);
  assert.deepStrictEqual(m.items.map((x) => x.id), ["a", "b", "f2", "h2"]);
});
t("they edit one item, I edit another -> both edits", () => {
  const mine = clone(base); mine.items[0].to = "COS";
  const theirs = clone(base); theirs.items[1].name = "Hilton";
  const m = merge3(base, mine, theirs);
  assert.strictEqual(m.items[0].to, "COS"); assert.strictEqual(m.items[1].name, "Hilton");
});
t("same field on same item -> mine wins", () => {
  const mine = clone(base); mine.items[0].to = "COS";
  const theirs = clone(base); theirs.items[0].to = "ORD";
  assert.strictEqual(merge3(base, mine, theirs).items[0].to, "COS");
});
t("they delete an item I didn't touch -> deleted", () => {
  const mine = clone(base); mine.title = "Hays trip";
  const theirs = clone(base); theirs.items = theirs.items.filter((x) => x.id !== "b");
  const m = merge3(base, mine, theirs);
  assert.deepStrictEqual(m.items.map((x) => x.id), ["a"]); assert.strictEqual(m.title, "Hays trip");
});
t("they delete an item I edited -> kept with my edit", () => {
  const mine = clone(base); mine.items[1].name = "Hilton";
  const theirs = clone(base); theirs.items = theirs.items.filter((x) => x.id !== "b");
  assert.strictEqual(merge3(base, mine, theirs).items.find((x) => x.id === "b").name, "Hilton");
});
t("travelers: I add one, they remove one -> both applied", () => {
  const mine = clone(base); mine.travelers.push("Josh");
  const theirs = clone(base); theirs.travelers = ["Levi"];
  assert.deepStrictEqual(merge3(base, mine, theirs).travelers, ["Levi", "Josh"]);
});
t("co-ops merge by id", () => {
  const mine = clone(base); mine.coops.push({ id: "c2", name: "Washington EC" });
  const theirs = clone(base); theirs.coops[0].town = "WaKeeney";
  const m = merge3(base, mine, theirs);
  assert.deepStrictEqual(m.coops.map((c) => c.id), ["c1", "c2"]); assert.strictEqual(m.coops[0].town, "WaKeeney");
});
t("team list merges by name", () => {
  const b = [{ name: "Levi", home: "IND" }], mine = [{ name: "Levi", home: "IND" }, { name: "Kat", home: "MHT" }], theirs = [{ name: "Levi", home: "SDF" }];
  assert.deepStrictEqual(merge3(b, mine, theirs), [{ name: "Levi", home: "SDF" }, { name: "Kat", home: "MHT" }]);
});
t("territories merge per RBM", () => {
  const b = { A: "KS", B: "TX" }, mine = { A: "KS MO", B: "TX" }, theirs = { A: "KS", B: "TX OK" };
  assert.deepStrictEqual(merge3(b, mine, theirs), { A: "KS MO", B: "TX OK" });
});
t("no base (first sync) and nothing in common -> union of items", () => {
  const mine = { id: "t1", items: [{ id: "x" }] }, theirs = { id: "t1", items: [{ id: "y" }] };
  assert.deepStrictEqual(merge3(undefined, mine, theirs).items.map((i) => i.id), ["y", "x"]);
});
t("trip deleted there, untouched here -> stays deleted", () => {
  assert.strictEqual(merge3(base, clone(base), null), null);
});
console.log(`${n} merge tests passed`);
