"""
Programmatic SIP dispatch rule creation via the LiveKit API.

Run this script once to set up inbound call routing:
    python sip_config.py

This creates a dispatch rule that routes all inbound SIP calls to
the voice agent named "matcha-intake-agent".
"""

import asyncio
import os
import json

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
    """Create a SIP outbound trunk for placing calls via Twilio."""
    trunk = await lk.sip.create_sip_outbound_trunk(
        api.CreateSIPOutboundTrunkRequest(
            trunk=api.SIPOutboundTrunkInfo(
                name="club-allenby-outbound",
                address=f"{os.environ['TWILIO_SIP_TRUNK_SID']}.pstn.twilio.com",
                numbers=[os.environ.get("TWILIO_PHONE_NUMBER", "")],
                auth_username=os.environ.get("TWILIO_ACCOUNT_SID", ""),
                auth_password=os.environ.get("TWILIO_AUTH_TOKEN", ""),
            )
        )
    )
    print(f"Created outbound trunk: {trunk.sip_trunk_id}")
    return trunk.sip_trunk_id


async def create_dispatch_rule(lk: api.LiveKitAPI, trunk_id: str):
    """Create a dispatch rule that routes inbound calls to the agent."""
    rule = await lk.sip.create_sip_dispatch_rule(
        api.CreateSIPDispatchRuleRequest(
            rule=api.SIPDispatchRule(
                rule=api.SIPDispatchRuleIndividual(
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


async def main():
    load_dotenv()

    lk = api.LiveKitAPI(
        url=os.environ["LIVEKIT_URL"],
        api_key=os.environ["LIVEKIT_API_KEY"],
        api_secret=os.environ["LIVEKIT_API_SECRET"],
    )

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
