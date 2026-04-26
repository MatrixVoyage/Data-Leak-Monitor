# NetSentinel: Personal Data Leak & Network Monitor
**Complete Project Documentation & Technical Interview Guide**

---

## 1. Project Overview
### Purpose of the Project
NetSentinel is a privacy-first, cloud-integrated network monitoring system designed to provide real-time visibility into local network activity. It captures, enriches, and statistically analyzes network traffic to alert users about potential data leaks, tracking behavior, and unusual device connections.

### The Problem It Solves
Modern households and developers possess numerous internet-connected devices (laptops, phones, smart TVs, IoT cameras). Most of these devices communicate silently in the background, making it impossible to know if a device is phoning home telemetry, downloading ads, or actively exfiltrating data to an unknown foreign server. Tools like Wireshark are too complex for daily monitoring and record intrusive payloads. NetSentinel solves this by interpreting standard traffic into human-readable alerts entirely focused on metadata privacy.

### Real-World Applications
- **IoT Security:** Detecting when a smart thermometer starts uploading massive data chunks to an unrecognized domain.
- **Privacy Auditing:** Understanding which devices rely on continuous ad/tracking domains (Google/Meta telemetry).
- **Incident Response:** Having historical logs of the exact destination and port an infected machine reached out to.

---

## 2. Architecture & System Design
The project utilizes a decoupled, three-tier architecture ensuring lightweight data collection and centralized heavy-lifting.

### High-Level Architecture
1. **Local Agent (Collector)**: A Python application running directly on the local machine/network. It sniffs hardware packets, strips payloads, and caches metadata.
2. **Cloud Backend (Processor)**: A robust FastAPI engine hosted on Render. It receives batched traffic data, enriches it with Geo-IP and Domain resolution, runs an AI/Statistical Rules Engine, and persists data.
3. **Frontend Dashboard (Viewer)**: A Next.js web application providing a high-end, real-time interface to visualize data.

### Data Flow
- **Capture:** Local Agent uses `scapy` to read TCP/UDP headers. Extracted metadata (Source/Dest IP, Bytes, Port) is cached in a local SQLite DB.
- **Ingestion:** Every 5-10 seconds, the Agent performs a batch `POST` request, pushing cached logs to the `/api/ingest` Cloud Backend endpoint.
- **Enhancement & Storage:** The Cloud Backend attempts DNS resolution and MaxMind Geo-IP location lookup for the destination IPs. The traffic is scored, saved to a relational database, and Anomalies/Alerts are triggered based on the score.
- **Consumption:** The Next.js dashboard polls the Cloud APIs (`/api/traffic`, `/api/anomalies`) and streams statistical differences using Zustand state management.

---

## 3. Complete Codebase Breakdown

### `backend-local-agent/` (The Edge Collector)
Responsible for capturing base truth network reality.

* **`sniffer.py`**: The heavy lifter. 
  * *Purpose*: Sniffs OS-level network packets using `scapy`.
  * *Logic*: Uses `sniff(prn=process_packet)`. Extracts IP Headers. It establishes an `agent_cache.db` to act as a buffer. It spawns a background thread running `_sender_loop()` which checks the DB every few seconds, wraps rows into JSON, and sends a single bulk HTTP `POST` to the cloud.
  * *Important Concept*: **Batching & Buffering**. If the internet goes down, the SQL cache grows but does not crash. Once the internet returns, it clears the buffer. It uses Windows `getmac` to auto-detect its active interface to track its own IP.
* **`main.py`**: FastAPI shell for the local agent (used to pause/play the local sniffer locally).
* **`.env`**: Holds `AGENT_API_KEY` to authenticate local-to-cloud ingress.

### `backend-cloud/` (The Brain)
Responsible for intelligence and data persistence.

* **`main.py`**: The API Router.
  * Links endpoints like `/api/traffic`, `/api/dns`, and `/api/devices`. 
  * *Important Component*: Runs an `APScheduler` background task every 12 hours that executes `db.query(...).delete()` to purge old records, saving the deployment from Storage limits.
  * Handles the ingestion route using `try/except` around record insertion and `db.rollback()` on failure to guarantee atomic operations.
* **`enrichment.py`**: 
  * *Purpose*: Maps `142.250.x.x` to `google.com` and `US`. 
  * Uses non-blocking socket lookups and a GeoLite2 DB. Gracefully fails to `"Unknown"` if the DNS server takes too long to avoid dragging down the batch ingest.
