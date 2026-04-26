import os
from fastapi import FastAPI, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
import json
import time
from collections import defaultdict

from logger import logger
from database import engine, get_db
import models

# Import modular routers
from routers import ingestion, auth_router, reporting

from sqlalchemy import inspect, text

def auto_migrate():
    """
    Auto-migrate: ensures all model columns exist in the database.
    SQLAlchemy's create_all() only creates NEW tables, so if a table already
    exists with old columns, new columns won't be added. This fixes that.
    Also drops extra DB columns that are NOT in the model (prevents NOT NULL violations).
    """
    # First, create any brand-new tables
    models.Base.metadata.create_all(bind=engine)
    
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    # Column type mapping for ALTER TABLE statements
    type_map = {
        "String": "TEXT",
        "Integer": "INTEGER",
        "Boolean": "BOOLEAN",
        "Float": "REAL",
        "DateTime": "TIMESTAMP",
        "JSON": "JSON",
        "VARCHAR": "TEXT",
    }
    
    for table_name, table in models.Base.metadata.tables.items():
        if table_name not in existing_tables:
            continue  # create_all already handled it
        
        existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
        model_cols = {col.name for col in table.columns}
        
        # --- Add missing columns ---
        for column in table.columns:
            if column.name not in existing_cols:
                col_type_str = str(column.type)
                sql_type = "TEXT"  # safe default
                for key, val in type_map.items():
                    if key.upper() in col_type_str.upper():
                        sql_type = val
                        break
                
                nullable = "NULL" if column.nullable else "NOT NULL DEFAULT ''"
                if sql_type in ("INTEGER", "REAL"):
                    nullable = "NULL" if column.nullable else "NOT NULL DEFAULT 0"
                if sql_type == "BOOLEAN":
                    nullable = "NULL" if column.nullable else "NOT NULL DEFAULT FALSE"
                
                alter_sql = f'ALTER TABLE "{table_name}" ADD COLUMN "{column.name}" {sql_type} {nullable}'
                try:
                    with engine.begin() as conn:
                        conn.execute(text(alter_sql))
                    logger.info(f"Migration: Added column '{column.name}' ({sql_type}) to '{table_name}'")
                except Exception as e:
                    logger.warning(f"Migration: Could not add column '{column.name}' to '{table_name}': {e}")
        
        # --- Drop extra columns that exist in DB but NOT in model ---
        extra_cols = existing_cols - model_cols
        for extra_col in extra_cols:
            try:
                drop_sql = f'ALTER TABLE "{table_name}" DROP COLUMN IF EXISTS "{extra_col}"'
                with engine.begin() as conn:
                    conn.execute(text(drop_sql))
                logger.info(f"Migration: Dropped extra column '{extra_col}' from '{table_name}'")
            except Exception as e:
                # If DROP fails (e.g. constraints), try making it nullable instead
                try:
                    nullable_sql = f'ALTER TABLE "{table_name}" ALTER COLUMN "{extra_col}" DROP NOT NULL'
                    with engine.begin() as conn:
                        conn.execute(text(nullable_sql))
                    logger.info(f"Migration: Made extra column '{extra_col}' nullable in '{table_name}'")
                except Exception as e2:
                    logger.warning(f"Migration: Could not handle extra column '{extra_col}' in '{table_name}': {e2}")

auto_migrate()

app = FastAPI(title="NetSentinel - Cloud Backend API")

# Strict CORS configuration
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,https://dataleakmonitor.vercel.app").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Message-ID"],
)

# Attach Routers
app.include_router(ingestion.router)
app.include_router(auth_router.router)
app.include_router(reporting.router)

# Basic Rate Limiting Middleware (IP based)
RATE_LIMIT_STORE = defaultdict(list)
MAX_REQUESTS = 5000
WINDOW_SECONDS = 60

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
    now = time.time()
    
    # Clean old requests
    RATE_LIMIT_STORE[ip] = [t for t in RATE_LIMIT_STORE[ip] if t > now - WINDOW_SECONDS]
    
    if len(RATE_LIMIT_STORE[ip]) >= MAX_REQUESTS:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=429, content={"detail": "Too Many Requests"})
    
    RATE_LIMIT_STORE[ip].append(now)
    response = await call_next(request)
    return response

# Active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()
app.state.manager = manager

# --- Data Retention Cleanup Background Task ---
def cleanup_old_data():
    db = next(get_db())
    try:
        logger.info("Running Data Retention Cleanup Task")
        cutoff_48h = datetime.utcnow() - timedelta(hours=48)
        cutoff_30d = datetime.utcnow() - timedelta(days=30)
        
        # Raw traffic -> 48 hours
        rows = db.query(models.TrafficRecord).filter(models.TrafficRecord.timestamp_start < cutoff_48h).delete()
        alerts_deleted = db.query(models.Alert).filter(models.Alert.timestamp < cutoff_30d).delete()
        anomalies_deleted = db.query(models.Anomaly).filter(models.Anomaly.timestamp < cutoff_30d).delete()
        
        db.commit()
        logger.info(f"Cleanup finished. Deleted {rows} traffic, {alerts_deleted} alerts, {anomalies_deleted} anomalies.")
    except Exception as e:
        logger.error(f"Cleanup task failed: {str(e)}")
    finally:
        db.close()

scheduler = BackgroundScheduler()
scheduler.add_job(cleanup_old_data, 'interval', hours=12)

@app.on_event("startup")
def startup_event():
    db = next(get_db())
    try:
        admin = db.query(models.User).filter_by(role="admin").first()
        if not admin:
            logger.warning("No admin user found! System requires first-run setup. Please visit the web interface.")
    finally:
        db.close()
    scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()

@app.get("/")
def read_root():
    return {"status": "ok", "message": "NetSentinel API Running"}

@app.get("/api/health")
def health_check(db = Depends(get_db)):
    """Debug endpoint to check system state."""
    try:
        return {
            "database": "connected",
            "users": db.query(models.User).count(),
            "admin_exists": db.query(models.User).filter_by(role="admin").first() is not None
        }
    except Exception as e:
        return {"database": "error", "detail": str(e)}



@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Just keep connection alive and wait for broadcast
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
