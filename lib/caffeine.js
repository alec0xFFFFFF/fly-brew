/**
 * Dry Brew Caffeine Plan Generator
 *
 * Based on circadian neuroscience principles (Timeshifter / Lockley):
 * - Caffeine is an adenosine-receptor antagonist — keeps you awake, does NOT reset the clock
 * - Its role: keep you alert during critical light-exposure windows that DO shift the clock
 * - "Little and often": ~30-50mg every 1.5-2 hours
 * - Hard cutoff: no caffeine within 8 hours of planned sleep
 * - Caffeine half-life: 3-5 hours
 *
 * Dry Brew = 65mg caffeine per serving. Half a Dry Brew = ~33mg per dose.
 */

const DRY_BREW_MG = 65;
const DOSE_MG = Math.round(DRY_BREW_MG / 2); // 33mg — half a Dry Brew per dose
const CAFFEINE_CUTOFF_HOURS = 8;
const DOSE_INTERVAL_HOURS = 2; // half a Dry Brew every 2 hours ≈ 16mg/hr

/**
 * Build a full caffeine plan for a flight.
 *
 * @param {object} flight
 * @param {string} flight.departureTime  - ISO 8601 departure in local origin time
 * @param {string} flight.arrivalTime    - ISO 8601 arrival in local destination time
 * @param {number} flight.originOffset   - UTC offset in hours for origin (e.g. -5 for EST)
 * @param {number} flight.destOffset     - UTC offset in hours for destination (e.g. +1 for CET)
 * @param {string} flight.originCity
 * @param {string} flight.destCity
 * @param {object} [opts]
 * @param {number} [opts.normalWake]     - Usual wake hour in origin time (default 7)
 * @param {number} [opts.normalSleep]    - Usual sleep hour in origin time (default 23)
 * @returns {object} plan
 */
