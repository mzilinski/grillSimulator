import threading
import time
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)


class KamadoGrill:
    def __init__(self, aussentemperatur=20):
        self.temperatur = aussentemperatur
        self.max_temperatur = 450
        self.ventilator = False
        self.luftzufuhr = True
        self.gezuendet = False
        self.lock = threading.Lock()
        self.stop_event = threading.Event()

    def anzünden(self):
        with self.lock:
            self.gezuendet = True

    def ventilator_an(self):
        with self.lock:
            self.ventilator = True

    def ventilator_aus(self):
        with self.lock:
            self.ventilator = False

    def luftzufuhr_zu(self):
        with self.lock:
            self.luftzufuhr = False

    def luftzufuhr_auf(self):
        with self.lock:
            self.luftzufuhr = True

    def update_temperatur(self):
        while not self.stop_event.is_set():
            if grill is not None:
                with self.lock:
                    if self.gezuendet:
                        if self.ventilator and self.luftzufuhr:
                            self.temperatur += 5
                        elif self.luftzufuhr:
                            self.temperatur += 2
                        else:
                            self.temperatur -= 2

                        if self.temperatur > self.max_temperatur:
                            self.temperatur = self.max_temperatur

                        if self.temperatur < 20:
                            self.temperatur = 20
                            self.gezuendet = False

                time.sleep(1)

    def stop(self):
        self.stop_event.set()

    def run(self):
        update_thread = threading.Thread(target=self.update_temperatur)
        update_thread.start()

grill = KamadoGrill()
grill.run()

@app.route('/api/anzünden', methods=['POST'])
def anzünden():
    grill.anzünden()
    return jsonify(success=True)


@app.route('/api/ventilator_an', methods=['POST'])
def ventilator_an():
    grill.ventilator_an()
    return jsonify(success=True)


@app.route('/api/ventilator_aus', methods=['POST'])
def ventilator_aus():
    grill.ventilator_aus()
    return jsonify(success=True)


@app.route('/api/luftzufuhr_zu', methods=['POST'])
def luftzufuhr_zu():
    grill.luftzufuhr_zu()
    return jsonify(success=True)


@app.route('/api/luftzufuhr_auf', methods=['POST'])
def luftzufuhr_auf():
    grill.luftzufuhr_auf()
    return jsonify(success=True)


@app.route('/api/grill_status', methods=['GET'])
def grill_status():
    if grill is not None:
        status = {
            'temperatur': grill.temperatur,
            'gezuendet': grill.gezuendet,
            'ventilator': grill.ventilator,
            'luftzufuhr': grill.luftzufuhr
        }
        return jsonify(status)
    else:
        return jsonify({"error": "Grill simulation is not running"})


@app.route('/', methods=['GET'])
def home():
    return render_template('index.html')

@app.route('/api/stop_simulation', methods=['POST'])
def stop_simulation():
    global grill
    grill.stop()
    grill = None
    return jsonify(success=True)

@app.route('/api/start_simulation', methods=['POST'])
def start_simulation():
    global grill
    grill = KamadoGrill()
    grill.run()
    return jsonify(success=True)

if __name__ == '__main__':
    app.run(debug=True, port=5007)
