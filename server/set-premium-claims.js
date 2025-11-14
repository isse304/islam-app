const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(require("./serviceAccountKey.json"))
});

async function setPremium() {
  const userId = "cCPJ3yZIaHc5WciIdFrQRmWXaC13";
  
  // Get existing claims first to preserve role
  const userRecord = await admin.auth().getUser(userId);
  const existingClaims = userRecord.customClaims || {};
  
  console.log("📋 Existing claims:", existingClaims);
  
  // Merge with premium claims
  const updatedClaims = {
    ...existingClaims,
    premium: true,
    subscriptionStatus: "active",
    subscriptionEnd: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60 // 90 days from now
  };
  
  await admin.auth().setCustomUserClaims(userId, updatedClaims);
  console.log("✅ Premium claim set for (90 days)");
  if (existingClaims.role) {
    console.log("✅ Role preserved:", existingClaims.role);
  }
  process.exit(0);
}

setPremium().catch(err => {
  console.error("❌ ERROR:", err);
  process.exit(1);
});