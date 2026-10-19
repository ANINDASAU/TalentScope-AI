from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CounterState:
    count: int
    stage: str
    angle: Optional[float]


class PushUpCounter:
    """Count complete push-ups from a sequence of elbow angles."""

    def __init__(self, down_threshold=90.0, up_threshold=160.0):
        if down_threshold >= up_threshold:
            raise ValueError("down_threshold must be less than up_threshold")

        self.down_threshold = float(down_threshold)
        self.up_threshold = float(up_threshold)
        self.reset()

    def reset(self):
        self.count = 0
        self.stage = "up"
        self.last_angle = None

    def update(self, elbow_angle):
        if elbow_angle is None:
            return self.count

        try:
            angle = float(elbow_angle)
        except (TypeError, ValueError):
            return self.count

        if not 0.0 <= angle <= 180.0:
            return self.count

        self.last_angle = angle
        if angle <= self.down_threshold:
            self.stage = "down"
        elif angle >= self.up_threshold and self.stage == "down":
            self.stage = "up"
            self.count += 1

        return self.count

    def state(self):
        return CounterState(self.count, self.stage, self.last_angle)