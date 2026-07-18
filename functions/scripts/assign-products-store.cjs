/**
 * One-time migration: stamp existing products with a storeId.
 *
 * Products used to live in a single shared "products" collection with no owner.
 * Now each storefront filters by `storeId`, so legacy products must be assigned
 * to a store or they won't show anywhere.
 *
 * Usage (run from the repo root or the functions/ folder):
 *   1. Download a service account key from the Firebase console:
 *        Project settings → Service accounts → Generate new private key
 *      Save it somewhere private (do NOT commit it).
 *   2. Run:
 *        node functions/scripts/assign-products-store.cjs --store techma --key C:\path\to\serviceAccountKey.json
 *
 *   By default this is a DRY RUN (prints what it would change). Add --commit to
 *   actually write. Only products that have NO storeId yet are touched, so it is
 *   safe to re-run.
 */
const admin = require("firebase-admin");
const path = require("path");

function getArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const storeId = getArg("store", "");
const keyPath = getArg("key", process.env.GOOGLE_APPLICATION_CREDENTIALS || "");
const commit = process.argv.includes("--commit");

if (!storeId) {
  console.error('Missing --store <id>. Example: --store techma');
  process.exit(1);
}
if (!keyPath) {
  console.error(
    "Missing service account key. Pass --key <path> or set GOOGLE_APPLICATION_CREDENTIALS.",
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(keyPath))),
});

(async () => {
  const db = admin.firestore();
  const snap = await db.collection("products").get();

  const unassigned = snap.docs.filter((d) => {
    const s = d.data().storeId;
    return !s || String(s).trim() === "";
  });

  console.log(`Total products: ${snap.size}`);
  console.log(`Without a storeId: ${unassigned.length}`);
  console.log(
    `Will assign them to store "${storeId}" ${commit ? "(COMMITTING)" : "(dry run)"}`,
  );

  if (!commit) {
    unassigned.slice(0, 20).forEach((d) => {
      console.log(`  - ${d.id}  ${d.data().name || ""}`);
    });
    console.log("\nDry run only. Re-run with --commit to apply.");
    process.exit(0);
  }

  let batch = db.batch();
  let count = 0;
  for (const d of unassigned) {
    batch.update(d.ref, { storeId });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();

  console.log(`Done. Assigned ${count} products to "${storeId}".`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
