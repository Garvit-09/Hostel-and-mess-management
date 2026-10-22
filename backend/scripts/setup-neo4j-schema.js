// setup-neo4j-schema.js – Automatically creates Neo4j constraints & indexes
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const neo = require('../neo4j');

async function setupSchema() {
  console.log('=======================================================');
  console.log('NEO4J SCHEMA & CONSTRAINTS SETUP');
  console.log('=======================================================');

  const health = await neo.checkHealth();
  if (!health.connected) {
    console.error(`❌ Neo4j connection unavailable: ${health.message || health.error}`);
    console.error(`Please configure NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD in backend/.env`);
    process.exit(1);
  }

  console.log(`Connected to Neo4j (${health.uri}) [Database: ${health.database}]`);

  const cypherFile = path.join(__dirname, '..', '..', 'database', 'neo4j_schema.cypher');
  if (!fs.existsSync(cypherFile)) {
    console.error(`❌ Schema definition file missing: ${cypherFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(cypherFile, 'utf8');
  // Split statements by semicolon, ignoring comments
  const statements = content
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('//'));

  console.log(`Found ${statements.length} schema statements to execute.\n`);

  let successCount = 0;
  for (const stmt of statements) {
    try {
      const summary = stmt.split('\n')[0].substring(0, 60);
      process.stdout.write(`Executing: ${summary}... `);
      await neo.writeQuery(stmt);
      console.log('✅ OK');
      successCount++;
    } catch (err) {
      console.log(`⚠️ Note: ${err.message}`);
    }
  }

  console.log('\n=======================================================');
  console.log(`Schema setup completed: ${successCount} statements executed successfully.`);
  console.log('=======================================================');
  await neo.closeDriver();
  process.exit(0);
}

setupSchema().catch(err => {
  console.error('Fatal schema setup error:', err);
  process.exit(1);
});
