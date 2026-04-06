#!/usr/bin/env npx tsx
/**
 * Migration script: v1 (boulder/rock/pebble + projects) → v2 (investments + vital/size)
 *
 * What it does:
 *   1. Copies all `projects` docs into a new `investments` collection (same doc IDs)
 *      - Adds `rank` field (alphabetical order among active, then on_hold)
 *   2. Updates all `tasks` docs with new fields:
 *      - `vital` — derived from old `priority` (high → true, else false)
 *      - `size`  — derived from old `classification` (boulder → 'L', rock → 'M', pebble → 'S', unclassified → null)
 *      - `investmentId` — copied from `projectId`
 *      - `initiativeId` — null
 *   3. Updates `activityLog` entries to add `investmentId` alongside existing `projectId`
 *
 * Idempotent: skips documents that already have new fields populated.
 * Does NOT delete old fields or old collections — that's Phase 4 cleanup.
 *
 * Usage (run from mcp-server/ directory which has firebase-admin installed):
 *   cd mcp-server && GOOGLE_APPLICATION_CREDENTIALS=../service-account-key.json npx tsx ../scripts/migrate-v2.ts [--dry-run]
 */

import { createRequire } from 'module';
// Resolve firebase-admin from mcp-server/node_modules regardless of script location
const require = createRequire(import.meta.url.replace('/scripts/', '/mcp-server/'));

const { initializeApp, cert } = require('firebase-admin/app') as typeof import('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore') as typeof import('firebase-admin/firestore');
import type { ServiceAccount } from 'firebase-admin/app';

import { readFileSync } from 'fs';
import { resolve } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Firebase init ──────────────────────────────────────────────

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || resolve(import.meta.dirname, '..', 'service-account-key.json');

const sa = JSON.parse(readFileSync(saPath, 'utf8')) as ServiceAccount;
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ── Classification → size mapping ──────────────────────────────

const CLASSIFICATION_TO_SIZE: Record<string, string | null> = {
  boulder: 'L',
  rock: 'M',
  pebble: 'S',
  unclassified: null,
};

// ── Step 1: Projects → Investments ─────────────────────────────

async function migrateProjects(): Promise<void> {
  console.log('\n── Step 1: Migrate projects → investments ──');

  const projectsSnapshot = await db.collection('projects').get();
  if (projectsSnapshot.empty) {
    console.log('  No projects found. Skipping.');
    return;
  }

  // Check which investments already exist
  const investmentsSnapshot = await db.collection('investments').get();
  const existingInvestmentIds = new Set(investmentsSnapshot.docs.map(d => d.id));

  // Sort projects: active first (alphabetical), then on_hold (alphabetical) for rank assignment
  const projects = projectsSnapshot.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .sort((a, b) => {
      const statusOrder = (s: string) => s === 'active' ? 0 : 1;
      const diff = statusOrder(a.data.status || 'active') - statusOrder(b.data.status || 'active');
      if (diff !== 0) return diff;
      return (a.data.name || '').localeCompare(b.data.name || '');
    });

  let created = 0;
  let skipped = 0;

  const batch = db.batch();
  projects.forEach((project, index) => {
    if (existingInvestmentIds.has(project.id)) {
      skipped++;
      return;
    }

    const investmentData = {
      ...project.data,
      rank: (index + 1) * 1000, // spacing for future reordering
    };

    if (!DRY_RUN) {
      batch.set(db.collection('investments').doc(project.id), investmentData);
    }
    created++;
  });

  if (!DRY_RUN && created > 0) {
    await batch.commit();
  }

  console.log(`  ${created} investments created, ${skipped} already existed.`);
}

// ── Step 2: Add new fields to tasks ────────────────────────────

async function migrateTasks(): Promise<void> {
  console.log('\n── Step 2: Add vital/size/investmentId to tasks ──');

  const snapshot = await db.collection('tasks').get();
  if (snapshot.empty) {
    console.log('  No tasks found. Skipping.');
    return;
  }

  let updated = 0;
  let skipped = 0;

  // Firestore batches are limited to 500 operations
  const BATCH_SIZE = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Skip if already migrated (has `size` field set, even if null, meaning we wrote it)
    if (data.hasOwnProperty('vital')) {
      skipped++;
      continue;
    }

    const classification = data.classification || 'unclassified';
    const priority = data.priority || 'low';

    const updates: Record<string, any> = {
      vital: priority === 'high',
      size: CLASSIFICATION_TO_SIZE[classification] ?? null,
      investmentId: data.projectId || null,
      initiativeId: null,
    };

    if (!DRY_RUN) {
      batch.update(doc.ref, updates);
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    updated++;
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  console.log(`  ${updated} tasks updated, ${skipped} already migrated.`);
}

// ── Step 3: Add investmentId to activity log ────────────────────

async function migrateActivityLog(): Promise<void> {
  console.log('\n── Step 3: Add investmentId to activity log entries ──');

  const snapshot = await db.collection('activityLog').get();
  if (snapshot.empty) {
    console.log('  No activity log entries found. Skipping.');
    return;
  }

  let updated = 0;
  let skipped = 0;

  const BATCH_SIZE = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    if (data.hasOwnProperty('investmentId')) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      batch.update(doc.ref, { investmentId: data.projectId || null });
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    updated++;
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  console.log(`  ${updated} log entries updated, ${skipped} already migrated.`);
}

// ── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🔄 Migration v1 → v2${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);
  console.log(`   Using service account: ${saPath}`);

  await migrateProjects();
  await migrateTasks();
  await migrateActivityLog();

  console.log('\n✅ Migration complete.\n');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
