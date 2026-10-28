import pytest
from fastapi.testclient import TestClient

from grillsim.app import app
from grillsim.controller import FanController
from grillsim.physics import Kamado
from grillsim.simulation import CommandError, Simulation


def run(grill: Kamado, seconds: int, controller: FanController | None = None) -> None:
    for _ in range(seconds):
        if controller:
            grill.fan = controller.update(grill.temperature, 1)
        grill.step(1)


def test_cold_grill_stays_at_ambient():
    grill = Kamado()
    run(grill, 600)
    assert grill.temperature == grill.ambient
    assert grill.fuel_g == 2500


def test_more_air_means_hotter():
    temps = []
    for vent in (0.15, 0.4, 1.0):
        # wie am echten Grill: offen anzünden, dann herunterregeln
        grill = Kamado(lower_vent=1, upper_vent=1)
        grill.ignite()
        run(grill, 900)
        grill.lower_vent = grill.upper_vent = vent
        run(grill, 2 * 3600)
        temps.append(grill.temperature)
    assert temps[0] < temps[1] < temps[2]
    assert 90 < temps[0] < 160  # Low & Slow
    assert temps[2] > 400


def test_closed_vents_smother_fire():
    grill = Kamado(lower_vent=1, upper_vent=1)
    grill.ignite()
    run(grill, 1800)
    grill.lower_vent = grill.upper_vent = 0
    run(grill, 3 * 3600)
    assert not grill.lit
    assert grill.temperature < 60


def test_fire_goes_out_when_fuel_runs_out():
    grill = Kamado(lower_vent=1, upper_vent=1, fuel_g=300)
    grill.ignite()
    run(grill, 3 * 3600)
    assert grill.fuel_g == 0
    assert not grill.lit


def test_open_lid_drops_temperature():
    grill = Kamado(lower_vent=0.4, upper_vent=0.4)
    grill.ignite()
    run(grill, 3600)
    before = grill.temperature
    grill.lid_open = True
    run(grill, 120)
    assert grill.temperature < before - 40


@pytest.mark.parametrize("setpoint", [110, 225])
def test_pid_holds_setpoint(setpoint):
    grill = Kamado(lower_vent=0, upper_vent=0.25)
    grill.ignite()
    controller = FanController(setpoint=setpoint)
    run(grill, 2 * 3600, controller)
    assert abs(grill.temperature - setpoint) < 3


def test_meat_reaches_target_and_reports_it():
    sim = Simulation()
    sim.handle({"action": "lower_vent", "value": 0.4})
    sim.handle({"action": "upper_vent", "value": 0.4})
    sim.handle({"action": "ignite"})
    sim.handle({"action": "meat", "value": "steak"})
    sim.speed = 1
    sim.advance(3600)
    assert sim.grill.meat.core >= 56
    assert any("erreicht" in e for e in sim.drain_events())


def test_invalid_commands_are_rejected():
    sim = Simulation()
    with pytest.raises(CommandError):
        sim.handle({"action": "explode"})
    with pytest.raises(CommandError):
        sim.handle({"action": "speed", "value": 7})
    with pytest.raises(CommandError):
        sim.handle({"action": "lower_vent", "value": "weit"})


def test_websocket_streams_state_and_accepts_commands():
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            assert ws.receive_json()["type"] == "history"
            ws.send_json({"action": "ignite"})
            for _ in range(10):
                msg = ws.receive_json()
                if msg["type"] == "state" and msg["grill"]["lit"]:
                    break
            assert msg["grill"]["lit"]
        assert client.get("/api/state").json()["grill"]["lit"]
        assert client.get("/").status_code == 200
