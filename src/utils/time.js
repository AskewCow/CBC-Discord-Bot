// Epoch seconds — the unit every timestamp column in this project uses.
function nowSec() {
  return Math.floor(Date.now() / 1000);
}

module.exports = { nowSec };
