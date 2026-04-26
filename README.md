# 🛡️ Data Leak Monitor

A comprehensive network security and data leak prevention (DLP) platform. This system monitors local network traffic in real-time, detects anomalies using advanced packet analysis, and provides a centralized dashboard for security oversight.

---

## 🏗️ System Architecture

The project is divided into three primary layers:

1.  **[Cloud Backend](./backend-cloud)**: High-performance FastAPI server managing data persistence, JWT authentication, and centralized analytics.
2.  **[Local Agent](./backend-local-agent)**: Lightweight Python service utilizing **Scapy** for real-time packet sniffing, DNS analysis, and secure data queuing.
3.  **[Frontend](./frontend)**: Modern **Next.js 16** dashboard featuring real-time data visualization via Recharts and smooth UI interactions with Framer Motion.

---

## 🚀 Features

- **Real-Time Sniffing**: Deep packet inspection (DPI) to monitor network activity at the packet level.
- **Anomaly Detection**: Automated identification of suspicious traffic patterns or potential data leaks.
- **DNS Analysis**: Monitoring resolving activity to detect domain-based threats or data exfiltration.
- **Traffic Visualization**: Detailed charts and panels for packet distribution, traffic spikes, and device stats.
- **Persistent Queuing**: Local SQLite-backed queue with exponential backoff for reliable data transmission to the cloud.
- **Secure Auth**: Role-based access control (RBAC) powered by JWT and industry-standard security practices.

---

## 🛠️ Tech Stack

### Cloud Backend
- **Framework**: FastAPI (Python)
- **Database**: PostgreSQL / SQLite via SQLAlchemy
- **Security**: JWT (python-jose), Bcrypt (passlib)
- **Scheduling**: APScheduler for data retention policies

### Local Agent
- **Networking**: Scapy (Packet Capture)
- **Communication**: WebSockets & REST API
- **Persistence**: SQLite (Local Buffer)
- **Engine**: Python 3.x

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4 & Shadcn UI
- **Visualization**: Recharts & Lucide Icons
- **State Management**: Zustand & React Query
- **Database Layer**: Prisma ORM

---

## 📥 Getting Started (Production & Local Dev)

The easiest way to run NetSentinel is via Docker Compose. This spins up the full stack (Next.js Frontend + FastAPI Backend) in a unified environment.

### 1. Start the Full Stack
Ensure you have Docker and Docker Compose installed.

```bash
docker-compose up --build -d
```

This will expose:
- **Frontend Dashboard**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000`

### 2. First-Run Setup Wizard
1. Open `http://localhost:3000` in your browser.
2. Complete the **Setup Wizard** to create your first Admin account.
3. Upon completion, the system will provide you with an **Agent API Key**. **Save this key!**

*(Note: If you ever lose the key, you can retrieve or regenerate keys from the **Settings > Agent & Alerts** tab in the dashboard).*

### 3. Start the Local Agent
The local agent runs on the machine/network you want to monitor. It requires administrative privileges to sniff raw packets.

1. Navigate to the agent directory:
```bash
cd backend-local-agent
```

2. Create a `.env` file and add your API Key:
```env
CLOUD_API_URL=http://localhost:8000
AGENT_API_KEY=your_generated_api_key_here
```

3. Install dependencies and run (requires root/admin):
```bash
pip install -r requirements.txt

# On Linux/macOS:
sudo python main.py

# On Windows:
# Run your terminal/command prompt as Administrator
python main.py
```

### 4. Alternative: Dockerized Agent
If you prefer running the agent via Docker (Linux only, as it requires host networking for packet capture):
```bash
cd backend-local-agent
docker build -t netsentinel-agent .
docker run -d --network host --privileged -e CLOUD_API_URL="http://localhost:8000" -e AGENT_API_KEY="your_api_key" netsentinel-agent
```

---

## 🛡️ Security Note
This tool is designed for authorized network monitoring and security research. Ensure you have proper permissions before sniffing traffic on any network.
