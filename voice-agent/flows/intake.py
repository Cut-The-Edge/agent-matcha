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

# ── Context blocks for different caller types ────────────────────────

EXISTING_MEMBER_MOSTLY_COMPLETE = (
    "This is a returning Club Allenby member whose profile is mostly complete. "
    "Do NOT follow the standard intake call structure. Instead:\n"
    "1) Greet them warmly by name.\n"
    "2) Ask 'What can I help you with today?' or 'What's new?'\n"
    "3) Adapt to their intent:\n"
    "   - If they want to update info (moved, new job, etc.), collect the changes and save them.\n"
    "   - If they want to upgrade membership, note their interest (membership_interest field) "
    "and let them know Dani will reach out with details.\n"
    "   - If they have a question, answer what you can (no pricing — defer to Dani).\n"
    "   - If they're open to chatting, fill a few remaining profile gaps naturally.\n"
    "4) Keep it short unless they want to talk more.\n"
    "Skip the housekeeping script, the big opening question, and the full deep dive."
)

EXISTING_MEMBER_INCOMPLETE = (
    "This is an existing Club Allenby member but their profile has significant gaps. "
    "Greet them warmly by name and acknowledge they're already part of Club Allenby. "
    "Ask what brings them in today. If they have a specific need (update info, "
    "upgrade membership, ask a question), handle that first. Then transition naturally: "
    "'While I have you, mind if we fill in a few things for your profile?' "
    "Follow the intake structure but skip any sections that are already filled."
)

# Keep the old constant for backwards compatibility
EXISTING_MEMBER_CONTEXT = EXISTING_MEMBER_INCOMPLETE

UNKNOWN_CALLER_CONTEXT = (
    "This caller was not found in the system by phone number. They may be "
    "a new prospect or an existing member calling from a different number. "
    "Start by getting to know them and building their profile through "
    "natural conversation."
)
