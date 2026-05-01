"""
WebSocket connection manager.

Manages active WebSocket connections keyed by farmer_id.
Extracted from main.py so it can be imported by both the
WS route and any service that needs to push server-side events.
"""

from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections per farmer."""

    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, farmer_id: str) -> None:
        await websocket.accept()
        self.active_connections[farmer_id] = websocket

    def disconnect(self, farmer_id: str) -> None:
        self.active_connections.pop(farmer_id, None)

    async def send_event(self, farmer_id: str, event: dict) -> None:
        if farmer_id in self.active_connections:
            try:
                await self.active_connections[farmer_id].send_json(event)
            except Exception:
                self.disconnect(farmer_id)


# Singleton used across the application
manager = ConnectionManager()
