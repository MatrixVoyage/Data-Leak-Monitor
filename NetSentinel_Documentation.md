# 📚 NetSentinel: Architectural Documentation & Technical Guide

This document provides an in-depth look at NetSentinel's purpose, architectural design, component execution flow, and core theoretical concepts. It serves as both a developer onboarding guide and a technical reference for system audits.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture & System Design](#2-architecture--system-design)
3. [Component Breakdown](#3-component-breakdown)
4. [Execution Flow](#4-execution-flow)
5. [Core Concepts](#5-core-concepts)

---

## 1. Project Overview

### 🎯 Purpose
NetSentinel is a privacy-first, cloud-integrated network monitoring system. It provides real-time visibility into local network activity by capturing, enriching, and statistically analyzing network traffic. Its primary goal is to alert users to potential data leaks, unauthorized background tracking, and unusual device connections.

### 💡 The Problem It Solves
Modern environments contain numerous internet-connected devices (laptops, mobile devices, IoT hardware) that frequently share telemetry and personal data in the background. Traditional packet analyzers like Wireshark are powerful but notoriously complex for persistent monitoring, and they capture invasive payloads. NetSentinel abstracts this complexity by focusing exclusively on **metadata privacy**—converting raw network behavior into human-readable alerts without logging sensitive packet payloads.

### 🏢 Real-World Applications
- **IoT Security:** Detect when a smart device unexpectedly uploads large volumes of data to an unrecognized geographical location.
- **Privacy Auditing:** Track which applications rely on continuous advertising and tracking domains (e.g., Google, Meta telemetry).
- **Incident Response:** Maintain historical logs of egress network connections (destinations and ports) isolated from an infected machine.

---

## 2. Architecture & System Design

NetSentinel employs a decoupled, three-tier architecture to ensure minimal local footprint and robust centralized processing.

### High-Level Tiers
1. **Local Agent (Collector):** A Python service resting securely on the local network or gateway. It monitors hardware-level packets, strips payload data for privacy, and caches the metadata locally.
2. **Cloud Backend (Processor):** A resilient FastAPI engine handling heavy computational tasks. It receives batched traffic data, enriches it via Geo-IP and DNS plugins, applies a statistical Rules Engine, and safely stores the finalized records.
3. **Frontend Dashboard (Viewer):** A modern Next.js web application utilizing real-time state management to provide high-end, dynamic visual analytics.

### Data Flow
- **Capture:** The Agent utilizes `scapy` to intercept TCP/UDP headers. Key metadata (Source/Destination IP, Byte Size, Port) is cached in a local SQLite database.
- **Ingestion:** Using a background thread, the Agent bulk-POSTs cached logs to the `/api/ingest` Cloud Backend endpoint every 5–10 seconds.
- **Enhancement & Evaluation:** The Cloud Backend attempts DNS resolution and GeoLite2 IP location lookups. The record is scored based on anomalies; if critical thresholds are met, the system generates an Alert.
- **Consumption:** The Next.js dashboard polls `/api/traffic` and `/api/anomalies`, leveraging Zustand to stream and smoothly render the architectural shifts.

---

## 3. Component Breakdown

### `backend-local-agent/` *(The Edge Collector)*
Responsible for capturing baseline network truth. Focuses on stealth and resilience.

- **`sniffer.py`**
  - *Purpose:* Analyzes OS-level network packets using `scapy`'s `sniff()` function.
  - *Logic:* Discards payloads, retaining only networking headers. Writes directly to an `agent_cache.db` buffer. A background `_sender_loop()` regularly flushes the buffer to the cloud via bulk HTTP requests.
  - *Resilience:* **Batching & Buffering.** If external connectivity is lost, the local SQL cache securely expands safely. When connectivity is restored, the buffered backlog is flushed transparently to the cloud.
- **`main.py`**
  - *Purpose:* Exposes a small local FastAPI control surface allowing administrators to safely pause/resume local sniffing.
- **`.env`**
  - Stores the `AGENT_API_KEY` for secure cloud ingress authentication.

### `backend-cloud/` *(The Brain)*
Responsible for data intelligence, enrichment, and persistent storage.

- **`main.py`**
  - Functions as the core API Router (`/api/traffic`, `/api/dns`, `/api/devices`).
  - Utilizes an `APScheduler` background task to purge expired records daily, proactively preventing storage bloat.
  - Ensures atomic database operations using strict `try/except` rollback paradigms during batch data ingestion.
- **`enrichment.py`**
  - Resolves IPs (e.g., `142.250.x.x`) to domains (`google.com`) and geopolitical regions (`US`).
  - Employs non-blocking socket lookups to ensure the ingestion queue remains performant, gracefully falling back to "Unknown" on timeouts.
- **`rules_engine.py`**
  - The proprietary detection logic sequence. Batches are evaluated against weighted risk profiles (e.g., *Is it a known tracker?* +1 point; *Is it a large upload to a restricted country?* +2 points).
  - High-scoring interactions (Score >= 5) automatically spawn robust `Anomaly` records detailing the violation.
- **`models.py / schemas.py`**
  - Defines the strict SQLAlchemy database schemas and Pydantic validation pipelines, ensuring only mathematically sound payload data enters the SQL matrix.

### `frontend/` *(The Interface)*
A Next.js (React) unified presentation layer utilizing strict typescript definitions.

- **`src/store/dashboard.ts`**
  - Employs **Zustand** for lightweight, global state arrays (like `traffic[]` or `anomalies[]`), ensuring all sibling visual components share universal consistency.
- **`src/components/dashboard/`**
  - **`traffic-panel.tsx`**: Renders analytical grids and Recharts bar charts. Adheres to "Safe-Navigation" (`t.destDomain || ''`) defensively avoiding client-side rendering crashes from unstructured backend events.
  - **`packets-panel.tsx`**: The "Live Capture" interface. Rapidly iterative parsing visualizes live metrics in immediate response.

---

## 4. Execution Flow (Anatomy of a Request)

*Trace example: A user watches a YouTube video.*

1. **Packet Capture:** `sniffer.py` identifies HTTP/S packets leaving port `443` directed to a Google CDN. It records the destination IP and payload size (e.g., 2000 bytes) but discards the video payload itself.
2. **Buffer Queue:** The stripped metadata is `INSERT`ed into the local `agent_cache.db`.
3. **Dispatch Thread:** Every few seconds, the dispatcher detects the buffered rows, packages them into a JSON payload, and `POST`s the bundle to the Cloud API.
4. **Cloud Receive:** `main.py` decodes and sanitizes the JSON via Pydantic validators.
5. **Enrichment Iteration:** `enrichment.py` processes the target IP, associating it with `"US"` and `"google.com"`.
6. **Rules Engine:** `evaluate_traffic_batch()` scans the metrics. Despite high bandwidth usage, the rules engine categorizes the traffic as a recognized benign service (Score: 0). No anomaly is triggered.
7. **Database Persistence:** The finalized `TrafficRecord` is committed to the cloud database.
8. **Client Rendering:** A user observing the frontend sees the new data arrive. The `useEffect` hook in `traffic-panel.tsx` captures the updated record, and the UI's `Recharts` graph instantly adapts to graph the newly transmitted bytes.

---

## 5. Core Concepts & Topics

- **Packet Sniffing & The OSI Model:** Understanding how operating systems handle Transport (Layer 4) encapsulation vs Network (Layer 3) IP addressing. Scapy requires administrative permissions to interface with the raw network socket promiscuously.
- **Relational Object Mapping (ORM):** Utilizing SQLAlchemy to abstract SQL statements into Pythonic objects. This pattern drastically reduces the application's theoretical attack surface for SQL injection vulnerabilities.
- **Polling vs. WebSockets:** The dashboard leverages consistent, efficient short-polling. While WebSockets provide bi-directional sustained links, polling scales considerably better across stateless Serverless ecosystems (like Vercel hosting).
- **Graceful Error Resilience:** Ingestion pipelines utilize isolated exception handling; a single malformed packet within a JSON batch will not fatally crash the remaining 99 successful data insertions.
