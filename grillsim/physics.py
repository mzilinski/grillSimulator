"""Thermisches Modell eines Kamado-Grills.

Das Modell ist bewusst einfach gehalten, bildet aber die Effekte ab, die man
am echten Grill spürt:

* Die Keramik hat eine große Wärmekapazität – Temperaturänderungen brauchen Minuten.
* Die Glut muss sich erst ausbreiten; frisch angezündet brennt nur ein kleiner Teil.
* Der Luftstrom ergibt sich aus Zuluft (unten), Abluft (oben), Kaminzug und Ventilator.
* Kohle wird verbraucht; ist sie leer, kühlt der Grill aus.
* Ein geöffneter Deckel lässt die Hitze schlagartig entweichen.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

CHARCOAL_HEAT_KJ_PER_G = 30.0  # Heizwert Holzkohle
EFFICIENCY = 0.55  # Anteil der Verbrennungswärme, der im Garraum ankommt
HEAT_CAPACITY_KJ_PER_K = 16.0  # Keramik + Rost + Luft (effektiv)
LOSS_W_PER_K = 3.8  # Wärmeverlust über die geschlossene Keramikhülle
RADIATION_SCALE_K = 380.0  # ab hier wächst der Verlust durch Abstrahlung spürbar
LID_OPEN_LOSS_W_PER_K = 120.0
EXHAUST_LOSS_W_PER_K = 1.5  # pro Einheit Luftstrom
BURN_G_PER_S = 0.33  # Abbrand bei Luftstrom 1 und voller Glut
EMBER_SPREAD_S = 400.0  # bis die Glut sich bei gutem Zug voll ausgebreitet hat
MAX_TEMP = 500.0


@dataclass
class Meat:
    name: str
    target: float
    time_constant_s: float  # wie träge das Stück auf die Garraumtemperatur reagiert
    core: float = 5.0
    stall: tuple[float, float] | None = None  # Temperaturbereich des „Stalls“


MEAT_PRESETS: dict[str, Meat] = {
    "steak": Meat("Rumpsteak", target=56, time_constant_s=500),
    "haehnchen": Meat("Ganzes Hähnchen", target=75, time_constant_s=2600),
    "rippchen": Meat("Spareribs", target=90, time_constant_s=9000, stall=(65, 75)),
    "pulled_pork": Meat("Pulled Pork", target=93, time_constant_s=19000, stall=(65, 76)),
}


@dataclass
class Kamado:
    ambient: float = 20.0
    temperature: float = 20.0
    fuel_g: float = 2500.0
    ember: float = 0.0  # 0 = aus, 1 = Glut voll durchgezogen
    lower_vent: float = 0.5  # 0..1
    upper_vent: float = 0.5  # 0..1
    fan: float = 0.0  # 0..1
    lid_open: bool = False
    burn_rate: float = 0.0  # g/s, folgt dem Luftstrom mit Verzögerung
    meat: Meat | None = None
    sim_time: float = 0.0
    events: list[str] = field(default_factory=list)

    @property
    def lit(self) -> bool:
        return self.ember > 0.0

    def ignite(self) -> None:
        if self.fuel_g <= 0:
            self.events.append("Keine Kohle im Grill – erst nachlegen.")
            return
        if not self.lit:
            self.ember = 0.03
            self.events.append("Kohle angezündet.")

    def add_fuel(self, grams: float) -> None:
        self.fuel_g = min(self.fuel_g + grams, 4000.0)
        # frische Kohle verdeckt kurz die Glut
        self.ember *= 0.85
        self.events.append(f"{grams / 1000:.1f} kg Kohle nachgelegt.")

    def airflow(self) -> float:
        """Relativer Luftdurchsatz durch den Brennraum."""
        if self.lid_open:
            # offener Deckel: Kohle bekommt Luft von oben
            return 0.6 + self.lower_vent
        exhaust = 0.15 + 0.85 * self.upper_vent
        draft_strength = 0.3 + 0.7 * min(1.0, max(0.0, self.temperature - self.ambient) / 200)
        # etwas Luft zieht immer durch Dichtung und Lüftergehäuse
        natural = max(self.lower_vent, 0.02) * exhaust * draft_strength
        forced = self.fan * exhaust * 1.2
        return natural + forced

    def step(self, dt: float) -> None:
        self.sim_time += dt
        air = self.airflow()

        if self.lit:
            if self.fuel_g <= 0:
                self.ember = max(0.0, self.ember - dt / 120)
                if self.ember == 0:
                    self.events.append("Die Kohle ist aufgebraucht – Glut erloschen.")
            elif air < 0.003:
                # ohne Sauerstoff erstickt die Glut
                self.ember = max(0.0, self.ember - dt / 900)
                if self.ember == 0:
                    self.events.append("Glut erstickt – Lüftungen waren zu.")
            else:
                spread = min(1.0, 0.2 + air * 3) * dt / EMBER_SPREAD_S
                self.ember = min(1.0, self.ember + spread)

        target_burn = BURN_G_PER_S * self.ember * air**0.7 if self.lit else 0.0
        # Glut reagiert verzögert auf mehr oder weniger Luft
        tau = 90.0 if target_burn > self.burn_rate else 240.0
        self.burn_rate += (target_burn - self.burn_rate) * min(1.0, dt / tau)
        burned = min(self.fuel_g, self.burn_rate * dt)
        self.fuel_g -= burned

        heat_in_kw = burned / dt * CHARCOAL_HEAT_KJ_PER_G * EFFICIENCY if dt > 0 else 0.0
        loss_w_per_k = LOSS_W_PER_K + air * EXHAUST_LOSS_W_PER_K
        if self.lid_open:
            loss_w_per_k += LID_OPEN_LOSS_W_PER_K
        delta = self.temperature - self.ambient
        heat_out_kw = loss_w_per_k * delta * (1 + delta / RADIATION_SCALE_K) / 1000
        self.temperature += (heat_in_kw - heat_out_kw) * dt / HEAT_CAPACITY_KJ_PER_K
        self.temperature = min(MAX_TEMP, max(self.ambient, self.temperature))

        if self.meat is not None:
            self._cook(dt)

    def _cook(self, dt: float) -> None:
        meat = self.meat
        assert meat is not None
        before = meat.core
        rate = (self.temperature - meat.core) / meat.time_constant_s
        if meat.stall and meat.stall[0] < meat.core < meat.stall[1] and rate > 0:
            # Verdunstungskälte an der Oberfläche bremst das Garen
            rate *= 0.2
        meat.core += rate * dt
        if before < meat.target <= meat.core:
            self.events.append(f"{meat.name} hat {meat.target:.0f} °C Kerntemperatur erreicht!")
        if meat.stall and before < meat.stall[0] <= meat.core:
            self.events.append(f"{meat.name} ist im Stall – Geduld, das gehört dazu.")

    def snapshot(self) -> dict:
        data = asdict(self)
        data.pop("events")
        data["lit"] = self.lit
        data["airflow"] = self.airflow()
        data["fuel_hours_left"] = (
            self.fuel_g / self.burn_rate / 3600 if self.burn_rate > 1e-4 else None
        )
        return data
