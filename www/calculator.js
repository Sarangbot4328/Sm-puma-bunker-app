(function () {
  "use strict";

  const DEFAULT_REFERENCE_TEMP_C = 15.0;
  const DEFAULT_HFO_EXPANSION_PER_C = 0.00064;

  class CalculationError extends Error {
    constructor(message) {
      super(message);
      this.name = "CalculationError";
    }
  }

  function asNumber(value) {
    return Number(value);
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function bracket(values, value, label) {
    const ordered = values.map(asNumber).sort((a, b) => a - b);
    if (value < ordered[0] || value > ordered[ordered.length - 1]) {
      throw new CalculationError(`${label} is outside table range: ${ordered[0]} ~ ${ordered[ordered.length - 1]}`);
    }

    for (const existing of ordered) {
      if (existing === value) return { low: existing, high: existing };
    }

    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index] > value) {
        return { low: ordered[index - 1], high: ordered[index] };
      }
    }

    return { low: ordered[ordered.length - 1], high: ordered[ordered.length - 1] };
  }

  function lerp(x, x0, x1, y0, y1) {
    if (x0 === x1) return y0;
    return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
  }

  function tableRows(table) {
    const rows = new Map();
    for (const row of table) rows.set(Number(row.sound_cm), row);
    return rows;
  }

  function numericObjectValue(object, numericKey) {
    const direct = object[String(numericKey)];
    if (direct !== undefined) return Number(direct);

    const fixed = object[numericKey.toFixed(1)];
    if (fixed !== undefined) return Number(fixed);

    const matchingKey = Object.keys(object).find((key) => Number(key) === Number(numericKey));
    if (matchingKey === undefined) {
      throw new CalculationError("No table value exists for this combination.");
    }
    return Number(object[matchingKey]);
  }

  function volumeAtSoundAndTrim(tank, soundCm, trimM) {
    const soundValues = tank.trim_table.map((row) => Number(row.sound_cm));
    const trimValues = tank.trim_columns_m.map(asNumber);
    const soundBracket = bracket(soundValues, soundCm, "Sounding");
    const trimBracket = bracket(trimValues, trimM, "Trim");
    const rows = tableRows(tank.trim_table);

    function volume(sound, trim) {
      return numericObjectValue(rows.get(sound).volumes_m3, trim);
    }

    const v00 = volume(soundBracket.low, trimBracket.low);
    const v01 = volume(soundBracket.low, trimBracket.high);
    const v10 = volume(soundBracket.high, trimBracket.low);
    const v11 = volume(soundBracket.high, trimBracket.high);
    const lowSoundVolume = lerp(trimM, trimBracket.low, trimBracket.high, v00, v01);
    const highSoundVolume = lerp(trimM, trimBracket.low, trimBracket.high, v10, v11);
    return lerp(soundCm, soundBracket.low, soundBracket.high, lowSoundVolume, highSoundVolume);
  }

  function heelCorrection(tank, soundCm, heelDeg) {
    if (heelDeg === 0) return 0.0;

    const side = heelDeg > 0 ? "starboard" : "port";
    const table = tank.heel_correction[side];
    const heelValues = tank.heel_columns_deg[side].map(asNumber);
    const soundValues = table.map((row) => Number(row.sound_cm));
    const soundBracket = bracket(soundValues, soundCm, "Sounding for heel correction");
    const heelBracket = bracket(heelValues, heelDeg, "Heel");
    const rows = tableRows(table);

    function correction(sound, heel) {
      return numericObjectValue(rows.get(sound).corrections_cm, heel);
    }

    const c00 = correction(soundBracket.low, heelBracket.low);
    const c01 = correction(soundBracket.low, heelBracket.high);
    const c10 = correction(soundBracket.high, heelBracket.low);
    const c11 = correction(soundBracket.high, heelBracket.high);
    const lowSoundCorrection = lerp(heelDeg, heelBracket.low, heelBracket.high, c00, c01);
    const highSoundCorrection = lerp(heelDeg, heelBracket.low, heelBracket.high, c10, c11);
    return lerp(soundCm, soundBracket.low, soundBracket.high, lowSoundCorrection, highSoundCorrection);
  }

  function temperatureVcf(tank, temperatureC) {
    if (temperatureC === null || temperatureC === undefined || temperatureC === "") {
      return { vcf: 1.0, referenceTempC: null };
    }
    const referenceTempC = Number(tank.reference_temp_c ?? DEFAULT_REFERENCE_TEMP_C);
    const coefficient = Number(tank.temperature_coefficient ?? DEFAULT_HFO_EXPANSION_PER_C);
    const vcf = 1 - coefficient * (Number(temperatureC) - referenceTempC);
    if (vcf <= 0) throw new CalculationError("Temperature correction factor is invalid.");
    return { vcf, referenceTempC };
  }

  function listTanks(data) {
    return data.tanks.map((tank) => ({
      id: tank.id,
      name: tank.name,
      oil_type: tank.oil_type || "HFO",
      max_sound_cm: tank.max_sound_cm,
      default_density: tank.default_density,
      reference_temp_c: tank.reference_temp_c ?? DEFAULT_REFERENCE_TEMP_C,
      temperature_coefficient: tank.temperature_coefficient ?? DEFAULT_HFO_EXPANSION_PER_C,
      trim_min: Math.min(...tank.trim_columns_m.map(asNumber)),
      trim_max: Math.max(...tank.trim_columns_m.map(asNumber))
    }));
  }

  function getTank(data, tankId) {
    const tank = data.tanks.find((candidate) => candidate.id === tankId);
    if (!tank) throw new CalculationError("Tank was not found.");
    return tank;
  }

  function calculate(data, payload) {
    const tank = getTank(data, payload.tank_id);
    const measurementType = payload.measurement_type;
    const measurementCm = Number(payload.measurement_cm);
    const trimM = Number(payload.trim_m);
    const heelDeg = Number(payload.heel_deg);
    const density = payload.density === null || payload.density === "" ? null : Number(payload.density);
    const temperatureC = payload.temperature_c === null || payload.temperature_c === "" ? null : Number(payload.temperature_c);

    if (!["sounding", "ullage"].includes(measurementType)) {
      throw new CalculationError("Measurement type must be sounding or ullage.");
    }
    if (measurementCm < 0) throw new CalculationError("Measurement must be 0 or greater.");
    if (density !== null && density <= 0) throw new CalculationError("Density must be greater than 0.");

    const rawSoundCm = measurementType === "sounding" ? measurementCm : Number(tank.max_sound_cm) - measurementCm;
    if (rawSoundCm < 0 || rawSoundCm > Number(tank.max_sound_cm)) {
      throw new CalculationError(`Sounding is outside tank range: 0 ~ ${tank.max_sound_cm}cm`);
    }

    const correctionCm = heelCorrection(tank, rawSoundCm, heelDeg);
    const correctedSoundCm = rawSoundCm + correctionCm;
    if (correctedSoundCm < 0 || correctedSoundCm > Number(tank.max_sound_cm)) {
      throw new CalculationError("Corrected sounding is outside tank range.");
    }

    const volumeM3 = volumeAtSoundAndTrim(tank, correctedSoundCm, trimM);
    const temp = temperatureVcf(tank, temperatureC);
    const correctedVolumeM3 = volumeM3 * temp.vcf;
    const metricTon = density === null ? null : correctedVolumeM3 * density;

    return {
      tank_id: tank.id,
      tank_name: tank.name,
      oil_type: tank.oil_type || "HFO",
      raw_sound_cm: round(rawSoundCm, 3),
      heel_correction_cm: round(correctionCm, 3),
      corrected_sound_cm: round(correctedSoundCm, 3),
      volume_m3: round(volumeM3, 3),
      temperature_c: temperatureC,
      reference_temp_c: temp.referenceTempC,
      temperature_vcf: round(temp.vcf, 6),
      corrected_volume_m3: round(correctedVolumeM3, 3),
      density,
      metric_ton: metricTon === null ? null : round(metricTon, 3)
    };
  }

  window.SoundingCalculator = {
    CalculationError,
    calculate,
    listTanks
  };
})();
