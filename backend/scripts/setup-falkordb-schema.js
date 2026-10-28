// setup-falkordb-schema.js – Automatically creates FalkorDB constraints & indexes
// Idempotently provisions range and search indexes for all 10 entity labels and lookup fields.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const falkor = require('../falkordb');

// ==============================================================================
// VIVA_FALKORDB_SCHEMA: DDL AUTOMATION & SCHEMA INITIALIZATION RUNNER
// Purpose: Automatically reads database/falkordb_schema.cypher and idempotently executes
//          all primary key range indexes and secondary search indexes against FalkorDB.
// Entry point: setupSchema() (run via npm run falkordb:schema or node scripts/setup-falkordb-schema.js)
// Logic:
//   1. Verifies connectivity to FalkorDB via falkor.checkHealth().
//   2. Reads database/falkordb_schema.cypher and splits by semicolon.
//   3. Runs falkor.writeQuery() for each index statement.
//   4. Also enforces unique node constraints using FalkorDB's constraint manager.
// ==============================================================================
async function setupSchema() {
  console.log('=======================================================');
  console.log('FALKORDB SCHEMA & INDEXES SETUP');
  console.log('=======================================================');

  const health = await falkor.checkHealth();
  if (!health.connected) {
    console.error(`❌ FalkorDB connection unavailable: ${health.message || health.error}`);
    console.error(`Please verify FALKORDB_HOST, FALKORDB_PORT in backend/.env or run 'docker compose up -d'`);
    process.exit(1);
  }

  console.log(`Connected to FalkorDB (${health.host}:${health.port}) [Graph: ${health.graphName}]`);

  const cypherFile = path.join(__dirname, '..', '..', 'database', 'falkordb_schema.cypher');
  if (!fs.existsSync(cypherFile)) {
    console.error(`❌ Schema definition file missing: ${cypherFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(cypherFile, 'utf8');
  const statements = content
    .split(';')
    .map(s => s.replace(/^\s*\/\/.*$/gm, '').trim())
    .filter(s => s.length > 0);

  console.log(`Found ${statements.length} schema index statements to execute.\n`);

  let successCount = 0;
  for (const stmt of statements) {
    try {
      const summary = stmt.split('\n')[0].substring(0, 60);
      process.stdout.write(`Executing: ${summary}... `);
      await falkor.writeQuery(stmt);
      console.log('✅ OK');
      successCount++;
    } catch (err) {
      if (err.message && (err.message.includes('already indexed') || err.message.includes('already exists'))) {
        console.log('✅ OK (Already indexed)');
        successCount++;
      } else {
        console.log(`⚠️ Note: ${err.message}`);
      }
    }
  }

  // Idempotently create unique node constraints via FalkorDB constraint API
  const uniqueEntities = [
    { label: 'Student', prop: 'student_id' },
    { label: 'Room', prop: 'room_id' },
    { label: 'Hostel', prop: 'hostel_id' },
    { label: 'Block', prop: 'block_id' },
    { label: 'Floor', prop: 'floor_id' },
    { label: 'RoomType', prop: 'room_type_id' },
    { label: 'Complaint', prop: 'complaint_id' },
    { label: 'ComplaintType', prop: 'complaint_type_id' },
    { label: 'Mess', prop: 'mess_id' },
    { label: 'Caterer', prop: 'caterer_id' }
  ];

  console.log('\nEnforcing entity uniqueness constraints...');
  const g = await falkor.getGraph();
  if (g && typeof g.createNodeUniqueConstraint === 'function') {
    for (const { label, prop } of uniqueEntities) {
      try {
        process.stdout.write(`Constraint: (${label}.${prop} IS UNIQUE)... `);
        await g.createNodeUniqueConstraint(label, prop);
        console.log('✅ OK');
      } catch (err) {
        if (err.message && (err.message.includes('already') || err.message.includes('exists') || err.message.includes('PENDING'))) {
          console.log('✅ OK (Existing)');
        } else {
          console.log(`⚠️ Note: ${err.message}`);
        }
      }
    }
  }

  console.log('\n=======================================================');
  console.log(`FalkorDB Schema setup completed: ${successCount} index statements processed.`);
  console.log('=======================================================');
  await falkor.closeConnection();
  process.exit(0);
}

setupSchema().catch(async err => {
  console.error('Fatal schema setup error:', err);
  await falkor.closeConnection();
  process.exit(1);
});

