function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Produces an 8-point trend line, same shape the seed data uses, so newly
// added sites get a normal-looking sparkline instead of a flat line.
function trendSeries(bias = 0) {
  let v = rand(20, 80);
  const out = [v];
  for (let i = 0; i < 7; i++) {
    v = Math.max(2, v + rand(-15, 15) + bias);
    out.push(v);
  }
  return out;
}

module.exports = { rand, trendSeries };