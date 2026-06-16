"""Live reward monitoring via rewardguard.dev.

The env emits a per-step reward breakdown in ``info["reward_components"]``
(see :func:`wobblesoccer.env.reward_components`).  This module feeds those
components straight into rewardguard's ``Monitor`` so you can catch shaping that
is quietly drowning out the goal signal *while* you train.

``rewardguard`` is an **optional** dependency — nothing here is imported by the
core or the env.  Install it with::

    pip install rewardguard

Quick manual use (any training loop)::

    from wobblesoccer import SoccerEnv
    from wobblesoccer.integrations import make_monitor, summarize

    env = SoccerEnv()
    monitor = make_monitor()
    obs, info = env.reset(seed=0)
    for _ in range(10_000):
        obs, r, term, trunc, info = env.step(env.action_space.sample())
        monitor.step(info["reward_components"])          # <- the whole integration
        if term or trunc:
            obs, info = env.reset()
    print(summarize(monitor.check()))

Stable-Baselines3 use::

    from wobblesoccer.integrations import make_monitor, make_sb3_callback
    cb = make_sb3_callback(make_monitor())
    model.learn(total_timesteps=500_000, callback=cb)
"""

from __future__ import annotations

from typing import Dict, Optional

# How much of the *total* reward you expect each component to contribute.
# Goals should dominate; the shaping terms should be a thin nudge.  RewardGuard
# compares these expectations against what actually happens and flags drift.
DEFAULT_EXPECTED: Dict[str, float] = {
    "goal": 0.85,
    "progress": 0.07,
    "possession": 0.05,
    "engage": 0.03,
}


def make_monitor(expected: Optional[Dict[str, float]] = None,
                 tolerance: float = 5.0, window: int = 2000):
    """Build a rewardguard ``Monitor`` wired to the default reward components."""
    import rewardguard as rg  # optional dependency, imported on use
    return rg.Monitor(expected=dict(expected or DEFAULT_EXPECTED),
                      tolerance=tolerance, window=window)


def summarize(result) -> str:
    """Render a rewardguard ``AnalysisResult`` as a short, readable report."""
    lines = [f"[RewardGuard] severity={result.severity} "
             f"(steps analysed={result.episode_count})"]
    for name, rep in result.imbalance_report.items():
        if rep.get("status") == "imbalanced":
            lines.append(f"   - {name}: {rep['real']:.1f}% real vs "
                         f"{rep['expected']:.1f}% expected -> {rep['recommendation']}")
    if getattr(result, "unexpected_sources", None):
        lines.append(f"   - unexpected reward sources: {result.unexpected_sources}")
    if len(lines) == 1:
        lines.append("   - reward components are balanced")
    return "\n".join(lines)


def make_sb3_callback(monitor, check_freq: int = 4096, verbose: int = 1):
    """A Stable-Baselines3 callback that streams components into ``monitor``.

    It reads ``info["reward_components"]`` from every vec-env step and prints a
    balance report every ``check_freq`` steps.  Import of SB3 is deferred so this
    module stays importable without it.
    """
    from stable_baselines3.common.callbacks import BaseCallback

    class _RewardGuardCallback(BaseCallback):
        def __init__(self):
            super().__init__(verbose)
            self.monitor = monitor
            self.check_freq = check_freq
            self._since_check = 0

        def _on_step(self) -> bool:
            infos = self.locals.get("infos", []) or []
            for info in infos:
                comps = info.get("reward_components")
                if comps:
                    self.monitor.step(comps)
            self._since_check += len(infos)
            if self._since_check >= self.check_freq:
                self._since_check = 0
                try:
                    result = self.monitor.check()
                    if self.verbose:
                        print(summarize(result))
                except ValueError:
                    pass  # not enough data yet
            return True

    return _RewardGuardCallback()
