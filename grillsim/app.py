"""Web-App: liefert die Oberfläche aus und streamt den Grillzustand per WebSocket."""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .simulation import CommandError, Simulation

STATIC = Path(__file__).parent / "static"
TICK_S = 0.25

sim = Simulation()
clients: set[WebSocket] = set()


async def broadcast(message: dict) -> None:
    for ws in list(clients):
        try:
            await ws.send_json(message)
        except Exception:
            clients.discard(ws)


async def run_loop() -> None:
    last = time.monotonic()
    while True:
        await asyncio.sleep(TICK_S)
        now = time.monotonic()
        history_len = len(sim.history)
        sim.advance(now - last)
        last = now
        message: dict = {"type": "state", **sim.state(), "events": sim.drain_events()}
        if len(sim.history) != history_len:
            message["sample"] = sim.history[-1]
        await broadcast(message)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(run_loop())
    yield
    task.cancel()


app = FastAPI(title="Kamado-Grillsimulator", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/api/state")
async def state() -> dict:
    return sim.state()


@app.post("/api/command")
async def command(cmd: dict) -> dict:
    try:
        sim.handle(cmd)
    except (CommandError, ValueError) as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


def same_origin(ws: WebSocket) -> bool:
    """Fremde Webseiten im selben Browser dürfen den Grill nicht steuern."""
    origin = ws.headers.get("origin")
    if origin is None:  # kein Browser, z. B. ein Skript
        return True
    return urlsplit(origin).netloc == ws.headers.get("host")


@app.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    if not same_origin(ws):
        await ws.close(code=1008)
        return
    await ws.accept()
    clients.add(ws)
    await ws.send_json({"type": "history", "samples": list(sim.history)})
    try:
        while True:
            cmd = await ws.receive_json()
            try:
                sim.handle(cmd)
                if cmd.get("action") == "reset":
                    await broadcast({"type": "history", "samples": []})
            except (CommandError, ValueError) as exc:
                await ws.send_json({"type": "error", "message": str(exc)})
    except WebSocketDisconnect:
        clients.discard(ws)


def main() -> None:
    import uvicorn

    uvicorn.run("grillsim.app:app", host="127.0.0.1", port=5007)
