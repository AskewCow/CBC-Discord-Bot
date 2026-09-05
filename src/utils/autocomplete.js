// Format DB rows as slash-command autocomplete choices. Rows must have `id`
// and `name`; Discord caps choices at 25 and names at 100 chars.
function toChoices(rows) {
  return rows.slice(0, 25).map((r) => ({ name: String(r.name).slice(0, 100), value: String(r.id) }));
}

module.exports = { toChoices };
