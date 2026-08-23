import {
  createRegionalMarketFavoriteQuotesView,
  regionalMarketFavoriteItemsView,
  regionalMarketOrderBookView,
} from "../src/server/regionalMarketViews.mjs";

function integerArgument(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

const sampleCount = integerArgument("samples", 30);
const ordersPerFavorite = integerArgument("orders-per-favorite", 500);
const favorites = Array.from({ length: 20 }, (_, index) => ({
  itemType: index % 2 === 0 ? "item" : "cargo",
  itemId: String(index + 1),
}));
const catalog = new Map(favorites.map((favorite) => [
  `${favorite.itemType === "cargo" ? "cargo" : "items"}:${favorite.itemId}`,
  {
    itemType: favorite.itemType,
    targetId: favorite.itemId,
    name: `${favorite.itemType === "cargo" ? "Cargo" : "Item"} ${favorite.itemId}`,
    tag: "Benchmark",
    tier: 3,
    rarity: "Rare",
    iconAssetName: `benchmark-${favorite.itemType}-${favorite.itemId}.webp`,
  },
]));
const orders = [];
for (const [favoriteIndex, favorite] of favorites.entries()) {
  for (let orderIndex = 0; orderIndex < ordersPerFavorite; orderIndex += 1) {
    const sell = orderIndex % 2 === 0;
    orders.push({
      entityId: String(favoriteIndex * ordersPerFavorite + orderIndex + 1),
      side: sell ? "sell" : "buy",
      regionId: orderIndex % 10 === 0 ? "7" : "19",
      itemType: favorite.itemType,
      itemId: favorite.itemId,
      price: String(9_007_199_254_740_993n + BigInt(favoriteIndex * ordersPerFavorite + orderIndex)),
      quantity: String(orderIndex + 1),
    });
  }
}
const snapshot = { orders };
const scope = { regionId: "19", allowedRegionIds: ["7", "19"] };
const getEntity = (key) => catalog.get(key) ?? null;

function oldCycle() {
  return favorites.map((favorite) => regionalMarketOrderBookView(snapshot, getEntity(
    `${favorite.itemType === "cargo" ? "cargo" : "items"}:${favorite.itemId}`,
  ), { ...scope, ...favorite }));
}

function newCycle() {
  const project = createRegionalMarketFavoriteQuotesView();
  return {
    quotes: project(snapshot, favorites, { ...scope, generation: 1 }),
    items: regionalMarketFavoriteItemsView(favorites, { getEntity }),
  };
}

function sample(run) {
  const cpuMs = [];
  for (let index = 0; index < 5; index += 1) run();
  for (let index = 0; index < sampleCount; index += 1) {
    const started = process.cpuUsage();
    run();
    const used = process.cpuUsage(started);
    cpuMs.push((used.user + used.system) / 1_000);
  }
  const sorted = [...cpuMs].sort((left, right) => left - right);
  return {
    meanCpuMs: Number((cpuMs.reduce((sum, value) => sum + value, 0) / cpuMs.length).toFixed(3)),
    p95CpuMs: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
  };
}

const oldPayload = oldCycle();
const newPayload = newCycle();
for (const [index, favorite] of favorites.entries()) {
  const key = `${favorite.itemType}:${favorite.itemId}`;
  const book = oldPayload[index];
  const quote = newPayload.quotes[key];
  const sellPrices = book.sellOrders.map((order) => BigInt(order.price));
  const buyPrices = book.buyOrders.map((order) => BigInt(order.price));
  const bestSell = sellPrices.length ? String(sellPrices.reduce((best, value) => value < best ? value : best)) : null;
  const bestBuy = buyPrices.length ? String(buyPrices.reduce((best, value) => value > best ? value : best)) : null;
  if (quote.bestSell !== bestSell || quote.bestBuy !== bestBuy
    || quote.sellCount !== book.sellOrders.length || quote.buyCount !== book.buyOrders.length
    || newPayload.items[key].name !== book.item.name) {
    throw new Error(`Parity mismatch for ${key}`);
  }
}

process.stdout.write(`${JSON.stringify({
  fixture: {
    favorites: favorites.length,
    orders: orders.length,
    regionId: "19",
    samples: sampleCount,
    concurrency: 1,
    cache: "cold",
  },
  old: {
    requestsPerCycle: 20,
    payloadBytes: Buffer.byteLength(JSON.stringify(oldPayload)),
    ...sample(oldCycle),
  },
  new: {
    requestsPerCycle: 1,
    payloadBytes: Buffer.byteLength(JSON.stringify(newPayload)),
    ...sample(newCycle),
  },
  parity: true,
})}\n`);
