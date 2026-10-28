"""PID-Regler für den Ventilator – wie ein BBQ-Guru oder FireBoard Drive."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FanController:
    setpoint: float = 110.0
    kp: float = 0.04
    ki: float = 0.00015
    kd: float = 0.6
    integral: float = 0.0
    last_error: float | None = None

    def reset(self) -> None:
        self.integral = 0.0
        self.last_error = None

    def update(self, temperature: float, dt: float) -> float:
        error = self.setpoint - temperature
        derivative = 0.0 if self.last_error is None else (error - self.last_error) / dt
        self.last_error = error
        output = self.kp * error + self.ki * self.integral + self.kd * derivative
        # Anti-Windup: nur integrieren, solange der Ausgang nicht anschlägt
        if 0.0 < output < 1.0 or (output <= 0 and error > 0) or (output >= 1 and error < 0):
            self.integral += error * dt
        return min(1.0, max(0.0, output))
