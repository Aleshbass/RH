"""A local-only browser harness for exercising Joy's real conversation path.

This is deliberately not a customer-facing product surface.  It is unavailable
outside ``JOY_ENVIRONMENT=development`` and needs its own local token.
"""

from __future__ import annotations

import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.api.internal.simulate import SimulateTurnIn
from app.config import Settings, get_settings
from app.db import get_session
from app.llm.gemini_client import LLMClient, get_llm_client
from app.queue.worker import process_inbound
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.triage_session import TriageSession
from app.models.types import ConversationStage, PatientPhase, Persona

router = APIRouter()

_LOCAL_RESET_CONFIRMATION = "RESET LOCAL CONTEXT"


class LocalResetIn(BaseModel):
    confirmation: str


def _require_development_console(
    x_joy_dev_token: str | None = Header(default=None, alias="X-Joy-Dev-Token"),
    settings: Settings = Depends(get_settings),
) -> None:
    if settings.joy_environment.lower() != "development":
        raise HTTPException(status_code=404, detail="Not found")
    if not settings.dev_console_token or not x_joy_dev_token:
        raise HTTPException(status_code=401, detail="Local console token required")
    if not secrets.compare_digest(x_joy_dev_token, settings.dev_console_token):
        raise HTTPException(status_code=401, detail="Invalid local console token")


@router.post("/internal/dev/chat", dependencies=[Depends(_require_development_console)])
def chat(
    body: SimulateTurnIn,
    session: Session = Depends(get_session),
    llm: LLMClient = Depends(get_llm_client),
) -> dict:
    """Run the same turn pipeline used by the WhatsApp worker, with no delivery."""
    result = process_inbound(
        session,
        f"dev-console:{uuid4()}",
        body.phone,
        body.text,
        llm=llm,
        audio_url=body.audio_url,
    )
    if result is None:
        raise HTTPException(status_code=409, detail="Duplicate local test turn")
    return result.model_dump(mode="json")


