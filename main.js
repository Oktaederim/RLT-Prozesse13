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
        /**
         * Simuliert das Heizen von Luft. Der Wassergehalt x bleibt konstant.
         * @param {object} startZustand - Der Anfangszustand der Luft (ein Zustand-Objekt).
         * @param {number} zielTemperatur - Die Zieltemperatur in °C.
         * @returns {object} Der neue Zustand der Luft nach dem Heizen.
         */
        heizen: function (startZustand, zielTemperatur) {
            // Beim Heizen bleibt der Wassergehalt x konstant.
            // Der neue Zustand wird mit der Zieltemperatur und dem alten Wassergehalt berechnet.
            return Zustand(zielTemperatur, startZustand.x);
        },

        /**
         * Simuliert das Kühlen und Entfeuchten.
         * @param {object} startZustand - Der Anfangszustand der Luft.
         * @param {number} zielTemperatur - Die Zieltemperatur in °C.
         * @param {number} zielPhi - Die Ziel-relative-Feuchte in %.
         * @returns {object} Der neue Zustand der Luft.
         */
        kuehlen_entfeuchten: function (startZustand, zielTemperatur, zielPhi) {
            // Sättigungsdampfdruck bei der Zieltemperatur
            const p_s_ziel = 611.2 * Math.exp((17.62 * zielTemperatur) / (243.12 + zielTemperatur));
            // Partialdruck bei der Ziel-relativen-Feuchte
            const p_d_ziel = p_s_ziel * (zielPhi / 100);
            
            // Neuer Wassergehalt x in kg/kg
            const p_amb = 101325;
            const x_kg_neu = (0.622 * p_d_ziel) / (p_amb - p_d_ziel);
            
            // Umrechnung in g/kg
            const x_g_neu = x_kg_neu * 1000;
            
            return Zustand(zielTemperatur, x_g_neu);
        },

        /**
         * Simuliert die Dampfbefeuchtung. Die Temperatur ändert sich kaum.
         * @param {object} startZustand - Der Anfangszustand der Luft.
         * @param {number} zielWassergehalt - Der Zielwassergehalt in g/kg.
         * @returns {object} Der neue Zustand der Luft.
         */
        dampf_bef: function (startZustand, zielWassergehalt) {
            // Bei idealer Dampfbefeuchtung (isotherm) bleibt die Temperatur (fast) gleich.
            return Zustand(startZustand.t, zielWassergehalt);
        },

        /**
         * Simuliert die Wasserbefeuchtung (adiabat). Die Enthalpie h bleibt konstant.
         * @param {object} startZustand - Der Anfangszustand der Luft.
         * @param {number} zielWassergehalt - Der Zielwassergehalt in g/kg.
         * @returns {object} Der neue Zustand der Luft.
         */
        wasser_bef: function (startZustand, zielWassergehalt) {
            // Bei adiabater Befeuchtung bleibt die Enthalpie h konstant.
            // h = 1.006 * t + (x/1000) * (2501 + 1.86 * t)
            // Wir müssen die neue Temperatur t_neu für h_alt und x_neu finden.
            const h_konstant = startZustand.h;
            const x_neu_kg = zielWassergehalt / 1000;
            
            // Formel nach t umstellen: t = (h - x * 2501) / (1.006 + x * 1.86)
            const t_neu = (h_konstant - x_neu_kg * 2501) / (1.006 + x_neu_kg * 1.86);
            
            return Zustand(t_neu, zielWassergehalt);
        },
        
        /**
         * Simuliert das Mischen zweier Luftströme.
         * @param {object} zustand1 - Zustand des ersten Luftstroms.
         * @param {number} anteil1 - Anteil des ersten Luftstroms am Gesamtvolumenstrom (z.B. 0.4 für 40%).
         * @param {object} zustand2 - Zustand des zweiten Luftstroms.
         * @param {number} anteil2 - Anteil des zweiten Luftstroms.
         * @returns {object} Der Zustand des Mischluftstroms.
         */
        mischen: function(zustand1, anteil1, zustand2, anteil2) {
            const gesamtanteil = anteil1 + anteil2;
            if (gesamtanteil === 0) return Zustand(0,0); // Schutz vor Division durch Null

            // Die Mischwerte werden über die Hebelgesetze für Enthalpie und Wassergehalt berechnet.
            const h_misch = (anteil1 * zustand1.h + anteil2 * zustand2.h) / gesamtanteil;
            const x_misch_g = (anteil1 * zustand1.x + anteil2 * zustand2.x) / gesamtanteil;
            
            // Die Mischtemperatur wird aus der neuen Enthalpie und dem neuen Wassergehalt berechnet.
            const x_misch_kg = x_misch_g / 1000;
            const t_misch = (h_misch - x_misch_kg * 2501) / (1.006 + x_misch_kg * 1.86);

            return Zustand(t_misch, x_misch_g);
        }
    };

    // ########################################################################
    // ### Event-Handler für die Buttons ###
    // ########################################################################

    /**
     * Schreibt die berechneten Werte in die Ausgabefelder.
     * @param {object} zuluft - Das Zustandsobjekt der Zuluft.
     * @param {number} q - Die spezifische Heiz-/Kühlleistung in kJ/kg.
     * @param {number} dw - Die spezifische Befeuchtungs-/Entfeuchtungsleistung in g/kg.
     */
    function updateOutput(zuluft, q, dw) {
        $("#t_zu_out").val(zuluft.t.toFixed(2));
        $("#x_zu_out").val(zuluft.x.toFixed(3));
        $("#h_zu_out").val(zuluft.h.toFixed(2));
        $("#phi_zu_out").val(zuluft.phi.toFixed(2));
        $("#q_zu_out").val(q.toFixed(2));
        $("#w_zu_out").val(dw.toFixed(3));
    }
    
    // --- HEIZEN ---
    $("#heizen").click(function () {
        const aussenluft = Zustand(parseFloat($("#t_aussen").val()), parseFloat($("#x_aussen").val()));
        const zielTemperatur = parseFloat($("#t_zu_heiz").val());
        
        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(zielTemperatur)) {
            alert("Bitte gültige Werte für Außenluft und Zieltemperatur Heizen eingeben.");
            return;
        }

        const zuluft = prozesse.heizen(aussenluft, zielTemperatur);
        const q = zuluft.h - aussenluft.h;
        const dw = 0; // Keine Feuchteänderung
        
        updateOutput(zuluft, q, dw);
    });

    // --- KÜHLEN & ENTFEUCHTEN ---
    $("#kuehlen").click(function () {
        const aussenluft = Zustand(parseFloat($("#t_aussen").val()), parseFloat($("#x_aussen").val()));
        const zielTemperatur = parseFloat($("#t_zu_kuehl").val());
        const zielPhi = parseFloat($("#phi_zu_kuehl").val());

        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(zielTemperatur) || isNaN(zielPhi)) {
            alert("Bitte gültige Werte für Außenluft und Zielzustand Kühlen eingeben.");
            return;
        }

        const zuluft = prozesse.kuehlen_entfeuchten(aussenluft, zielTemperatur, zielPhi);
        const q = zuluft.h - aussenluft.h;
        const dw = zuluft.x - aussenluft.x;

        updateOutput(zuluft, q, dw);
    });
    
    // --- DAMPFBEFEUCHTUNG ---
    $("#dampf").click(function() {
        const aussenluft = Zustand(parseFloat($("#t_aussen").val()), parseFloat($("#x_aussen").val()));
        const zielWassergehalt = parseFloat($("#x_zu_dampf").val());

        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(zielWassergehalt)) {
            alert("Bitte gültige Werte für Außenluft und Zielwassergehalt Dampf eingeben.");
            return;
        }

        const zuluft = prozesse.dampf_bef(aussenluft, zielWassergehalt);
        const q = zuluft.h - aussenluft.h; // Heizleistung des Dampfs
        const dw = zuluft.x - aussenluft.x;
        
        updateOutput(zuluft, q, dw);
    });

    // --- WASSERBEFEUCHTUNG (ADIABAT) ---
    $("#wasser").click(function() {
        const aussenluft = Zustand(parseFloat($("#t_aussen").val()), parseFloat($("#x_aussen").val()));
        const zielWassergehalt = parseFloat($("#x_zu_wasser").val());
        
        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(zielWassergehalt)) {
            alert("Bitte gültige Werte für Außenluft und Zielwassergehalt Wasser eingeben.");
            return;
        }
        
        const zuluft = prozesse.wasser_bef(aussenluft, zielWassergehalt);
        const q = 0; // Adiabat, keine externe Wärmezufuhr
        const dw = zuluft.x - aussenluft.x;

        updateOutput(zuluft, q, dw);
    });

    // --- MISCHEN ---
    $("#mischen").click(function () {
        const aussenluft = Zustand(parseFloat($("#t_aussen").val()), parseFloat($("#x_aussen").val()));
        const anteilAussen = parseFloat($("#anteil_aussen").val());
        
        const raumluft = Zustand(parseFloat($("#t_raum").val()), parseFloat($("#x_raum").val()));
        const anteilRaum = parseFloat($("#anteil_raum").val());

        if (isNaN(aussenluft.t) || isNaN(aussenluft.x) || isNaN(anteilAussen) || isNaN(raumluft.t) || isNaN(raumluft.x) || isNaN(anteilRaum)) {
            alert("Bitte gültige Werte für Außenluft, Raumluft und die Mischungsanteile eingeben.");
            return;
        }

        const zuluft = prozesse.mischen(aussenluft, anteilAussen, raumluft, anteilRaum);
        // Bei Mischung sind Prozessgrößen q und dw nicht direkt anwendbar (interne Energieverschiebung)
        const q = 0;
        const dw = 0;
        
        updateOutput(zuluft, q, dw);
    });

});
