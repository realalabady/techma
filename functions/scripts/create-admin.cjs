/**
 * Create (or promote) an admin user.
 *
 * An admin in this app = a Firebase Auth user + a Firestore `users/{uid}`
 * document whose `role` is "admin". This script creates both in one shot.
 * If the email already has an Auth account, it reuses it (and resets the
 * password to the one provided), then stamps the Firestore doc as admin.
 *
 * Usage (from the repo root or the functions/ folder):
 *   1. Download a service account key from the Firebase console:
 *        Project settings → Service accounts → Generate new private key
 *      Save it somewhere private (do NOT commit it — serviceAccount*.json is gitignored).
 *   2. Run:
 *        node functions/scripts/create-admin.cjs \
 *          --email ym206538@gmail.com \
 *          --password "Aa1122334455@" \
 *          --key C:\path\to\serviceAccountKey.json
 *
 *   Optional: --name "Store Owner"  (defaults to the email's local part)
 */
const admin = require("firebase-admin");
const path = require("path");

function getArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const email = getArg("email", "");
const password = getArg("password", "");
const name = getArg("name", email ? email.split("@")[0] : "");
const keyPath = getArg("key", process.env.GOOGLE_APPLICATION_CREDENTIALS || "");

if (!email || !password) {
  console.error("Missing --email and/or --password.");
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
  const auth = admin.auth();
  const db = admin.firestore();

  // 1. Create the Auth user, or reuse + reset the password if it already exists.
  let user;
  try {
    user = await auth.createUser({ email, password, displayName: name });
    console.log(`Created Auth user: ${user.uid}`);
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      user = await auth.getUserByEmail(email);
      await auth.updateUser(user.uid, { password, displayName: name });
      console.log(`Auth user already existed (${user.uid}); password reset.`);
    } else {
      throw err;
    }
  }

  // 2. Write the Firestore users/{uid} doc with the admin role (merge-safe).
  await db.collection("users").doc(user.uid).set(
    {
      email,
      name,
      phone: "",
      role: "admin",
      addresses: [],
      createdAt: admin.firestore.Timestamp.now(),
    },
    { merge: true },
  );

  console.log(`Done. ${email} is now an admin (uid ${user.uid}).`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
