# WhatsApp automation cutover

Joy is the sole patient inbound/outbound conversation owner. Disable any older
generic greeting or intake responder before enabling the Joy production webhook.
The generic message beginning “Welcome to Rehabify Health” is not emitted by
the RH or Joy repositories and will compete with Joy if left active.

Before go-live, verify in Meta Business Suite/WhatsApp Manager and any connected
automation provider (n8n, Make, Zapier, Twilio, CRM):

1. Turn off the generic greeting, keyword, and first-message flows for Joy’s number.
2. Keep the Meta webhook subscribed to one delivery owner: Joy.
3. Remove duplicate webhook destinations and old access-token integrations.
4. Send one referral WhatsApp message containing its `RHB-…` code; confirm one
   Joy response, one delivery receipt, and one inbound audit event.
5. Monitor the worker retry/dead-letter logs; a failed send must be retried or
   surfaced, never silently replaced by a generic responder.

This configuration is intentionally external to the codebase: it must be
performed in the WhatsApp/Meta account that owns the number.
