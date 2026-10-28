"""Simulationsablauf: Zeitraffer, Regler, Verlauf und Befehle."""

from __future__ import annotations

import copy
from collections import deque
from dataclasses import dataclass, field

from .controller import FanController
from .physics import MEAT_PRESETS, Kamado

SPEEDS = (1, 10, 60, 300)
HISTORY_INTERVAL_S = 30.0  # Simulationssekunden zwischen zwei Messpunkten
HISTORY_LENGTH = 1440  # = 12 Stunden Verlauf


class CommandError(ValueError):
    pass


def _fraction(value: object) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise CommandError("Wert muss eine Zahl sein") from exc
    return min(1.0, max(0.0, number))


@dataclass
class Simulation:
    grill: Kamado = field(default_factory=Kamado)
    controller: FanController = field(default_factory=FanController)
    auto_fan: bool = False
    speed: int = 10
    paused: bool = False
    history: deque = field(default_factory=lambda: deque(maxlen=HISTORY_LENGTH))
    _since_sample: float = HISTORY_INTERVAL_S

    def advance(self, real_seconds: float) -> None:
        if self.paused:
            return
        remaining = real_seconds * self.speed
        while remaining > 0:
            dt = min(1.0, remaining)
            if self.auto_fan:
                self.grill.fan = self.controller.update(self.grill.temperature, dt)
            self.grill.step(dt)
            remaining -= dt
            self._since_sample += dt
            if self._since_sample >= HISTORY_INTERVAL_S:
                self._since_sample = 0.0
                self.history.append(self.sample())

    def sample(self) -> list[float | None]:
        g = self.grill
        core = round(g.meat.core, 1) if g.meat else None
        return [round(g.sim_time), round(g.temperature, 1), core, round(g.fan, 2)]

    def drain_events(self) -> list[str]:
        events, self.grill.events = self.grill.events, []
        return events

    def state(self) -> dict:
        return {
            "grill": self.grill.snapshot(),
            "auto_fan": self.auto_fan,
            "setpoint": self.controller.setpoint,
            "speed": self.speed,
            "speeds": SPEEDS,
            "paused": self.paused,
            "meat_presets": {k: {"name": m.name, "target": m.target} for k, m in MEAT_PRESETS.items()},
        }

    def handle(self, cmd: dict) -> None:
        action = cmd.get("action")
        g = self.grill
        match action:
            case "ignite":
                g.ignite()
            case "lower_vent":
                g.lower_vent = _fraction(cmd.get("value"))
            case "upper_vent":
                g.upper_vent = _fraction(cmd.get("value"))
            case "fan":
                self.auto_fan = False
                g.fan = _fraction(cmd.get("value"))
            case "auto_fan":
                self.auto_fan = bool(cmd.get("value"))
                self.controller.reset()
                if not self.auto_fan:
                    g.fan = 0.0
            case "setpoint":
                self.controller.setpoint = min(450.0, max(60.0, float(cmd.get("value", 110))))
            case "lid":
                g.lid_open = bool(cmd.get("value"))
                g.events.append("Deckel geöffnet." if g.lid_open else "Deckel geschlossen.")
            case "add_fuel":
                g.add_fuel(float(cmd.get("value", 500)))
            case "meat":
                key = cmd.get("value")
                if key is None:
                    g.meat = None
                elif key in MEAT_PRESETS:
                    g.meat = copy.deepcopy(MEAT_PRESETS[key])
                    g.events.append(f"{g.meat.name} aufgelegt, Ziel {g.meat.target:.0f} °C.")
                else:
                    raise CommandError(f"Unbekanntes Grillgut: {key}")
            case "speed":
                speed = int(cmd.get("value", 1))
                if speed not in SPEEDS:
                    raise CommandError(f"Zeitraffer muss einer von {SPEEDS} sein")
                self.speed = speed
            case "pause":
                self.paused = bool(cmd.get("value"))
            case "reset":
                self.grill = Kamado()
                self.controller = FanController()
                self.auto_fan = False
                self.history.clear()
                self._since_sample = HISTORY_INTERVAL_S
            case _:
                raise CommandError(f"Unbekannter Befehl: {action}")
