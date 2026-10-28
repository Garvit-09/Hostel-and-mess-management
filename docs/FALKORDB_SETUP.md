# 🚀 FalkorDB Setup & Deployment Guide

This guide provides end-to-end instructions for launching, configuring, synchronizing, and testing **FalkorDB** as the graph intelligence engine for the **Hostel and Mess Management System (HostelHub)**.

---

## 📋 Prerequisites

Before proceeding, verify that the following dependencies are installed on your workstation:

1. **Docker Desktop** (or Docker Engine + Docker Compose)
   - Used to run the official FalkorDB image (`falkordb/falkordb:latest`).
   - Download: [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
2. **Node.js** (v18.0.0 or higher; v20+ recommended)
   - Verify installation: `node -v`
3. **npm** (v9.0.0 or higher)
   - Verify installation: `npm -v`
4. **Git**
   - For repository version control.

---

## 🐳 Step 1: Launching FalkorDB via Docker

FalkorDB runs as a high-performance Redis module service communicating over the standard Redis protocol on port `6379`.

### Option A: Using Docker Compose (Recommended)

A pre-configured [`docker-compose.yml`](../docker-compose.yml) is included in the project root:

```bash
# Navigate to the repository root directory
cd "Hostel-and-mess-management"

# Launch FalkorDB container in detached mode
docker compose up -d
```

### Option B: Using the Docker CLI Directly

If you prefer running a single Docker command:

```bash
docker run -d \
  --name hostelhub-falkordb \
  -p 6379:6379 \
  -v falkordb_data:/data \
  --restart unless-stopped \
  falkordb/falkordb:latest
```

### Verify Container Health

Check that the container is running and healthy:

```bash
docker ps --filter "name=hostelhub-falkordb"
```

Expected output:
```text
CONTAINER ID   IMAGE                      COMMAND                  STATUS                   PORTS                    NAMES
a41ebffba091   falkordb/falkordb:latest   "/entrypoint.sh falk…"   Up (healthy)             0.0.0.0:6379->6379/tcp   hostelhub-falkordb
```

---

## ⚙️ Step 2: Configure Environment Variables

The backend reads FalkorDB and MySQL connection settings from `backend/.env`.

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Verify that `backend/.env` contains the FalkorDB variables:
   ```ini
   # Database Configuration (MySQL)
   # Leave DB_PASSWORD unset or empty to use Auto-Fallback Mode
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   # DB_PASSWORD=your_mysql_password_here
   DB_NAME=hostel_mess_management

   # Server Port
   PORT=4000

   # FalkorDB Graph Database Configuration
   FALKORDB_HOST=localhost
   FALKORDB_PORT=6379
   # FALKORDB_PASSWORD=
   FALKORDB_GRAPH_NAME=hostel_hub
   ```

> [!NOTE]
> `backend/.env.example` is also provided in the repository with placeholder values. Never commit live production passwords to Git.

---

## 📦 Step 3: Install Node.js Dependencies

Install the backend dependencies, including the official `falkordb` TypeScript/Node.js client:

```bash
cd backend
npm install
```

Verify that `falkordb` is listed under `dependencies` in `backend/package.json`:
```json
"dependencies": {
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.19.2",
  "falkordb": "^7.0.0",
  "mysql2": "^3.9.3"
}
```

---

## 🏗️ Step 4: Initialize Graph Schema & Indexes

FalkorDB supports fast indexed lookup via OpenCypher index creation. Execute the idempotent schema setup script:

```bash
npm run falkordb:schema
```

This script:
1. Connects to `localhost:6379` using the graph name `hostel_hub`.
2. Creates **15 range and secondary search indexes** across all 10 domain entities:
   - `Student`: `student_id`, `reg_no`
   - `Room`: `room_id`, `room_number`
   - `Hostel`: `hostel_id`, `hostel_name`
   - `Block`: `block_id`
   - `Floor`: `floor_id`
   - `RoomType`: `room_type_id`
   - `Complaint`: `complaint_id`, `status`
   - `ComplaintType`: `complaint_type_id`
   - `Mess`: `mess_id`, `mess_name`
   - `Caterer`: `caterer_id`
3. Verifies entity uniqueness constraints using `createNodeUniqueConstraint`.

Expected output:
```text
=======================================================
FALKORDB SCHEMA & INDEXES SETUP
=======================================================
Connected to FalkorDB (localhost:6379) [Graph: hostel_hub]
Found 15 schema index statements to execute.
...
FalkorDB Schema setup completed: 15 index statements processed.
=======================================================
```

---

## 🔄 Step 5: Execute ETL Synchronization

Synchronize the authoritative relational records into FalkorDB:

```bash
npm run falkordb:sync
```

This pipeline extracts records from MySQL (or the high-fidelity embedded engine if MySQL is offline) and merges them into FalkorDB:
- 12 Student nodes
- 2 Hostel nodes
- 4 Block nodes
- 4 Floor nodes
- 4 RoomType nodes
- 10 Room nodes
- 5 Mess nodes
- 3 Caterer nodes
- 2 ComplaintType nodes
- 7 Complaint nodes
- Active living relationships (`ALLOCATED_TO`), dining memberships (`REGISTERED_FOR`), facility grievance links (`ASSOCIATED_WITH`), and structural hierarchy (`ON_FLOOR`, `IN_BLOCK`, `PART_OF`, `HAS_TYPE`, `SERVED_BY`, `LOCATED_AT`, `FILED`, `OF_TYPE`).

Expected output:
```text
=======================================================
STARTING MYSQL -> FALKORDB SYNCHRONIZATION PIPELINE
=======================================================
Target Graph: localhost:6379 (Graph: hostel_hub)
Extracting authoritative data from MySQL / Data Engine...
Loaded records: 12 students, 10 rooms, 7 complaints, 5 messes.
=======================================================
✅ FALKORDB SYNCHRONIZATION SUCCESSFUL (Completed in ~70ms)
- Nodes Processed: 53
- Active Facility Grievance Links Established: 5
=======================================================
```

---

## 🧪 Step 6: Run Automated Integration Tests

Validate the complete graph stack using the automated test suite:

```bash
npm test
```

This runs `backend/scripts/test-graph.js` and evaluates **44 assertions**:
- Authoritative relational data extraction
- FalkorDB live connection and latency check
- ETL idempotency (verifying zero duplicate nodes upon repeated sync)
- Live Cypher Roommate Finder traversal with self-exclusion
- Live Cypher Grievance Hotspot aggregation
- Authoritative MySQL smart room vacancy reconciliation rule
- Payload integrity validators (Regression tests 1 through 8)
- Live HTTP API `/api/graph/explore` payload validation (Regression 9: 100% valid edge endpoints, zero dangling references)

Expected output:
```text
=======================================================
TOTAL TEST SUMMARY: 44 Passed, 0 Failed.
=======================================================
```

---

## 🌐 Step 7: Start the Server & Open the Web UI

Start the application backend:

```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:4000/app
```

Click on the **"Hostel Intelligence [FalkorDB]"** tab to explore:
1. **Overview Dashboard**: Live FalkorDB connectivity badge, latency in milliseconds, node count, and graph metrics.
2. **Roommate Explorer**: Select any student (e.g., *Aditya Sen* or *Aarav Sharma*) to visualize shared room occupancy.
3. **Grievance Hotspots**: Inspect complaint density grouped by physical room, mess hall, or hostel block.
4. **Smart Room Vacancy**: Filter by AC/Non-AC, minimum capacity, and residential block with real-time MySQL vacancy validation.
5. **Mess Connection Explorer**: Explore dining contracts, caterer SLAs, and registered student rosters.
6. **Interactive Graph Explorer**: Zoom, pan, drag, and inspect the complete campus knowledge graph rendered via **Cytoscape.js**.

---

## 🛠️ Troubleshooting & FAQ

### Q1: `docker: Error response from daemon: Ports are not available: exposing port TCP 0.0.0.0:6379`
- **Cause**: Another service (such as a local Redis server or an older container) is occupying port 6379.
- **Fix**: Check what process is using port 6379:
  ```powershell
  # PowerShell
  Get-NetTCPConnection -LocalPort 6379
  ```
  Stop conflicting containers:
  ```bash
  docker stop <conflicting_container_name>
  ```
  Or change `FALKORDB_PORT=6380` in `.env` and `6380:6379` in `docker-compose.yml`.

### Q2: What happens if FalkorDB is offline?
- The backend features a built-in **circuit-breaker middleware** (`ensureFalkorDB` in `backend/routes/graph.js`).
- If FalkorDB stops, the backend immediately detects the disconnection and seamlessly serves authoritative relational projections from MySQL without throwing HTTP 500 errors.
- The UI status badge dynamically displays `FalkorDB [Offline - Fallback Engine Active]`.

### Q3: Does graph data survive container restarts?
- **Yes**. `docker-compose.yml` mounts a named Docker volume `falkordb_data:/data`. All graph keys, nodes, and relationships are automatically persisted to disk by FalkorDB's snapshot engine.

### Q4: How do I completely wipe and re-sync the graph?
```bash
# Optional: Clear graph in FalkorDB
docker exec -it hostelhub-falkordb redis-cli GRAPH.DELETE hostel_hub

# Re-create schema and sync
npm run falkordb:schema
npm run falkordb:sync
```

