"""
Intake conversation flow configuration.

Based on analysis of 10+ real intake call transcripts from Dani Bergman.
These stages are guidance for the LLM — not rigid states.
"""

STAGES = {
    "greeting": {
        "description": "Warm greeting and housekeeping",
        "instructions": (
            "Greet the caller warmly. Mention the call is recorded and notes "
            "are being taken. Frame the call: 'This is basically to get to know "
            "you, complete your profile, and then I'll tell you about what we "
            "offer at the end.' Say 'this is a safe space.'"
        ),
        "next": "opening_question",
    },
    "opening_question": {
        "description": "The big bundled opener to get them talking",
        "instructions": (
            "Ask the opener: 'Why don't you start by telling me a little bit "
            "about yourself — where you're from, your family, and your level "
            "of Judaism.' Then follow up naturally on whatever they share."
        ),
        "next": "deep_dive",
    },
    "deep_dive": {
        "description": "Natural conversation covering background, Judaism, career, dating, preferences",
        "instructions": (
            "Cover these topics through natural conversation — don't interrogate. "
            "Background and location, family, Jewish observance and kosher/Shabbat "
            "details, career, 'what does a day in your life look like?', dating "
            "history, the perfect partner question ('if you could draw up your "
            "perfect partner, who would they be?'), must-haves vs dealbreakers, "
            "physical preferences (preface with 'safe space'), timeline for "
            "marriage and kids."
        ),
        "next": "wrap_up",
    },
    "wrap_up": {
        "description": "Final check and goodbye",
        "instructions": (
            "Ask 'is there anything else you want to share with me before we "
            "wrap up?' Let them know Dani will review their profile and be in "
            "touch. Remind them to complete their online profile. Mention any "
            "upcoming events. Warm goodbye. Then call save_intake_data with "
            "everything you learned, followed by end_call."
        ),
        "next": None,
    },
}

EXISTING_MEMBER_CONTEXT = (
    "This is an existing Club Allenby member with SMA profile data "
    "pre-loaded. Review their filled fields above and focus conversation "
    "on filling missing profile gaps. Don't re-ask what you already know — "
    "confirm key details are still current and dig deeper into gaps."
)

UNKNOWN_CALLER_CONTEXT = (
    "This caller was not found in the system by phone number. They may be "
    "a new prospect or an existing member calling from a different number. "
    "Start by getting to know them and building their profile through "
    "natural conversation."
)
