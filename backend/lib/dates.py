"""Server-side date helpers. The pod clock is UTC — anchor "today" here, never in the browser."""

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def today_iso(tz: str | None = None) -> str:
    """Today's date as YYYY-MM-DD in `tz` (default: APP_TZ env, else UTC)."""
    zone = tz or os.environ.get("APP_TZ", "UTC")
    return datetime.now(ZoneInfo(zone)).strftime("%Y-%m-%d")


def fmt_hhmmss(iso: str | None) -> str:
    """Time portion (HHMMSS) of an ISO datetime, in Asia/Jakarta (WIB)."""
    if not iso:
        return "000000"
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(ZoneInfo(os.environ.get("APP_TZ", "Asia/Jakarta"))).strftime("%H%M%S")
    except (ValueError, TypeError):
        return "000000"


def fmt_ddmmyy(iso: str) -> str:
    """Format an ISO (YYYY-MM-DD) date as dd/mm/yy for printed documents."""
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d/%m/%y")
    except (ValueError, TypeError):
        return iso or ""