@router.get("/internal/dev/messages", dependencies=[Depends(_require_development_console)])
def messages(
    phone: str = Query(min_length=7, max_length=32),
    session: Session = Depends(get_session),
) -> dict[str, list[dict[str, str]]]:
    """Return the local patient transcript, including async worker notices."""
    patient = session.scalar(select(Patient).where(Patient.phone_e164 == phone))
    if patient is None:
        return {"messages": []}
    conversation = session.scalar(
        select(Conversation).where(
            Conversation.person_id == patient.id,
            Conversation.persona == Persona.PATIENT,
        )
    )
    if conversation is None:
        return {"messages": []}
    rows = session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    ).all()
    return {
        "messages": [
            {
                "id": str(row.id),
                "role": row.role,
                "text": row.text,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }


@router.post("/internal/dev/reset-local-context", dependencies=[Depends(_require_development_console)])
def reset_local_context(
    body: LocalResetIn,
    session: Session = Depends(get_session),
) -> dict[str, int | str]:
    """Clear only the local Joy conversation state used by the dev console."""
    if body.confirmation.strip() != _LOCAL_RESET_CONFIRMATION:
        raise HTTPException(
            status_code=400,
            detail=f'Type "{_LOCAL_RESET_CONFIRMATION}" to continue',
        )
    messages = session.scalar(select(func.count()).select_from(Message)) or 0
    triage_sessions = session.scalar(select(func.count()).select_from(TriageSession)) or 0
    conversations = session.scalar(select(func.count()).select_from(Conversation)) or 0
    session.execute(delete(Message))
    session.execute(delete(TriageSession))
    session.execute(
        update(Conversation).values(
            phase=PatientPhase.FIRST_CONTACT,
            stage=ConversationStage.STORY_CAPTURE.value,
            last_known_language=None,
            summary_text=None,
            booking_substate=None,
            booking_context=None,
            human_takeover=False,
            takeover_notified_at=None,
        )
    )
    session.flush()
    return {
        "message": "Local Joy context cleared.",
        "messages_deleted": messages,
        "triage_sessions_deleted": triage_sessions,
        "conversations_reset": conversations,
    }


@router.get("/internal/dev/console", response_class=HTMLResponse)
def console(
    settings: Settings = Depends(get_settings),
) -> HTMLResponse:
    """Serve a tiny same-origin test UI; API calls remain token-protected."""
    if settings.joy_environment.lower() != "development":
        raise HTTPException(status_code=404, detail="Not found")
    return HTMLResponse(_CONSOLE_HTML)


_CONSOLE_HTML = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Joy local console</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#efeae2;color:#111b21;font:15px system-ui,-apple-system,sans-serif}.app{max-width:860px;height:100vh;margin:auto;background:#fff;display:flex;flex-direction:column;box-shadow:0 0 28px #0002}.bar{background:#075e54;color:#fff;padding:16px 20px;display:flex;gap:12px;align-items:center}.avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#25d366;font-weight:800}.bar small{display:block;color:#d5f7e7}.settings{padding:8px 16px;background:#f0f2f5;color:#54656f}.settings summary{cursor:pointer}.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.settings input{width:100%;padding:8px;border:1px solid #d1d7db;border-radius:6px}.remote-reset{margin-top:12px;padding-top:12px;border-top:1px solid #d1d7db}.remote-reset p{margin:0 0 7px;font-size:13px}.remote-reset button{margin-top:7px;padding:8px 12px;border:0;border-radius:6px;background:#b3261e;color:#fff;font-weight:700;cursor:pointer}.thread{flex:1;overflow-y:auto;padding:24px 18px;background:radial-gradient(#d9ddd7 1px,transparent 1px);background-size:18px 18px}.notice{margin:0 auto 16px;width:max-content;max-width:90%;padding:6px 10px;border-radius:8px;background:#fff3cd;color:#5c4b00;font-size:12px}.row{display:flex;margin:8px 0}.row.you{justify-content:flex-end}.bubble{max-width:76%;padding:9px 11px;border-radius:8px;white-space:pre-wrap;line-height:1.4;box-shadow:0 1px 1px #0002}.you .bubble{background:#d9fdd3;border-top-right-radius:0}.joy .bubble{background:#fff;border-top-left-radius:0}.typing{display:none;color:#667781;font-style:italic}.composer{display:flex;gap:10px;padding:12px;background:#f0f2f5}.composer textarea{flex:1;resize:none;min-height:42px;max-height:120px;padding:11px;border:0;border-radius:22px;font:inherit}.composer button{border:0;border-radius:22px;background:#008069;color:#fff;padding:0 20px;font-weight:700;cursor:pointer}.composer button:disabled{opacity:.6;cursor:wait}@media(max-width:600px){.app{max-width:none}.settings-grid{grid-template-columns:1fr}.bubble{max-width:88%}}</style>
</head><body><main class="app"><header class="bar"><div class="avatar">J</div><div><strong>Rehabify Joy</strong><small>Local development test</small></div></header>
<details class="settings"><summary>Test connection settings</summary><div class="settings-grid"><label>Local console token<input id="token" type="password" autocomplete="off"></label><label>Test phone (E.164)<input id="phone" value="+2348000000001"></label></div><div class="remote-reset"><p><strong>Local reset:</strong> clears this machine's Joy messages, triage sessions, and conversation state. Railway and WhatsApp are not affected.</p><label>Type <code>RESET LOCAL CONTEXT</code><input id="reset-confirmation" autocomplete="off"></label><button id="reset-local" type="button">Reset local Joy context</button></div></details>
<section id="thread" class="thread"><div class="notice">Local test mode — messages are never sent to WhatsApp.</div><div id="typing" class="typing">Joy is typing…</div></section>
<form id="composer" class="composer"><textarea id="text" placeholder="Type a patient message" rows="1" required></textarea><button id="send" type="submit">Send</button></form></main>
<script>
const $=id=>document.getElementById(id),thread=$('thread'),typing=$('typing'),send=$('send'),text=$('text');
function renderMessage(item,message){const parts=String(message).split(/(https?:\/\/[^\s<>"']+)/g);for(const part of parts){if(/^https?:\/\//.test(part)){const link=document.createElement('a');link.href=part;link.textContent=part;link.target='_blank';link.rel='noopener noreferrer';item.append(link)}else item.append(document.createTextNode(part))}}
function bubble(kind,message){const row=document.createElement('div');row.className='row '+kind;const item=document.createElement('div');item.className='bubble';renderMessage(item,message);row.append(item);thread.insertBefore(row,typing)}
async function refreshMessages(){const token=$('token').value,phone=$('phone').value.trim();if(!token||!phone)return;try{const response=await fetch('/internal/dev/messages?phone='+encodeURIComponent(phone),{headers:{'X-Joy-Dev-Token':token}});if(!response.ok)return;const data=await response.json();thread.querySelectorAll('.row').forEach(row=>row.remove());for(const message of data.messages||[])bubble(message.role==='user'?'you':'joy',message.text);thread.scrollTop=thread.scrollHeight}catch(_error){/* Keep the last rendered transcript during a transient poll failure. */}}
$('composer').addEventListener('submit',async event=>{event.preventDefault();const message=text.value.trim();if(!message)return;const token=$('token').value;if(!token){alert('Enter your local console token in Test connection settings.');return}text.value='';send.disabled=true;typing.style.display='block';thread.scrollTop=thread.scrollHeight;try{const response=await fetch('/internal/dev/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Joy-Dev-Token':token},body:JSON.stringify({phone:$('phone').value,text:message})});const data=await response.json();if(!response.ok)throw new Error(data.detail||'Joy could not process that message.');await refreshMessages()}catch(error){bubble('joy','Local test error: '+error.message);thread.scrollTop=thread.scrollHeight}finally{typing.style.display='none';send.disabled=false;text.focus()}});
$('phone').addEventListener('change',refreshMessages);$('token').addEventListener('change',refreshMessages);setInterval(refreshMessages,2000);
$('reset-local').onclick=async()=>{const token=$('token').value,confirmation=$('reset-confirmation').value;if(!token){alert('Enter your local console token first.');return}if(confirmation!=='RESET LOCAL CONTEXT'){alert('Type the confirmation exactly.');return}if(!confirm('This clears local Joy conversation context only. Continue?'))return;const button=$('reset-local');button.disabled=true;try{const response=await fetch('/internal/dev/reset-local-context',{method:'POST',headers:{'Content-Type':'application/json','X-Joy-Dev-Token':token},body:JSON.stringify({confirmation})});const data=await response.json();if(!response.ok)throw new Error(data.detail||'Reset failed.');alert(`${data.message} ${data.messages_deleted} messages removed.`);thread.querySelectorAll('.row').forEach(row=>row.remove())}catch(error){alert('Reset failed: '+error.message)}finally{button.disabled=false}};text.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('composer').requestSubmit()}});
</script>
</body></html>"""