* **`rules_engine.py`**: The detection engine.
  * *Logic*: Traffic comes in for analysis. Checks rules: *Is it a known tracker? (+1)*. *Is it an unknown foreign country limit? (+2)*. *Is it a traffic bandwidth spike? (+2)*.
  * When a batch scores `>= 5`, it creates a `models.Anomaly` statistical record detailing "Why" (e.g. "Data Exfil: uploaded 150MB to a new country code").
* **`models.py / schemas.py`**: SQLAlchemy Tables mapping to SQLite (or Postgres), and Pydantic validators ensuring only cleanly-typed JSON comes in and out.

### `frontend/` (The Interface)
A Next.js (React) application.

* **`src/store/dashboard.ts`**: Uses **Zustand**. Holds global arrays like `traffic[]` or `anomalies[]`. This simplifies sharing state between the sidebar and all graph components.
* **`src/components/dashboard/`**:
  * `traffic-panel.tsx`: Renders the Data grid and Recharts bar charts. Employs "Safe-Navigation" (`t.destDomain || ''`) to parse nullable backend fields and prevent white-screen crashes.
  * `packets-panel.tsx`: The "Live Capture" view. Uses `setInterval` fetching. Parses JSON Arrays iteratively to render instant real-time network lines.

---

## 4. Execution Flow (From Code Perspective)

Let's trace a YouTube video loading on the Local Device.
1. **Packet Capture:** `sniffer.py` (`scapy` hook) catches IP packets leaving port `443` bound for a Google Video CDN. It logs `dest_ip`, sizes the payload (e.g., 2000 bytes), and drops the body.
2. **Buffer Queue:** The packet data is `INSERT`ed into the local `agent_cache.db` queue table.
3. **Dispatch Thread:** `sniffer.py`'s loop thread wakes up, finds 50 packets in the DB, JSONifies them, and sends `requests.post(CLOUD_API_URL/api/ingest)`.
4. **Cloud Receive:** `main.py` -> `@app.post("/api/ingest")`. It decodes the JSON payload using Pydantic.
5. **Enrichment Iteration:** It hands the CDN IP to `enrichment.py`, mapping it to `"US"`. 
6. **Rules Engine:** The batch is sent to `evaluate_traffic_batch()`. The engine notes high bandwidth, but flags it as a known service (score stays low: `0`). No anomaly is raised.
7. **Database Persistence:** The `models.TrafficRecord` is committed to the cloud DB.
8. **Client Rendering:** A user opens the frontend. The `useEffect` inside `traffic-panel.tsx` hits `/api/traffic`. The backend streams the new record down over JSON. The React state updates, and the `Recharts` graph instantly grows to represent the newly downloaded YouTube bytes.

---

## 5. Core Concepts & Topics (For Further Study)

- **Packet Sniffing & OSI Model:** (Network Interface layer vs Transport protocols). Why parsing layers via Scapy requires Administrator privileges to open promiscuous sockets.
- **Relational Object Mapping (ORM):** SQLAlchemy converts Python classes to strict SQL code. It abstracts away SQL Injection vulnerabilities.
- **Polling vs WebSockets:** The dashboard utilizes short-polling (`setInterval()`). Note: While WebSockets afford true real-time, polling is significantly easier to host on stateless free-tier Serverless platforms (like Vercel).
- **Graceful Error Handling:** Ingestions use non-fatal error fallback, ensuring one bad IP doesn't crash 99 other valid packets in a batch.

---

## 6. Tech Stack Deep Dive

- **Python (Scapy + FastAPI):** Python allows extremely rapid low-level network manipulation via Scapy, while FastAPI utilizes modern `async/await` features, resulting in exceptionally fast API response times compared to older frameworks like Django or Flask.
- **Next.js + React + Tailwind + Zustand:** Next.js establishes solid routing. Tailwind ensures a high-end designer UI without massive custom CSS files. Zustand is used instead of Redux because it requires zero boilerplate and enables instantaneous data streams across graph components.
- **SQLAlchemy:** Acts as the bridge to SQLite (development) and Postgres (production), decoupling application logic from the exact database engine utilized by the hosting provider.

---

## 7. Setup & Running the Code

