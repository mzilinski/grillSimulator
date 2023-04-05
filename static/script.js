let grillSimulationRunning = true;

function updateButtonStates(temperatur = 20) {
    if (grillSimulationRunning) {
        $('#simulation-start-btn').prop('disabled', true);
        $('#simulation-stop-btn').prop('disabled', false);
        if (temperatur > 20) {
            $('#anzuenden-btn').prop('disabled', true);
        } else {
            $('#anzuenden-btn').prop('disabled', false);
        }
        $('#ventilator-btn').prop('disabled', false);
        $('#luftzufuhr-btn').prop('disabled', false);
    } else {
        $('#simulation-start-btn').prop('disabled', false);
        $('#simulation-stop-btn').prop('disabled', true);
        $('#anzuenden-btn').prop('disabled', true);
        $('#ventilator-btn').prop('disabled', true);
        $('#luftzufuhr-btn').prop('disabled', true);
    }
}

function updateThermometer(temperature = 20) {
    const minTemp = 20;
    const maxTemp = 500;
    const minRotation = 20;
    const maxRotation = 180;

    if (temperature < minTemp) {
        temperature = minTemp;
    } else if (temperature > maxTemp) {
        temperature = maxTemp;
    }

    const rotation = ((temperature - minTemp) / (maxTemp - minTemp)) * (maxRotation - minRotation) + minRotation;
    const needle = document.querySelector('.needle');
    const label = document.querySelector('.label');

    needle.style.setProperty('--rotation', `${rotation}deg`);
    label.textContent = `${temperature}°C`;
}


function updateSimulationStatusText() {
    $('#simulation-status').text(grillSimulationRunning ? 'Läuft' : 'Gestoppt');
}

function updateGrillStatus() {
    $.getJSON('/api/grill_status', function (data) {
        $('#temperatur').text(data.temperatur);
        $('#gezuendet').text(data.gezuendet ? 'An' : 'Aus');
        $('#ventilator').text(data.ventilator ? 'An' : 'Aus');
        $('#luftzufuhr').text(data.luftzufuhr ? 'Auf' : 'Zu');

        $('#ventilator-btn').text(data.ventilator ? 'Ventilator aus' : 'Ventilator an');
        $('#luftzufuhr-btn').text(data.luftzufuhr ? 'Luftzufuhr zu' : 'Luftzufuhr auf');
        updateButtonStates(data.temperatur);
        updateThermometer(data.temperatur);
    });
}

function handleIgnition() {
    $.post('/api/anzünden', function () {
        updateGrillStatus();
    });
}

function handleVentilatorToggle() {
    let action = $(this).text() === 'Ventilator an' ? '/api/ventilator_an' : '/api/ventilator_aus';
    $.post(action, function () {
        updateGrillStatus();
    });
}

function handleAirIntakeToggle() {
    let action = $(this).text() === 'Luftzufuhr auf' ? '/api/luftzufuhr_auf' : '/api/luftzufuhr_zu';
    $.post(action, function () {
        updateGrillStatus();
    });
}

function handleSimulationStart() {
    grillSimulationRunning = true;
    updateButtonStates();
    updateSimulationStatusText();
    $.post('/api/start_simulation', function () {
        updateGrillStatus();
    });
}

function handleSimulationStop() {
    grillSimulationRunning = false;
    updateButtonStates();
    updateSimulationStatusText();
    $.post('/api/stop_simulation', function () {
        updateGrillStatus();
    });
}

$(document).ready(function () {
updateGrillStatus();
    setInterval(updateGrillStatus, 1000);

    $('#anzuenden-btn').click(handleIgnition);
    $('#ventilator-btn').click(handleVentilatorToggle);
    $('#luftzufuhr-btn').click(handleAirIntakeToggle);
    $('#simulation-start-btn').click(handleSimulationStart);
    $('#simulation-stop-btn').click(handleSimulationStop);

    updateButtonStates();
    updateSimulationStatusText();
});
