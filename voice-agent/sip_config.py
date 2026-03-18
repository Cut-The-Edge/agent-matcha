"""
Programmatic SIP trunk and dispatch rule creation via the LiveKit API.

Run this script once to set up both inbound and outbound call routing:
    python sip_config.py

For outbound calls only:
    python sip_config.py --outbound-only

To list existing SIP trunks:
    python sip_config.py --list

This creates:
  - Inbound trunk: routes incoming calls from Twilio to LiveKit
  - Outbound trunk: allows the agent to place calls via Twilio SIP
  - Dispatch rule: routes inbound SIP calls to "matcha-intake-agent"

The outbound trunk ID must be set as LIVEKIT_OUTBOUND_TRUNK_ID in .env
for the Next.js API route to use it.
"""

import asyncio
import os
import json
import sys

from dotenv import load_dotenv
from livekit import api


async def create_inbound_trunk(lk: api.LiveKitAPI) -> str:
    """Create a SIP inbound trunk for receiving calls from Twilio."""
    trunk = await lk.sip.create_sip_inbound_trunk(
        api.CreateSIPInboundTrunkRequest(
            trunk=api.SIPInboundTrunkInfo(
                name="club-allenby-inbound",
                numbers=[os.environ.get("TWILIO_PHONE_NUMBER", "")],
            )
        )
    )
    print(f"Created inbound trunk: {trunk.sip_trunk_id}")
    return trunk.sip_trunk_id


async def create_outbound_trunk(lk: api.LiveKitAPI) -> str:
    """Create a SIP outbound trunk for placing calls via Twilio.

    The outbound trunk uses the Club Allenby phone number as the caller ID,
    so members see the familiar number when receiving outbound calls.
    """
    phone_number = os.environ.get("TWILIO_PHONE_NUMBER", "")
    trunk = await lk.sip.create_sip_outbound_trunk(
        api.CreateSIPOutboundTrunkRequest(
            trunk=api.SIPOutboundTrunkInfo(
                name="club-allenby-outbound",
                address=f"{os.environ['TWILIO_SIP_TRUNK_SID']}.pstn.twilio.com",
                # Caller ID: this number will be shown to the callee
                numbers=[phone_number],
                auth_username=os.environ.get("TWILIO_ACCOUNT_SID", ""),
                auth_password=os.environ.get("TWILIO_AUTH_TOKEN", ""),
            )
        )
    )
    print(f"Created outbound trunk: {trunk.sip_trunk_id}")
    print(f"  Caller ID: {phone_number}")
    print(f"  SIP address: {os.environ['TWILIO_SIP_TRUNK_SID']}.pstn.twilio.com")
    print()
    print(f"  Add to your .env (Next.js):")
    print(f"    LIVEKIT_OUTBOUND_TRUNK_ID={trunk.sip_trunk_id}")
    return trunk.sip_trunk_id


async def create_dispatch_rule(lk: api.LiveKitAPI, trunk_id: str):
    """Create a dispatch rule that routes inbound calls to the agent."""
    rule = await lk.sip.create_sip_dispatch_rule(
        api.CreateSIPDispatchRuleRequest(
            rule=api.SIPDispatchRule(
                dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                    room_prefix="call-",
                ),
            ),
            trunk_ids=[trunk_id],
            room_config=api.RoomConfiguration(
                agents=[
                    api.RoomAgentDispatch(
                        agent_name="matcha-intake-agent",
                    ),
                ],
            ),
        )
    )
    print(f"Created dispatch rule: {rule.sip_dispatch_rule_id}")
    return rule.sip_dispatch_rule_id


async def list_trunks(lk: api.LiveKitAPI):
    """List existing SIP trunks for reference."""
    print("Existing SIP trunks:")
    print()

    # List inbound trunks
    inbound = await lk.sip.list_sip_inbound_trunk(api.ListSIPInboundTrunkRequest())
    print(f"Inbound trunks ({len(inbound.items)}):")
    for t in inbound.items:
        print(f"  - {t.sip_trunk_id}: {t.name} (numbers: {t.numbers})")

    print()

    # List outbound trunks
    outbound = await lk.sip.list_sip_outbound_trunk(api.ListSIPOutboundTrunkRequest())
    print(f"Outbound trunks ({len(outbound.items)}):")
    for t in outbound.items:
        print(f"  - {t.sip_trunk_id}: {t.name} (numbers: {t.numbers}, address: {t.address})")

    print()

    # List dispatch rules
    rules = await lk.sip.list_sip_dispatch_rule(api.ListSIPDispatchRuleRequest())
    print(f"Dispatch rules ({len(rules.items)}):")
    for r in rules.items:
        print(f"  - {r.sip_dispatch_rule_id}: trunk_ids={r.trunk_ids}")


async def main():
    load_dotenv()

    lk = api.LiveKitAPI(
        url=os.environ["LIVEKIT_URL"],
        api_key=os.environ["LIVEKIT_API_KEY"],
        api_secret=os.environ["LIVEKIT_API_SECRET"],
    )

    args = sys.argv[1:]

    if "--list" in args:
        await list_trunks(lk)
        return

    if "--outbound-only" in args:
        print("Creating outbound SIP trunk only...")
        print()
        outbound_trunk_id = await create_outbound_trunk(lk)
        print()
        print(json.dumps({"outbound_trunk_id": outbound_trunk_id}, indent=2))
        return

    print("Setting up SIP configuration for Club Allenby...")
    print()

    inbound_trunk_id = await create_inbound_trunk(lk)
    outbound_trunk_id = await create_outbound_trunk(lk)
    dispatch_rule_id = await create_dispatch_rule(lk, inbound_trunk_id)

    print()
    print("SIP setup complete!")
    print()
    print("Save these IDs for reference:")
    print(json.dumps({
        "inbound_trunk_id": inbound_trunk_id,
        "outbound_trunk_id": outbound_trunk_id,
        "dispatch_rule_id": dispatch_rule_id,
    }, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