### Local Environment Setup
1. **Cloud Backend**: 
   ```bash
   cd backend-cloud
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
2. **Local Agent**:
   Ensure Npcap (Windows) or Libpcap (Linux) is installed.
   ```bash
   cd backend-local-agent
   # Configure .env with your CLOUD_API_URL and AGENT_API_KEY
   pip install -r requirements.txt
   # Must be run as Administrator/Root
   python main.py 
   ```
3. **Frontend**:
   ```bash
   cd frontend
   npm install
   # Set NEXT_PUBLIC_API_URL in .env.local
   npm run dev
   ```

---

## 8. Advanced Engineering Insights

### Performance & Scalability
- **Batching:** Sending 50 HTTP requests a second would DDoS the cloud server and freeze the local OS. Batching packets locally in SQLite and pushing them up every 10 seconds drops internet usage by 95% while keeping analytics near-real-time.
- **Non-Blocking Enrichment:** Slower DNS lookups are given strict `timeouts` inside Python `try/except`. If the DNS provider goes down, the system inserts an empty string instead of failing to record the data. 

### Security & Privacy
- **Stateless Analysis:** No packets bodies (payloads) are captured. The system structurally cannot read passwords, messages, or emails, mathematically guaranteeing privacy.
- **Protected Endpoints:** Devices cannot push data arbitrarily; they require an `AGENT_API_KEY` stored securely mapped to a specific registered user.

---

## 9. Interview-Focused Section

If you are asked about this project in a Software Engineering interview, here is how you discuss it:

**Q. "Why did you use SQLite and Batching in the local agent rather than streaming packets directly?"**
*Answer:* "If the agent streams directly and encounters a network hiccup or temporary cloud outage, all packet records in that window are permanently lost. By caching them locally via SQLite, we create an Event Buffer. The application attempts to drain the buffer every 10 seconds. If it fails, the data persists locally and retries indefinitely, providing ultimate fault tolerance."

**Q. "How did you handle the risk of the database growing too large?"**
*Answer:* "I implemented an automated Data Retention Lifecycle. A background Python module utilizing `APScheduler` runs routinely. It executes queries to purge raw traffic older than a few days, only maintaining the aggregated high-level Anomalies for the long term. This converts exponential growth into a controlled rolling storage window."

**Q. "What was one difficulty you ran into, and how did you solve it?"**
*Answer:* "Initially, on the dashboard, React's `.map()` function would crash the entire application (white screen of death) if the API successfully returned a packet, but the packet had an `undefined` destination domain. I fixed this by implementing protective null-guards (`t.destDomain || ''`) or Optional Chaining prior to mapping, ensuring structural resiliency against malformed data inputs."

---

How the data flows (simple language):

┌──────────────────────────────────────────────────────────────────┐
│                       YOUR LAPTOP                                │
│                                                                  │
│   📶 Mobile Hotspot / WiFi                                       │
│       ↓ (all traffic passes through here)                        │
│                                                                  │
│   🐍 Local Python Agent (sniffer.py)                             │
│       - Captures every packet going in/out                       │
│       - Records: which device, which website, how much data      │
│       - Stores packets in a local queue (SQLite)                 │
│       - Every 5 seconds, sends a batch to the cloud              │
│                                                                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS (encrypted)
                         ↓
┌────────────────────────────────────────────────────────────────── ┐
│              RENDER CLOUD (backend-cloud)                         │
│                                                                   │
│   📦 Receives the batch of traffic records                        │
│   🗄️  Stores them in PostgreSQL database                          │
│   🔍 Analyzes for suspicious patterns                             │
│   📊 Serves data via REST API (/api/stats, /api/traffic, etc.)   │
│                                                                   │
└────────────────────────┬──────────────────────────────────────────┘
                         │ HTTPS
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│            VERCEL DASHBOARD (frontend)                            │
│                                                                   │
│   🖥️  Your browser loads the beautiful Next.js dashboard          │
│   📡 Fetches data from Render cloud API                           │
│   📈 Shows: Devices, Traffic, DNS, Alerts, AI Detection           │
│   🌍 Accessible from ANY device — phone, tablet, other PC         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘


## 10. Summary
NetSentinel represents a complete end-to-end Full Stack pipeline spanning from low-level networking and OSI analysis up to cloud system architecture and modern web engineering. It acts as both a functional cybersecurity home-tool and a showcase of handling asynchronous pipelines, RESTful architectures, and database scalability.
