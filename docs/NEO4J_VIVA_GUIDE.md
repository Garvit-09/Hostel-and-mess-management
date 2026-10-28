# 🎓 Master Neo4j Viva & Demonstration Navigation Guide

**Course:** Database Management Systems (DA2 Laboratory Coursework)  
**System:** Hostel & Mess Management System (Hybrid Dual-Database Architecture)  
**Author Repository:** [https://github.com/Garvit-09/Hostel-and-mess-management](https://github.com/Garvit-09/Hostel-and-mess-management)  
**Quick Navigation Shortcut:** In VS Code, press `Ctrl + Shift + F` and search any `VIVA_...` marker listed below.

---

## 1. Quick Feature Navigation Table

Every feature in the Neo4j implementation is annotated with a standardized, searchable `VIVA_...` marker placed immediately above the relevant function, route, schema, query, or frontend handler.

| Feature / Topic | Search Marker | Primary Files | What to Demonstrate in VS Code |
| :--- | :--- | :--- | :--- |
| **System Overview & Health** | `VIVA_NEO4J_OVERVIEW` | `backend/routes/graph.js`<br>`frontend/assets/script.js` | Bolt ping latency check, node/relationship counters, and live status badge. |
| **Hybrid Dual-Engine Architecture** | `VIVA_NEO4J_ARCHITECTURE` | `backend/neo4j.js`<br>`backend/routes/graph.js`<br>`backend/server.js` | Driver singleton, session wrappers, and dual-layer data flow. |
| **Feature 1: Roommate Finder** | `VIVA_ROOMMATE_FINDER` | `backend/routes/graph.js`<br>`frontend/assets/script.js`<br>`backend/scripts/sync-neo4j.js` | Traversal: `(s1)-[:ALLOCATED_TO {status:'Active'}]->(Room)<-(s2)`. Current peer discovery. |
| **Feature 2: Grievance Hotspots** | `VIVA_GRIEVANCE_HOTSPOT` | `backend/routes/graph.js`<br>`frontend/assets/script.js`<br>`database/migration_neo4j_facility_complaint.sql` | Spatial clustering of complaints to facilities via `[:ASSOCIATED_WITH]`; heat-map color tiers. |
| **Feature 3: Smart Vacancy Finder** | `VIVA_SMART_VACANCY` | `backend/routes/graph.js`<br>`frontend/assets/script.js`<br>`backend/scripts/test-graph.js` | 5-tier structural traversal + MySQL occupancy verification (`vacant_beds = max(0, cap - occ)`). |
| **Feature 4: Mess Connections** | `VIVA_MESS_CONNECTION` | `backend/routes/graph.js`<br>`frontend/assets/script.js`<br>`backend/scripts/sync-neo4j.js` | Multi-hop supply chain: `(Hostel)<-[:LOCATED_AT]-(Mess)-[:SERVED_BY]->(Caterer)`. |
| **Feature 5: Interactive Visualizer** | `VIVA_NEO4J_FRONTEND` | `frontend/assets/script.js`<br>`backend/routes/graph.js`<br>`backend/graph-utils.js` | Cytoscape.js canvas rendering, CoSE layout physics, custom node colors, and inspector panels. |
| **ETL Data Synchronization** | `VIVA_NEO4J_SYNC` | `backend/scripts/sync-neo4j.js`<br>`backend/routes/graph.js`<br>`backend/scripts/test-graph.js` | Idempotent sync pipeline: MySQL tabular read -> Cypher `MERGE` -> relation creation. |
| **Graph Schema Definition** | `VIVA_NEO4J_SCHEMA` | `database/neo4j_schema.cypher`<br>`backend/scripts/setup-neo4j-schema.js`<br>`backend/graph-utils.js` | 10 Node labels, 11 Relationship types, canonical graph IDs, and property constraints. |
| **Uniqueness Constraints** | `VIVA_NEO4J_CONSTRAINTS` | `database/neo4j_schema.cypher`<br>`backend/scripts/setup-neo4j-schema.js` | 10 uniqueness constraints protecting primary identity keys (e.g. `s.student_id IS UNIQUE`). |
| **Search Performance Indexes** | `VIVA_NEO4J_INDEXES` | `database/neo4j_schema.cypher`<br>`backend/scripts/setup-neo4j-schema.js` | 5 Range/B-Tree lookup indexes (reg_no, room_number, hostel_name, mess_name, status). |
| **Zero-Downtime Fallback Engine** | `VIVA_NEO4J_FALLBACK` | `backend/neo4j.js`<br>`backend/routes/graph.js`<br>`frontend/assets/script.js` | In-memory relational synthesis from MySQL tables when Neo4j is offline (`neo4jConnected: false`). |
| **Parameterized Cypher Execution** | `VIVA_NEO4J_CYPHER` | `backend/neo4j.js`<br>`backend/routes/graph.js`<br>`backend/scripts/sync-neo4j.js` | `readQuery()` and `writeQuery()` runners; injection prevention using Cypher query parameters (`$param`). |
| **Graph REST API Layer** | `VIVA_NEO4J_API` | `backend/routes/graph.js`<br>`backend/server.js` | 8 REST endpoints mounted at `/api/graph/*` providing clean JSON contracts to the client. |
| **Payload Integrity & Validation** | `VIVA_NEO4J_DATA_VALIDATION` | `backend/graph-utils.js`<br>`backend/neo4j.js`<br>`database/migration_neo4j_facility_complaint.sql` | `validateGraphPayload()`: filters orphaned edges, converts Neo4j Integers, validates IDs. |
| **Architectural Boundaries & Limits** | `VIVA_NEO4J_LIMITATIONS` | `backend/routes/graph.js`<br>`database/neo4j_schema.cypher`<br>`frontend/assets/script.js` | What the system DOES NOT do (no prospective AI matchmaking, no graph gender rules, no auto-allocation). |

---

## 2. Hybrid System Architecture & Data Flow

### 2.1 The Two-Database Concept
This application does not replace MySQL with Neo4j; it operates a **Dual-Database Hybrid Architecture**:

```
+---------------------------------------------------------------------------------------+
|                                Frontend Client (Browser)                             |
|       Tabs: Dashboard | Students | Rooms | Mess | Grievances | Query Console          |
|                 + Hostel Intelligence [Neo4j] (6 Integrated Sub-Panels)                |
+---------------------------------------------------------------------------------------+
                                           |
                                           | HTTP REST API Calls (JSON)
                                           v
+---------------------------------------------------------------------------------------+
|                         Node.js / Express Backend (Port 4000)                         |
|   Standard Routes: /api/students, /api/rooms, /api/mess, /api/complaints, /api/queries|
|   Graph Intelligence: /api/graph (routes/graph.js)                                    |
+---------------------------------------------------------------------------------------+
                |                                                 |
                | Relational CRUD (mysql2)                        | Cypher Queries (neo4j-driver)
                v                                                 v
+-----------------------------------+             +-------------------------------------+
|        MySQL 8.0+ Database        |             |         Neo4j Graph Database        |
|  17 Relational Tables + Triggers  |             |   10 Labeled Nodes + 11 Rel Types   |
|   AUTHORITATIVE SOURCE OF TRUTH   |             |    GRAPH INTELLIGENCE PROJECTION    |
| (Transactions, Billing, Allotment)|             | (Network Analytics, Multi-Hop Paths)|
+-----------------------------------+             +-------------------------------------+
                |                                                 ^
                +------------ ETL Sync Pipeline ------------------+
                             (scripts/sync-neo4j.js)
```

### 2.2 Why Two Databases?
1. **MySQL** is the **Authoritative Transactional Source of Truth**:
   - Handles ACID transactions (room bookings, fee receipts, password hashing, grievance creation).
   - Enforces referential integrity (`FOREIGN KEY`), unique registration numbers, check constraints, and row-level locking.
2. **Neo4j** is the **Graph Intelligence Engine**:
   - Projects relational entities into a Property Graph using **Index-Free Adjacency**.
   - Answers multi-hop, recursive, and pattern-matching queries in constant or linear time relative to subgraph size ($O(k)$), without costly $N$-way relational SQL `JOIN` statements.

### 2.3 Synchronization & Staleness
- **Mechanism:** Synchronization is **batch/on-demand ETL**, not real-time 2-phase commit (2PC).
- **Trigger:** Initiated via CLI (`npm run neo4j:sync`), web button in UI (`POST /api/graph/sync`), or schema migration setup.
- **Idempotence:** Every Cypher write uses `MERGE` on unique business keys (`student_id`, `room_id`, etc.) and `ON MATCH SET` to update mutable properties without creating duplicate nodes or edges.
- **Staleness Handling:** If Neo4j is offline or temporarily out of date, the backend's **Relational Fallback Engine** (`fetchSourceData()`) queries MySQL directly, constructs the graph topology in Node.js memory, validates it, and returns the live state with `neo4jConnected: false`.

---

## 3. Graph Data Model Specification

### 3.1 Node Labels (10 Total)

| Label | Primary Key / Identity | Important Properties | Real-World Campus Meaning |
| :--- | :--- | :--- | :--- |
| `:Student` | `student_id` | `reg_no`, `full_name`, `gender`, `branch`, `course`, `year_of_study` | An enrolled student resident. |
| `:Room` | `room_id` | `room_number`, `floor_id`, `room_type_id`, `current_occupancy` | A physical dorm room. |
| `:Floor` | `floor_id` | `floor_number`, `block_id` | A building floor level. |
| `:Block` | `block_id` | `block_name`, `hostel_id` | A residential wing/block. |
| `:Hostel` | `hostel_id` | `hostel_name`, `hostel_type` ('Boys'/'Girls'), `warden_name` | A student residential building. |
| `:Mess` | `mess_id` | `mess_name`, `mess_category` ('Veg'/'Non-Veg'/'Special'), `capacity`, `monthly_fee` | A dining facility. |
| `:Caterer` | `caterer_id` | `caterer_name`, `contact_person`, `contact_number` | External catering contractor. |
| `:Complaint`| `complaint_id`| `status` ('Pending'/'In Progress'/'Resolved'), `description`, `complaint_date` | Student grievance ticket. |
| `:ComplaintType`| `complaint_type_id` | `type_name`, `category` | Classification taxonomy. |
| `:RoomType` | `room_type_id`| `type_name`, `capacity`, `ac_type` ('AC'/'Non-AC') | Specifications template. |

### 3.2 Relationship Types (11 Total)

| Relationship Type | Source Node | Target Node | Properties | Semantic Meaning |
| :--- | :--- | :--- | :--- | :--- |
| `[:ALLOCATED_TO]` | `:Student` | `:Room` | `allocation_date`, `status` ('Active'/'Vacated') | Bed occupancy allotment. |
| `[:ON_FLOOR]` | `:Room` | `:Floor` | _none_ | Spatial floor placement. |
| `[:IN_BLOCK]` | `:Floor` | `:Block` | _none_ | Structural block hierarchy. |
| `[:PART_OF]` | `:Block` | `:Hostel` | _none_ | Hostel facility inclusion. |
| `[:HAS_TYPE]` | `:Room` | `:RoomType` | _none_ | Capacity & AC specifications. |
| `[:REGISTERED_FOR]`| `:Student` | `:Mess` | `registration_date`, `status` ('Active'/'Inactive') | Meal plan subscription. |
| `[:SERVED_BY]` | `:Mess` | `:Caterer` | _none_ | Catering service contract. |
| `[:LOCATED_AT]` | `:Mess` | `:Hostel` | _none_ | Physical dining location. |
| `[:FILED]` | `:Student` | `:Complaint`| _none_ | Grievance origin reporter. |
| `[:ASSOCIATED_WITH]`| `:Complaint`| `:Room` \| `:Mess` \| `:Hostel` | _none_ | Targeted facility under grievance. |
| `[:OF_TYPE]` | `:Complaint`| `:ComplaintType` | _none_ | Grievance category classification. |

---

## 4. Comprehensive Viva Questions & Answers (18 Q&As)

### Q1: Why did you use Neo4j when MySQL already has foreign keys and joins?
> **Answer:** MySQL is exceptional for transactional operations and tabular integrity. However, campus operations require answering multi-hop network questions—such as finding all co-allocated roommates across multiple blocks, tracking historical room-sharing patterns, detecting grievance clusters across spatial hierarchies, and tracing mess contractor supply links. In MySQL, these require 5 to 7 relational `JOIN` operations that become computationally expensive as tables grow. Neo4j uses **Index-Free Adjacency**, where nodes point directly to their connected neighbors via physical pointers in RAM/disk. Traversing relationships in Neo4j takes $O(k)$ time proportional to the number of edges followed, rather than $O(\log N)$ or $O(N)$ scanning across unrelated index tables.

### Q2: What is a Graph Database and what is Index-Free Adjacency?
> **Answer:** A graph database is a database designed to treat data relationships as first-class citizens with equal importance to the data itself. Unlike relational databases that connect tables at query time using foreign key value lookups, Neo4j uses **Index-Free Adjacency**. Each node contains direct physical pointer references to its adjacent nodes and relationships. This means graph traversals do not use index lookups to jump between records; they dereference pointers directly, ensuring query execution time depends on the size of the traversed subgraph rather than the total size of the database.

### Q3: What is the Labeled Property Graph (LPG) model?
> **Answer:** Neo4j implements the Labeled Property Graph model, which consists of four core concepts:
> 1. **Nodes:** The entities (e.g., a Student, Room, Mess).
> 2. **Labels:** Categories that group nodes and assign schema indexing rules (e.g., `:Student`, `:Room`).
> 3. **Relationships:** Directed, typed connections between nodes (e.g., `-[:ALLOCATED_TO]->`). Relationships must always have a start node and an end node.
> 4. **Properties:** Arbitrary key-value pairs stored directly inside nodes or relationships (e.g., `status: 'Active'`, `capacity: 2`).

### Q4: What is Cypher and how does it differ from SQL?
> **Answer:** Cypher is Neo4j’s declarative graph query language. While SQL uses relational algebra syntax (`SELECT ... FROM ... JOIN ... ON ...`), Cypher uses ASCII-art visual syntax to describe graph paths:
> `(student:Student)-[:ALLOCATED_TO]->(room:Room)`.
> Cypher describes *what pattern to match* in the graph rather than specifying how to join relational tables.

### Q5: What is the difference between MATCH and OPTIONAL MATCH in Cypher?
> **Answer:**
> - `MATCH` is analogous to an `INNER JOIN` in SQL. If any part of the path pattern is missing, the entire row is filtered out and discarded.
> - `OPTIONAL MATCH` is analogous to a `LEFT OUTER JOIN` in SQL. If the pattern matches, it binds the variables; if the pattern cannot be found, it sets those variables to `null` while keeping the original matched nodes in the result set.
> In our Roommate and Mess endpoints, we use `OPTIONAL MATCH` for building hierarchies and grievances so that a student or dining hall without open complaints is still returned in the visualization.

### Q6: What is the difference between CREATE and MERGE in Cypher?
> **Answer:**
> - `CREATE` unconditionally creates new nodes and relationships every time it is run. Running `CREATE (s:Student {student_id: 1})` ten times creates 10 duplicate nodes.
> - `MERGE` performs an idempotent "find or create" operation. It first searches the graph for the pattern. If found, it binds to the existing entity; if not found, it creates it. We use `MERGE` across our synchronization ETL (`sync-neo4j.js`) combined with `ON MATCH SET` to ensure rerunning sync never creates duplicate data.

### Q7: Why do we have uniqueness constraints in Neo4j if MySQL already has primary keys?
> **Answer:** Neo4j and MySQL are separate database engines. Neo4j does not automatically inherit MySQL's relational schema constraints. We define uniqueness constraints in Cypher (e.g., `CREATE CONSTRAINT FOR (s:Student) REQUIRE s.student_id IS UNIQUE`) for two critical reasons:
> 1. **Data Integrity:** It guarantees that duplicate entities cannot be created in the graph.
> 2. **Lookup Performance:** Neo4j automatically creates a high-performance B-Tree/Range index on every unique property, ensuring `MERGE` operations on `$studentId` complete in sub-millisecond time.

### Q8: What does a uniqueness constraint in Neo4j NOT protect against?
> **Answer:** A uniqueness constraint only prevents duplicate values of that single property (e.g., two `:Student` nodes with the same `student_id`). It **does NOT** enforce high-level business rules—such as preventing a student from being allocated to two rooms simultaneously, ensuring room capacity is not exceeded, or checking gender compatibility. In our architecture, these transactional business rules are strictly enforced by MySQL relational foreign keys, check constraints, and stored procedures.

### Q9: How does the Roommate Finder feature work?
> **Answer:** The Roommate Finder (`GET /api/graph/students/:id/roommates`) finds current roommates using graph pattern traversal:
> 1. Validates the numeric student ID.
> 2. Matches the student's active allocation: `MATCH (target:Student {student_id: $id})-[r:ALLOCATED_TO {status: 'Active'}]->(room:Room)`.
> 3. Traverses incoming active allocation edges from that room to find peers: `MATCH (peer:Student)-[pr:ALLOCATED_TO {status: 'Active'}]->(room) WHERE peer.student_id <> target.student_id`.
> 4. Retrieves the room's floor, block, and hostel hierarchy via `[:ON_FLOOR]`, `[:IN_BLOCK]`, and `[:PART_OF]`.
> 5. If the student is unallocated, it returns `hasActiveAllocation: false` without failing.

### Q10: Does the Roommate Finder enforce gender rules or suggest prospective roommates?
> **Answer:** **No.** That is an important boundary of our implementation. The Roommate Finder is an *authoritative lookup* of existing, co-allocated residents sharing the exact same room. It does not perform predictive AI matchmaking or prospective roommate suggestions. Gender restrictions and block eligibility are enforced upstream in MySQL when an allocation is saved, not inside this graph query.

### Q11: How does Grievance Hotspot Detection work?
> **Answer:** The Grievance Hotspots endpoint (`GET /api/graph/complaint-hotspots`) clusters complaints by physical facility:
> 1. Queries complaints linked to facilities via `[:ASSOCIATED_WITH]`: `MATCH (c:Complaint)-[:ASSOCIATED_WITH]->(fac)`.
> 2. Groups by facility, counting open (`status IN ['Pending', 'In Progress']`), resolved (`status = 'Resolved'`), and total complaints.
> 3. Ranks facilities by unresolved complaints descending.
> 4. Complaints with no facility link (`fac IS NULL`) are isolated and reported separately as "Unlinked Campus Grievances."
> 5. In Cytoscape.js, facilities are color-coded based on open complaint thresholds: gray for 0–1, amber for 2–4, and critical red for 5+.

### Q12: Does a high complaint count on a facility prove contractor negligence?
> **Answer:** **No.** A graph relationship `(Complaint)-[:ASSOCIATED_WITH]->(Mess)` represents an administrative spatial association recorded on a complaint ticket. It indicates that the grievance occurred at or pertained to that facility. It provides operational visibility for administrators to investigate; it does not constitute legal or causal proof of negligence.

### Q13: How does the Smart Vacancy Finder work?
> **Answer:** The Smart Vacancy endpoint (`GET /api/graph/rooms/available`) combines graph structural traversal with relational verification:
> 1. Traverses the 5-tier structural hierarchy: `(Hostel)<-[:PART_OF]-(Block)<-[:IN_BLOCK]-(Floor)<-[:ON_FLOOR]-(Room)-[:HAS_TYPE]->(RoomType)`.
> 2. Applies optional query filters for hostel, AC type, and minimum capacity.
> 3. Cross-validates occupancy against active MySQL room allocations to compute:  
>    $$\text{vacant\_beds} = \max(0, \text{capacity} - \text{occupancy})$$
> 4. Fully occupied rooms are included with `vacant_beds: 0` and labeled "Fully Occupied" to provide full campus visibility.
> 5. **Limitation:** This endpoint reports room availability; it does not perform automated room booking or allocation mutations.

### Q14: How does the Mess Connection feature work?
> **Answer:** The Mess Connections endpoint (`GET /api/graph/mess/:id/connections`) exposes the dining supply chain:
> 1. Evaluates the central `:Mess` node.
> 2. Follows `[:SERVED_BY]` to identify the contractor `:Caterer` and contact person.
> 3. Follows `[:LOCATED_AT]` to determine the physical host `:Hostel`.
> 4. Traverses incoming `[:REGISTERED_FOR {status: 'Active'}]` relationships to list enrolled `:Student` residents.
> 5. Identifies dining-specific complaints linked via `[:ASSOCIATED_WITH]`.
> This gives administrators a single 360-degree view of catering contractors, subscriber counts, and dining feedback.

### Q15: What happens if Neo4j is offline or the server fails to connect?
> **Answer:** The system has an automatic **Hybrid Relational Fallback Engine**. The Neo4j driver initializes lazily and performs non-blocking health checks. If `neo4jConnected` is false:
> 1. The backend automatically switches to `fetchSourceData()`, fetching records from MySQL relational tables.
> 2. It builds the graph topology (nodes and edges) in Node.js memory.
> 3. It sanitizes the payload through `validateGraphPayload()` to ensure no orphaned edges exist.
> 4. It returns `neo4jConnected: false` with complete valid Cytoscape elements.
> The frontend updates the status badge to "Offline - Fallback Engine Active" and renders the data without crashing or showing blank screens.

### Q16: How do we prevent frontend Cytoscape.js rendering crashes?
> **Answer:** Cytoscape.js throws a fatal JavaScript error if an edge references a `source` or `target` node ID that does not exist in the nodes collection. We prevent this using a two-layer defense:
> 1. **Backend Validation (`backend/graph-utils.js`):** `validateGraphPayload()` builds a `Set` of all valid node IDs and filters out any edge whose source or target is missing.
> 2. **Client-side Verification (`frontend/assets/script.js`):** `renderCytoscapeGraph()` independently verifies every edge against a node ID `Set` before calling `cytoscape({ elements: ... })`.

### Q17: What is Cytoscape.js and how does it relate to Neo4j?
> **Answer:** Cytoscape.js is a client-side JavaScript graph visualization library that renders nodes and edges onto an HTML5 canvas in the browser. Cytoscape.js **is not a database**. It receives JSON graph elements from our Node.js Express API and executes the **CoSE (Compound Spring Embedder)** force-directed physics layout to position the nodes visually. Neo4j is the server-side database that stores, indexes, and queries the graph data.

### Q18: Why can't MySQL and Neo4j share a single atomic transaction?
> **Answer:** MySQL and Neo4j are independent database engines running as separate processes with distinct transaction managers, write-ahead logs, and communication protocols (MySQL uses the MySQL Wire Protocol on port 3306; Neo4j uses the Bolt protocol on port 7687). Participating in a single atomic transaction across heterogeneous systems requires a distributed transaction coordinator using Two-Phase Commit (2PC / XA protocol), which introduces significant latency, complex failure modes, and locking overhead. Instead, we use MySQL as the authoritative transaction authority and synchronize state to Neo4j through an idempotent ETL pipeline.

---

## 5. Live Demonstration Sequence (Step-by-Step for Viva)

Follow this sequence during your practical viva demonstration:

### Step 1: Open VS Code Search
- Press `Ctrl + Shift + F`.
- Type `VIVA_` to show the full list of documented graph features.

### Step 2: Demonstrate Architecture & Dual-Database Mounting
1. Search `VIVA_NEO4J_ARCHITECTURE` in `backend/server.js`.
2. Show that `/api/graph` is mounted cleanly alongside traditional relational endpoints (`/api/students`, `/api/rooms`).
3. Open `backend/neo4j.js` and explain the lazy-connect driver singleton and transaction runners (`readQuery`, `writeQuery`).

### Step 3: Demonstrate Schema, Constraints, and Indexes
1. Search `VIVA_NEO4J_CONSTRAINTS` in `database/neo4j_schema.cypher`.
2. Point out the 10 uniqueness constraints on canonical IDs (e.g. `student_id`, `room_id`).
3. Search `VIVA_NEO4J_INDEXES` and explain how B-Tree indexes accelerate searches on student registration numbers and room numbers.
4. Open `backend/scripts/setup-neo4j-schema.js` and show the automated schema runner.

### Step 4: Demonstrate Feature 1: Roommate Finder
1. Search `VIVA_ROOMMATE_FINDER` in `backend/routes/graph.js`.
2. Explain the Cypher pattern:
   ```cypher
   MATCH (s:Student {student_id: $studentId})-[r:ALLOCATED_TO {status: 'Active'}]->(rm:Room)
   OPTIONAL MATCH (peer:Student)-[pr:ALLOCATED_TO {status: 'Active'}]->(rm)
   WHERE peer.student_id <> s.student_id
   ```
3. Open the web browser, navigate to **Hostel Intelligence > Roommate Explorer**, select a student from the dropdown, and show:
   - The student's room and roommates card.
   - The interactive Cytoscape graph canvas showing the room hierarchy.
   - The "Housing History" button toggling past roommate intervals.

### Step 5: Demonstrate Feature 2: Grievance Hotspot Detection
1. Search `VIVA_GRIEVANCE_HOTSPOT` in `backend/routes/graph.js`.
2. Show how complaints are grouped by target facility via `[:ASSOCIATED_WITH]`.
3. In the browser, navigate to **Grievance Hotspots**:
   - Show the ranked facility table (unresolved vs resolved).
   - Point out the red intensity visualization in the graph canvas.
   - Click **Inspect Grievances** on a facility to view specific grievance tickets.
   - Highlight the "Unlinked Campus Grievances" counter for complaints with no specific room/mess assigned.

### Step 6: Demonstrate Feature 3: Smart Vacancy Finder
1. Search `VIVA_SMART_VACANCY` in `backend/routes/graph.js`.
2. Highlight line calculation:
   $$\text{vacant\_beds} = \max(0, \text{capacity} - \text{occupancy})$$
3. In the browser, navigate to **Smart Vacancy**:
   - Filter by Hostel or AC Type.
   - Show that vacant rooms display a green badge with available beds and a "✓ Verified MySQL Vacancy" badge.
   - Show that fully occupied rooms show "Fully Occupied" (zero overflow).

### Step 7: Demonstrate Feature 4: Mess Connections
1. Search `VIVA_MESS_CONNECTION` in `backend/routes/graph.js`.
2. Explain the relationships: `(Mess)-[:SERVED_BY]->(Caterer)` and `(Student)-[:REGISTERED_FOR]->(Mess)`.
3. In the browser, select a dining facility (e.g., Block A Dining) and show:
   - Caterer contact card and cuisine category.
   - Subscribed student count.
   - Interactive dining network canvas in Cytoscape.js.

### Step 8: Demonstrate Data Synchronization & Idempotence
1. Search `VIVA_NEO4J_SYNC` in `backend/scripts/sync-neo4j.js`.
2. Explain how `MERGE` ensures that rerunning the sync script updates properties (`ON MATCH SET`) without producing duplicate nodes or edges.
3. In the browser header, click **Sync Graph Projection** and observe the live sync summary modal displaying the milliseconds elapsed and updated node counters.

### Step 9: Demonstrate Zero-Downtime Fallback Engine
1. Search `VIVA_NEO4J_FALLBACK` in `backend/routes/graph.js`.
2. Explain: If Neo4j is stopped or unreachable, `fetchSourceData()` queries MySQL tables, dynamically reconstructs the graph elements, and returns `neo4jConnected: false`.
3. Show in `frontend/assets/script.js` how the UI gracefully updates the header badge to "Offline - Fallback Engine Active" with zero page crashes.

---

## 6. Limitations & Honest Implementation Boundaries

When presenting during your viva, state these confirmed technical boundaries clearly:

1. **Roommate Lookup vs Prospective Matchmaking:**  
   The Roommate Finder identifies **current co-allocated residents** sharing an existing room. It is **not** an AI matchmaking algorithm for suggesting compatible roommates.
2. **Gender and Eligibility Constraints:**  
   Gender separation (Boys hostel vs Girls hostel) and room eligibility rules are enforced in **MySQL** at the time of allocation. The Cypher query traverses the existing graph structure; it does not independently recalculate gender compatibility.
3. **Vacancy Reporting vs Automated Allocation:**  
   The Smart Vacancy endpoint is a **read-only discovery and consistency tool**. It computes available beds and cross-checks with MySQL. It **does not** mutate data or automatically allocate beds to students.
4. **Grievance Association vs Proof of Causation:**  
   The `[:ASSOCIATED_WITH]` relationship records that a grievance ticket is linked to a room, mess, or hostel. It identifies areas requiring investigation; it **does not** prove legal contractor liability or equipment defect causation.
5. **Batch ETL vs Real-Time Continuous Replication:**  
   Changes made in MySQL (e.g., newly inserted students) are reflected in Neo4j after running the idempotent synchronization pipeline (`POST /api/graph/sync` or `npm run neo4j:sync`). It is **not** an instantaneous distributed two-phase commit transaction.
6. **Cytoscape.js Client Library Role:**  
   Cytoscape.js is strictly a **client-side graph rendering library**. Rendering a graph in Cytoscape does not prove a live Neo4j database is connected, because our system includes an automatic fallback that can generate identical Cytoscape payloads directly from MySQL. Live Neo4j connectivity is confirmed by `/api/graph/health` returning `neo4j.connected = true`.

---

## 7. CLI Verification Commands

To verify and run test scripts from the terminal:

```bash
# 1. Verify schema constraints and indexes (idempotent)
npm run neo4j:schema

# 2. Run full idempotent MySQL to Neo4j synchronization
npm run neo4j:sync

# 3. Run automated integration tests across all graph endpoints
npm run neo4j:test

# 4. Check syntax of all graph source files
node --check backend/neo4j.js
node --check backend/graph-utils.js
node --check backend/routes/graph.js
node --check backend/scripts/sync-neo4j.js
node --check backend/scripts/setup-neo4j-schema.js
node --check backend/scripts/test-graph.js
node --check frontend/assets/script.js
```