function generatePlan(flight, opts = {}) {
  const normalWake = opts.normalWake ?? 7;
  const normalSleep = opts.normalSleep ?? 23;

  const dep = new Date(flight.departureTime);
  const arr = new Date(flight.arrivalTime);
  const originOff = flight.originOffset;
  const destOff = flight.destOffset;
  const tzDiff = destOff - originOff; // positive = eastbound, negative = westbound
  const absDiff = Math.abs(tzDiff);

  // Flight duration in hours (using UTC equivalents)
  const depUTC = dep.getTime() - originOff * 3600000;
  const arrUTC = arr.getTime() - destOff * 3600000;
  const flightHours = (arrUTC - depUTC) / 3600000;

  // Direction
  const direction = tzDiff > 0 ? 'east' : tzDiff < 0 ? 'west' : 'none';

  // How many pre-adjustment days (1 day per 3 time zones, max 3 days)
  const preAdjustDays = Math.min(3, Math.max(1, Math.ceil(absDiff / 3)));

  // Shift per day during pre-adjustment (hours)
  const shiftPerDay = absDiff <= 3 ? 1 : absDiff <= 6 ? 1.5 : 2;

  // Build day-by-day plan
  const days = [];

  // ── Pre-flight days ──
  for (let d = preAdjustDays; d >= 1; d--) {
    const dayLabel = d === 1 ? 'Day before flight' : `${d} days before flight`;
    let targetWake, targetSleep;

    if (direction === 'east') {
      // Shift earlier each day
      targetWake = normalWake - shiftPerDay * (preAdjustDays - d + 1);
      targetSleep = normalSleep - shiftPerDay * (preAdjustDays - d + 1);
    } else if (direction === 'west') {
      // Shift later each day
      targetWake = normalWake + shiftPerDay * (preAdjustDays - d + 1);
      targetSleep = normalSleep + shiftPerDay * (preAdjustDays - d + 1);
    } else {
      targetWake = normalWake;
      targetSleep = normalSleep;
    }

    // Clamp sleep to reasonable bounds
    targetSleep = clampHour(targetSleep);
    targetWake = clampHour(targetWake);

    const caffeineStart = targetWake;
    const caffeineCutoff = getCutoff(targetWake, targetSleep);
    const doses = buildDoses(caffeineStart, caffeineCutoff);

    days.push({
      label: dayLabel,
      type: 'pre-flight',
      wake: formatHour(targetWake),
      sleep: formatHour(targetSleep),
      caffeineWindow: {
        start: formatHour(caffeineStart),
        cutoff: formatHour(caffeineCutoff),
      },
      doses,
      lightAdvice: direction === 'east'
        ? 'Seek bright light immediately after waking. Avoid screens before bed.'
        : direction === 'west'
          ? 'Seek bright light in the evening. Dim lights in the morning.'
          : 'Maintain normal light exposure.',
      tip: direction === 'east'
        ? `Shift your sleep ${shiftPerDay}h earlier than yesterday.`
        : direction === 'west'
          ? `Shift your sleep ${shiftPerDay}h later than yesterday.`
          : 'No shift needed — same time zone.',
    });
  }

  // ── Flight day ──
  const depHour = dep.getHours() + dep.getMinutes() / 60;
  const arrHour = arr.getHours() + arr.getMinutes() / 60;

  // Target sleep at destination on arrival day
  let arrivalTargetSleep, arrivalTargetWake;
  if (direction === 'east') {
    // Aim for slightly earlier than normal destination bedtime
    arrivalTargetSleep = normalSleep - Math.min(2, absDiff / 2);
    arrivalTargetWake = normalWake - Math.min(2, absDiff / 2);
  } else if (direction === 'west') {
    arrivalTargetSleep = normalSleep + Math.min(2, absDiff / 2);
    arrivalTargetWake = normalWake + Math.min(2, absDiff / 2);
  } else {
    arrivalTargetSleep = normalSleep;
    arrivalTargetWake = normalWake;
  }
  arrivalTargetSleep = clampHour(arrivalTargetSleep);
  arrivalTargetWake = clampHour(arrivalTargetWake);

  // In-flight caffeine: stay awake if destination is in daytime; sleep if nighttime
  const flightDoses = [];
  const flightEvents = [];

  // Convert flight to destination-relative time blocks
  // If arriving during destination day, use caffeine on the flight to stay awake
  // If arriving at destination night, avoid caffeine on flight to sleep
  const arrIsDay = arrHour >= 6 && arrHour <= 20;
  const flightCaffeineCutoff = getCutoff(arrivalTargetWake, arrivalTargetSleep);

  if (arrIsDay) {
    // Stay awake during flight — have Dry Brew
    const cafStart = depHour;
    // But stop relative to destination sleep time
    // Estimate: caffeine cutoff is 8h before destination bedtime
    // During flight we're in origin time, so convert
    let cutoffOriginTime = flightCaffeineCutoff + (originOff - destOff);
    if (cutoffOriginTime < depHour) cutoffOriginTime = depHour; // already past cutoff

    const inFlightEnd = depHour + flightHours;
    const effectiveCutoff = Math.min(cutoffOriginTime, inFlightEnd);

    if (effectiveCutoff > cafStart) {
      let t = cafStart + 0.5; // start 30 min after takeoff
      while (t < effectiveCutoff) {
        flightDoses.push({
          time: formatHour(t),
          label: `Eat half a Dry Brew (~${DOSE_MG}mg)`,
        });
        t += DOSE_INTERVAL_HOURS;
      }
    }

    flightEvents.push({
      type: 'caffeine',
      note: 'Stay awake — destination is in daytime when you arrive. Eat Dry Brew every ~2.5 hours.',
    });
  } else {
    // Try to sleep on the flight — no caffeine
    flightEvents.push({
      type: 'sleep',
      note: 'Try to sleep on the flight — you\'re arriving at night. No Dry Brew.',
    });
  }

  // Also add pre-departure doses if departing during day
  const preDepDoses = [];
  if (depHour > normalWake) {
    let t = clampHour(normalWake + (direction === 'east' ? -shiftPerDay * preAdjustDays : shiftPerDay * preAdjustDays));
    const preCutoff = Math.min(depHour - 0.5, flightCaffeineCutoff + (originOff - destOff));
    while (t < preCutoff && t < depHour - 0.5) {
      preDepDoses.push({
        time: formatHour(t),
        label: `Eat half a Dry Brew (~${DOSE_MG}mg)`,
      });
      t += DOSE_INTERVAL_HOURS;
    }
  }

  days.push({
    label: 'Flight day',
    type: 'flight',
    departure: formatTime(dep),
    arrival: formatTime(arr),
    flightDuration: `${Math.floor(flightHours)}h ${Math.round((flightHours % 1) * 60)}m`,
    preDepartureDoses: preDepDoses,
    inFlightDoses: flightDoses,
    events: flightEvents,
    caffeineWindow: {
      start: preDepDoses.length > 0 ? preDepDoses[0].time : (flightDoses.length > 0 ? flightDoses[0].time : 'N/A'),
      cutoff: formatHour(flightCaffeineCutoff) + ' (destination time)',
    },
    lightAdvice: arrIsDay
      ? 'Keep window shade open during flight. Seek sunlight on arrival.'
      : 'Dim your screens 2 hours before you want to sleep on the plane.',
  });

  // ── Arrival day (at destination) ──
  const arrCafStart = arrivalTargetWake;
  const arrCafCutoff = getCutoff(arrCafStart, arrivalTargetSleep);
  const arrDoses = buildDoses(arrCafStart, arrCafCutoff);

  days.push({
    label: 'Arrival day (destination time)',
    type: 'arrival',
    wake: formatHour(arrivalTargetWake),
    sleep: formatHour(arrivalTargetSleep),
    caffeineWindow: {
      start: formatHour(arrCafStart),
      cutoff: formatHour(arrCafCutoff),
    },
    doses: arrDoses,
    lightAdvice: direction === 'east'
      ? 'Seek bright morning light. Avoid light in the evening.'
      : direction === 'west'
        ? 'Avoid bright morning light (wear sunglasses). Seek afternoon/evening light.'
        : 'Maintain normal light exposure.',
    tip: 'Stick to destination meal times even if you\'re not hungry.',
  });

  // ── Post-arrival days (adaptation) ──
  // Use unwrapped values for interpolation to avoid wraparound issues.
  // If arrival target is past midnight, keep it > 24 so lerp goes the right direction.
  let unwrappedArrSleep = arrivalTargetSleep;
  if (unwrappedArrSleep < arrivalTargetWake) unwrappedArrSleep += 24;
  let unwrappedNormSleep = normalSleep;
  if (unwrappedNormSleep < normalWake) unwrappedNormSleep += 24;
  // Ensure we interpolate via the shorter arc
  if (Math.abs(unwrappedArrSleep - unwrappedNormSleep) > 12) {
    if (unwrappedArrSleep > unwrappedNormSleep) unwrappedNormSleep += 24;
    else unwrappedArrSleep += 24;
  }

  const adaptDays = Math.min(3, Math.ceil(absDiff / 2));
  for (let d = 1; d <= adaptDays; d++) {
    const progress = d / (adaptDays + 1);
    let wake, sleep;
    if (direction !== 'none') {
      wake = arrivalTargetWake + (normalWake - arrivalTargetWake) * progress;
      sleep = unwrappedArrSleep + (unwrappedNormSleep - unwrappedArrSleep) * progress;
    } else {
      wake = normalWake;
      sleep = normalSleep;
    }
    wake = clampHour(wake);
    sleep = clampHour(sleep);

    const cafStart = wake;
    const cafCutoff = getCutoff(cafStart, sleep);
    const doses = buildDoses(cafStart, cafCutoff);

    days.push({
      label: `Day ${d} at destination`,
      type: 'adaptation',
      wake: formatHour(wake),
      sleep: formatHour(sleep),
      caffeineWindow: {
        start: formatHour(cafStart),
        cutoff: formatHour(cafCutoff),
      },
      doses,
      lightAdvice: direction === 'east'
        ? 'Continue seeking morning light. Shift evening light avoidance later each day.'
        : direction === 'west'
          ? 'Gradually expose yourself to earlier morning light each day.'
          : 'Normal light exposure.',
      tip: d === adaptDays ? 'You should be mostly adapted by now!' : `Adaptation ~${Math.round(progress * 100)}% complete.`,
    });
  }

  // Summary — count half-brew doses, convert to whole Dry Brews needed
  const totalDoses = days.reduce((sum, day) => {
    const dayDoses = (day.doses?.length || 0) +
      (day.preDepartureDoses?.length || 0) +
      (day.inFlightDoses?.length || 0);
    return sum + dayDoses;
  }, 0);
  const totalDryBrews = Math.ceil(totalDoses / 2); // 2 half-brews = 1 whole Dry Brew
  const totalCaffeineMg = totalDoses * DOSE_MG;

  return {
    summary: {
      direction: direction === 'east' ? 'Eastbound' : direction === 'west' ? 'Westbound' : 'Same timezone',
      timezoneShift: `${tzDiff >= 0 ? '+' : ''}${tzDiff}h`,
      totalDays: days.length,
      totalDoses,
      totalDryBrews,
      totalCaffeineMg,
      flightDuration: `${Math.floor(flightHours)}h ${Math.round((flightHours % 1) * 60)}m`,
      origin: flight.originCity,
      destination: flight.destCity,
    },
    days,
    constants: {
      dryBrewMg: DRY_BREW_MG,
      doseMg: DOSE_MG,
      cutoffHours: CAFFEINE_CUTOFF_HOURS,
      doseIntervalHours: DOSE_INTERVAL_HOURS,
    },
  };
}

