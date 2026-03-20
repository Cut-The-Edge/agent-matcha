"""Local development entry point -- test via browser at localhost:7860."""

import logging

from dotenv import load_dotenv
from pipecat.runner.types import RunnerArguments, SmallWebRTCRunnerArguments
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.network.small_webrtc import SmallWebRTCTransport
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams

load_dotenv()

logging.basicConfig(level=logging.INFO)


async def bot(runner_args: RunnerArguments):
    """Entry point called by Pipecat dev runner."""
    if not isinstance(runner_args, SmallWebRTCRunnerArguments):
        raise ValueError(f"Expected SmallWebRTCRunnerArguments, got {type(runner_args)}")

    transport = SmallWebRTCTransport(
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(
                stop_secs=0.3,
                start_secs=0.1,
                min_volume=0.5,
            )),
            vad_audio_passthrough=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        ),
        webrtc_connection=runner_args.webrtc_connection,
    )

    from matcha_agent import run_agent
    await run_agent(transport)


if __name__ == "__main__":
    from pipecat.runner.run import main
    main()
