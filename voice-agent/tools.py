"""
LLM function tools for the voice agent.

Tools are defined directly as @function_tool() methods on the MatchaAgent
class in agent.py. This file is kept as a reference for the tool schemas.

Current tools:
- check_member_profile: Look up caller in DB by phone number
- save_intake_data: Save all collected profile data (called once at end of call)
- end_call: Gracefully disconnect after goodbye + data save
"""
