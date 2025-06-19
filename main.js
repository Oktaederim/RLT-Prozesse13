$(document).ready(function () {
    // #############################################################################
    // ### Physikalische Berechnungsfunktionen für feuchte Luft (h-x-Diagramm) ###
    // #############################################################################

    /**
     * Erstellt ein Zustandsobjekt für feuchte Luft.
     * Alle thermodynamischen Eigenschaften werden aus Temperatur und Wassergehalt berechnet.
     * @param {number} t - Temperatur in °C (Celsius)
     * @param {number} x - Wassergehalt in g/kg trockener Luft
     * @returns {object} Ein Objekt mit den Eigenschaften t, x, h (Enthalpie), phi (relative Feuchte)
     */
    function Zustand(t, x) {
        // Umrechnung von x von g/kg in kg/kg für die Formeln
        const x_kg = x / 1000;

        // Sättigungsdampfdruck p_s in Pa nach Magnus-Formel
        const p_s = 611.2 * Math.exp((17.62 * t) / (243.12 + t));

        // Partialdampfdruck p_d in Pa
        // Annahme: Atmosphärendruck p_amb = 101325 Pa (Standarddruck)
        const p_amb = 101325;
        const p_d = (x_kg * p_amb) / (0.622 + x_kg);

        // Relative Feuchte phi in %
        const phi = (p_d / p_s) * 100;

        // Enthalpie h in kJ/kg
        const h = 1.006 * t + x_kg * (2501 + 1.86 * t);

        return {
            t: t,       // Temperatur in °C
            x: x,       // Wassergehalt in g/kg
            h: h,       // Enthalpie in kJ/kg
            phi: phi    // Relative Feuchte in %
        };
    }

    // ########################################################################
    // ### RLT-Prozesse ###
    // ########################################################################

    const prozesse = {
        heizen: function (startZustand, zielTemperatur) {
            return Zustand(zielTemperatur, startZustand.x);
        },
        kuehlen_entfeuchten: function (startZustand, zielTemperatur, zielPhi) {
            const p_s_ziel = 611.2 * Math.exp((17.62 * zielTemperatur) / (243.12 + zielTemperatur));
            const p_d_ziel = p_s_ziel * (zielPhi / 100);
            const p_amb = 101325;
            const x_kg_neu = (0.622 * p_d_ziel) / (p_amb - p_d_ziel);
            const x_g_neu = x_kg_neu * 1000;
            return Zustand(zielTemperatur, x_g_neu);
        },
        dampf_bef: function (startZustand, zielWassergehalt) {
            return Zustand(startZustand.t, zielWassergehalt);
        },
        wasser_bef: function (startZustand, zielWassergehalt) {
            const h_konstant = startZustand.h;
            const x_neu_kg = zielWassergehalt / 1000;
            const t_neu = (h_konstant - x_neu_kg * 2501) / (1.006 + x_neu_kg * 1.86);
            return Zustand(t_neu, zielWassergehalt);
        },
        mischen: function(zustand1, anteil1, zustand2, anteil2) {
            const gesamtanteil = anteil1 + anteil2;
            if (gesamtanteil === 0) return Zustand(0, 0);
            const h_misch = (anteil1 * zustand1.h + anteil2 * zustand2.h) / gesamtanteil;
            const x_misch_g = (anteil1 * zustand1.x + anteil2 * zustand2.x) / gesamtanteil;
            const x_misch_kg = x_misch_g / 1000;
            const t_misch = (h_misch - x_misch_kg * 2501) / (1.006 + x_misch_kg * 1.86);
            return Zustand(t_misch, x_misch_g);
        }
    };

    // ########################################################################
    // ### Event-Handler für die Buttons ###
    // ########################################################################

    function updateOutput(zuluft, q, dw) {
        $("#t_zu_out").val(zuluft.t.toFixed(2));
        $("#x_zu_out").val(zuluft.x.toFixed(3));
        $("#h_zu_out").val(zuluft.h.toFixed(2));
        $("#phi_zu_out").val(zuluft.phi.toFixed(2));
        $("#q_zu_out").val(q.toFixed(2));
        $("#w_zu_out").val(dw.toFixed(3));
    }

    function getAussenluft() {
        return Zustand(parseFloat($("#t_aussen").val()), parseFloat($("#x_aussen").val()));
    }
    
    function getRaumluft() {
        return Zustand(parseFloat($("#t_raum").val()), parseFloat($("#x_raum").val()));
    }

    $("#heizen").click(function () {
        const aussenluft = getAussenluft();
        const zielTemperatur = parseFloat($("#t_zu_heiz").val());
        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(zielTemperatur)) return;
        
        const zuluft = prozesse.heizen(aussenluft, zielTemperatur);
        const q = zuluft.h - aussenluft.h;
        updateOutput(zuluft, q, 0);
    });

    $("#kuehlen").click(function () {
        const aussenluft = getAussenluft();
        const zielTemperatur = parseFloat($("#t_zu_kuehl").val());
        const zielPhi = parseFloat($("#phi_zu_kuehl").val());
        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(zielTemperatur) || isNaN(zielPhi)) return;

        const zuluft = prozesse.kuehlen_entfeuchten(aussenluft, zielTemperatur, zielPhi);
        const q = zuluft.h - aussenluft.h;
        const dw = zuluft.x - aussenluft.x;
        updateOutput(zuluft, q, dw);
    });
    
    $("#dampf").click(function() {
        const aussenluft = getAussenluft();
        const zielWassergehalt = parseFloat($("#x_zu_dampf").val());
        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(zielWassergehalt)) return;

        const zuluft = prozesse.dampf_bef(aussenluft, zielWassergehalt);
        const q = zuluft.h - aussenluft.h;
        const dw = zuluft.x - aussenluft.x;
        updateOutput(zuluft, q, dw);
    });

    $("#wasser").click(function() {
        const aussenluft = getAussenluft();
        const zielWassergehalt = parseFloat($("#x_zu_wasser").val());
        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(zielWassergehalt)) return;
        
        const zuluft = prozesse.wasser_bef(aussenluft, zielWassergehalt);
        const q = 0; // Adiabat
        const dw = zuluft.x - aussenluft.x;
        updateOutput(zuluft, q, dw);
    });

    $("#mischen").click(function () {
        const aussenluft = getAussenluft();
        const anteilAussen = parseFloat($("#anteil_aussen").val());
        const raumluft = getRaumluft();
        const anteilRaum = parseFloat($("#anteil_raum").val());

        if (isNaN(aussenluft.t) || isNaN(anteilAussen) || isNaN(raumluft.t) || isNaN(anteilRaum)) return;

        const zuluft = prozesse.mischen(aussenluft, anteilAussen, raumluft, anteilRaum);
        // Prozessgrößen bei reiner Mischung sind 0, da es ein interner Vorgang ist
        updateOutput(zuluft, 0, 0);
    });
});
