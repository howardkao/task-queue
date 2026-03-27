import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const collections = ["tasks", "projects", "activityLog"] as const;

function getOwnerUid(): string {
  const cliValue = process.argv[2];
  const envValue = process.env.MIGRATION_OWNER_UID;
  const ownerUid = cliValue || envValue;

  if (!ownerUid) {
    throw new Error("Provide the target owner UID as argv[2] or MIGRATION_OWNER_UID.");
  }

  return ownerUid;
}

async function migrateCollection(collectionName: (typeof collections)[number], ownerUid: string) {
  const snapshot = await db.collection(collectionName).get();

  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchSize = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (typeof data.ownerUid === "string" && data.ownerUid.length > 0) {
      skipped += 1;
      continue;
    }

    batch.update(doc.ref, { ownerUid });
    updated += 1;
    batchSize += 1;

    if (batchSize === 400) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return {
    collectionName,
    scanned: snapshot.size,
    updated,
    skipped,
  };
}

async function main() {
  const ownerUid = getOwnerUid();

  console.log(`Starting ownership migration for UID: ${ownerUid}`);

  for (const collectionName of collections) {
    const result = await migrateCollection(collectionName, ownerUid);
    console.log(
      `[${result.collectionName}] scanned=${result.scanned} updated=${result.updated} skipped=${result.skipped}`
    );
  }

  console.log("Ownership migration completed.");
}

void main().catch((error) => {
  console.error("Ownership migration failed:", error);
  process.exitCode = 1;
});