/** Build an array of Dry Brew dose times between start and cutoff hours */
function buildDoses(startHour, cutoffHour) {
  const doses = [];
  if (cutoffHour <= startHour) return doses;
  let t = startHour + 0.5; // first dose 30 min after wake
  while (t <= cutoffHour) {
    doses.push({
      time: formatHour(t),
      label: `Eat 1 Dry Brew (${DRY_BREW_MG}mg)`,
    });
    t += DOSE_INTERVAL_HOURS;
  }
  return doses;
}

/**
 * Compute the caffeine cutoff hour given a wake and sleep hour.
 * Handles the case where sleep wraps past midnight (e.g., sleep=1 means 1 AM next day).
 */
function getCutoff(wakeHour, sleepHour) {
  let sleep = sleepHour;
  // If sleep appears before wake, it's past midnight — treat as next day
  if (sleep <= wakeHour) sleep += 24;
  const cutoff = sleep - CAFFEINE_CUTOFF_HOURS;
  return clampHour(cutoff);
}

/** Clamp an hour value to 0-24 range */
function clampHour(h) {
  while (h < 0) h += 24;
  while (h >= 24) h -= 24;
  return h;
}

/** Format a decimal hour (e.g. 14.5) as "2:30 PM" */
function formatHour(h) {
  h = clampHour(h);
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${display}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

/** Format a Date as "HH:MM AM/PM" */
function formatTime(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m.toString().padStart(2, '0')} ${ampm}`;
}

module.exports = { generatePlan, DRY_BREW_MG };
