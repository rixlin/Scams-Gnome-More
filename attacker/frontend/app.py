"""
Attacker Frontend — Streamlit control panel for adversarial call testing.
"""

import time

import requests
import streamlit as st

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BACKEND_URL = "http://localhost:8000"

st.set_page_config(page_title="Attack Agent Control", page_icon="☎️", layout="wide")

# ---------------------------------------------------------------------------
# Session state (initialize before UI controls)
# ---------------------------------------------------------------------------

if "active_call_sid" not in st.session_state:
    st.session_state.active_call_sid = None
if "call_start_time" not in st.session_state:
    st.session_state.call_start_time = None

# ---------------------------------------------------------------------------
# Sidebar — Call Controls
# ---------------------------------------------------------------------------

st.sidebar.title("☎️ Attack Agent")
st.sidebar.markdown("---")

default_caller_id = ""
try:
    from dotenv import dotenv_values
    env_vals = dotenv_values(".env")
    default_caller_id = env_vals.get("TWILIO_PHONE_NUMBER", "")
except Exception:
    pass

caller_id = st.sidebar.text_input(
    "Caller ID (Your Twilio Number)",
    value=default_caller_id,
    help="Your account's Twilio phone number making the outbound call",
)

target_number = st.sidebar.text_input(
    "Target Phone Number",
    placeholder="+1234567890",
    help="Can be any phone number, including another Twilio account's number",
)

difficulty = st.sidebar.slider(
    "Jailbreak Difficulty",
    min_value=1,
    max_value=5,
    value=3,
    help="1 = Low (easily sidetracked), 3 = Medium (persistent), 5 = High (aggressive urgency)",
)

difficulty_labels = {1: "Low", 2: "Low–Med", 3: "Medium", 4: "Med–High", 5: "High"}
st.sidebar.caption(f"Level: **{difficulty_labels[difficulty]}**")

start_call = st.sidebar.button("🚀 Start Call", type="primary", use_container_width=True)
hangup_call = st.sidebar.button(
    "🛑 Hang Up",
    type="secondary",
    use_container_width=True,
    disabled=(st.session_state.active_call_sid is None),
)

st.sidebar.markdown("---")
st.sidebar.caption("Ensure the FastAPI backend is running on port 8000.")

# ---------------------------------------------------------------------------
# Initiate / Hangup call handlers
# ---------------------------------------------------------------------------

if start_call:
    if not target_number:
        st.sidebar.error("Please enter a target phone number.")
    else:
        try:
            payload = {"to": target_number, "difficulty": difficulty}
            if caller_id:
                payload["from"] = caller_id

            resp = requests.post(
                f"{BACKEND_URL}/calls/initiate",
                json=payload,
                timeout=15,
            )
            if resp.ok:
                data = resp.json()
                st.session_state.active_call_sid = data.get("call_sid")
                st.session_state.call_start_time = time.time()
                st.sidebar.success(f"Call initiated — SID: {data.get('call_sid', 'N/A')}")
                st.rerun()
            else:
                try:
                    err_detail = resp.json().get("detail", resp.text)
                except Exception:
                    err_detail = resp.text
                st.sidebar.error(f"Backend error ({resp.status_code}): {err_detail}")
        except Exception as exc:
            st.sidebar.error(f"Failed to start call: {exc}")

if hangup_call and st.session_state.active_call_sid:
    try:
        resp = requests.post(
            f"{BACKEND_URL}/calls/{st.session_state.active_call_sid}/hangup",
            timeout=10,
        )
        if resp.ok:
            st.sidebar.warning(f"Call terminated.")
            st.session_state.active_call_sid = None
            st.session_state.call_start_time = None
            st.rerun()
        else:
            st.sidebar.error(f"Failed to hang up: {resp.text}")
    except Exception as exc:
        st.sidebar.error(f"Error terminating call: {exc}")

# ---------------------------------------------------------------------------
# Main area
# ---------------------------------------------------------------------------

st.title("Attack Agent — Live Dashboard")

col_status, col_btn_hangup, col_timer = st.columns([2, 1, 1])

with col_status:
    if st.session_state.active_call_sid:
        st.info(f"📞 Active call: `{st.session_state.active_call_sid}`")
    else:
        st.warning("No active call. Use the sidebar to start one.")

with col_btn_hangup:
    if st.session_state.active_call_sid:
        if st.button("🛑 End Call", key="main_hangup", type="secondary", use_container_width=True):
            try:
                requests.post(f"{BACKEND_URL}/calls/{st.session_state.active_call_sid}/hangup", timeout=10)
                st.session_state.active_call_sid = None
                st.session_state.call_start_time = None
                st.rerun()
            except Exception as exc:
                st.error(f"Error ending call: {exc}")

with col_timer:
    if st.session_state.call_start_time:
        elapsed = int(time.time() - st.session_state.call_start_time)
        mins, secs = divmod(elapsed, 60)
        st.metric("Call Duration", f"{mins:02d}:{secs:02d}")
    else:
        st.metric("Call Duration", "--:--")

st.markdown("---")

# ---------------------------------------------------------------------------
# Live transcript
# ---------------------------------------------------------------------------

st.subheader("📝 Live Transcript")

transcript_container = st.container()

if st.session_state.active_call_sid:
    try:
        resp = requests.get(
            f"{BACKEND_URL}/calls/{st.session_state.active_call_sid}/transcript",
            timeout=5,
        )
        data = resp.json()
        turns = data.get("turns", [])
        if turns:
            for t in turns:
                speaker = "🤖 Agent" if t["speaker"] == "agent" else "👤 Target"
                behavior_tag = ""
                if t.get("behavior") and t["behavior"] != "unknown":
                    behavior_tag = f"  _[{t['behavior']}]_"
                transcript_container.markdown(f"**{speaker}:** {t['text']}{behavior_tag}")
        else:
            transcript_container.caption("Waiting for conversation to begin…")

        # Auto-refresh
        if data.get("status") == "in-progress":
            time.sleep(2)
            st.rerun()
    except requests.ConnectionError:
        transcript_container.error("Cannot connect to backend. Is the server running?")
    except Exception as exc:
        transcript_container.error(f"Error fetching transcript: {exc}")
else:
    transcript_container.caption("Start a call to see the live transcript.")

# ---------------------------------------------------------------------------
# Call history
# ---------------------------------------------------------------------------

st.markdown("---")
st.subheader("📋 Call History")

try:
    resp = requests.get(f"{BACKEND_URL}/calls", timeout=5)
    calls = resp.json()
    if calls:
        for sid, info in calls.items():
            with st.expander(f"Call {sid} — {info.get('status', 'unknown')}"):
                st.json(info)
    else:
        st.caption("No calls recorded yet.")
except requests.ConnectionError:
    st.caption("Backend not available.")
except Exception:
    st.caption("Could not load call history.")
