"""Backend tests for Asisten AI endpoints (POST/GET/DELETE /api/assistant/*)."""

import json

import httpx
import pytest

ADMIN = {"username": "admin", "password": "admin123"}


@pytest.fixture
def auth_client():
    with httpx.Client(base_url="http://localhost:8001/api", timeout=60.0) as c:
        r = c.post("/auth/login", json=ADMIN)
        assert r.status_code == 200, f"login failed: {r.text}"
        yield c


# --- auth guard ---
def test_chat_requires_auth(client):
    r = client.post("/assistant/chat", json={"message": "hi"})
    assert r.status_code == 401


def test_history_requires_auth(client):
    r = client.get("/assistant/history")
    assert r.status_code == 401


# --- history + chat flow ---
def test_history_is_array(auth_client):
    r = auth_client.get("/assistant/history")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_clear_history_then_chat_then_history(auth_client):
    # Clean slate
    r = auth_client.delete("/assistant/history")
    assert r.status_code == 200

    r = auth_client.get("/assistant/history")
    assert r.status_code == 200
    assert r.json() == []

    # Chat (stream)
    question = "Berapa total stok semua gudang?"
    tokens = []
    done = False
    err = None
    with auth_client.stream("POST", "/assistant/chat", json={"message": question}, timeout=90.0) as resp:
        assert resp.status_code == 200
        for raw in resp.iter_lines():
            if not raw or not raw.startswith("data: "):
                continue
            try:
                ev = json.loads(raw[6:])
            except Exception:
                continue
            if "token" in ev:
                tokens.append(ev["token"])
            elif ev.get("done"):
                done = True
                break
            elif "error" in ev:
                err = ev["error"]
                break

    assert err is None, f"stream returned error event: {err}"
    assert done, "no 'done' event received from stream"
    answer = "".join(tokens)
    assert len(answer) > 0, "assistant returned empty answer"

    # History must now contain user + assistant chronologically (user first)
    r = auth_client.get("/assistant/history")
    assert r.status_code == 200
    hist = r.json()
    assert len(hist) >= 2
    last_two = hist[-2:]
    assert last_two[0]["role"] == "user"
    assert last_two[0]["content"] == question
    assert last_two[1]["role"] == "assistant"
    assert last_two[1]["content"] == answer

    # Cleanup
    auth_client.delete("/assistant/history")
